// Plan-based limits for clubs (spec §7).
//
// Every roster/team rule that depends on the club's plan reads from here.
// The numbers are no longer hardcoded: they come from the club's Plan row
// (admin-editable), resolved by lib/plans.ts. A lapsed paid plan counts as
// free, and an unknown plan code falls back to free.

import { FREE_PLAN_CODE, resolvePlan, type ClubPlanLimits } from "@/lib/plans";

export const FREE_CLUB_PLAN = FREE_PLAN_CODE.club;

export interface ClubLimits extends ClubPlanLimits {
  isPaid: boolean;
}

export async function getClubLimits(club: {
  subscriptionPlanCode: string;
  planExpiresAt: Date | null;
}): Promise<ClubLimits> {
  const plan = await resolvePlan("club", {
    planCode: club.subscriptionPlanCode,
    planExpiresAt: club.planExpiresAt,
  });
  return { ...plan.limits, isPaid: plan.isPaid };
}
