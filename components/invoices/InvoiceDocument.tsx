import { formatMoney } from "@/lib/money";
import type { DisplayStatus } from "@/lib/invoice-math";
import InvoiceStatusBadge from "./StatusBadge";

export type InvoiceDocData = {
  number: string;
  orgName: string;
  currency: string;
  issuedAt: Date;
  dueDate: Date | null;
  note: string | null;
  subtotal: { toString(): string };
  taxRate: { toString(): string };
  taxLabel: string;
  taxAmount: { toString(): string };
  gatewayFee: { toString(): string };
  total: { toString(): string };
  lines: { id: string; description: string; amount: { toString(): string }; unitAmount: { toString(): string }; refundable: boolean; waived: boolean }[];
};

const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// The invoice itself â€” the same view for the admin and for the organization.
export default function InvoiceDocument({ invoice: i, status }: { invoice: InvoiceDocData; status: DisplayStatus }) {
  const m = (v: { toString(): string }) => formatMoney(Number(v.toString()), i.currency);
  const fee = Number(i.gatewayFee.toString());
  const tax = Number(i.taxAmount.toString());
  return (
    <div className="bg-bk-surface border border-bk-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted">Invoice</p>
          <p className="font-mono text-[18px] text-bk-heading">{i.number}</p>
        </div>
        <InvoiceStatusBadge status={status} />
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 font-sans text-[12px] mb-4">
        <div><dt className="text-bk-muted">Billed to</dt><dd className="text-bk-heading">{i.orgName}</dd></div>
        <div><dt className="text-bk-muted">Issued</dt><dd className="text-bk-heading">{d(i.issuedAt)}</dd></div>
        <div><dt className="text-bk-muted">Due</dt><dd className={status === "overdue" ? "text-bk-live" : "text-bk-heading"}>{i.dueDate ? d(i.dueDate) : "No due date"}</dd></div>
      </dl>
      <table className="w-full font-sans text-[13px]">
        <tbody className="divide-y divide-bk-border">
          {i.lines.map((l) => (
            <tr key={l.id}>
              <td className="py-2 text-bk-heading">
                {l.description}
                {l.refundable && <span className="block text-[11px] text-bk-muted">Held for you and returned later â€” not a fee.</span>}
              </td>
              <td className="py-2 text-right font-mono text-bk-heading">
                {l.waived ? (
                  <>
                    <span className="text-bk-muted line-through mr-2">{m(l.unitAmount)}</span>
                    <span className="text-bk-teal">Waived</span>
                  </>
                ) : (
                  m(l.amount)
                )}
              </td>
            </tr>
          ))}
          {tax > 0 && (
            <tr>
              <td className="py-2 text-bk-muted">{i.taxLabel} ({i.taxRate.toString()}% of the plan fee after any discount)</td>
              <td className="py-2 text-right font-mono text-bk-heading">{m(i.taxAmount)}</td>
            </tr>
          )}
          {fee > 0 && (
            <tr>
              <td className="py-2 text-bk-muted">Payment processing fee</td>
              <td className="py-2 text-right font-mono text-bk-heading">{m(i.gatewayFee)}</td>
            </tr>
          )}
          <tr>
            <td className="py-2 font-bold text-bk-heading">Total</td>
            <td className="py-2 text-right font-mono font-bold text-bk-gold-light text-[15px]">{m(i.total)}</td>
          </tr>
        </tbody>
      </table>
      {i.note && <p className="font-sans text-[12px] text-bk-muted mt-3">{i.note}</p>}
    </div>
  );
}
