import { requireAdminPage } from "@/lib/admin-page";
import { getPlanSettings, listPlans } from "@/lib/services/plan-requests";
import { listPlanFields } from "@/lib/services/plan-fields";
import { getEnabledCurrencies } from "@/lib/services/currencies";
import PlanManager from "../PlanManager";
import { SectionHeading } from "@/components/ui/Panel";

export default async function AdminPlansPage() {
  await requireAdminPage();
  const [plans, fields, settings, currencies] = await Promise.all([
    listPlans(),
    listPlanFields(),
    getPlanSettings(),
    getEnabledCurrencies(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <SectionHeading>Plans</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          Prices, durations and feature limits for Organizer, Club and Player plans.
        </p>
      </div>
      <PlanManager
        initialPlans={plans}
        fields={fields.map((f) => ({ id: f.id, audience: f.audience, label: f.label, kind: f.kind }))}
        depositEnabled={settings.depositEnabled}
        currencies={currencies}
      />
    </div>
  );
}
