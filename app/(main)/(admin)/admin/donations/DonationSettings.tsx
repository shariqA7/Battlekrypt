"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";

export default function DonationSettings({ instructions, verifiedOnly }: { instructions: string; verifiedOnly: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(instructions);
  const [vo, setVo] = useState(verifiedOnly);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/donation-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructions: text, verifiedOnly: vo }) });
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: "Saved." });
      return router.refresh();
    }
    setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error?.message ?? "Something went wrong." });
  }

  return (
    <div>
      <label htmlFor="s-instr" className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1">How donors pay (shown on the Donate page)</label>
      <textarea id="s-instr" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2" placeholder="Bank, account number, JazzCash/Easypaisa number, and what to write in the reference." />
      <label className="flex items-start gap-2 font-sans text-[13px] text-bk-body mt-4 cursor-pointer">
        <input type="checkbox" checked={vo} onChange={(e) => setVo(e.target.checked)} className="mt-0.5" />
        <span>General fund: verified members only<span className="block text-[12px] text-bk-muted">Only users and organizations on a paid plan can give to the general fund. Each campaign has its own switch.</span></span>
      </label>
      <button type="button" onClick={save} disabled={busy} className={`${buttonClass("primary", "md")} mt-4`}>{busy ? "Saving…" : "Save"}</button>
      {msg && <span role="status" className={`ml-3 font-sans text-[12px] ${msg.ok ? "text-bk-teal" : "text-bk-live"}`}>{msg.text}</span>}
    </div>
  );
}
