import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { listClubsPage } from "@/lib/services/admin-lists";
import { ADMIN_PAGE_SIZE } from "@/lib/admin-paging";
import { SectionHeading } from "@/components/ui/Panel";
import ClubsList from "./ClubsList";

export default async function AdminClubsPage() {
  await requireAdminPage();
  const [total, initial] = await Promise.all([prisma.clubProfile.count(), listClubsPage({ q: "", cursor: null, limit: ADMIN_PAGE_SIZE })]);

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>Clubs &amp; teams</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">{total} clubs created</p>
      </div>
      <ClubsList initial={initial} />
    </div>
  );
}
