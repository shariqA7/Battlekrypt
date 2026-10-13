import { requireAdminPage } from "@/lib/admin-page";
import { listPlans } from "@/lib/services/plan-requests";
import PlanManager from "../PlanManager";
import { SectionHeading } from "@/components/ui/Panel";

export default async function AdminPlansPage() {
  await requireAdminPage();
  const plans = await listPlans();

  return (
    <div className="space-y-10">
      <div>
        <SectionHeading>Plans</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          Prices, durations and feature limits for Organizer, Club and Player plans.
        </p>
      </div>
      <PlanManager initialPlans={plans} />
    </div>
  );
}
