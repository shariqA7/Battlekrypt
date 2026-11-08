import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/admin-page";
import { hasAccess } from "@/lib/staff-permissions";
import { getGameForAdmin } from "@/lib/services/games-admin";
import { SectionHeading } from "@/components/ui/Panel";
import GameForm from "../GameForm";

export const dynamic = "force-dynamic";

export default async function EditGamePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("games");
  const game = await getGameForAdmin((await params).id);
  if (!game) notFound();

  return (
    <div className="space-y-5">
      <SectionHeading>{game.name}</SectionHeading>
      <GameForm
        mode="edit"
        game={game}
        canEdit={hasAccess(staff, "games", "edit")}
        canDelete={staff.role === "super_admin"}
      />
    </div>
  );
}
