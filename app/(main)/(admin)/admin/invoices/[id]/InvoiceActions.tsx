"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";

const field = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";
const OTHER = "__other";

export default function InvoiceActions({
  invoiceId,
  total,
  currency,
  methods,
  hasProof,
  suggestedMethodId,
  suggestedReference,
}: {
  invoiceId: string;
  total: number;
  currency: string;
  methods: { id: string; name: string }[];
  hasProof: boolean;
  suggestedMethodId: string | null;
  suggestedReference: string | null;
}) {
  const router = useRouter();
  const [methodId, setMethodId] = useState(methods.find((m) => m.id === suggestedMethodId)?.id ?? methods[0]?.id ?? OTHER);
  const [methodName, setMethodName] = useState("");
  const [amount, setAmount] = useState(String(total));
  const [reference, setReference] = useState(suggestedReference ?? "");
  const [paidAt, setPaidAt] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "mark-paid" | "reject-proof" | "cancel", body: Record<string, unknown>) {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/admin/invoices/${invoiceId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error?.message ?? "Something went wrong.");
    router.refresh();
  }

  function markPaid(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm("Confirm the money has arrived. This starts the plan and records the payment.")) return;
    void call("mark-paid", {
      amount: Number(amount),
      methodId: methodId === OTHER ? null : methodId,
      methodName: methodId === OTHER ? methodName : null,
      reference,
      paidAt: paidAt || null,
      note,
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={markPaid} className="bg-bk-surface border border-bk-border p-4 space-y-3">
        <p className="font-sans font-bold text-[13px] text-bk-heading">Mark as paid</p>
        <div className="flex flex-wrap gap-3 font-sans text-[12px] text-bk-muted">
          <label className="block">
            <span className="block mb-1">Received through</span>
            <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className={field}>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value={OTHER}>Other (type it)</option>
            </select>
          </label>
          {methodId === OTHER && (
            <label className="block">
              <span className="block mb-1">Method</span>
              <input value={methodName} onChange={(e) => setMethodName(e.target.value)} maxLength={60} placeholder="Cash, one-off transfer…" className={`${field} w-48`} />
            </label>
          )}
          <label className="block">
            <span className="block mb-1">Amount received ({currency})</span>
            <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} w-36 font-mono`} />
          </label>
          <label className="block">
            <span className="block mb-1">Reference / transaction ID</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} className={`${field} w-56 font-mono`} />
          </label>
          <label className="block">
            <span className="block mb-1">Date received (blank = today)</span>
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={field} />
          </label>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional)" className={`${field} w-full`} />
        <p className="font-sans text-[11px] text-bk-muted">Only the full invoice total can be recorded.</p>
        <button type="submit" disabled={busy !== null} className={buttonClass("primary", "sm")}>{busy === "mark-paid" ? "Saving…" : "Mark as paid"}</button>
      </form>

      <div className="bg-bk-surface border border-bk-border p-4 space-y-2">
        <p className="font-sans font-bold text-[13px] text-bk-heading">{hasProof ? "Reject the proof or cancel" : "Cancel this invoice"}</p>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={hasProof ? "Why (they will see this)" : "Reason for cancelling"} className={`${field} w-full`} />
        <div className="flex gap-2">
          {hasProof && (
            <button type="button" disabled={busy !== null} onClick={() => call("reject-proof", { note: reason })} className={buttonClass("outline", "sm")}>
              {busy === "reject-proof" ? "…" : "Reject proof"}
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => confirm("Cancel this invoice? It can't be paid afterwards.") && call("cancel", { note: reason })}
            className={buttonClass("danger", "sm")}
          >
            {busy === "cancel" ? "…" : "Cancel invoice"}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="font-sans text-[12px] text-bk-live">{error}</p>}
    </div>
  );
}
