import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { listCustomRequestsForAdmin } from "@/lib/services/custom-plans";
import { listPlans } from "@/lib/services/plan-requests";
import { getEnabledCurrencies } from "@/lib/services/currencies";
import { SectionHeading } from "@/components/ui/Panel";
import CustomPlansManager from "./CustomPlansManager";

export default async function AdminCustomPlansPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage("plans");
  const status = (await searchParams).status ?? "open";
  const [items, currencies, plans] = await Promise.all([
    listCustomRequestsForAdmin(status === "all" ? null : status),
    getEnabledCurrencies(),
    listPlans({ audience: "organizer", activeOnly: true }),
  ]);
  const chip = (active: boolean) => `font-sans text-[12px] px-3 py-1.5 border ${active ? "border-bk-gold-from text-bk-gold-light" : "border-bk-border text-bk-body hover:text-bk-heading"}`;
  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Custom plan requests</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          Organizers who used &quot;Customize your plan → Talk to sales&quot;. Look at what they asked for, set a price and send a quote. That makes a plan only they can see and buy. It then goes through the normal plan payment and approval.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[["open", "New"], ["quoted", "Quoted"], ["closed", "Closed"], ["all", "All"]].map(([k, l]) => (
          <Link key={k} href={`/admin/custom-plans?status=${k}`} className={chip(status === k)}>{l}</Link>
        ))}
      </div>
      <CustomPlansManager
        items={items.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        currencies={currencies}
        publicPlans={plans.filter((p) => !p.isPrivate).map((p) => ({ name: p.name, price: p.priceAmount, currency: p.priceCurrency, days: p.durationDays }))}
      />
    </div>
  );
}
