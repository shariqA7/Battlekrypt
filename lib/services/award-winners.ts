// Who won each special award (Final MVP, Best IGL…). The organizer picks a
// winner for every award after the event completes, from the players who
// actually took part. Winners get a payout record to confirm when the
// organizer marks prizes as paid (see markPrizesPaid in organizer-trust.ts).
import { prisma } from "@/lib/prisma";

export async function listEligiblePlayers(tournamentId: string) {
  const regs = await prisma.registration.findMany({
    where: { tournamentId, status: "approved" },
    select: {
      player: { select: { user: { select: { id: true, displayName: true } } } },
      teamEntry: { select: { name: true, members: { select: { player: { select: { user: { select: { id: true, displayName: true } } } } } } } },
    },
  });
  const byId = new Map<string, { userId: string; name: string; team: string | null }>();
  for (const r of regs) {
    if (r.player) byId.set(r.player.user.id, { userId: r.player.user.id, name: r.player.user.displayName, team: null });
    for (const m of r.teamEntry?.members ?? []) {
      byId.set(m.player.user.id, { userId: m.player.user.id, name: m.player.user.displayName, team: r.teamEntry?.name ?? null });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function assignAwardWinners(input: {
  organizerId: string;
  tournamentId: string;
  assignments: { awardId: string; userId: string | null }[];
}) {
  const t = await prisma.tournament.findUnique({ where: { id: input.tournamentId }, select: { organizerId: true, status: true } });
  if (!t) return { error: "not_found" as const };
  if (t.organizerId !== input.organizerId) return { error: "forbidden" as const };
  if (t.status !== "completed") return { error: "not_completed" as const };

  const [awards, eligible] = await Promise.all([
    prisma.prizeAward.findMany({ where: { tournamentId: input.tournamentId }, include: { payout: { select: { id: true } } } }),
    listEligiblePlayers(input.tournamentId),
  ]);
  const eligibleIds = new Set(eligible.map((p) => p.userId));
  const byId = new Map(awards.map((a) => [a.id, a]));

  for (const a of input.assignments) {
    const award = byId.get(a.awardId);
    if (!award) return { error: "validation_error" as const, message: "Unknown award." };
    if (award.payout) return { error: "validation_error" as const, message: `"${award.name}" was already marked as paid, so its winner can't change.` };
    if (a.userId !== null && !eligibleIds.has(a.userId)) {
      return { error: "validation_error" as const, message: `The winner of "${award.name}" must be a player who took part in this event.` };
    }
  }
  await prisma.$transaction(
    input.assignments.map((a) =>
      prisma.prizeAward.update({
        where: { id: a.awardId },
        data: { winnerUserId: a.userId, winnerAssignedAt: a.userId ? new Date() : null },
      })
    )
  );
  return { data: { updated: input.assignments.length } };
}
