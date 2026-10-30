import { requireStaffPage } from "@/lib/admin-page";
import { attentionForStaff, getAttentionCounts } from "@/lib/services/admin-attention";
import { areaForAdminPath, hasAccess } from "@/lib/staff-permissions";
import { SectionHeading } from "@/components/ui/Panel";
import SubTabs from "@/components/admin/SubTabs";
import { ADMIN_SUBTABS } from "@/components/admin/adminNav";

// Approvals is split into sub tabs, one page per queue. Each tab loads only its
// own data; the badges come from the shared pending counts.
export default async function ApprovalsLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaffPage("approvals");
  const { items } = attentionForStaff((await getAttentionCounts()).items, staff);
  const tabs = ADMIN_SUBTABS["/admin/approvals"].filter((t) => hasAccess(staff, areaForAdminPath(t.href)!));

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Approvals</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">Everything waiting for an admin decision, one queue per tab.</p>
      </div>
      <SubTabs tabs={tabs} counts={items} label="Approval queues" />
      {children}
    </div>
  );
}
