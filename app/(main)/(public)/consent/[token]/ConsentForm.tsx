"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

type Done = { kind: "approved"; validUntil: string | null } | { kind: "declined" };

const inputClass =
  "w-full bg-bk-bg border border-bk-border px-3 h-[44px] font-sans text-[14px] text-bk-heading outline-none focus:border-bk-gold-from";

export default function ConsentForm({ token, childName, validDays }: { token: string; childName: string; validDays: number }) {
  const [signedName, setSignedName] = useState("");
  const [confirmGuardian, setConfirmGuardian] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  async function send(action: "approve" | "decline") {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/consent/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, signedName, confirmGuardian, agree }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "Something went wrong. Please try again.");
      return;
    }
    setDone(action === "approve" ? { kind: "approved", validUntil: body.validUntil } : { kind: "declined" });
  }

  if (done) {
    return (
      <Panel className="p-5">
        <p className="font-sans font-bold text-bk-heading mb-1">
          {done.kind === "approved" ? "Thank you. Consent recorded." : "You declined."}
        </p>
        <p className="font-sans text-bk-body text-sm">
          {done.kind === "approved"
            ? `${childName} can now take part in tournaments that ask for consent for the next ${validDays === 365 ? "year" : `${validDays} days`}. You can close this page.`
            : `Nothing was approved for ${childName}. You can close this page.`}
        </p>
      </Panel>
    );
  }

  const canApprove = confirmGuardian && agree && signedName.trim().length >= 3;

  return (
    <Panel className="p-5">
      <label className="flex items-start gap-3 font-sans text-[13px] text-bk-body mb-3 cursor-pointer">
        <input type="checkbox" checked={confirmGuardian} onChange={(e) => setConfirmGuardian(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--bk-gold-from)]" />
        <span>I am the parent or legal guardian of {childName}.</span>
      </label>
      <label className="flex items-start gap-3 font-sans text-[13px] text-bk-body mb-4 cursor-pointer">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--bk-gold-from)]" />
        <span>I have read the waiver above and I agree to it.</span>
      </label>

      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">Your full legal name (signature)</label>
      <input value={signedName} onChange={(e) => setSignedName(e.target.value)} autoComplete="name" className={inputClass} />

      {error && <p className="text-bk-live text-[12px] font-sans mt-3">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-3 mt-5">
        <button type="button" disabled={!canApprove || busy !== null} onClick={() => send("approve")} className={buttonClass("primary", "lg", "sm:flex-1")}>
          {busy === "approve" ? "Saving…" : "Approve"}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => send("decline")} className={buttonClass("outline", "lg", "sm:flex-1")}>
          {busy === "decline" ? "Saving…" : "Decline"}
        </button>
      </div>
    </Panel>
  );
}
