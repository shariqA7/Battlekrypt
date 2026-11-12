// A single ad slot. Renders nothing for ad-free (paid) accounts, and nothing at all while ads are
// switched off in the admin panel (the default).
//
// What fills it, in order:
//   1. a sponsor banner an admin sold directly (Admin > Ads), if one fits this placement and viewer
//   2. Google AdSense, if a publisher ID is set. In the EU/UK/Switzerland only once the admin has
//      confirmed a consent message is live (see adsenseAllowedIn)
//   3. nothing: an empty slot takes no space
//
// Never place this on a room ID/password reveal or a payment screen.

import { headers } from "next/headers";
import { getAdContext, type AdPlacement } from "@/lib/ads";
import { pickAd } from "@/lib/services/ads";
import { adsenseAllowedIn } from "@/lib/ad-rules";
import SponsorAd from "@/components/ui/SponsorAd";
import AdSenseUnit from "@/components/ui/AdSenseUnit";

export default async function AdSlot({ placement }: { placement: AdPlacement }) {
  const ctx = await getAdContext();
  if (!ctx.show) return null;

  const ad = await pickAd(placement, ctx.viewer).catch(() => null);
  if (ad) return <SponsorAd id={ad.id} imageUrl={ad.imageUrl} altText={ad.altText} placement={placement} />;

  const slot = ctx.adsense.slots[placement];
  if (ctx.adsense.clientId && slot) {
    const country = (await headers()).get("x-vercel-ip-country");
    if (adsenseAllowedIn(country, ctx.adsense.euConsentReady)) return <AdSenseUnit clientId={ctx.adsense.clientId} slot={slot} placement={placement} />;
  }
  return null;
}
