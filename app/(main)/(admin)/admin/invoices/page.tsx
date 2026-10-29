import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { listInvoicesPage, type InvoiceFilter } from "@/lib/services/invoices";
import { listPlans } from "@/lib/services/plan-requests";
import { getInvoiceSettings } from "@/lib/services/payment-methods";
import { getEnabledCurrencies } from "@/lib/services/currencies";
import { formatMoney } from "@/lib/money";
import { SectionHeading } from "@/components/ui/Panel";
import InvoiceStatusBadge from "@/components/invoices/StatusBadge";
import CreateInvoiceForm, { type PlanOption } from "./CreateInvoiceForm";

const TABS: { key: InvoiceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Awaiting payment" },
  { key: "proof_submitted", label: "Proof to check" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
];

export default async function AdminInvoicesPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const filter = TABS.find((t) => t.key === sp.filter)?.key ?? "all";
  const q = (sp.q ?? "").trim().slice(0, 100);

  const [page, plans, settings, enabled] = await Promise.all([
    listInvoicesPage({ q, cursor: null, limit: 50 }, filter),
    listPlans({ audience: "organizer", activeOnly: true }),
    getInvoiceSettings(),
    getEnabledCurrencies(),
  ]);
  const planOptions: PlanOption[] = plans
    .filter((p) => p.isPaid)
    .map((p) => ({ code: p.code, name: p.name, priceAmount: p.priceAmount, priceCurrency: p.priceCurrency, depositAmount: p.depositAmount, days: p.durationDays }));
  const currencies = Array.from(new Set(["PKR", ...enabled]));

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>Invoices</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          An invoice is created when an organization is added with billing on, or when an application is approved. When the money arrives,
          open the invoice and mark it paid: the plan starts and the payment is recorded.
        </p>
      </div>

      <CreateInvoiceForm plans={planOptions} currencies={currencies} defaultTaxRate={settings.invoiceTaxRate} taxLabel={settings.invoiceTaxLabel} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Invoice filter">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/invoices?filter=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`font-sans text-[12px] px-3 py-1.5 border ${filter === t.key ? "border-bk-gold-light text-bk-gold-light" : "border-bk-border text-bk-body hover:text-bk-heading"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form className="flex gap-2" action="/admin/invoices">
          <input type="hidden" name="filter" value={filter} />
          <input name="q" defaultValue={q} placeholder="Invoice number or organization" className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[34px] w-64" />
          <button className="font-sans text-[11px] font-bold uppercase tracking-[0.8px] border border-bk-border px-3 text-bk-body hover:text-bk-heading">Search</button>
        </form>
      </div>

      <div className="overflow-x-auto border border-bk-border">
        <table className="w-full font-sans text-[12px]">
          <thead className="bg-bk-surface text-bk-muted text-left uppercase tracking-[0.6px] text-[10px]">
            <tr>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Organization</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Issued</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bk-border">
            {page.items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-bk-muted">No invoices here.</td></tr>
            )}
            {page.items.map((i) => (
              <tr key={i.id} className="hover:bg-bk-surface-hover">
                <td className="px-3 py-2"><Link href={`/admin/invoices/${i.id}`} className="font-mono text-bk-gold-light underline">{i.number}</Link></td>
                <td className="px-3 py-2 text-bk-heading">{i.orgName}</td>
                <td className="px-3 py-2 font-mono text-bk-heading">{formatMoney(i.total, i.currency)}</td>
                <td className="px-3 py-2 text-bk-muted">{new Date(i.issuedAt).toLocaleDateString("en-GB")}</td>
                <td className="px-3 py-2 text-bk-muted">{i.dueDate ? new Date(`${i.dueDate}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" }) : "—"}</td>
                <td className="px-3 py-2"><InvoiceStatusBadge status={i.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page.nextCursor && <p className="font-sans text-[11px] text-bk-muted">Showing the latest 50. Use search or a filter to narrow the list.</p>}
    </div>
  );
}
