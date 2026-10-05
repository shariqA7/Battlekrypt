import { formatMoney } from "@/lib/money";

// What to show as the prize: the money for cash, otherwise the poster's text.
export function prizeLabel(c: {
  prizeType: string;
  prizeDescription: string;
  cashAmount: { toString(): string } | null;
  cashCurrency: string | null;
}) {
  return c.prizeType === "cash" && c.cashAmount && c.cashCurrency
    ? formatMoney(c.cashAmount, c.cashCurrency)
    : c.prizeDescription;
}

export const POSTER_LABEL = { player: "Player", club: "Club", organizer: "Organization" } as const;

export const ENTRANT_LABEL = {
  either: "Players or teams",
  player: "Solo players only",
  team: "Teams only",
} as const;
