import { requireAdminPage } from "@/lib/admin-page";
import { getClubPaymentInstructions } from "@/lib/services/clubs";
import ClubFeeSettings from "../../ClubFeeSettings";

export default async function SettingsClubsPage() {
  await requireAdminPage();
  const instructions = await getClubPaymentInstructions();
  return <ClubFeeSettings initialInstructions={instructions ?? ""} />;
}
