import { requireAdminPage } from "@/lib/admin-page";
import { listPlans } from "@/lib/services/plan-requests";
import PlanManager from "../PlanManager";

export default async function AdminPlansPage() {
  await requireAdminPage();
  const plans = await listPlans();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Plans</h1>
        <p className="font-sans text-[13px] text-bk-body">
          Prices, durations and feature limits for Organizer, Club and Player plans.
        </p>
      </div>
      <PlanManager initialPlans={plans} />
    </div>
  );
}
