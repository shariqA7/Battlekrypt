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
        className="text-bk-live font-sans text-[11px] uppercase tracking-[0.5px] underline disabled:opacity-50"
      >
        {submitting ? "Cancelling..." : "Cancel tournament"}
      </button>
      {error && <p className="text-bk-live text-[11px] font-sans mt-1">{error}</p>}
    </div>
  );
}
