"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import LimitFields, { type LimitValues } from "@/components/plans/LimitFields";
import { LIMIT_LABELS } from "@/lib/plan-limit-labels";

interface Item {
  id: string; status: string; createdAt: string; contactName: string; contactEmail: string | null; contactPhone: string | null;
  note: string | null; adminNote: string | null; orgName: string; currentPlan: string | null; limits: LimitValues;
  quote: { code: string; name: string; price: number | null; currency: string | null; days: number } | null;
}
interface PublicPlan { name: string; price: number | null; currency: string | null; days: number }

const field = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-2 h-[34px]";
const show = (v: number | boolean | null | undefined) => (v === null ? "Unlimited" : v === true ? "Yes" : v === false ? "No" : String(v ?? ""));

function Row({ item, currencies, publicPlans, onChanged }: { item: Item; currencies: string[]; publicPlans: PublicPlan[]; onChanged: () => void }) {
  const [price, setPrice] = useState(item.quote?.price ? String(item.quote.price) : "");
  const [currency, setCurrency] = useState(item.quote?.currency ?? currencies[0] ?? "PKR");
  const [days, setDays] = useState(String(item.quote?.days ?? 30));
  const [name, setName] = useState(item.quote?.name ?? "");
  const [note, setNote] = useState(item.adminNote ?? "");
  const [limits, setLimits] = useState<LimitValues>(item.limits);
  const [adjust, setAdjust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: object) {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/custom-plan-requests/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    onChanged();
  }

  const asked = Object.keys(item.limits).filter((k) => LIMIT_LABELS[k]);
  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans font-bold text-bk-heading text-[14px]">{item.orgName}</p>
          <p className="font-sans text-[12px] text-bk-muted">
            {item.contactName}{item.contactEmail ? ` · ${item.contactEmail}` : ""}{item.contactPhone ? ` · ${item.contactPhone}` : ""} · {new Date(item.createdAt).toLocaleString()}
            {item.currentPlan ? ` · now on ${item.currentPlan}` : ""}
          </p>
        </div>
        <span className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-gold-light">{item.status === "open" ? "New" : item.status}</span>
      </div>
      {item.note && <p className="font-sans text-[13px] text-bk-heading mt-2 whitespace-pre-wrap">&ldquo;{item.note}&rdquo;</p>}

      <details className="mt-3">
        <summary className="font-sans text-[12px] text-bk-gold-light cursor-pointer">What they asked for</summary>
        <div className="grid sm:grid-cols-2 gap-x-6 mt-2">
          {asked.map((k) => (
            <p key={k} className="font-sans text-[12px] text-bk-body flex justify-between border-b border-bk-border/50 py-1">
              <span>{LIMIT_LABELS[k].label}</span><span className="font-mono text-bk-heading">{show(item.limits[k])}</span>
            </p>
          ))}
        </div>
      </details>

      {item.status !== "closed" && (
        <div className="mt-4 border-t border-bk-border pt-3">
          {item.quote && <p className="font-sans text-[12px] text-bk-muted mb-2">Quote sent: <span className="text-bk-heading">{item.quote.name}</span>, {item.quote.price} {item.quote.currency} for {item.quote.days} days. Change the numbers and send again to update it.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${field} w-28`} type="number" min={1} placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
            <select className={field} value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">{currencies.map((c) => <option key={c}>{c}</option>)}</select>
            <input className={`${field} w-20`} type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days" />
            <span className="font-sans text-[11px] text-bk-muted">days</span>
            <input className={`${field} w-56`} placeholder={`Plan name (default: Custom plan for ${item.orgName})`.slice(0, 40)} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <textarea className={`${field} w-full h-16 py-2 mt-2`} placeholder="Message to the organizer (shown with the quote)" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" onClick={() => setAdjust(!adjust)} className="font-sans text-[12px] text-bk-gold-light underline mt-1">{adjust ? "Hide" : "Change the options before quoting"}</button>
          {adjust && <div className="mt-2"><LimitFields values={limits} onChange={setLimits} /></div>}
          {publicPlans.length > 0 && <p className="font-sans text-[11px] text-bk-muted mt-2">For reference: {publicPlans.filter((p) => p.price).map((p) => `${p.name} ${p.price} ${p.currency}/${p.days}d`).join(" · ")}</p>}
          {error && <p className="text-bk-live text-[12px] font-sans mt-2" role="alert">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button disabled={busy} onClick={() => send({ action: "quote", priceAmount: Number(price), priceCurrency: currency, durationDays: Number(days), planName: name, adminNote: note, limits })}
              className="bg-white text-bk-bg font-sans font-bold text-[11px] uppercase tracking-[0.8px] px-4 h-[34px] disabled:opacity-50">{item.quote ? "Update quote" : "Send quote"}</button>
            <button disabled={busy} onClick={() => { if (confirm("Close this request? A quote that wasn't bought is withdrawn.")) void send({ action: "close", adminNote: note }); }}
              className="border border-bk-border text-bk-body font-sans text-[11px] uppercase tracking-[0.8px] px-4 h-[34px] disabled:opacity-50">Close</button>
          </div>
        </div>
      )}
      {item.status === "closed" && item.adminNote && <p className="font-sans text-[12px] text-bk-muted mt-2">Note: {item.adminNote}</p>}
    </Panel>
  );
}

export default function CustomPlansManager({ items, currencies, publicPlans }: { items: Item[]; currencies: string[]; publicPlans: PublicPlan[] }) {
  const router = useRouter();
  if (items.length === 0) return <p className="font-sans text-[13px] text-bk-muted">No requests here.</p>;
  return <div className="space-y-3">{items.map((i) => <Row key={i.id} item={i} currencies={currencies} publicPlans={publicPlans} onChanged={() => router.refresh()} />)}</div>;
}
