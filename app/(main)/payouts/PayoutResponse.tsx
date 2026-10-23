"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PayoutResponse({ payoutId, status }: { payoutId: string; status: string }) {
  const router = useRouter();
  const [disputing, setDisputing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "confirmed") {
    return <p className="font-sans text-[12px] text-bk-teal mt-3">You confirmed this payout.</p>;
  }

  async function send(response: "confirmed" | "disputed") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/payouts/${payoutId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response, note }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    setDisputing(false);
    router.refresh();
  }

  return (
    <div className="mt-3">
      {status === "disputed" && (
        <p className="font-sans text-[12px] text-bk-live mb-2">You reported this as not paid. An admin will review it.</p>
      )}
      {!disputing ? (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => send("confirmed")}
            disabled={busy}
            className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
          >
            I received it
          </button>
          {status !== "disputed" && (
            <button onClick={() => setDisputing(true)} className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-live underline">
              I wasn&apos;t paid
            </button>
          )}
        </div>
      ) : (
        <div>
          <textarea
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened? (e.g. never received anything, received less)"
            className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2"
          />
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => send("disputed")}
              disabled={busy || note.trim().length < 10}
              className="bg-bk-live text-white font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
            >
              Report not paid
            </button>
            <button onClick={() => setDisputing(false)} className="font-sans text-[11px] uppercase text-bk-muted underline">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-bk-live text-[12px] font-sans mt-2">{error}</p>}
    </div>
  );
}
