"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ReviewChallenge {
  id: string;
  title: string;
  description: string;
  gameName: string;
  posterName: string;
  posterType: string;
  posterEmail: string | null;
  prizeLabel: string;
  prizeUsd: string | null;
  payoutMethod: string;
  createdAt: string;
}

// Challenges with a prize above the review threshold wait here. Approving
// puts them live; rejecting needs a reason the poster will see.
export default function ChallengeReview({
  initial,
  thresholdUsd,
}: {
  initial: ReviewChallenge[];
  thresholdUsd: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(id: string, action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/challenges/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "reject" ? JSON.stringify({ note }) : undefined,
    });
    if (!res.ok) setError((await res.json()).error.message);
    else {
      setItems((p) => p.filter((i) => i.id !== id));
      setRejecting(null);
      setNote("");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">
        Large-prize challenges ({items.length})
      </p>
      <p className="font-sans text-[12px] text-bk-muted mb-3">
        Prizes above ${thresholdUsd.toLocaleString()} wait here before going live.
      </p>
      {error && <p className="font-sans text-[12px] text-bk-live mb-3">{error}</p>}
      {items.length === 0 && <p className="font-sans text-[13px] text-bk-muted">Nothing waiting.</p>}
      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className="bg-bk-surface border border-bk-border p-4">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-sans font-bold text-bk-heading">{c.title}</p>
                <p className="font-sans text-[12px] text-bk-muted">
                  {c.gameName} · {c.posterType}: {c.posterName} ({c.posterEmail}) · {new Date(c.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-sans font-bold text-bk-gold-light">{c.prizeLabel}</p>
                {c.prizeUsd && <p className="font-sans text-[11px] text-bk-muted">≈ ${Number(c.prizeUsd).toLocaleString()}</p>}
              </div>
            </div>
            <p className="font-sans text-[13px] text-bk-body whitespace-pre-wrap mt-3">{c.description}</p>
            <p className="font-sans text-[12px] text-bk-muted mt-2">Pays via: {c.payoutMethod}</p>

            {rejecting === c.id ? (
              <div className="mt-3">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  placeholder="Reason (the poster will see this)"
                  className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 mb-2" />
                <button disabled={busy} onClick={() => act(c.id, "reject")} className="bg-bk-live text-white font-sans font-bold text-[11px] uppercase px-3 py-1.5 disabled:opacity-50">Send rejection</button>
              </div>
            ) : (
              <div className="flex gap-2 mt-3">
                <button disabled={busy} onClick={() => act(c.id, "approve")} className="bg-white text-bk-bg font-sans font-bold text-[11px] uppercase px-3 py-1.5 disabled:opacity-50">Approve</button>
                <button onClick={() => setRejecting(c.id)} className="border border-bk-live text-bk-live font-sans font-bold text-[11px] uppercase px-3 py-1.5">Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
