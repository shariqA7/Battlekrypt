"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import { buttonClass } from "@/components/ui/Button";
import { TAX_TYPES, taxTypeLabel } from "@/lib/ledger-math";
import { formatMoney } from "@/lib/money";
import type { TaxPaymentRow } from "@/lib/services/ledger";

const field = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";
const today = () => new Date().toISOString().slice(0, 10);

type Form = { date: string; type: string; amount: string; currency: string; authority: string; reference: string; periodNote: string; note: string; receiptUrl: string };
const blank = (): Form => ({ date: today(), type: "collected_tax", amount: "", currency: "PKR", authority: "", reference: "", periodNote: "", note: "", receiptUrl: "" });

// Record tax handed to the authority: tax collected from users (not an expense) and income tax on profit.
export default function TaxPaymentManager({ payments, total, currencies }: { payments: TaxPaymentRow[]; total: number; currencies: string[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState<Form>(blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function open(x?: TaxPaymentRow) {
    setError(null);
    setF(x ? { date: x.date, type: x.type, amount: String(x.amount), currency: x.currency, authority: x.authority ?? "", reference: x.reference ?? "", periodNote: x.periodNote ?? "", note: x.note ?? "", receiptUrl: "" } : blank());
    setEditing(x ? x.id : "new");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/admin/tax-payments" : `/api/admin/tax-payments/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, amount: Number(f.amount) }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error?.message ?? "Could not save.");
    setEditing(null);
    router.refresh();
  }

  async function voidIt(x: TaxPaymentRow) {
    const note = prompt(`Void this ${formatMoney(x.amount, x.currency)} tax payment? It stays in the history but no longer counts. Why?`);
    if (!note?.trim()) return;
    const res = await fetch(`/api/admin/tax-payments/${x.id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error?.message ?? "Could not void it.");
    router.refresh();
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="font-sans font-medium text-bk-heading text-sm">Tax paid to the authority</p>
        {editing === null && <button type="button" onClick={() => open()} className={buttonClass("primary", "sm")}>Record a tax payment</button>}
      </div>
      <p className="font-sans text-[12px] text-bk-muted mb-2">
        Tax collected from users is handed over, so it is not an expense and doesn&apos;t lower your profit. Income tax is paid on your profit and shown after it.
      </p>

      {editing !== null && (
        <form onSubmit={save} className="bg-bk-surface border border-bk-gold-light/40 p-4 mb-3 space-y-3">
          <p className="font-sans font-bold text-[13px] text-bk-heading">{editing === "new" ? "New tax payment" : "Edit tax payment"}</p>
          <div className="flex flex-wrap gap-3 font-sans text-[12px] text-bk-muted">
            <label className="block"><span className="block mb-1">Date paid</span><input type="date" value={f.date} onChange={set("date")} className={field} /></label>
            <label className="block">
              <span className="block mb-1">Which tax</span>
              <select value={f.type} onChange={set("type")} className={field}>
                {TAX_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="block"><span className="block mb-1">Amount</span><input type="number" min={0} step="any" value={f.amount} onChange={set("amount")} className={`${field} w-36 font-mono`} /></label>
            <label className="block">
              <span className="block mb-1">Currency</span>
              <select value={f.currency} onChange={set("currency")} className={field}>{currencies.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
          </div>
          <div className="flex flex-wrap gap-3 font-sans text-[12px] text-bk-muted">
            <label className="block"><span className="block mb-1">Authority (optional)</span><input value={f.authority} onChange={set("authority")} maxLength={80} placeholder="FBR, PRA…" className={`${field} w-44`} /></label>
            <label className="block"><span className="block mb-1">Challan / reference (optional)</span><input value={f.reference} onChange={set("reference")} maxLength={80} className={`${field} w-52 font-mono`} /></label>
            <label className="block grow"><span className="block mb-1">What it covers (optional)</span><input value={f.periodNote} onChange={set("periodNote")} maxLength={120} placeholder="Sales tax, October 2026" className={`${field} w-full min-w-56`} /></label>
          </div>
          <input value={f.note} onChange={set("note")} maxLength={500} placeholder="Note (optional)" className={`${field} w-full`} />
          <div>
            <p className="font-sans text-[12px] text-bk-muted mb-1">Payment slip or receipt (optional){editing !== "new" ? " — leave empty to keep the current one" : ""}</p>
            <FileUpload bucket="tournament-assets" pathPrefix="tax-receipts" label="Upload slip" onUploaded={(url: string) => setF((p) => ({ ...p, receiptUrl: url }))} />
          </div>
          {error && <p role="alert" className="font-sans text-[12px] text-bk-live">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setEditing(null)} disabled={busy} className={buttonClass("outline", "sm")}>Cancel</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto border border-bk-border">
        <table className="w-full font-sans text-[12px]">
          <thead className="bg-bk-surface text-bk-muted text-left uppercase tracking-[0.6px] text-[10px]">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Tax</th><th className="px-3 py-2">Details</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-bk-border">
            {payments.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-bk-muted">No tax payments in this period.</td></tr>}
            {payments.map((x) => (
              <tr key={x.id}>
                <td className="px-3 py-2 text-bk-muted">{new Date(`${x.date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" })}</td>
                <td className="px-3 py-2 text-bk-body">{taxTypeLabel(x.type)}</td>
                <td className="px-3 py-2 text-bk-heading">
                  {[x.authority, x.periodNote].filter(Boolean).join(" · ") || "—"}
                  {x.reference && <span className="font-mono text-bk-muted"> · {x.reference}</span>}
                  {x.receiptUrl && <> · <a href={x.receiptUrl} target="_blank" rel="noreferrer" className="text-bk-gold-light underline">slip</a></>}
                  {x.note && <span className="block text-[11px] text-bk-muted">{x.note}</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono text-bk-heading">{formatMoney(x.amount, x.currency)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button type="button" onClick={() => open(x)} className="text-bk-gold-light underline mr-3">Edit</button>
                  <button type="button" onClick={() => voidIt(x)} className="text-bk-muted underline">Void</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > payments.length && <p className="font-sans text-[11px] text-bk-muted mt-1">Showing the latest {payments.length} of {total}. The CSV has all of them.</p>}
    </section>
  );
}
