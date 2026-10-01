import { requireAdminPage } from "@/lib/admin-page";
import { getSiteSettings, listCarouselSlides } from "@/lib/services/tournaments";
import { getClubPaymentInstructions } from "@/lib/services/clubs";
import BrandingManager from "../BrandingManager";
import ClubFeeSettings from "../ClubFeeSettings";
import PlanSettings from "../PlanSettings";
import { getPlanSettings } from "@/lib/services/plan-requests";

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const [siteSettings, slides, instructions, planSettings] = await Promise.all([
    getSiteSettings(),
    listCarouselSlides(),
    getClubPaymentInstructions(),
    getPlanSettings(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Settings</h1>
        <p className="font-sans text-[13px] text-bk-body">Branding and payment instructions.</p>
      </div>
      <BrandingManager initialLogoUrl={siteSettings.logoUrl ?? ""} initialSlides={slides} />
      <ClubFeeSettings initialInstructions={instructions ?? ""} />
      <PlanSettings
        initialInstructions={planSettings.planPaymentInstructions ?? ""}
        initialAdsEnabled={planSettings.adsEnabled}
      />
    </div>
  );
}
