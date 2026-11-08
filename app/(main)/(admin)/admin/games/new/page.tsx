import { requireAdminPage } from "@/lib/admin-page";
import { SectionHeading } from "@/components/ui/Panel";
import GameForm from "../GameForm";

export default async function NewGamePage() {
  await requireAdminPage("games", "edit");
  return (
    <div className="space-y-5">
      <SectionHeading>Add game</SectionHeading>
      <GameForm mode="create" canEdit canDelete={false} />
    </div>
  );
}
