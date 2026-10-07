"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LAUNCH_CURRENCIES } from "@/lib/money";
import { PAYMENT_KINDS } from "@/lib/payment-kinds";

const field = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";

// Manual ledger entry — there is no payment gateway yet, so organization plan
// payments (and anything else) are recorded here by an admin.
export default function RecordPaymentForm() {
  const router = useRouter();
  const [f, setF] = useState({ email: "", kind: "org_plan", amount: "", currency: "PKR", method: "", reference: "", note: "" });
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, amount: Number(f.amount) }),
    });
    if (!res.ok) setMsg({ text: (await res.json()).error.message, error: true });
    else {
      setMsg({ text: "Payment recorded.", error: false });
      setF({ ...f, amount: "", reference: "", note: "" });
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="bg-bk-surface border border-bk-border p-4 flex flex-wrap gap-2 items-end">
      <input required type="email" value={f.email} onChange={set("email")} placeholder="Payer's account email" className={`${field} w-56`} />
      <select value={f.kind} onChange={set("kind")} className={field}>
        {PAYMENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      <input required type="number" min={1} step="any" value={f.amount} onChange={set("amount")} placeholder="Amount" className={`${field} w-28`} />
      <select value={f.currency} onChange={set("currency")} className={field}>
        {LAUNCH_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <input required value={f.method} onChange={set("method")} placeholder="Paid via (JazzCash, bank…)" className={`${field} w-48`} />
      <input value={f.reference} onChange={set("reference")} placeholder="Reference (optional)" className={`${field} w-44`} />
      <button disabled={busy} className="bg-white text-bk-bg font-sans font-bold text-[12px] uppercase tracking-[0.6px] px-4 h-[36px] disabled:opacity-50">
        Record payment
      </button>
      {msg && <p className={`w-full font-sans text-[12px] ${msg.error ? "text-bk-live" : "text-bk-gold-light"}`}>{msg.text}</p>}
    </form>
  );
}
