import { requireStaffPage } from "@/lib/admin-page";
import { hasAccess } from "@/lib/staff-permissions";
import { listGamesForAdmin } from "@/lib/services/games-admin";
import { SectionHeading } from "@/components/ui/Panel";
import { ButtonLink } from "@/components/ui/Button";
import GamesList from "./GamesList";

export const dynamic = "force-dynamic";

export default async function AdminGamesPage() {
  const staff = await requireStaffPage("games");
  const games = await listGamesForAdmin();
  const canEdit = hasAccess(staff, "games", "edit");
  const hidden = games.filter((g) => !g.isApproved).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionHeading>Games</SectionHeading>
          <p className="font-sans text-[13px] text-bk-body pl-[19px]">
            {games.length} games{hidden > 0 ? `, ${hidden} hidden from players` : ""}. Team size and region rules are not edited here.
          </p>
        </div>
        {canEdit && <ButtonLink href="/admin/games/new" size="sm">Add game</ButtonLink>}
      </div>
      <GamesList initial={games} canEdit={canEdit} />
    </div>
  );
}
