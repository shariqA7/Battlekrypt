"use client";

import type { AwardInput } from "@/lib/prize-awards";

// Extra awards on top of the placement split: "Final MVP", "Best IGL",
// "Best grenadier", "Best rookie"… Each has a cash amount (counts toward the
// prize pool), a non-cash prize, or both.

export interface AwardRow {
  name: string;
  cash: string;
  text: string;
}

export const emptyAwardRow = (): AwardRow => ({ name: "", cash: "", text: "" });

// Rows that aren't filled in yet are skipped, not errors.
export function awardRowsToBody(rows: AwardRow[]): AwardInput[] {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      cashAmount: r.cash.trim() && Number(r.cash) > 0 ? Number(r.cash) : null,
      prizeText: r.text.trim() || null,
    }));
}

export function awardRowsFromAwards(
  awards: { name: string; cashAmount: unknown; prizeText: string | null }[] | undefined
): AwardRow[] {
  return (awards ?? []).map((a) => ({
    name: a.name,
    cash: a.cashAmount == null ? "" : String(Number(a.cashAmount)),
    text: a.prizeText ?? "",
  }));
}

const cell =
  "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[44px] sm:h-[38px]";

const SUGGESTIONS = ["Final MVP", "Best IGL", "Best grenadier", "Best rookie player"];

export default function PrizeAwardsEditor({
  rows,
  onChange,
  currency,
}: {
  rows: AwardRow[];
  onChange: (rows: AwardRow[]) => void;
  currency: string;
}) {
  const set = (i: number, patch: Partial<AwardRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const unused = SUGGESTIONS.filter((s) => !rows.some((r) => r.name.trim().toLowerCase() === s.toLowerCase()));

  return (
    <div className="mt-4">
      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
        Special awards (optional)
      </label>
      <p className="font-sans text-[11px] text-bk-muted mb-2">
        Prizes for individual players, like Final MVP or Best IGL. Give a cash amount (it counts toward the prize pool), a
        prize such as &quot;gaming headset&quot;, or both.
      </p>

      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1.4fr_auto] gap-2 mb-2 items-end">
          <div>
            {i === 0 && <span className="block font-sans text-[10px] uppercase text-bk-muted mb-1">Award</span>}
            <input value={r.name} maxLength={60} placeholder="Final MVP" onChange={(e) => set(i, { name: e.target.value })} className={cell} aria-label="Award name" />
          </div>
          <div>
            {i === 0 && <span className="block font-sans text-[10px] uppercase text-bk-muted mb-1">Cash ({currency})</span>}
            <input
              inputMode="decimal"
              placeholder="0"
              value={r.cash}
              onChange={(e) => set(i, { cash: e.target.value.replace(/[^\d.]/g, "") })}
              className={`${cell} font-mono`}
              aria-label={`Cash amount in ${currency}`}
            />
          </div>
          <div>
            {i === 0 && <span className="block font-sans text-[10px] uppercase text-bk-muted mb-1">Other prize</span>}
            <input value={r.text} maxLength={100} placeholder="e.g. Gaming mouse" onChange={(e) => set(i, { text: e.target.value })} className={cell} aria-label="Non-cash prize" />
          </div>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            aria-label="Remove this award"
            className="h-[44px] sm:h-[38px] w-10 text-bk-muted hover:text-bk-live text-lg"
          >
            ×
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <button type="button" onClick={() => onChange([...rows, emptyAwardRow()])} className="font-sans text-[12px] text-bk-gold-light underline">
          + Add an award
        </button>
        {unused.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange([...rows.filter((r) => r.name.trim() || r.cash || r.text), { name: s, cash: "", text: "" }])}
            className="font-sans text-[11px] border border-bk-border text-bk-body px-2 py-0.5"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}
