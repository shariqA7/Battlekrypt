"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import { Chip, ExpandAllBar, Expandable, useOpenSet } from "@/components/admin/Expandable";

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
  const set = useOpenSet();

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
      <ExpandAllBar ids={items.map((i) => i.id)} set={set} />
      <div className="space-y-2">
        {items.map((c) => (
          <Expandable
            key={c.id}
            id={c.id}
            open={set.has(c.id)}
            onToggle={() => set.toggle(c.id)}
            summary={
              <>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-sans font-bold text-bk-heading">{c.title}</span>
                  <Chip>{c.gameName}</Chip>
                </span>
                <span className="block font-sans text-[12px] text-bk-muted truncate mt-0.5">
                  {c.posterType}: {c.posterName} · {c.posterEmail}
                </span>
              </>
            }
            aside={
              <span className="text-right">
                <span className="block font-sans font-bold text-bk-gold-light">{c.prizeLabel}</span>
                {c.prizeUsd && <span className="block font-sans text-[11px] text-bk-muted">≈ ${Number(c.prizeUsd).toLocaleString()}</span>}
              </span>
            }
          >
            <p className="font-sans text-[12px] text-bk-muted">Submitted {new Date(c.createdAt).toLocaleString()}</p>
            <p className="font-sans text-[13px] text-bk-body whitespace-pre-wrap mt-2">{c.description}</p>
            <p className="font-sans text-[12px] text-bk-muted mt-2">Pays via: {c.payoutMethod}</p>

            {rejecting === c.id ? (
              <div className="mt-3">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  placeholder="Reason (the poster will see this)"
                  className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 mb-2" />
                <button disabled={busy} onClick={() => act(c.id, "reject")} className={buttonClass("danger", "sm", "")}>Send rejection</button>
              </div>
            ) : (
              <div className="flex gap-2 mt-3">
                <button disabled={busy} onClick={() => act(c.id, "approve")} className={buttonClass("primary", "sm", "")}>Approve</button>
                <button onClick={() => setRejecting(c.id)} className="border border-bk-live text-bk-live font-sans font-bold text-[11px] uppercase px-3 min-h-[40px] sm:min-h-[32px] inline-flex items-center justify-center">Reject</button>
              </div>
            )}
          </Expandable>
        ))}
      </div>
    </section>
  );
}
