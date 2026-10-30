import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page";
import { ADMIN_SUBTABS } from "@/components/admin/adminNav";

// /admin/settings opens its first sub tab.
export default async function SettingsIndex() {
  await requireAdminPage("settings");
  redirect(ADMIN_SUBTABS["/admin/settings"][0].href);
}
