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

import type { AdPlacement, AdViewer } from "@/lib/ad-rules";
export type { AdPlacement };

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

// What the AdSlot needs, once per request: whether to show ads at all, who is looking (a visitor
// counts as a player), and the AdSense settings.
export type AdContext =
  | { show: false }
  | { show: true; viewer: AdViewer; adsense: { clientId: string | null; euConsentReady: boolean; slots: { browse: string | null; tournament_detail: string | null; dashboard: string | null } } };

export const getAdContext = cache(async (): Promise<AdContext> => {
  const settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  if (!settings?.adsEnabled) return { show: false };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let viewer: AdViewer = { player: true, organizer: false };
  if (user) {
    if (await viewerIsAdFree(user.id)) return { show: false };
    const [player, organizer] = await Promise.all([
      prisma.playerProfile.findUnique({ where: { userId: user.id }, select: { userId: true } }),
      prisma.organizerProfile.findUnique({ where: { userId: user.id }, select: { userId: true } }),
    ]);
    viewer = { player: !!player || !organizer, organizer: !!organizer };
  }
  return {
    show: true,
    viewer,
    adsense: {
      clientId: settings.adsenseClientId,
      euConsentReady: settings.adsenseEuConsentReady,
      slots: { browse: settings.adsenseSlotBrowse, tournament_detail: settings.adsenseSlotTournament, dashboard: settings.adsenseSlotDashboard },
    },
  };
});
