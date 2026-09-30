// Who sees ads (spec §7): free-tier accounts see them on browse/listing,
// tournament detail and dashboard pages; paid accounts are ad-free. Ads are
// NEVER shown on room ID/password reveal or payment screens — AdSlot only
// accepts the placements listed here, and none of them is one of those.
//
// A person may hold several accounts (player + organizer + club). They are
// ad-free if ANY of their accounts is on an active paid plan. Logged-out
// visitors always see ads (when ads are enabled at all).

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resolvePlan } from "@/lib/plans";

export type AdPlacement = "browse" | "tournament_detail" | "dashboard";

export const viewerIsAdFree = async (userId: string): Promise<boolean> => {
  const [player, organizer, club] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { userId } }),
    prisma.organizerProfile.findUnique({ where: { userId } }),
    prisma.clubProfile.findUnique({ where: { userId } }),
  ]);

  const plans = await Promise.all([
    player && resolvePlan("player", player),
    organizer && resolvePlan("organizer", organizer),
    club &&
      resolvePlan("club", {
        planCode: club.subscriptionPlanCode,
        planExpiresAt: club.planExpiresAt,
      }),
  ]);
  return plans.some((p) => p?.isPaid === true);
};

// Memoised per request so several AdSlots on one page cost one lookup.
export const shouldShowAds = cache(async (): Promise<boolean> => {
  const settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  if (!settings?.adsEnabled) return false;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return true;

  return !(await viewerIsAdFree(user.id));
});
