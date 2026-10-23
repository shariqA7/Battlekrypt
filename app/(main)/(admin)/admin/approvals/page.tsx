import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page";
import { getAttentionCounts } from "@/lib/services/admin-attention";
import { ADMIN_SUBTABS } from "@/components/admin/adminNav";

// /admin/approvals has no content of its own: it opens the first queue that has
// something waiting (or Organizations when everything is clear).
export default async function ApprovalsIndex() {
  await requireAdminPage();
  const { items } = await getAttentionCounts();
  const tabs = ADMIN_SUBTABS["/admin/approvals"];
  const first = tabs.find((t) => t.countKey && (items as Record<string, number>)[t.countKey] > 0) ?? tabs[0];
  redirect(first.href);
}
