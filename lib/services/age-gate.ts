// Age gate for tournament entry (spec follow-up). Every way of putting a player
// into a tournament calls this next to the institution gate: self-registration,
// organizer manual-add and the two club paths.
import { prisma } from "@/lib/prisma";
import { ageOn } from "@/lib/age";

export type AgeGateResult =
  | { ok: true }
  | { error: "birth_date_required" | "age_restricted"; message: string };

export async function checkAgeGate(
  tournamentId: string,
  playerIds: string[],
  opts: { selfPlayerId?: string } = {}
): Promise<AgeGateResult> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { minAge: true },
  });
  if (!tournament) return { ok: true }; // callers have already handled "not found"

  const ids = [...new Set(playerIds)];
  const profiles = await prisma.playerProfile.findMany({
    where: { id: { in: ids } },
    select: { id: true, birthDate: true },
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const single = ids.length === 1;
  const isSelf = single && ids[0] === opts.selfPlayerId;

  // Everyone needs a date of birth on file first; without it nobody can be
  // checked against the platform's 13+ floor either.
  for (const id of ids) {
    if (!byId.get(id)?.birthDate) {
      return {
        error: "birth_date_required",
        message: isSelf
          ? "Add your date of birth in Profile settings to join a tournament."
          : "A player on this entry needs to add their date of birth in Profile settings first.",
      };
    }
  }

  const now = new Date();
  for (const id of ids) {
    if (ageOn(byId.get(id)!.birthDate!, now) < tournament.minAge) {
      // Deliberately doesn't say who: that would reveal someone's age.
      return {
        error: "age_restricted",
        message: single
          ? `This tournament is for players aged ${tournament.minAge}+.`
          : `Every player must be aged ${tournament.minAge}+ for this tournament.`,
      };
    }
  }
  return { ok: true };
}
