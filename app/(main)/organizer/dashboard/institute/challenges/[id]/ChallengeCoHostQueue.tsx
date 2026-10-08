"use client";

import { useState } from "react";

interface Row {
  id: string;
  name: string;
  kind: string;
  rating: number;
  status: string;
  review: string;
}

export default function ChallengeCoHostQueue({ initial, open }: { initial: Row[]; open: boolean }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, approve: boolean) {
    setError(null);
    const res = await fetch(`/api/challenge-applications/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    if (!res.ok) {
      setError((await res.json()).error?.message ?? "Something went wrong.");
      return;
    }
    setRows((prev) =>
      prev
        .map((r) => (r.id === id ? { ...r, review: approve ? "approved" : "rejected", status: approve ? r.status : "not_selected" } : r))
        .filter((r) => r.review !== "rejected")
    );
  }

  return (
    <div>
      {error && <p className="text-bk-live text-[12px] mb-3">{error}</p>}
      {rows.length === 0 && (
        <p className="font-sans text-[12px] text-bk-muted">No applicants from your institute right now.</p>
      )}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="border border-bk-border p-4 font-sans text-[13px]">
            <p className="text-bk-heading font-bold break-words">{r.name}</p>
            <p className="text-bk-muted text-[12px] mt-1">
              {r.kind === "team" ? "Team" : "Solo player"} · rating {r.rating} ·{" "}
              {r.status === "selected" ? "chosen by the poster" : r.review === "approved" ? "approved by you" : "waiting for you"}
            </p>
            {open && r.status === "applied" && r.review === "pending" && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => act(r.id, true)} className="bg-bk-gold-light text-black font-bold text-[12px] px-4 h-[36px]">
                  Approve
                </button>
                <button onClick={() => act(r.id, false)} className="border border-bk-live text-bk-live font-bold text-[12px] px-4 h-[36px]">
                  Reject
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
