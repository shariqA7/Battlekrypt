// Pure helpers (no database imports) so client components can use them.
//
// A prize pool is described completely: placement rows ("1st $500", "2nd–3rd
// $200 each") plus optional awards ("Final MVP $100", "Best rookie: gaming
// mouse"). Every unit of the pool must be assigned — placements + cash awards
// must equal the pool — so players can see exactly where the money goes.

export interface AwardInput {
  name: string;
  cashAmount: number | null;
  prizeText: string | null;
}

export interface TierLike {
  from: number;
  to: number;
  amount: number;
}

const MAX_AWARDS = 15;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function tiersTotal(tiers: TierLike[]): number {
  return round2(tiers.reduce((sum, t) => sum + t.amount * (t.to - t.from + 1), 0));
}

export function awardsCash(awards: AwardInput[]): number {
  return round2(awards.reduce((sum, a) => sum + (a.cashAmount ?? 0), 0));
}

export function parsePrizeAwards(raw: unknown): { ok: true; awards: AwardInput[] } | { ok: false; message: string } {
  if (raw === undefined || raw === null) return { ok: true, awards: [] };
  if (!Array.isArray(raw)) return { ok: false, message: "prizeAwards must be a list." };
  if (raw.length > MAX_AWARDS) return { ok: false, message: `At most ${MAX_AWARDS} awards.` };
  const awards: AwardInput[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (name.length < 2 || name.length > 60) return { ok: false, message: "Each award needs a name (2–60 characters), e.g. Final MVP." };
    if (seen.has(name.toLowerCase())) return { ok: false, message: `"${name}" is listed twice.` };
    seen.add(name.toLowerCase());
    let cashAmount: number | null = null;
    if (o.cashAmount !== undefined && o.cashAmount !== null && o.cashAmount !== "") {
      const n = Number(o.cashAmount);
      if (!Number.isFinite(n) || n <= 0 || n > 1_000_000_000) return { ok: false, message: `"${name}": enter a cash amount above zero, or leave it empty.` };
      cashAmount = round2(n);
    }
    const prizeText = typeof o.prizeText === "string" && o.prizeText.trim() ? o.prizeText.trim() : null;
    if (prizeText && prizeText.length > 100) return { ok: false, message: `"${name}": the prize description is too long (max 100 characters).` };
    if (cashAmount === null && !prizeText) return { ok: false, message: `"${name}" needs a cash amount, a prize description, or both.` };
    awards.push({ name, cashAmount, prizeText });
  }
  return { ok: true, awards };
}

// Error message, or null when the prize pool is fully and consistently described.
export function checkPrizeBreakdown(input: { pool: number | null | undefined; tiers: TierLike[]; awards: AwardInput[] }): string | null {
  const pool = input.pool ?? 0;
  const cash = awardsCash(input.awards);
  if (!(pool > 0)) {
    if (input.tiers.length > 0 || cash > 0) return "Set a prize pool before assigning prizes.";
    return null; // no pool: only non-cash awards are possible
  }
  if (input.tiers.length === 0) {
    return "Say how many teams share the prize pool and how much each wins — add at least one place.";
  }
  const allocated = round2(tiersTotal(input.tiers) + cash);
  const diff = round2(pool - allocated);
  if (diff > 0) {
    return `${diff.toLocaleString("en-US")} of the prize pool isn't assigned yet. Every part of the pool needs a place or a cash award, so players can see where it goes.`;
  }
  if (diff < 0) {
    return `Places and cash awards add up to ${allocated.toLocaleString("en-US")}, which is more than the prize pool (${pool.toLocaleString("en-US")}).`;
  }
  return null;
}
