"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";

export type GatewayRow = {
  id: string;
  status: string;
  statusText: string;
  payCurrency: string | null;
  payAmount: number | null;
  actuallyPaid: number | null;
  outcomeAmount: number | null;
  outcomeCurrency: string | null;
  providerPaymentId: string | null;
  needsReview: boolean;
  reviewNote: string | null;
  createdAt: string;
  settledAt: string | null;
};

// The online (NOWPayments) checkouts for this invoice, and the controls for a stuck or flagged one.
export default function GatewayPanel({ invoiceId, rows }: { invoiceId: string; rows: GatewayRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "gateway-refresh" | "gateway-resolve", id: string) {
    setBusy(`${action}${id}`);
    setError(null);
    const res = await fetch(`/api/admin/invoices/${invoiceId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gatewayPaymentId: id }) });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(body.error?.message ?? "Something went wrong.");
    router.refresh();
  }

  return (
    <div className="bg-bk-surface border border-bk-border p-4 font-sans text-[12px]">
      <p className="text-bk-muted uppercase tracking-[0.8px] text-[10px] mb-2">Online payments (NOWPayments)</p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className={r.needsReview ? "border border-bk-live/40 p-2" : ""}>
            <p className="text-bk-heading">
              {r.statusText}
              <span className="text-bk-muted"> · {new Date(r.createdAt).toLocaleString("en-GB")}</span>
            </p>
            {(r.payCurrency || r.providerPaymentId) && (
              <p className="text-bk-muted font-mono text-[11px] break-all">
                {r.payCurrency ? `${r.payCurrency.toUpperCase()} ` : ""}
                {r.actuallyPaid !== null ? `paid ${r.actuallyPaid}` : ""}
                {r.payAmount !== null ? ` of ${r.payAmount}` : ""}
                {r.providerPaymentId ? ` · payment ${r.providerPaymentId}` : ""}
              </p>
            )}
            {r.outcomeAmount !== null && (
              <p className="text-bk-muted font-mono text-[11px]">You receive: {r.outcomeAmount} {(r.outcomeCurrency ?? "").toUpperCase()}</p>
            )}
            {r.needsReview && r.reviewNote && <p className="text-bk-live mt-1">{r.reviewNote}</p>}
            <div className="flex gap-2 mt-1">
              {r.providerPaymentId && r.status !== "finished" && (
                <button type="button" disabled={busy !== null} onClick={() => call("gateway-refresh", r.id)} className={buttonClass("outline", "sm")}>
                  {busy === `gateway-refresh${r.id}` ? "…" : "Check status now"}
                </button>
              )}
              {r.needsReview && (
                <button type="button" disabled={busy !== null} onClick={() => confirm("Mark this as dealt with?") && call("gateway-resolve", r.id)} className={buttonClass("ghost", "sm")}>
                  {busy === `gateway-resolve${r.id}` ? "…" : "Mark as dealt with"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-bk-live mt-2">{error}</p>}
    </div>
  );
}
