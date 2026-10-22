"use client";

// Where a prize is paid. Used twice: by a parent/guardian on the consent manage page
// (PUT to the token route), and by a player aged 18+ on their own profile.
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { PAYOUT_METHODS } from "@/lib/payout-rules";

const fieldClass =
  "w-full bg-bk-bg border border-bk-border px-3 h-[44px] font-sans text-[14px] text-bk-heading outline-none focus:border-bk-gold-from rounded-lg";

export default function PayoutForm({
  endpoint,
  saved,
  defaultName = "",
  nameLabel = "Full name on the account",
  note,
}: {
  endpoint: string;
  saved: { method: string; payeeName: string } | null;
  defaultName?: string;
  nameLabel?: string;
  note?: string;
}) {
  const [method, setMethod] = useState(saved?.method ?? "");
  const [payeeName, setPayeeName] = useState(saved?.payeeName ?? defaultName);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [hasSaved, setHasSaved] = useState(!!saved);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, payeeName, details }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: body?.error?.message ?? "Couldn't save. Please try again." });
      return;
    }
    setHasSaved(true);
    setDetails("");
    setMsg({ ok: true, text: "Saved. Your account details are stored encrypted." });
  }

  return (
    <div className="space-y-3">
      {note && <p className="font-sans text-[12px] text-bk-muted">{note}</p>}
      {hasSaved && (
        <p className="font-sans text-[13px] text-bk-body">
          Saved: <strong className="text-bk-heading">{method || saved?.method}</strong> for{" "}
          <strong className="text-bk-heading">{payeeName || saved?.payeeName}</strong>. For safety the account number isn&apos;t shown again. Enter new details below to change it.
        </p>
      )}
      <label className="block">
        <span className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">How should prizes be paid?</span>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={fieldClass}>
          <option value="">Choose a method</option>
          {PAYOUT_METHODS.map((m) => (<option key={m} value={m}>{m}</option>))}
        </select>
      </label>
      <label className="block">
        <span className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">{nameLabel}</span>
        <input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} className={fieldClass} autoComplete="name" />
      </label>
      <label className="block">
        <span className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">Account number, IBAN or wallet number</span>
        <input value={details} onChange={(e) => setDetails(e.target.value)} className={fieldClass} autoComplete="off" placeholder={hasSaved ? "Enter only to change" : ""} />
      </label>
      {msg && <p className={`font-sans text-[12px] ${msg.ok ? "text-bk-teal" : "text-bk-live"}`}>{msg.text}</p>}
      <button type="button" onClick={save} disabled={busy || !method || !payeeName || !details} className={buttonClass("primary", "md", "")}>
        {busy ? "Saving…" : hasSaved ? "Update payment details" : "Save payment details"}
      </button>
    </div>
  );
}
