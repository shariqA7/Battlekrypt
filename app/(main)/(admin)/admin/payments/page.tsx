import { requireAdminPage } from "@/lib/admin-page";
import { getPayments, } from "@/lib/services/admin-analytics";
import { PAYMENT_KINDS } from "@/lib/payment-kinds";
import { formatMoney } from "@/lib/money";
import { Stat, Panel } from "@/components/admin/charts";
import RecordPaymentForm from "../RecordPaymentForm";

const money = (byCur: Record<string, number>) =>
  Object.entries(byCur).map(([cur, amt]) => formatMoney(amt, cur)).join(" · ") || "—";

export default async function AdminPaymentsPage() {
  await requireAdminPage();
  const p = await getPayments();
  const kindLabel = (k: string) => PAYMENT_KINDS.find((x) => x.value === k)?.label ?? k;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Payments</h1>
        <p className="font-sans text-[13px] text-bk-body">
          Money the platform has received. Club plan payments are recorded when you approve them; record
          organization plan payments below.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Stat label="Total received" value={money(p.byCurrency)} hint={`${p.total} payment${p.total === 1 ? "" : "s"}`} />
        <Stat label="This month" value={money(p.byMonth[new Date().toISOString().slice(0, 7)] ?? {})} />
      </div>

      <RecordPaymentForm />

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="By payment method">
          {Object.keys(p.byMethod).length === 0 ? <p className="font-sans text-[12px] text-bk-muted">Nothing yet.</p> : (
            <ul className="space-y-1.5 font-sans text-[12px]">
              {Object.entries(p.byMethod).map(([m, by]) => (
                <li key={m} className="flex justify-between"><span className="text-bk-heading">{m}</span><span className="text-bk-muted">{money(by)}</span></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="By what it paid for">
          {Object.keys(p.byKind).length === 0 ? <p className="font-sans text-[12px] text-bk-muted">Nothing yet.</p> : (
            <ul className="space-y-1.5 font-sans text-[12px]">
              {Object.entries(p.byKind).map(([k, by]) => (
                <li key={k} className="flex justify-between"><span className="text-bk-heading">{kindLabel(k)}</span><span className="text-bk-muted">{money(by)}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="overflow-x-auto border border-bk-border">
        <table className="w-full font-sans text-[12px]">
          <thead className="bg-bk-surface text-bk-muted text-left uppercase tracking-[0.6px] text-[10px]">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Payer</th>
              <th className="px-3 py-2">For</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Paid via</th>
              <th className="px-3 py-2">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bk-border">
            {p.records.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-bk-muted">No payments recorded yet.</td></tr>
            )}
            {p.records.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-bk-muted">{r.createdAt.toLocaleDateString()}</td>
                <td className="px-3 py-2"><span className="text-bk-heading">{r.user.displayName}</span> <span className="text-bk-muted">{r.user.email}</span></td>
                <td className="px-3 py-2">{kindLabel(r.kind)}</td>
                <td className="px-3 py-2 text-bk-heading">{formatMoney(r.amount, r.currency)}</td>
                <td className="px-3 py-2">{r.method}</td>
                <td className="px-3 py-2 text-bk-muted">{r.reference ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
