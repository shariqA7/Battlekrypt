"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-2 h-[34px]";

// Make a new plan. It starts with the usual paid-plan options; change them in the plan list below.
export default function CreatePlanCard({ currencies }: { currencies: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ audience: "organizer", name: "", priceAmount: "", priceCurrency: currencies[0] ?? "PKR", durationDays: "30" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true); setError(null);
    const res = await fetch("/api/admin/plans", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, priceAmount: Number(f.priceAmount), durationDays: Number(f.durationDays) }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    setOpen(false); setF({ ...f, name: "", priceAmount: "" });
    router.refresh();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="border border-bk-border text-bk-heading font-sans text-[12px] px-4 h-[34px]">Create a plan</button>;
  return (
    <div className="border border-bk-border bg-bk-surface p-4">
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">New plan</p>
      <p className="font-sans text-bk-muted text-xs mb-3">It starts with the usual paid-plan options and goes on sale straight away. Change its options in the list below.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select className={input} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} aria-label="Who is it for">
          <option value="organizer">Organizer</option><option value="club">Club</option><option value="player">Player</option>
        </select>
        <input className={`${input} w-56`} placeholder="Plan name" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={`${input} w-28`} type="number" min={1} placeholder="Price" value={f.priceAmount} onChange={(e) => setF({ ...f, priceAmount: e.target.value })} />
        <select className={input} value={f.priceCurrency} onChange={(e) => setF({ ...f, priceCurrency: e.target.value })} aria-label="Currency">{currencies.map((c) => <option key={c}>{c}</option>)}</select>
        <input className={`${input} w-20`} type="number" min={1} value={f.durationDays} onChange={(e) => setF({ ...f, durationDays: e.target.value })} aria-label="Days" />
        <span className="font-sans text-[11px] text-bk-muted">days</span>
        <button disabled={busy} onClick={create} className="bg-white text-bk-bg font-sans font-bold text-[11px] uppercase tracking-[0.8px] px-4 h-[34px] disabled:opacity-50">{busy ? "Creating…" : "Create"}</button>
        <button disabled={busy} onClick={() => setOpen(false)} className="font-sans text-[12px] text-bk-muted px-2">Cancel</button>
      </div>
      {error && <p className="text-bk-live text-[12px] font-sans mt-2" role="alert">{error}</p>}
    </div>
  );
}
