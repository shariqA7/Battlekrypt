"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PublishButton({
  tournamentId,
  status,
}: {
  tournamentId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status !== "draft") {
    return (
      <span className="font-sans text-[11px] uppercase tracking-[0.5px] text-bk-gold-light bg-[rgba(244,200,66,0.1)] px-2.5 py-1.5">
        {status.replace("_", " ")}
      </span>
    );
  }

  async function handlePublish() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/publish`, { method: "POST" });
    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        onClick={handlePublish}
        disabled={submitting}
        className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-4 py-2 disabled:opacity-50"
      >
        {submitting ? "Publishing..." : "Publish"}
      </button>
      {error && <p className="text-bk-live text-[11px] font-sans mt-1 max-w-[220px]">{error}</p>}
    </div>
  );
}
