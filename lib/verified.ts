// "Verified" on this platform means being on an active PAID plan: a player plan, an organizer
// plan or a club plan. Admins choose, per giveaway or donation campaign, whether it is for
// verified accounts only or for everyone. A plan with an end date stops counting when it ends.
import { prisma } from "@/lib/prisma";
import { FREE_PLAN_CODE } from "@/lib/plans";

export type VerifiedVia = "player" | "organizer" | "club";

export async function getVerifiedStatus(userId: string, now = new Date()): Promise<{ verified: boolean; via: VerifiedVia | null }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      playerProfile: { select: { planCode: true, planExpiresAt: true } },
      organizerProfile: { select: { planCode: true, planExpiresAt: true } },
      clubProfile: { select: { subscriptionPlanCode: true, planExpiresAt: true, status: true } },
    },
  });
  if (!u) return { verified: false, via: null };

  const candidates: { via: VerifiedVia; code: string; expires: Date | null }[] = [];
  if (u.playerProfile) candidates.push({ via: "player", code: u.playerProfile.planCode, expires: u.playerProfile.planExpiresAt });
  if (u.organizerProfile) candidates.push({ via: "organizer", code: u.organizerProfile.planCode, expires: u.organizerProfile.planExpiresAt });
  if (u.clubProfile && u.clubProfile.status !== "disbanded") candidates.push({ via: "club", code: u.clubProfile.subscriptionPlanCode, expires: u.clubProfile.planExpiresAt });

  const live = candidates.filter((c) => !Object.values(FREE_PLAN_CODE).includes(c.code) && (c.expires === null || c.expires > now));
  if (live.length === 0) return { verified: false, via: null };
  // A non-free code is only a paid plan if the plan row says so (an admin can make a free custom plan).
  const plans = await prisma.plan.findMany({ where: { code: { in: live.map((c) => c.code) } }, select: { code: true, isPaid: true } });
  const paid = new Set(plans.filter((p) => p.isPaid).map((p) => p.code));
  const hit = live.find((c) => paid.has(c.code));
  return hit ? { verified: true, via: hit.via } : { verified: false, via: null };
}
