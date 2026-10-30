import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { getLedger } from "@/lib/services/ledger";
import { getEnabledCurrencies } from "@/lib/services/currencies";
import { RANGE_PRESETS, categoryLabel, resolveRange } from "@/lib/ledger-math";
import { formatMoney } from "@/lib/money";
import { SectionHeading } from "@/components/ui/Panel";
import ExpenseManager from "./ExpenseManager";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC" });

function Line({ label, value, currency, sub, strong, minus }: { label: string; value: number; currency: string; sub?: string; strong?: boolean; minus?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? "border-t border-bk-border mt-1 pt-2" : ""}`}>
      <span className={`font-sans text-[13px] ${strong ? "font-bold text-bk-heading" : "text-bk-body"}`}>
        {label}
        {sub && <span className="block text-[11px] text-bk-muted">{sub}</span>}
      </span>
      <span className={`font-mono text-[13px] shrink-0 ${strong ? "font-bold text-bk-gold-light text-[15px]" : "text-bk-heading"}`}>
        {minus && value > 0 ? "− " : ""}{formatMoney(value, currency)}
      </span>
    </div>
  );
}

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ preset?: string; from?: string; to?: string }> }) {
  await requireAdminPage("ledger");
  const sp = await searchParams;
  const range = resolveRange(sp.preset, sp.from, sp.to);
  const [ledger, enabled] = await Promise.all([getLedger(range), getEnabledCurrencies()]);
  const currencies = Array.from(new Set(["PKR", ...enabled]));
  const qs = range.preset === "custom" ? `preset=custom&from=${sp.from}&to=${sp.to}` : `preset=${range.preset}`;

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Ledger</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          What you earned, the tax you collected, what you spent, and the profit. Each currency is shown on its own and never converted. Dates are UTC.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Period">
          {RANGE_PRESETS.map((p) => (
            <Link key={p.key} href={`/admin/ledger?preset=${p.key}`} className={`font-sans text-[12px] px-3 py-1.5 border ${range.preset === p.key ? "border-bk-gold-light text-bk-gold-light" : "border-bk-border text-bk-body hover:text-bk-heading"}`}>
              {p.label}
            </Link>
          ))}
        </nav>
        <form action="/admin/ledger" className="flex items-end gap-2 font-sans text-[12px] text-bk-muted">
          <input type="hidden" name="preset" value="custom" />
          <label>From <input type="date" name="from" defaultValue={sp.from} className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] px-2 h-[34px]" /></label>
          <label>To <input type="date" name="to" defaultValue={sp.to} className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] px-2 h-[34px]" /></label>
          <button className="font-sans text-[11px] font-bold uppercase tracking-[0.8px] border border-bk-border px-3 h-[34px] text-bk-body hover:text-bk-heading">Show</button>
        </form>
      </div>
      <p className="font-sans text-[12px] text-bk-muted">
        Showing <span className="text-bk-heading">{range.label}</span> ·{" "}
        <a href={`/api/admin/ledger/export?${qs}`} className="text-bk-gold-light underline">Download CSV for your accountant</a>
      </p>

      {ledger.summaries.length === 0 && <p className="font-sans text-[13px] text-bk-muted">Nothing recorded in this period yet.</p>}

      {ledger.summaries.map((s) => {
        const held = ledger.heldNow.find((h) => h.currency === s.currency)?.amount ?? 0;
        const cats = Object.entries(s.expensesByCategory).filter(([, v]) => v > 0);
        return (
          <section key={s.currency} className="bg-bk-surface border border-bk-border p-4">
            <p className="font-sans font-bold text-[12px] uppercase tracking-[0.8px] text-bk-muted mb-2">{s.currency}</p>
            <Line label="Gross received" value={s.gross} currency={s.currency} sub="Everything customers paid, tax and security fees included" />
            <Line label="Tax collected from users" value={s.taxCollected} currency={s.currency} sub="Owed to the tax authority — not your income" minus />
            <Line label="Gateway fees" value={s.gatewayFees} currency={s.currency} sub="Passed to the customer on the invoice" minus />
            <Line label="Security fees held" value={s.depositsHeld} currency={s.currency} sub="Refundable — held for organizations, not income" minus />
            {s.forfeitedDeposits > 0 && <Line label="Forfeited security fees" value={s.forfeitedDeposits} currency={s.currency} sub="Kept, so counted as income" />}
            <Line label="Net revenue" value={s.netRevenue} currency={s.currency} strong />
            {cats.length > 0 && (
              <div className="mt-2">
                {cats.map(([k, v]) => <Line key={k} label={categoryLabel(k)} value={v} currency={s.currency} minus />)}
              </div>
            )}
            <Line label="Total expenses" value={s.expenses} currency={s.currency} minus />
            <Line label="Profit before tax" value={s.profit} currency={s.currency} sub="Net revenue minus expenses — what tax on your profit is based on" strong />
            <p className="font-sans text-[11px] text-bk-muted mt-3">
              Security fees held right now: {formatMoney(held, s.currency)}
              {s.depositsRefunded > 0 && ` · returned to organizations in this period: ${formatMoney(s.depositsRefunded, s.currency)}`}
              {s.discountsGiven > 0 && ` · discounts given: ${formatMoney(s.discountsGiven, s.currency)}`}
              {s.waived > 0 && ` · invoices waived: ${formatMoney(s.waived, s.currency)}`}
              {s.otherPayments > 0 && ` · includes ${formatMoney(s.otherPayments, s.currency)} of other recorded payments (no tax breakdown)`}
            </p>
          </section>
        );
      })}

      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-2">Income</p>
        <div className="overflow-x-auto border border-bk-border">
          <table className="w-full font-sans text-[12px]">
            <thead className="bg-bk-surface text-bk-muted text-left uppercase tracking-[0.6px] text-[10px]">
              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">From</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Tax</th><th className="px-3 py-2 text-right">Security fee</th><th className="px-3 py-2 text-right">Income</th></tr>
            </thead>
            <tbody className="divide-y divide-bk-border">
              {ledger.entries.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-bk-muted">No income in this period.</td></tr>}
              {ledger.entries.map((e) => (
                <tr key={`${e.type}-${e.id}`}>
                  <td className="px-3 py-2 text-bk-muted">{fmtDate(e.date)}</td>
                  <td className="px-3 py-2 font-mono">{e.invoiceId ? <Link href={`/admin/invoices/${e.invoiceId}`} className="text-bk-gold-light underline">{e.reference}</Link> : e.reference}</td>
                  <td className="px-3 py-2 text-bk-heading">{e.description}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.gross ? formatMoney(e.gross, e.currency) : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-bk-muted">{e.tax ? formatMoney(e.tax, e.currency) : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-bk-muted">{e.deposit ? formatMoney(e.deposit, e.currency) : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-bk-heading">{formatMoney(e.net, e.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ledger.entriesTotal > ledger.entries.length && <p className="font-sans text-[11px] text-bk-muted mt-1">Showing the latest {ledger.entries.length} of {ledger.entriesTotal}. The CSV has all of them.</p>}
      </section>

      <ExpenseManager expenses={ledger.expenses} total={ledger.expensesTotal} currencies={currencies} />
    </div>
  );
}
