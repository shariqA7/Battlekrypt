import { requireAdminPage } from "@/lib/admin-page";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import FeatureSwitches from "../../FeatureSwitches";

export default async function SettingsFeaturesPage() {
  await requireAdminPage();
  return <FeatureSwitches initial={await getFeatureFlags()} />;
}
