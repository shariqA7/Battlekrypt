// "Verified" for giveaways and donation campaigns means being on a PAID plan that is in force
// right now: a player plan, an organizer plan or a club plan. Admins choose, per giveaway or
// campaign, whether it is for verified accounts only or for everyone.
//
// This asks resolvePlan() (lib/plans.ts) whether the plan is paid, so it follows the same rules as
// the rest of the platform: a plan that has ended counts as Free, a scheduled plan counts from the
// day it starts, and an unknown plan code counts as Free.
//
// Note this is the plan rule only. The public "Verified badge" is stricter for organizers (it also
// needs an approved identity check, see isVerified in lib/plans.ts).
import { prisma } from "@/lib/prisma";
import { resolvePlan } from "@/lib/plans";

export type VerifiedVia = "player" | "organizer" | "club";

export async function getVerifiedStatus(userId: string, now = new Date()): Promise<{ verified: boolean; via: VerifiedVia | null }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { playerProfile: true, organizerProfile: true, clubProfile: true },
  });
  if (!u) return { verified: false, via: null };

  const [player, organizer, club] = await Promise.all([
    u.playerProfile ? resolvePlan("player", u.playerProfile, now) : null,
    u.organizerProfile ? resolvePlan("organizer", u.organizerProfile, now) : null,
    // A club's plan only counts once an admin has approved the club.
    u.clubProfile && u.clubProfile.status === "approved"
      ? resolvePlan("club", { planCode: u.clubProfile.subscriptionPlanCode, planExpiresAt: u.clubProfile.planExpiresAt }, now)
      : null,
  ]);
  if (player?.isPaid) return { verified: true, via: "player" };
  if (organizer?.isPaid) return { verified: true, via: "organizer" };
  if (club?.isPaid) return { verified: true, via: "club" };
  return { verified: false, via: null };
}
