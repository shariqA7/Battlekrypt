import { requireStaffPage } from "@/lib/admin-page";
import { attentionForStaff, getAttentionCounts } from "@/lib/services/admin-attention";
import { visibleAreas } from "@/lib/staff-permissions";
import { cookies } from "next/headers";
import AdminShell from "@/components/admin/AdminShell";
import { ADMIN_SIDEBAR_COOKIE } from "@/components/admin/adminNav";

// Shell for every /admin page: a collapsible sidebar, breadcrumbs, and a wide
// content area (see AdminShell). Each page still calls requireAdminPage(area)
// itself, because layouts are skipped on client-side navigation.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaffPage();
  const defaultCollapsed = (await cookies()).get(ADMIN_SIDEBAR_COOKIE)?.value === "collapsed";

  const { total: pending, items: counts } = attentionForStaff((await getAttentionCounts()).items, staff);

  return (
    <AdminShell pending={pending} counts={counts} allowed={visibleAreas(staff)} defaultCollapsed={defaultCollapsed}>
      {children}
    </AdminShell>
  );
}
