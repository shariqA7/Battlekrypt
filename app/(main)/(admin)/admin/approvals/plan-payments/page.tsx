import { requireAdminPage } from "@/lib/admin-page";
import { listPendingPlanRequests } from "@/lib/services/plan-requests";
import PlanRequestsQueue from "../../PlanRequestsQueue";

export default async function ApprovalsPlanPaymentsPage() {
  await requireAdminPage("payments");
  const planRequests = await listPendingPlanRequests();
  return <PlanRequestsQueue initial={planRequests} />;
}
