"use client";

import { useEffect, useState } from "react";

interface Summary {
  likes: number;
  dislikes: number;
  myVote: "like" | "dislike" | null;
}

// Visible to everyone (the ratio is part of the organizer's public
// credibility — spec §10); only a player who joined this tournament can
// actually cast a vote, enforced server-side (see the vote route).
export default function VoteWidget({ tournamentId }: { tournamentId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}/vote`)
      .then((res) => res.json())
      .then(setSummary)
      .catch(() => null);
  }, [tournamentId]);

  async function vote(value: "like" | "dislike") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(
          json.error?.code === "not_joined"
            ? "Only players who joined can rate this tournament."
            : "Sign in as a player to rate this tournament."
        );
        return;
      }
      setSummary((prev) => ({
        likes: (prev?.likes ?? 0) + (value === "like" && prev?.myVote !== "like" ? 1 : 0) -
          (prev?.myVote === "like" && value !== "like" ? 1 : 0),
        dislikes: (prev?.dislikes ?? 0) + (value === "dislike" && prev?.myVote !== "dislike" ? 1 : 0) -
          (prev?.myVote === "dislike" && value !== "dislike" ? 1 : 0),
        myVote: value,
      }));
    } finally {
      setSubmitting(false);
    }
  }

  if (!summary) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          disabled={submitting}
          onClick={() => vote("like")}
          className={`font-sans text-[12px] px-2.5 py-1 border ${
            summary.myVote === "like"
              ? "border-bk-gold-light text-bk-gold-light"
              : "border-bk-border text-bk-muted"
          } disabled:opacity-50`}
        >
          👍 {summary.likes}
        </button>
        <button
          disabled={submitting}
          onClick={() => vote("dislike")}
          className={`font-sans text-[12px] px-2.5 py-1 border ${
            summary.myVote === "dislike"
              ? "border-bk-live text-bk-live"
              : "border-bk-border text-bk-muted"
          } disabled:opacity-50`}
        >
          👎 {summary.dislikes}
        </button>
      </div>
      {error && <p className="font-sans text-[11px] text-bk-muted">{error}</p>}
    </div>
  );
}
