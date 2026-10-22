// A player's saved payout method. Players 18+ add their own; for a player under 18 the
// parent/guardian adds theirs from the link in the consent email, and the child can't
// change it. Account details are encrypted at rest (lib/payout-crypto.ts).
import { prisma } from "@/lib/prisma";
import { ageOn } from "@/lib/age";
import { ADULT_AGE } from "@/lib/consent-config";
import { childDisplayName } from "@/lib/consent";
import { decryptPayout, encryptPayout, payoutEncryptionReady } from "@/lib/payout-crypto";
import { formatPayoutText, payoutStillValid, validatePayoutInput } from "@/lib/payout-rules";

type Fail = { error: string; message: string };
const fail = (error: string, message: string): Fail => ({ error, message });

const isMinorBirth = (birthDate: Date | null | undefined) =>
  !!birthDate && ageOn(birthDate) < ADULT_AGE;

export async function savePayoutMethod(
  playerId: string,
  payee: "self" | "guardian",
  body: unknown
): Promise<{ data: { saved: true } } | Fail> {
  const v = validatePayoutInput(body);
  if ("error" in v) return v;
  if (!payoutEncryptionReady()) {
    return fail("not_configured", "Saving payment details isn't set up yet. Please try again later.");
  }
  const profile = await prisma.playerProfile.findUnique({ where: { id: playerId }, select: { birthDate: true } });
  if (!profile) return fail("not_found", "Player not found.");
  const minor = isMinorBirth(profile.birthDate);
  if (payee === "self" && minor) {
    return fail("guardian_only", "Your parent or guardian sets where your prizes are paid.");
  }
  if (payee === "guardian" && !minor) {
    return fail("not_a_minor", "This player is 18 or over and sets their own payment details.");
  }

  const data = {
    payee,
    payeeName: v.data.payeeName,
    method: v.data.method,
    detailsEnc: encryptPayout(v.data.details),
  };
  await prisma.playerPayoutMethod.upsert({ where: { playerId }, create: { playerId, ...data }, update: data });
  return { data: { saved: true } };
}

// For the settings screens: never includes the account details themselves.
export async function getPayoutSummary(playerId: string) {
  const [m, profile] = await Promise.all([
    prisma.playerPayoutMethod.findUnique({
      where: { playerId },
      select: { payee: true, payeeName: true, method: true, updatedAt: true },
    }),
    prisma.playerProfile.findUnique({ where: { id: playerId }, select: { birthDate: true } }),
  ]);
  const minor = isMinorBirth(profile?.birthDate);
  const usable = !!m && payoutStillValid(m.payee, minor);
  return { minor, usable, needsReentry: !!m && !usable, method: usable ? m : null };
}

// The text the person who owes the prize sees. Decrypts, so only call it where a prize is
// actually owed to this player (a won challenge, a placed tournament entry).
export async function getPayoutText(playerId: string): Promise<string | null> {
  const [m, p] = await Promise.all([
    prisma.playerPayoutMethod.findUnique({ where: { playerId } }),
    prisma.playerProfile.findUnique({ where: { id: playerId }, select: { birthDate: true, firstName: true, lastName: true } }),
  ]);
  if (!m || !p) return null;
  const minor = isMinorBirth(p.birthDate);
  if (!payoutStillValid(m.payee, minor)) return null;
  const details = decryptPayout(m.detailsEnc);
  if (details === null) return null;
  return formatPayoutText({
    payee: m.payee,
    payeeName: m.payeeName,
    method: m.method,
    details,
    childName: minor ? childDisplayName(p.firstName, p.lastName) : undefined,
  });
}

// Minors can only enter cash-prize events once a guardian has said where the money goes.
export async function minorsMissingGuardianPayout(playerIds: string[]): Promise<string[]> {
  const profiles = await prisma.playerProfile.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, birthDate: true, payoutMethod: { select: { payee: true } } },
  });
  return profiles
    .filter((p) => isMinorBirth(p.birthDate) && p.payoutMethod?.payee !== "guardian")
    .map((p) => p.id);
}

// ---- organizer: who to pay for a tournament's prize pool -----------------------

// Only call after checking the caller owns the tournament. Decrypts payout details, so
// it is limited to entries that actually finished in a prize position.
export async function listPrizePayees(tournamentId: string) {
  const [tiers, regs, t] = await Promise.all([
    prisma.prizeTier.findMany({ where: { tournamentId }, orderBy: { positionFrom: "asc" } }),
    prisma.registration.findMany({
      where: { tournamentId, status: "approved", placement: { not: null } },
      orderBy: { placement: "asc" },
      select: {
        id: true,
        placement: true,
        player: { select: { id: true, user: { select: { displayName: true } } } },
        teamEntry: {
          select: { name: true, members: { select: { player: { select: { id: true, user: { select: { displayName: true } } } } } } },
        },
      },
    }),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { prizePoolCurrency: true } }),
  ]);

  const rows = [];
  for (const r of regs) {
    const tier = tiers.find((x) => r.placement! >= x.positionFrom && r.placement! <= x.positionTo);
    if (!tier) continue; // finished outside the prize positions
    const people = r.player
      ? [{ id: r.player.id, name: r.player.user.displayName }]
      : (r.teamEntry?.members ?? []).map((m) => ({ id: m.player.id, name: m.player.user.displayName }));
    const payees = [];
    for (const p of people) payees.push({ name: p.name, text: await getPayoutText(p.id) });
    rows.push({
      registrationId: r.id,
      placement: r.placement!,
      entrant: r.teamEntry?.name ?? r.player?.user.displayName ?? "Entry",
      isTeam: !!r.teamEntry,
      amount: tier.amount.toString(),
      currency: t?.prizePoolCurrency ?? null,
      payees,
    });
  }
  return rows;
}
