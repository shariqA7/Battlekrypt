import { requireAdminPage } from "@/lib/admin-page";
import { getPlanSettings, listPlans } from "@/lib/services/plan-requests";
import { listPlanFields } from "@/lib/services/plan-fields";
import { getEnabledCurrencies } from "@/lib/services/currencies";
import PlanManager from "../PlanManager";
import CreatePlanCard from "../CreatePlanCard";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/Panel";

export default async function AdminPlansPage() {
  await requireAdminPage("plans");
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
          Prices, durations and feature limits for Organizer, Club and Player plans. Plans marked &quot;Custom quote&quot; were made for one organizer from a{" "}
          <Link href="/admin/custom-plans" className="text-bk-gold-light underline">custom plan request</Link>.
        </p>
        <div className="pl-[19px] mt-3"><CreatePlanCard currencies={currencies} /></div>
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
