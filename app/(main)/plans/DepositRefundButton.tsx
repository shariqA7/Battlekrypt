"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Leaving the paid plan = asking for the deposit back. The plan drops to free
// immediately (badge and paid perks stop); the refund follows after the wait.
export default function DepositRefundButton({ refundDays }: { refundDays: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (
      !confirm(
        `Leave your paid plan and request your security deposit back?\n\nYour plan switches to free right now and you lose the Verified badge. The deposit is refunded ${refundDays} days later if all your events and prize payouts are settled. Processing fees and tax are not refundable.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/deposits/refund", { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    router.refresh();
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-live underline disabled:opacity-50"
      >
        {busy ? "Requesting..." : "Leave paid plan & request refund"}
      </button>
      {error && <p className="font-sans text-[12px] text-bk-live mt-1">{error}</p>}
    </div>
  );
}
