import { requireAdminPage } from "@/lib/admin-page";
import { getPlanSettings } from "@/lib/services/plan-requests";
import PlanSettings from "../../PlanSettings";

export default async function SettingsPlansPage() {
  await requireAdminPage();
  const planSettings = await getPlanSettings();
  return (
    <PlanSettings
      initialInstructions={planSettings.planPaymentInstructions ?? ""}
      initialAdsEnabled={planSettings.adsEnabled}
      initialDepositEnabled={planSettings.depositEnabled}
      initialDepositRefundDays={planSettings.depositRefundDays}
      initialDepositMultiplier={planSettings.depositExposureMultiplier}
    />
  );
}
