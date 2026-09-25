// Plan-based limits for clubs (Phase 2 preview of Phase 5 subscriptions).
//
// Every roster/team rule that depends on the club's plan reads from here, so
// when real subscription plans land (Phase 5) this is the ONE place to swap
// in a lookup against an admin-configurable plans table. The numbers below
// are placeholders to tune — they're not scattered through the services.
//
// Free plan (per game): ONE entry — either one team or one solo player.
// No substitutes, no coach. Paid: unlimited entries + substitutes + coach.

export const FREE_CLUB_PLAN = "club_free";

export interface ClubLimits {
  // Max (teams + solo players) a club may field in one game. null = unlimited.
  maxEntriesPerGame: number | null;
  // Max non-substitute players on a single team.
  maxPlayersPerTeam: number;
  // Max substitutes on a single team.
  maxSubstitutesPerTeam: number;
  canSetCoach: boolean;
  isPaid: boolean;
}

const FREE: ClubLimits = {
  maxEntriesPerGame: 1,
  maxPlayersPerTeam: 6,
  maxSubstitutesPerTeam: 0,
  canSetCoach: false,
  isPaid: false,
};

const PAID: ClubLimits = {
  maxEntriesPerGame: null,
  maxPlayersPerTeam: 6,
  maxSubstitutesPerTeam: 2,
  canSetCoach: true,
  isPaid: true,
};

export function getClubLimits(club: { subscriptionPlanCode: string }): ClubLimits {
  return club.subscriptionPlanCode === FREE_CLUB_PLAN ? FREE : PAID;
}
