"use client";

import { useState } from "react";

interface PendingTournament {
  id: string;
  name: string;
  competitiveTier: string;
  prizePoolAmount: string | null;
  prizePoolCurrency: string | null;
  organizer: { orgName: string };
  game: { name: string };
}

export default function TierReviewQueue({
  initialTournaments,
}: {
  initialTournaments: PendingTournament[];
}) {
  const [tournaments, setTournaments] = useState(initialTournaments);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/admin/tournaments/${id}/tier-review/approve`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      setError((await res.json()).error.message);
      return;
    }
    setTournaments((prev) => prev.filter((t) => t.id !== id));
  }

  async function reject(id: string) {
    const reason = window.prompt("Reason for rejecting (shown in the admin log only)?") ?? "";
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/admin/tournaments/${id}/tier-review/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError((await res.json()).error.message);
      return;
    }
    setTournaments((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">
        Tier review queue ({tournaments.length})
      </p>
      <p className="font-sans text-bk-muted text-xs mb-3">
        S-tier and National-tier tournaments an organizer has submitted for publish — spec
        §9&apos;s &quot;admin review required&quot; / &quot;always admin-approved&quot; gate. Rejecting sends
        it back to draft; it isn&apos;t cancelled.
      </p>

      {error && <p className="text-bk-live text-[12px] font-sans mb-2">{error}</p>}

      {tournaments.length === 0 ? (
        <p className="font-sans text-bk-muted text-xs">Nothing pending review.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tournaments.map((t) => (
            <div
              key={t.id}
              className="bg-bk-surface border border-bk-border p-3 flex items-center justify-between gap-3"
            >
              <div>
                <p className="font-sans text-bk-heading text-sm">
                  {t.name}{" "}
                  <span className="font-mono text-bk-gold-light text-xs">
                    {t.competitiveTier}-TIER
                  </span>
                </p>
                <p className="font-sans text-bk-muted text-xs mt-0.5">
                  {t.game.name} · {t.organizer.orgName} ·{" "}
                  {t.prizePoolAmount
                    ? `${t.prizePoolAmount} ${t.prizePoolCurrency}`
                    : "no prize pool"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => approve(t.id)}
                  disabled={busyId === t.id}
                  className="bg-white text-bk-bg font-sans font-bold text-[10px] uppercase tracking-[0.5px] px-2 py-1.5 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => reject(t.id)}
                  disabled={busyId === t.id}
                  className="text-bk-live font-sans text-[10px] uppercase tracking-[0.5px] underline disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
