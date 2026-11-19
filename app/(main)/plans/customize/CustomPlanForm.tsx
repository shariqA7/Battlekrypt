"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import LimitFields, { type LimitValues } from "@/components/plans/LimitFields";

const input = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5 mt-4";

export default function CustomPlanForm({
  initial, start, current, currentName,
}: { initial: { name: string; email: string; phone: string }; start: LimitValues; current: LimitValues; currentName: string }) {
  // Name, email and phone start filled in from the account. They can be changed.
  const [contact, setContact] = useState(initial);
  const [limits, setLimits] = useState<LimitValues>(start);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true); setError(null);
    const res = await fetch("/api/custom-plan-requests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactName: contact.name, contactEmail: contact.email, contactPhone: contact.phone, limits, note }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong. Please try again.");
    setSent(true);
  }

  if (sent) {
    return (
      <Panel className="p-5">
        <p className="font-sans font-bold text-bk-heading text-[15px] mb-1">Request sent</p>
        <p className="font-sans text-[13px] text-bk-body mb-4">Thank you. Our sales team will look at what you asked for and quote a price. We&apos;ll notify you here and by the contact details you gave.</p>
        <Link href="/plans" className="font-sans text-[12px] text-bk-gold-light underline">Back to Plans</Link>
      </Panel>
    );
  }

  return (
    <div>
      <Panel className="p-5 mb-6">
        <p className="font-sans font-bold text-bk-heading text-[14px] mb-1">What do you need?</p>
        <p className="font-sans text-[12px] text-bk-muted mb-4">Your current plan ({currentName}) is shown under each option. Tick &quot;Unlimited&quot; where you don&apos;t want a cap.</p>
        <LimitFields values={limits} onChange={setLimits} current={current} />
      </Panel>

      <Panel className="p-5">
        <p className="font-sans font-bold text-bk-heading text-[14px] mb-1">How can we reach you?</p>
        <label className={label} htmlFor="cp-name">Name</label>
        <input id="cp-name" className={input} value={contact.name} maxLength={80} onChange={(e) => setContact({ ...contact, name: e.target.value })} autoComplete="name" />
        <div className="grid sm:grid-cols-2 gap-x-4">
          <div><label className={label} htmlFor="cp-email">Email</label>
            <input id="cp-email" type="email" className={input} value={contact.email} maxLength={254} onChange={(e) => setContact({ ...contact, email: e.target.value })} autoComplete="email" /></div>
          <div><label className={label} htmlFor="cp-phone">Phone</label>
            <input id="cp-phone" type="tel" className={input} value={contact.phone} maxLength={20} onChange={(e) => setContact({ ...contact, phone: e.target.value })} autoComplete="tel" /></div>
        </div>
        <p className="font-sans text-[11px] text-bk-muted mt-1">An email or a phone number is enough.</p>
        <label className={label} htmlFor="cp-note">Anything else we should know? (optional)</label>
        <textarea id="cp-note" className={`${input} h-24 py-2`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="text-bk-live text-[12px] font-sans mt-3" role="alert">{error}</p>}
        <button type="button" disabled={busy} onClick={submit} className="mt-5 bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-5 py-3 disabled:opacity-50">
          {busy ? "Sending…" : "Send to sales"}
        </button>
      </Panel>
    </div>
  );
}
