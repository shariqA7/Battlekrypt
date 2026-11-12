import { requireAdminPage } from "@/lib/admin-page";
import { getAdsenseSettings, listCampaignsWithStats } from "@/lib/services/ads";
import AdsManager from "./AdsManager";

export default async function AdminAdsPage() {
  await requireAdminPage("ads");
  const [campaigns, settings] = await Promise.all([listCampaignsWithStats(), getAdsenseSettings()]);
  return (
    <AdsManager
      adsEnabled={settings.adsEnabled}
      adsense={{
        adsenseClientId: settings.adsenseClientId ?? "",
        adsenseSlotBrowse: settings.adsenseSlotBrowse ?? "",
        adsenseSlotTournament: settings.adsenseSlotTournament ?? "",
        adsenseSlotDashboard: settings.adsenseSlotDashboard ?? "",
      }}
      euConsentReady={settings.adsenseEuConsentReady}
      campaigns={campaigns.map((c) => ({
        id: c.id, name: c.name, advertiser: c.advertiser, imageUrl: c.imageUrl, linkUrl: c.linkUrl, altText: c.altText,
        placements: c.placements, audience: c.audience, weight: c.weight, active: c.active, live: c.live,
        startsAt: c.startsAt.toISOString(), endsAt: c.endsAt ? c.endsAt.toISOString() : null,
        paidAmount: c.paidAmount, paidCurrency: c.paidCurrency,
        impressions: c.impressions, clicks: c.clicks, impressions30: c.impressions30, clicks30: c.clicks30,
      }))}
    />
  );
}
