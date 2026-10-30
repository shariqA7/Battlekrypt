import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/admin-page";
import { attentionForStaff, getAttentionCounts } from "@/lib/services/admin-attention";
import { areaForAdminPath, hasAccess } from "@/lib/staff-permissions";
import { ADMIN_SUBTABS } from "@/components/admin/adminNav";

// /admin/approvals has no content of its own: it opens the first queue that has
// something waiting (or Organizations when everything is clear).
export default async function ApprovalsIndex() {
  const staff = await requireStaffPage("approvals");
  const { items } = attentionForStaff((await getAttentionCounts()).items, staff);
  const tabs = ADMIN_SUBTABS["/admin/approvals"].filter((t) => hasAccess(staff, areaForAdminPath(t.href)!));
  const first = tabs.find((t) => t.countKey && (items as Record<string, number>)[t.countKey] > 0) ?? tabs[0];
  redirect(first.href);
}
