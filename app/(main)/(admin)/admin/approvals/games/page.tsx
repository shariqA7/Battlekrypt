import { requireAdminPage } from "@/lib/admin-page";
import { listPendingGameRequests } from "@/lib/services/tournaments";
import AdminQueues from "../../AdminQueues";

export default async function ApprovalsGamesPage() {
  await requireAdminPage("approvals");
  const pendingGameRequests = await listPendingGameRequests();
  return <AdminQueues show={["games"]} initialGameRequests={pendingGameRequests} />;
}
