"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "I can't run this session": for one day of a recurring series. Players who paid choose between the
// next session and a refund, so no admin approval is needed.
export default function SeriesCancelButton({ tournamentId, status }: { tournamentId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (status === "cancelled" || status === "completed" || status === "in_progress") return null;

  async function cancel() {
    const reason = window.prompt("Tell players why you can't run this session (optional). Players who paid will choose between the next session and a refund.");
    if (reason === null) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/organizer/scrim-sessions/${tournamentId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    router.refresh();
  }

  return (
    <div>
      <button type="button" disabled={busy} onClick={cancel} className="border border-bk-border text-bk-live font-sans text-[12px] px-4 h-[36px] disabled:opacity-50">
        {busy ? "Cancelling…" : "Can't run this session"}
      </button>
      {error && <p className="text-bk-live text-[12px] font-sans mt-1" role="alert">{error}</p>}
    </div>
  );
}
