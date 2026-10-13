"use client";

import { formatMoney } from "@/lib/money";

// Splits the prize pool by finishing place (D3), e.g. 1st $750,000, 4th–8th
// $50,000 each. Optional: with no rows the tournament just shows its total.

export interface PrizeRow {
  from: string;
  to: string; // blank = same as "from" (a single place)
  amount: string;
}

export const emptyPrizeRow = (): PrizeRow => ({ from: "", to: "", amount: "" });

// What the API wants. Rows that aren't filled in yet are skipped, not errors.
export function prizeRowsToBody(rows: PrizeRow[]) {
  return rows
    .filter((r) => r.from.trim() && Number(r.amount) > 0)
    .map((r) => ({
      from: Number(r.from),
      to: r.to.trim() ? Number(r.to) : Number(r.from),
      amount: Number(r.amount),
    }));
}

export function prizeRowsFromTiers(tiers: { positionFrom: number; positionTo: number; amount: unknown }[] | undefined): PrizeRow[] {
  return (tiers ?? []).map((t) => ({
    from: String(t.positionFrom),
    to: t.positionTo === t.positionFrom ? "" : String(t.positionTo),
    amount: String(Number(t.amount)),
  }));
}

const cell =
  "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-mono px-3 h-[44px] sm:h-[38px]";

export default function PrizeSplitEditor({
  rows,
  onChange,
  poolAmount,
  currency,
}: {
  rows: PrizeRow[];
  onChange: (rows: PrizeRow[]) => void;
  poolAmount: number;
  currency: string;
}) {
  const parsed = prizeRowsToBody(rows);
  const allocated = parsed.reduce((sum, r) => sum + r.amount * Math.max(0, r.to - r.from + 1), 0);
  const over = poolAmount > 0 && allocated > poolAmount;
  const set = (i: number, patch: Partial<PrizeRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="mt-4">
      <label className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
        Prize distribution (optional)
      </label>
      <p className="font-sans text-[11px] text-bk-muted mb-2">
        Split the prize pool by finishing place. For a range such as 4th–8th, fill in both places; the amount is
        what <em>each</em> team in that range wins.
      </p>

      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1.6fr_auto] gap-2 mb-2 items-end">
          <div>
            {i === 0 && <span className="block font-sans text-[10px] uppercase text-bk-muted mb-1">From place</span>}
            <input inputMode="numeric" placeholder="1" value={r.from} onChange={(e) => set(i, { from: e.target.value.replace(/\D/g, "") })} className={cell} aria-label="From place" />
          </div>
          <div>
            {i === 0 && <span className="block font-sans text-[10px] uppercase text-bk-muted mb-1">To (opt.)</span>}
            <input inputMode="numeric" placeholder="—" value={r.to} onChange={(e) => set(i, { to: e.target.value.replace(/\D/g, "") })} className={cell} aria-label="To place" />
          </div>
          <div>
            {i === 0 && <span className="block font-sans text-[10px] uppercase text-bk-muted mb-1">Each wins ({currency})</span>}
            <input inputMode="decimal" placeholder="0" value={r.amount} onChange={(e) => set(i, { amount: e.target.value.replace(/[^\d.]/g, "") })} className={cell} aria-label={`Amount each team wins in ${currency}`} />
          </div>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            aria-label="Remove this row"
            className="h-[44px] sm:h-[38px] w-10 text-bk-muted hover:text-bk-live text-lg"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...rows, emptyPrizeRow()])}
        className="font-sans text-[12px] text-bk-gold-light underline"
      >
        + Add a place
      </button>

      {parsed.length > 0 && (
        <p className={`font-mono text-[12px] mt-2 ${over ? "text-bk-live" : "text-bk-muted"}`}>
          {over
            ? `Over by ${formatMoney(allocated - poolAmount, currency)} — the split can't exceed the prize pool.`
            : poolAmount > 0
              ? `${formatMoney(allocated, currency)} of ${formatMoney(poolAmount, currency)} allocated · ${formatMoney(poolAmount - allocated, currency)} left`
              : "Set a prize pool above to split it."}
        </p>
      )}
    </div>
  );
}
