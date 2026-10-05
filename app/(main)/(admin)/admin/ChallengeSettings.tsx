"use client";

import { useState } from "react";

export default function ChallengeSettings({ initialUsd }: { initialUsd: number }) {
  const [usd, setUsd] = useState(String(initialUsd));
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/challenge-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewUsd: Number(usd) }),
    });
    setMsg(res.ok ? { text: "Saved.", error: false } : { text: (await res.json()).error.message, error: true });
    setBusy(false);
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">Challenge prizes</p>
      <p className="font-sans text-[12px] text-bk-muted mb-3">
        Cash or in-game prizes worth more than this (in US dollars) wait for admin approval before going
        live. How many challenges each plan can post, and the biggest prize it can offer, are edited in
        the plans above.
      </p>
      <div className="flex items-center gap-2">
        <span className="font-sans text-[13px] text-bk-body">$</span>
        <input type="number" min={1} value={usd} onChange={(e) => setUsd(e.target.value)}
          className="w-32 bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]" />
        <button disabled={busy} onClick={save} className="bg-white text-bk-bg font-sans font-bold text-[12px] uppercase px-4 h-[36px] disabled:opacity-50">Save</button>
        {msg && <span className={`font-sans text-[12px] ${msg.error ? "text-bk-live" : "text-bk-gold-light"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
