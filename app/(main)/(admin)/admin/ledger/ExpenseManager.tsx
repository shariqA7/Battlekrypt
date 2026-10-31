"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/ui/FileUpload";
import { buttonClass } from "@/components/ui/Button";
import { EXPENSE_CATEGORIES, categoryLabel } from "@/lib/ledger-math";
import { formatMoney } from "@/lib/money";
import type { ExpenseRow } from "@/lib/services/ledger";

const field = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";
const today = () => new Date().toISOString().slice(0, 10);

type Form = { date: string; category: string; title: string; vendor: string; amount: string; currency: string; note: string; receiptUrl: string };
const blank = (): Form => ({ date: today(), category: "service", title: "", vendor: "", amount: "", currency: "PKR", note: "", receiptUrl: "" });

export default function ExpenseManager({ expenses, total, currencies }: { expenses: ExpenseRow[]; total: number; currencies: string[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState<Form>(blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function open(x?: ExpenseRow) {
    setError(null);
    setF(x ? { date: x.date, category: x.category, title: x.title, vendor: x.vendor ?? "", amount: String(x.amount), currency: x.currency, note: x.note ?? "", receiptUrl: "" } : blank());
    setEditing(x ? x.id : "new");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/admin/expenses" : `/api/admin/expenses/${editing}`, {
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

  async function voidIt(x: ExpenseRow) {
    const note = prompt(`Void “${x.title}”? It stays in the history but no longer counts. Why?`);
    if (!note?.trim()) return;
    const res = await fetch(`/api/admin/expenses/${x.id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error?.message ?? "Could not void it.");
    router.refresh();
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="font-sans font-medium text-bk-heading text-sm">Expenses</p>
        {editing === null && <button type="button" onClick={() => open()} className={buttonClass("primary", "sm")}>Add an expense</button>}
      </div>

      {editing !== null && (
        <form onSubmit={save} className="bg-bk-surface border border-bk-gold-light/40 p-4 mb-3 space-y-3">
          <p className="font-sans font-bold text-[13px] text-bk-heading">{editing === "new" ? "New expense" : "Edit expense"}</p>
          <div className="flex flex-wrap gap-3 font-sans text-[12px] text-bk-muted">
            <label className="block"><span className="block mb-1">Date paid</span><input type="date" value={f.date} onChange={set("date")} className={field} /></label>
            <label className="block">
              <span className="block mb-1">Category</span>
              <select value={f.category} onChange={set("category")} className={field}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label className="block grow"><span className="block mb-1">What was it for</span><input value={f.title} onChange={set("title")} maxLength={100} placeholder="Supabase Pro, May salary, office rent…" className={`${field} w-full min-w-56`} /></label>
            <label className="block"><span className="block mb-1">Paid to (optional)</span><input value={f.vendor} onChange={set("vendor")} maxLength={100} className={`${field} w-44`} /></label>
          </div>
          <div className="flex flex-wrap items-end gap-3 font-sans text-[12px] text-bk-muted">
            <label className="block"><span className="block mb-1">Amount</span><input type="number" min={0} step="any" value={f.amount} onChange={set("amount")} className={`${field} w-36 font-mono`} /></label>
            <label className="block">
              <span className="block mb-1">Currency</span>
              <select value={f.currency} onChange={set("currency")} className={field}>{currencies.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="block grow"><span className="block mb-1">Note (optional)</span><input value={f.note} onChange={set("note")} maxLength={500} className={`${field} w-full min-w-56`} /></label>
          </div>
          <div>
            <p className="font-sans text-[12px] text-bk-muted mb-1">Receipt or bill (optional){editing !== "new" ? " — leave empty to keep the current one" : ""}</p>
            <FileUpload bucket="payment-proofs" isPrivate ownerFolder pathPrefix="expense-receipts" label="Upload receipt" onUploaded={(url: string) => setF((p) => ({ ...p, receiptUrl: url }))} />
          </div>
          {error && <p role="alert" className="font-sans text-[12px] text-bk-live">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>{busy ? "Saving…" : "Save expense"}</button>
            <button type="button" onClick={() => setEditing(null)} disabled={busy} className={buttonClass("outline", "sm")}>Cancel</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto border border-bk-border">
        <table className="w-full font-sans text-[12px]">
          <thead className="bg-bk-surface text-bk-muted text-left uppercase tracking-[0.6px] text-[10px]">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">For</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-bk-border">
            {expenses.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-bk-muted">No expenses in this period. Add services, salaries, rent and bills here so the profit is real.</td></tr>}
            {expenses.map((x) => (
              <tr key={x.id}>
                <td className="px-3 py-2 text-bk-muted">{new Date(`${x.date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" })}</td>
                <td className="px-3 py-2 text-bk-body">{categoryLabel(x.category)}</td>
                <td className="px-3 py-2 text-bk-heading">
                  {x.title}
                  {x.vendor && <span className="text-bk-muted"> · {x.vendor}</span>}
                  {x.receiptUrl && <> · <a href={`/api/proofs/expense/${x.id}`} target="_blank" rel="noreferrer" className="text-bk-gold-light underline">receipt</a></>}
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
      {total > expenses.length && <p className="font-sans text-[11px] text-bk-muted mt-1">Showing the latest {expenses.length} of {total}. The CSV has all of them.</p>}
    </section>
  );
}
