"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AwardRow {
  id: string;
  name: string;
  cash: number | null;
  text: string | null;
  winnerUserId: string | null;
  locked: boolean; // prizes already marked as paid
}
interface Player {
  userId: string;
  name: string;
  team: string | null;
}

// After the event: pick who won each special award (Final MVP, Best IGL…).
// Winners must be players who took part. Every award needs a winner before
// you can mark prizes as paid; each winner then confirms they received it.
export default function AwardWinnersPanel({
  tournamentId,
  awards,
  players,
  currency,
}: {
  tournamentId: string;
  awards: AwardRow[];
  players: Player[];
  currency: string;
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, string>>(
    Object.fromEntries(awards.map((a) => [a.id, a.winnerUserId ?? ""]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const allLocked = awards.every((a) => a.locked);
  const select = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[44px] sm:h-[38px]";

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/tournaments/${tournamentId}/award-winners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignments: awards.filter((a) => !a.locked).map((a) => ({ awardId: a.id, userId: picks[a.id] || null })),
      }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="bg-bk-surface border border-bk-border p-4 mb-6">
      <p className="font-sans text-[13px] text-bk-heading font-bold mb-1">Special award winners</p>
      <p className="font-sans text-[12px] text-bk-body mb-3">
        {allLocked
          ? "Prizes are marked as paid, so winners are final. Each winner is asked to confirm they received their award."
          : "Pick a winner for every award. Then use “Confirm prize payout sent” once you've paid or given the prizes."}
      </p>
      <div className="space-y-3">
        {awards.map((a) => (
          <div key={a.id}>
            <p className="font-sans text-[12px] text-bk-heading">
              {a.name}{" "}
              <span className="text-bk-muted font-mono">
                {[a.cash != null ? `${a.cash.toLocaleString()} ${currency}` : null, a.text].filter(Boolean).join(" + ")}
              </span>
            </p>
            <select
              value={picks[a.id] ?? ""}
              disabled={a.locked}
              onChange={(e) => {
                setSaved(false);
                setPicks({ ...picks, [a.id]: e.target.value });
              }}
              className={`${select} mt-1`}
              aria-label={`Winner of ${a.name}`}
            >
              <option value="">Not chosen yet</option>
              {players.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name}
                  {p.team ? ` (${p.team})` : ""}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {error && <p className="text-bk-live text-[12px] font-sans mt-2">{error}</p>}
      {saved && <p className="text-bk-teal text-[12px] font-sans mt-2">Saved.</p>}
      {!allLocked && (
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="mt-3 bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save winners"}
        </button>
      )}
    </div>
  );
}
