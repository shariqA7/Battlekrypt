import { requireStaffPage } from "@/lib/admin-page";
import { settingsGroupsFor } from "@/lib/settings-groups";
import SettingsFrame from "@/components/admin/SettingsFrame";

// Settings: a card hub at /admin/settings, and a sidebar next to each settings
// page (see SettingsFrame). Every page still checks its own permission.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaffPage("settings");
  return <SettingsFrame groups={settingsGroupsFor(staff)}>{children}</SettingsFrame>;
}
