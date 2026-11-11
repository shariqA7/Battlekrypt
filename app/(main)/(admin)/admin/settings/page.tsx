import { requireStaffPage } from "@/lib/admin-page";
import { settingsGroupsFor } from "@/lib/settings-groups";
import SettingsHub from "@/components/admin/SettingsHub";

// /admin/settings: every setting as a card, grouped.
export default async function SettingsIndex() {
  const staff = await requireStaffPage("settings");
  return <SettingsHub groups={settingsGroupsFor(staff)} />;
}
