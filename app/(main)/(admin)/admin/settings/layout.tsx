import { requireAdminPage } from "@/lib/admin-page";
import { SectionHeading } from "@/components/ui/Panel";
import SubTabs from "@/components/admin/SubTabs";
import { ADMIN_SUBTABS } from "@/components/admin/adminNav";

// Settings is split into sub tabs, one page per group of settings.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Settings</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">Branding, payment instructions and platform rules.</p>
      </div>
      <SubTabs tabs={ADMIN_SUBTABS["/admin/settings"]} label="Settings sections" />
      {children}
    </div>
  );
}
