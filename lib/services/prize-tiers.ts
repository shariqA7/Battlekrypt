import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Prize distribution (D3). One row = a finishing-position range and what EACH
// team in that range wins, e.g. {1,1,750000} or {4,8,50000} ("4th-8th, $50,000
// each"). The whole split can't pay out more than the prize pool.

export interface PrizeTierInput {
  from: number;
  to: number;
  amount: number;
}

const MAX_ROWS = 20;
const MAX_POSITION = 1000;

export function parsePrizeTiers(raw: unknown): { ok: true; tiers: PrizeTierInput[] } | { ok: false; message: string } {
  if (raw === undefined || raw === null) return { ok: true, tiers: [] };
  if (!Array.isArray(raw)) return { ok: false, message: "prizeTiers must be a list." };
  if (raw.length > MAX_ROWS) return { ok: false, message: `A prize split can have at most ${MAX_ROWS} rows.` };

  const tiers: PrizeTierInput[] = [];
  for (const r of raw) {
    const from = Number((r as Record<string, unknown>)?.from);
    const to = Number((r as Record<string, unknown>)?.to ?? (r as Record<string, unknown>)?.from);
    const amount = Number((r as Record<string, unknown>)?.amount);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > MAX_POSITION) {
      return { ok: false, message: "Each prize row needs a valid finishing place (1 or more, and the last place can't be before the first)." };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Each prize row needs an amount greater than zero." };
    }
    tiers.push({ from, to, amount: Math.round(amount * 100) / 100 });
  }

  const sorted = [...tiers].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from <= sorted[i - 1].to) {
      return { ok: false, message: "Prize rows can't overlap: each finishing place can only be listed once." };
    }
  }
  return { ok: true, tiers: sorted };
}

export function totalPayout(tiers: PrizeTierInput[]): number {
  return Math.round(tiers.reduce((sum, t) => sum + t.amount * (t.to - t.from + 1), 0) * 100) / 100;
}

// Returns an error message, or null when the split is fine for this pool.
export function checkAgainstPool(tiers: PrizeTierInput[], poolAmount: number | null | undefined): string | null {
  if (tiers.length === 0) return null;
  if (!poolAmount || poolAmount <= 0) return "Set a prize pool before splitting it by place.";
  const total = totalPayout(tiers);
  if (total > poolAmount) {
    return `The prize split adds up to ${total.toLocaleString("en-US")}, which is more than the prize pool (${poolAmount.toLocaleString("en-US")}).`;
  }
  return null;
}

// Replace a tournament's split in one transaction (empty list clears it).
export function replacePrizeTiers(tournamentId: string, tiers: PrizeTierInput[]): Prisma.PrismaPromise<unknown>[] {
  return [
    prisma.prizeTier.deleteMany({ where: { tournamentId } }),
    ...(tiers.length
      ? [
          prisma.prizeTier.createMany({
            data: tiers.map((t) => ({ tournamentId, positionFrom: t.from, positionTo: t.to, amount: t.amount })),
          }),
        ]
      : []),
  ];
}

// "1st", "2nd", "3rd", "4th", 11th..13th, 21st ...
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export function placeLabel(from: number, to: number): string {
  return from === to ? `${ordinal(from)} place` : `${ordinal(from)}–${ordinal(to)}`;
}
