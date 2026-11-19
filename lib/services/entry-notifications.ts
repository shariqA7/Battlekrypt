// Tells players (and every member of a team) about what happened to the events
// they joined: started, finished with results, or cancelled. All best-effort:
// a failed lookup or insert is logged and swallowed, never allowed to undo the
// action that triggered it.
import { prisma } from "@/lib/prisma";

type RegStatus = "pending" | "approved" | "rejected" | "disqualified";

// The user accounts behind a registration: the solo player, or every team member.
export function usersOfRegistration(r: {
  player: { userId: string } | null;
  teamEntry: { members: { player: { userId: string } }[] } | null;
}): string[] {
  return Array.from(
    new Set([
      ...(r.player ? [r.player.userId] : []),
      ...(r.teamEntry?.members.map((m) => m.player.userId) ?? []),
    ])
  );
}

const WHO = {
  player: { select: { userId: true } },
  teamEntry: { select: { members: { select: { player: { select: { userId: true } } } } } },
} as const;

async function safely(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error(`${label} notification failed`, e);
  }
}

async function recipients(tournamentId: string, statuses: RegStatus[]) {
  const regs = await prisma.registration.findMany({
    where: { tournamentId, status: { in: statuses } },
    select: { placement: true, ...WHO },
  });
  return regs;
}

// The organizer cancelled the event (admin-approved cancellations are announced
// by change-requests.ts, which also covers refunds).
export function notifyTournamentCancelled(tournamentId: string) {
  return safely("tournament cancelled", async () => {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, entryType: true } });
    if (!t) return;
    const regs = await recipients(tournamentId, ["pending", "approved"]);
    const userIds = Array.from(new Set(regs.flatMap(usersOfRegistration)));
    if (userIds.length === 0) return;
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: "tournament_cancelled",
        title: `"${t.name}" was cancelled`,
        body: t.entryType === "paid" ? "Contact the organizer about a refund of your entry fee." : undefined,
        href: `/tournaments/${tournamentId}`,
      })),
    });
  });
}

// The event moved to In progress: approved entries should go and play.
export function notifyTournamentStarted(tournamentId: string) {
  return safely("tournament started", async () => {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } });
    if (!t) return;
    const regs = await recipients(tournamentId, ["approved"]);
    const userIds = Array.from(new Set(regs.flatMap(usersOfRegistration)));
    if (userIds.length === 0) return;
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: "tournament_started",
        title: `"${t.name}" has started`,
        body: "Open the event page for your schedule and room details.",
        href: `/tournaments/${tournamentId}`,
      })),
    });
  });
}

// The event is completed and results are final. Each entry hears its own placement.
export function notifyResultsPosted(tournamentId: string) {
  return safely("results posted", async () => {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } });
    if (!t) return;
    const regs = await recipients(tournamentId, ["approved"]);
    const seen = new Set<string>();
    const data: { userId: string; type: string; title: string; body: string; href: string }[] = [];
    for (const r of regs) {
      for (const userId of usersOfRegistration(r)) {
        if (seen.has(userId)) continue;
        seen.add(userId);
        data.push({
          userId,
          type: "results_posted",
          title: `Results are in for "${t.name}"`,
          body: r.placement ? `You finished #${r.placement}.` : "See the final standings.",
          href: `/tournaments/${tournamentId}`,
        });
      }
    }
    if (data.length) await prisma.notification.createMany({ data });
  });
}
