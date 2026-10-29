import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { listUsersPage } from "@/lib/services/admin-lists";
import { ADMIN_PAGE_SIZE } from "@/lib/admin-paging";
import { SectionHeading } from "@/components/ui/Panel";
import UsersList from "./UsersList";

export default async function AdminUsersPage() {
  await requireAdminPage();
  const [total, initial] = await Promise.all([prisma.user.count(), listUsersPage({ q: "", cursor: null, limit: ADMIN_PAGE_SIZE })]);

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>Users</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          {total} account{total === 1 ? "" : "s"}
        </p>
      </div>
      <UsersList initial={initial} />
    </div>
  );
}
