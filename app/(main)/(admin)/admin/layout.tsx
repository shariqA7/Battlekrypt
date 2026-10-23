import { requireAdminPage } from "@/lib/admin-page";
import { getAttentionCounts } from "@/lib/services/admin-attention";
import { cookies } from "next/headers";
import AdminShell from "@/components/admin/AdminShell";
import { ADMIN_SIDEBAR_COOKIE } from "@/components/admin/adminNav";

// Shell for every /admin page: a collapsible sidebar, breadcrumbs, and a wide
// content area (see AdminShell). Each page still calls requireAdminPage()
// itself, because layouts are skipped on client-side navigation.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  const defaultCollapsed = (await cookies()).get(ADMIN_SIDEBAR_COOKIE)?.value === "collapsed";

  const { total: pending } = await getAttentionCounts();

  return (
    <AdminShell pending={pending} defaultCollapsed={defaultCollapsed}>
      {children}
    </AdminShell>
  );
}
