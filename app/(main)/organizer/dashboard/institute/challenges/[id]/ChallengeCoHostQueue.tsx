"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

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
          <li key={r.id} className="bg-bk-surface border border-bk-border p-4 font-sans text-[13px]">
            <p className="text-bk-heading font-bold break-words">{r.name}</p>
            <p className="text-bk-muted text-[12px] mt-1 flex flex-wrap items-center gap-2">
              <span>
                {r.kind === "team" ? "Team" : "Solo player"} · rating {r.rating}
              </span>
              <Badge tone={r.status === "selected" ? "tier" : r.review === "approved" ? "teal" : "amber"}>
                {r.status === "selected" ? "Chosen by the poster" : r.review === "approved" ? "Approved by you" : "Waiting for you"}
              </Badge>
            </p>
            {open && r.status === "applied" && r.review === "pending" && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={() => act(r.id, true)}>
                  Approve
                </Button>
                <Button size="sm" variant="danger" onClick={() => act(r.id, false)}>
                  Reject
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
