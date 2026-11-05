"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";

const input = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[40px] w-32";

export default function GiveawaySettings({ verifiedOnly, reviewAboveUsd, claimDays }: { verifiedOnly: boolean; reviewAboveUsd: number; claimDays: number }) {
  const router = useRouter();
  const [vo, setVo] = useState(verifiedOnly);
  const [review, setReview] = useState(String(reviewAboveUsd));
  const [days, setDays] = useState(String(claimDays));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/giveaways/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifiedOnly: vo, reviewAboveUsd: Number(review), claimDays: Number(days) }) });
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: "Saved." }); return router.refresh(); }
    setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error?.message ?? "Something went wrong." });
  }

  return (
    <div>
      <label className="flex items-start gap-2 font-sans text-[13px] text-bk-body cursor-pointer">
        <input type="checkbox" checked={vo} onChange={(e) => setVo(e.target.checked)} className="mt-0.5" />
        <span>Organizers&apos; giveaways: verified members only<span className="block text-[12px] text-bk-muted">Only users and organizations on a paid plan can enter giveaways that organizers run. Organizers can&apos;t change this. You can still override it on any single giveaway.</span></span>
      </label>
      <div className="flex flex-wrap gap-6 mt-4">
        <div>
          <label htmlFor="gs-review" className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1">Review prizes above (USD)</label>
          <input id="gs-review" inputMode="decimal" value={review} onChange={(e) => setReview(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="gs-days" className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1">Days a winner has to answer</label>
          <input id="gs-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className={input} />
        </div>
      </div>
      <button type="button" onClick={save} disabled={busy} className={`${buttonClass("primary", "md")} mt-4`}>{busy ? "Saving…" : "Save"}</button>
      {msg && <span role="status" className={`ml-3 font-sans text-[12px] ${msg.ok ? "text-bk-teal" : "text-bk-live"}`}>{msg.text}</span>}
    </div>
  );
}
