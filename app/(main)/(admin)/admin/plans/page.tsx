import { requireAdminPage } from "@/lib/admin-page";
import { listPlans } from "@/lib/services/plan-requests";
import PlanManager from "../PlanManager";
import { getEnabledCurrencies } from "@/lib/services/currencies";
import { SectionHeading } from "@/components/ui/Panel";

export default async function AdminPlansPage() {
  await requireAdminPage();
  const [plans, currencies] = await Promise.all([listPlans(), getEnabledCurrencies()]);

  return (
    <div className="space-y-10">
      <div>
        <SectionHeading>Plans</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          Prices, durations and feature limits for Organizer, Club and Player plans.
        </p>
      </div>
      <PlanManager initialPlans={plans} currencies={currencies} />
    </div>
  );
}
