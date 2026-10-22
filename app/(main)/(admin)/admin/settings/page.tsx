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
import LoginOptionsSettings from "../LoginOptionsSettings";
import { getLoginOptions } from "@/lib/services/login-options";
import { SectionHeading } from "@/components/ui/Panel";

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const [siteSettings, slides, instructions, planSettings, tierSettings, challengeReviewUsd, loginOptions] = await Promise.all([
    getSiteSettings(),
    listCarouselSlides(),
    getClubPaymentInstructions(),
    getPlanSettings(),
    listTierSettings(),
    getChallengeReviewUsd(),
    getLoginOptions(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <SectionHeading>Settings</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">Branding and payment instructions.</p>
      </div>
      <BrandingManager initialLogoUrl={siteSettings.logoUrl ?? ""} initialSlides={slides} />
      <ClubFeeSettings initialInstructions={instructions ?? ""} />
      <LoginOptionsSettings initialTwitch={loginOptions.twitch} />
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
