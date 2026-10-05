import { requireAdminPage } from "@/lib/admin-page";
import { getSiteSettings, listCarouselSlides } from "@/lib/services/tournaments";
import { getClubPaymentInstructions } from "@/lib/services/clubs";
import BrandingManager from "../BrandingManager";
import ClubFeeSettings from "../ClubFeeSettings";
import TierSettingsManager from "../TierSettingsManager";
import { listTierSettings } from "@/lib/services/competitive-tiers";
import PlanSettings from "../PlanSettings";
import { getPlanSettings } from "@/lib/services/plan-requests";
import ChallengeSettings from "../ChallengeSettings";
import { getChallengeReviewUsd } from "@/lib/services/challenges";

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const [siteSettings, slides, instructions, planSettings, tierSettings, challengeReviewUsd] = await Promise.all([
    getSiteSettings(),
    listCarouselSlides(),
    getClubPaymentInstructions(),
    getPlanSettings(),
    listTierSettings(),
    getChallengeReviewUsd(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Settings</h1>
        <p className="font-sans text-[13px] text-bk-body">Branding and payment instructions.</p>
      </div>
      <BrandingManager initialLogoUrl={siteSettings.logoUrl ?? ""} initialSlides={slides} />
      <ClubFeeSettings initialInstructions={instructions ?? ""} />
      <ChallengeSettings initialUsd={challengeReviewUsd} />
      <TierSettingsManager
        initialSettings={tierSettings
          // "none" means "not competitive" — it is never a configurable tier.
          .filter((s): s is typeof s & { tier: Exclude<typeof s.tier, "none"> } => s.tier !== "none")
          .map((s) => ({
            ...s,
            minPrizePoolUsd: s.minPrizePoolUsd.toString(),
          }))}
      />
      <PlanSettings
        initialInstructions={planSettings.planPaymentInstructions ?? ""}
        initialAdsEnabled={planSettings.adsEnabled}
      />
    </div>
  );
}
