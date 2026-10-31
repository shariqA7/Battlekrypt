"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SideSheet from "@/components/admin/SideSheet";
import { buttonClass } from "@/components/ui/Button";
import { SUPPORTED_CURRENCIES, formatMoney } from "@/lib/money";

type Campaign = { id: string; slug: string; title: string; description: string; currency: string; goal: number | null; raised: number; donors: number; allocated: number; status: string; open: boolean; verifiedOnly: boolean; endsAt: string | null };

const input = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[40px]";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1 mt-4";
const blank = { title: "", description: "", currency: "PKR", goalAmount: "", endsAt: "", verifiedOnly: false, status: "active" };

export default function CampaignsPanel({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/donation-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, goalAmount: f.goalAmount ? Number(f.goalAmount) : undefined, endsAt: f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : undefined }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    setOpen(false);
    setF(blank);
    router.refresh();
  }

  async function patch(id: string, body: object) {
    const res = await fetch(`/api/admin/donation-campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary", "md")}>+ New campaign</button>
      </div>
      {campaigns.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-muted">No campaigns yet. Gifts without a campaign go to the general fund.</p>
      ) : (
        <ul className="divide-y divide-bk-border border border-bk-border">
          {campaigns.map((c) => (
            <li key={c.id} className="p-3 font-sans text-[12px] flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-bk-heading font-bold text-[14px]">
                  {c.title} <span className="text-bk-muted font-normal">· {c.status}{c.status === "active" && !c.open ? " (ended)" : ""}</span>
                </p>
                <p className="text-bk-body">
                  Raised {formatMoney(c.raised, c.currency)}{c.goal !== null && ` of ${formatMoney(c.goal, c.currency)}`} · {c.donors} donor{c.donors === 1 ? "" : "s"} · used {formatMoney(c.allocated, c.currency)}
                  {c.endsAt && ` · ends ${new Date(c.endsAt).toLocaleDateString("en-GB")}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <label className="flex items-center gap-2 text-bk-body cursor-pointer">
                  <input type="checkbox" checked={c.verifiedOnly} onChange={(e) => patch(c.id, { verifiedOnly: e.target.checked })} />
                  Verified members only
                </label>
                <span className="flex gap-3 uppercase tracking-[0.6px] text-[11px]">
                  {c.status !== "active" && <button type="button" onClick={() => patch(c.id, { status: "active" })} className="text-bk-gold-light underline">Open</button>}
                  {c.status === "active" && <button type="button" onClick={() => patch(c.id, { status: "closed" })} className="text-bk-gold-light underline">Close</button>}
                  <a href={`/donate?campaign=${c.slug}`} className="text-bk-gold-light underline">View</a>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SideSheet
        open={open}
        onClose={() => setOpen(false)}
        title="New donation campaign"
        subtitle="A drive with a purpose, an optional goal and an optional end date."
        footer={
          <div className="flex justify-between gap-3">
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("outline", "md")}>Cancel</button>
            <button type="button" onClick={create} disabled={busy} className={buttonClass("primary", "md")}>{busy ? "Creating…" : f.status === "draft" ? "Save as draft" : "Open campaign"}</button>
          </div>
        }
      >
        <label htmlFor="c-title" className={label}>Title</label>
        <input id="c-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={80} className={input} placeholder="Prize pool for the Ramadan Cup" />
        <label htmlFor="c-desc" className={label}>What is the money for?</label>
        <textarea id="c-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={4} maxLength={2000} className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="c-cur" className={label}>Currency</label>
            <select id="c-cur" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} className={input}>
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="c-goal" className={label}>Goal (optional)</label>
            <input id="c-goal" inputMode="decimal" value={f.goalAmount} onChange={(e) => setF({ ...f, goalAmount: e.target.value })} className={input} />
          </div>
        </div>
        <label htmlFor="c-end" className={label}>Ends on (optional)</label>
        <input id="c-end" type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} className={input} />
        <label className="flex items-start gap-2 font-sans text-[13px] text-bk-body mt-5 cursor-pointer">
          <input type="checkbox" checked={f.verifiedOnly} onChange={(e) => setF({ ...f, verifiedOnly: e.target.checked })} className="mt-0.5" />
          <span>Verified members only<span className="block text-[12px] text-bk-muted">Only users and organizations on a paid plan can give. Anyone else is asked to get verified first.</span></span>
        </label>
        <label className="flex items-center gap-2 font-sans text-[13px] text-bk-body mt-3 cursor-pointer">
          <input type="checkbox" checked={f.status === "draft"} onChange={(e) => setF({ ...f, status: e.target.checked ? "draft" : "active" })} />
          Save as a draft (not public yet)
        </label>
        {error && <p role="alert" className="text-bk-live text-[12px] font-sans mt-4">{error}</p>}
      </SideSheet>
    </div>
  );
}
