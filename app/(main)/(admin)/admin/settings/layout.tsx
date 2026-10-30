import { requireStaffPage } from "@/lib/admin-page";
import { areaForAdminPath, hasAccess } from "@/lib/staff-permissions";
import { SectionHeading } from "@/components/ui/Panel";
import SubTabs from "@/components/admin/SubTabs";
import { ADMIN_SUBTABS } from "@/components/admin/adminNav";

// Settings is split into sub tabs, one page per group of settings.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaffPage("settings");
  // Billing is money: it only shows for staff who also have the Payments permission.
  const tabs = ADMIN_SUBTABS["/admin/settings"].filter((t) => hasAccess(staff, areaForAdminPath(t.href)!));
  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Settings</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">Branding, payment instructions and platform rules.</p>
      </div>
      <SubTabs tabs={tabs} label="Settings sections" />
      {children}
    </div>
  );
}
