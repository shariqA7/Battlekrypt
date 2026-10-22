// Guardian withdrew consent while the child is in a tournament that is already running.
// The entry stays until an admin decides (see ConsentCase in the schema).
import { prisma } from "@/lib/prisma";
import { childDisplayName } from "@/lib/consent";
import { notify } from "@/lib/services/notifications";
import { getConsentStateForPlayer } from "@/lib/services/parental-consent";

// Called when consent is withdrawn. Safe to call twice: one case per entry.
export async function openConsentCases(playerId: string, regs: { id: string; tournamentId: string }[]) {
  if (regs.length === 0) return;
  await prisma.consentCase.createMany({
    data: regs.map((r) => ({ registrationId: r.id, tournamentId: r.tournamentId, playerId })),
    skipDuplicates: true,
  });
}

export async function countOpenConsentCases() {
  return prisma.consentCase.count({ where: { status: "open" } });
}

export async function listConsentCases(status: "open" | "decided") {
  const rows = await prisma.consentCase.findMany({
    where: status === "open" ? { status: "open" } : { status: { in: ["allowed", "removed"] } },
    orderBy: status === "open" ? { createdAt: "asc" } : { decidedAt: "desc" },
    take: status === "open" ? 100 : 20,
    include: {
      registration: {
        select: {
          status: true,
          teamEntry: { select: { name: true } },
          tournament: { select: { id: true, name: true, organizer: { select: { orgName: true } } } },
        },
      },
    },
  });
  const players = await prisma.playerProfile.findMany({
    where: { id: { in: rows.map((r) => r.playerId) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const byId = new Map(players.map((p) => [p.id, p]));

  const out = [];
  for (const r of rows) {
    const p = byId.get(r.playerId);
    // The guardian may have approved again since; the admin should know before removing anyone.
    const state = status === "open" ? (await getConsentStateForPlayer(r.playerId)).state : null;
    out.push({
      id: r.id,
      status: r.status,
      childName: p ? childDisplayName(p.firstName, p.lastName) : "A player",
      teamName: r.registration.teamEntry?.name ?? null,
      tournamentId: r.registration.tournament.id,
      tournamentName: r.registration.tournament.name,
      organizerName: r.registration.tournament.organizer.orgName,
      consentNow: state,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
    });
  }
  return out;
}

// "allow": they finish the tournament. "remove": the entry is disqualified. Either way the
// child still can't join anything new, and the organizer and the player are told.
export async function decideConsentCase(
  caseId: string,
  adminId: string,
  action: "allow" | "remove",
  note?: string
) {
  const c = await prisma.consentCase.findUnique({
    where: { id: caseId },
    include: {
      registration: { select: { id: true, tournament: { select: { id: true, name: true, organizer: { select: { userId: true } } } } } },
    },
  });
  if (!c) return { error: "not_found" as const, message: "Case not found." };

  const cleanNote = (note ?? "").trim().slice(0, 500) || null;
  const res = await prisma.consentCase.updateMany({
    where: { id: caseId, status: "open" },
    data: { status: action === "allow" ? "allowed" : "removed", decidedById: adminId, decidedAt: new Date(), note: cleanNote },
  });
  if (res.count === 0) return { error: "already_decided" as const, message: "This case was already decided." };

  const t = c.registration.tournament;
  if (action === "remove") {
    await prisma.registration.update({ where: { id: c.registration.id }, data: { status: "disqualified" } });
    const { bumpRegistrationCount } = await import("@/lib/services/tournaments");
    await bumpRegistrationCount(t.id);
  }

  const player = await prisma.playerProfile.findUnique({ where: { id: c.playerId }, select: { userId: true } });
  const verdict =
    action === "allow"
      ? `An admin decided the player can finish "${t.name}".`
      : `An admin removed the player's entry from "${t.name}", because their guardian withdrew consent.`;
  const extra = cleanNote ? ` Note: ${cleanNote}` : "";
  await notify(t.organizer.userId, {
    type: "consent_case",
    title: action === "allow" ? "Player may finish the tournament" : "Entry removed",
    body: verdict + extra,
    href: `/organizer/dashboard/tournaments/${t.id}`,
  });
  if (player) {
    await notify(player.userId, {
      type: "consent_case",
      title: action === "allow" ? "You can finish the tournament" : "Your entry was removed",
      body:
        action === "allow"
          ? `You can finish "${t.name}". You still can't join anything new until your guardian approves again.`
          : `Your entry in "${t.name}" was removed because your guardian withdrew permission.`,
      href: "/dashboard",
    });
  }
  return { data: { status: action === "allow" ? ("allowed" as const) : ("removed" as const) } };
}
