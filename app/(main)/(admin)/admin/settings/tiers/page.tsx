import { requireAdminPage } from "@/lib/admin-page";
import { listTierSettings } from "@/lib/services/competitive-tiers";
import TierSettingsManager from "../../TierSettingsManager";

export default async function SettingsTiersPage() {
  await requireAdminPage("settings");
  const tierSettings = await listTierSettings();
  return (
    <TierSettingsManager
      initialSettings={tierSettings
        // "none" means "not competitive" — it is never a configurable tier.
        .filter((s): s is typeof s & { tier: Exclude<typeof s.tier, "none"> } => s.tier !== "none")
        .map((s) => ({
          ...s,
          minPrizePoolUsd: s.minPrizePoolUsd.toString(),
        }))}
    />
  );
}
