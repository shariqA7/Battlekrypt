"use client";

import { useEffect, useState } from "react";

const TIERS = ["none", "D", "C", "B", "A", "S", "National"] as const;
export type CompetitiveTierValue = (typeof TIERS)[number];

interface TierFloor {
  minPrizePoolUsd: string;
  minRating: number | null;
  minWins: number | null;
  publishPath: "instant" | "admin_review" | "always_admin";
}

// Spec §9's own descriptions — shown so the organizer knows what picking a
// tier commits them to before they've even entered a prize pool.
const PUBLISH_PATH_NOTE: Record<TierFloor["publishPath"], string> = {
  instant: "Publishes immediately once the prize pool floor is met.",
  admin_review: "Requires admin review before it goes live.",
  always_admin: "Always requires admin approval, reviewed case by case.",
};

export default function TierPicker({
  value,
  onChange,
}: {
  value: CompetitiveTierValue;
  onChange: (tier: CompetitiveTierValue) => void;
}) {
  const [floor, setFloor] = useState<TierFloor | null>(null);
  // Which tier `floor` currently reflects — lets "loading" be derived
  // during render (floorTier !== value) instead of tracked as its own
  // state set synchronously inside the effect.
  const [floorTier, setFloorTier] = useState<CompetitiveTierValue | null>(null);
  const loading = value !== "none" && floorTier !== value;

  useEffect(() => {
    // Nothing to fetch or show for "none" — the JSX below only renders the
    // floor info when value !== "none", so there's no stale-state to reset.
    if (value === "none") return;

    let cancelled = false;
    fetch(`/api/organizer/tier-floor?tier=${value}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setFloor(json.data);
        setFloorTier(value);
      })
      .catch(() => {
        if (cancelled) return;
        setFloor(null);
        setFloorTier(value);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div>
      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
        Competitive tier
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CompetitiveTierValue)}
        className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]"
      >
        <option value="none">None — not a competitive-tier event</option>
        {TIERS.filter((t) => t !== "none").map((t) => (
          <option key={t} value={t}>
            {t}-tier
          </option>
        ))}
      </select>

      {value !== "none" && (
        <p className="font-sans text-bk-muted text-[11px] mt-1.5">
          {loading && "Checking this tier's requirements..."}
          {!loading && floor && (
            <>
              Requires a prize pool of at least{" "}
              <span className="text-bk-gold-light font-mono">${floor.minPrizePoolUsd}</span>{" "}
              USD-equivalent
              {floor.minRating != null && (
                <>
                  , and {value === "National" ? "" : "players need "}≥{floor.minRating} rating in
                  this game to join
                </>
              )}
              {floor.minWins != null && (
                <>, and teams need {floor.minWins}+ prior S-tier wins in this game to join</>
              )}
              . {PUBLISH_PATH_NOTE[floor.publishPath]}
            </>
          )}
          {!loading && !floor && "Couldn't load this tier's requirements — try again."}
        </p>
      )}
    </div>
  );
}
