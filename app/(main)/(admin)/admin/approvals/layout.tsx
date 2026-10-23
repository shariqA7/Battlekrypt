import { requireAdminPage } from "@/lib/admin-page";
import { getAttentionCounts } from "@/lib/services/admin-attention";
import { SectionHeading } from "@/components/ui/Panel";
import SubTabs from "@/components/admin/SubTabs";
import { ADMIN_SUBTABS } from "@/components/admin/adminNav";

// Approvals is split into sub tabs, one page per queue. Each tab loads only its
// own data; the badges come from the shared pending counts.
export default async function ApprovalsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  const { items } = await getAttentionCounts();

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Approvals</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">Everything waiting for an admin decision, one queue per tab.</p>
      </div>
      <SubTabs tabs={ADMIN_SUBTABS["/admin/approvals"]} counts={items} label="Approval queues" />
      {children}
    </div>
  );
}
