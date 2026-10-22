"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";

export default function WithdrawButton({ token, childName }: { token: string; childName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ cancelled: number; flagged: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/consent/manage/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body?.error?.message ?? "Something went wrong. Please try again.");
      return;
    }
    setDone({ cancelled: body.cancelled ?? 0, flagged: body.flagged ?? 0 });
  }

  if (done) {
    return (
      <p className="font-sans text-[13px] text-bk-teal">
        Permission withdrawn. {done.cancelled > 0 ? `${done.cancelled} upcoming ${done.cancelled === 1 ? "entry was" : "entries were"} cancelled. ` : ""}
        {done.flagged > 0 ? `${done.flagged} running ${done.flagged === 1 ? "tournament was" : "tournaments were"} flagged to the organizer. ` : ""}
        We emailed you a confirmation. You can close this page.
      </p>
    );
  }

  return (
    <div>
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className={buttonClass("danger", "md", "")}>
          Withdraw permission
        </button>
      ) : (
        <div className="space-y-3">
          <p className="font-sans text-[13px] text-bk-heading">Withdraw permission for {childName}? This takes effect straight away.</p>
          <div className="flex gap-3">
            <button type="button" disabled={busy} onClick={withdraw} className={buttonClass("danger", "md", "")}>
              {busy ? "Withdrawing…" : "Yes, withdraw"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={buttonClass("outline", "md", "")}>
              Keep permission
            </button>
          </div>
        </div>
      )}
      {error && <p className="font-sans text-[12px] text-bk-live mt-3">{error}</p>}
    </div>
  );
}
