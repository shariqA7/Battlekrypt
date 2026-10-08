"use client";

import { useState } from "react";
import { REPORT_REASONS } from "@/lib/challenge-integrity-rules";

export default function ReportButton({ challengeId }: { challengeId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("scam");
  const [details, setDetails] = useState("");
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/challenges/${challengeId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, details }),
    });
    if (res.ok) {
      setMsg({ text: "Thanks — an admin will look at it.", error: false });
      setOpen(false);
    } else {
      setMsg({ text: (await res.json()).error.message, error: true });
    }
    setBusy(false);
  }

  return (
    <div className="mt-8 pt-4 border-t border-bk-border">
      {!open ? (
        <button onClick={() => { setOpen(true); setMsg(null); }} className="font-sans text-[12px] text-bk-muted underline">
          Report this challenge
        </button>
      ) : (
        <div className="space-y-3 max-w-sm">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] px-3 h-[36px]">
            {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} placeholder="Details (optional)" className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] px-3 py-2" />
          <div className="flex gap-3">
            <button disabled={busy} onClick={send} className="bg-white text-bk-bg font-sans font-bold text-[11px] uppercase px-4 py-2 disabled:opacity-50">Send report</button>
            <button onClick={() => setOpen(false)} className="font-sans text-[12px] text-bk-muted underline">Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={`mt-2 font-sans text-[12px] ${msg.error ? "text-bk-live" : "text-bk-gold-light"}`}>{msg.text}</p>}
    </div>
  );
}
