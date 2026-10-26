// Age gate for tournament entry (spec follow-up). Every way of putting a player
// into a tournament calls this next to the institution gate: self-registration,
// organizer manual-add and the two club paths.
import { prisma } from "@/lib/prisma";
import { ageOn } from "@/lib/age";
import { checkJoinGate } from "@/lib/services/parental-consent";
import { minorsMissingGuardianPayout } from "@/lib/services/payout-methods";
import { parentalConsentOn } from "@/lib/services/feature-flags";

export type AgeGateResult =
  | { ok: true }
  | { error: "birth_date_required" | "age_restricted" | "consent_required" | "guardian_payout_required"; message: string };

export async function checkAgeGate(
  tournamentId: string,
  playerIds: string[],
  opts: { selfPlayerId?: string } = {}
): Promise<AgeGateResult> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { minAge: true, prizePoolAmount: true },
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

  // Under-18s can only view until a guardian has approved: nobody on this entry may be
  // a minor without an approved consent (see checkJoinGate).
  const consent = await checkJoinGate(ids, opts.selfPlayerId);
  if ("error" in consent) return { error: "consent_required", message: consent.message };

  // Prizes for a minor are paid to their guardian, so a cash prize pool needs the guardian's
  // payment details on file before a minor can enter.
  if ((await parentalConsentOn()) && tournament.prizePoolAmount && Number(tournament.prizePoolAmount) > 0) {
    const missing = await minorsMissingGuardianPayout(ids);
    if (missing.length > 0) {
      return {
        error: "guardian_payout_required",
        message: missing.length === 1 && missing[0] === opts.selfPlayerId
          ? "This tournament has cash prizes. Your parent or guardian needs to add where prizes are paid (from the link in their approval email) before you can join."
          : "This tournament has cash prizes. A player on this entry still needs their parent or guardian to add where prizes are paid.",
      };
    }
  }
  return { ok: true };
}
