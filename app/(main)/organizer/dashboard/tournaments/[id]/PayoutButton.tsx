"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PayoutButton({
  tournamentId,
  status,
  hasPrizePool,
  payoutConfirmed,
}: {
  tournamentId: string;
  status: string;
  hasPrizePool: boolean;
  payoutConfirmed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Only meaningful once the tournament is actually done and there's real
  // prize money to have paid out (see Tournament.payoutConfirmed).
  if (status !== "completed" || !hasPrizePool) return null;

  if (payoutConfirmed) {
    return (
      <span className="text-bk-teal font-sans text-[11px] uppercase tracking-[0.5px]">
        Payout confirmed
      </span>
    );
  }

  async function handleConfirm() {
    if (!window.confirm("Confirm that prize money for this tournament has been sent?")) return;

    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/payout`, { method: "POST" });

    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={handleConfirm}
        disabled={submitting}
        className="text-bk-gold-light font-sans text-[11px] uppercase tracking-[0.5px] underline disabled:opacity-50"
      >
        {submitting ? "Confirming..." : "Confirm prize payout sent"}
      </button>
      {error && <p className="text-bk-live text-[11px] font-sans mt-1">{error}</p>}
    </div>
  );
}
