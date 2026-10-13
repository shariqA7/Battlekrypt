"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelButton({
  tournamentId,
  status,
}: {
  tournamentId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "cancelled" || status === "completed") return null;

  async function handleCancel() {
    if (!window.confirm("Cancel this tournament? This can't be undone.")) return;

    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/cancel`, { method: "POST" });

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
        onClick={handleCancel}
        disabled={submitting}
        className="inline-flex items-center justify-center h-[40px] sm:h-[34px] px-3 font-sans font-bold text-[11px] uppercase tracking-[1.2px] border border-bk-live/50 text-bk-live hover:bg-bk-live/10 disabled:opacity-50"
      >
        {submitting ? "Cancelling..." : "Cancel tournament"}
      </button>
      {error && <p className="text-bk-live text-[11px] font-sans mt-1">{error}</p>}
    </div>
  );
}
