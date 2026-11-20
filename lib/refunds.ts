// What happens to an entry fee when a team withdraws. The ORGANIZER chooses the policy when the
// tournament is created and players see it before they pay (lib/seat-settings.ts describes it).
// BattleKrypt never holds the money: the organizer received it, so the organizer sends refunds.
// These are the pure rules; lib/services/withdrawals.ts applies them.
import type { RefundPolicyKey } from "@/lib/seat-settings";

export type RefundStatusKey = "not_applicable" | "requested" | "waiting_resale" | "owed" | "refunded" | "declined";

export interface RefundInput {
  policy: RefundPolicyKey;
  cutoffHours: number;
  entryType: "free" | "paid";
  /** The team sent a payment (proof uploaded or marked paid). Nothing sent, nothing to refund. */
  sentMoney: boolean;
  /** The team held a seat. A team still on the waiting list never had one. */
  hadSeat: boolean;
  /** When the team's room starts (the tournament's start if the room has no time of its own). */
  roomStart: Date | null;
  now: Date;
}

export const hoursUntil = (start: Date | null, now: Date) => (start ? (start.getTime() - now.getTime()) / 3_600_000 : Infinity);

export function decideRefund(i: RefundInput): { status: RefundStatusKey; reason: string } {
  if (i.entryType !== "paid" || !i.sentMoney) return { status: "not_applicable", reason: "There is nothing to refund." };
  if (!i.hadSeat) return { status: "owed", reason: "You never got a seat, so your payment is refunded in full." };
  switch (i.policy) {
    case "no_refund":
      return { status: "declined", reason: "This tournament doesn't refund withdrawals." };
    case "full_before_cutoff": {
      const left = hoursUntil(i.roomStart, i.now);
      return left >= i.cutoffHours
        ? { status: "owed", reason: "You withdrew in time, so you get a full refund." }
        : { status: "declined", reason: `Refunds close ${i.cutoffHours} ${i.cutoffHours === 1 ? "hour" : "hours"} before the room starts, so this one isn't eligible.` };
    }
    case "if_resold":
      return { status: "waiting_resale", reason: "You'll be refunded if another team takes your seat from the waiting list." };
    default:
      return { status: "requested", reason: "The organizer will decide on your refund." };
  }
}

export type WithdrawBlock = "closed" | "started" | "not_active";

/** Can this entry still withdraw? Only before its room starts, and only while it holds (or queues for) a seat. */
export function withdrawBlock(i: { entryStatus: string; tournamentStatus: string; roomStart: Date | null; now: Date }): WithdrawBlock | null {
  if (!["pending", "approved", "waitlisted"].includes(i.entryStatus)) return "not_active";
  if (!["published", "registration_open", "registration_closed"].includes(i.tournamentStatus)) return "closed";
  if (i.roomStart && i.roomStart.getTime() <= i.now.getTime()) return "started";
  return null;
}

/** Withdrawals waiting for a resale are matched with newly filled seats oldest first. */
export function resolveResales<T extends { id: string; withdrawnAt: Date }>(waiting: T[], seatsResold: number): { owed: string[]; stillWaiting: string[] } {
  const ordered = [...waiting].sort((a, b) => a.withdrawnAt.getTime() - b.withdrawnAt.getTime() || (a.id < b.id ? -1 : 1));
  const n = Math.max(0, Math.min(seatsResold, ordered.length));
  return { owed: ordered.slice(0, n).map((x) => x.id), stillWaiting: ordered.slice(n).map((x) => x.id) };
}

/** What an organizer may do with a refund, and from which state. */
export const REFUND_ACTIONS = {
  owe: { from: ["requested", "waiting_resale", "declined"], to: "owed" },
  decline: { from: ["requested", "waiting_resale", "owed"], to: "declined" },
  refunded: { from: ["owed"], to: "refunded" },
} as const;
export type RefundAction = keyof typeof REFUND_ACTIONS;

export function nextRefundStatus(action: RefundAction, current: RefundStatusKey): RefundStatusKey | null {
  const a = REFUND_ACTIONS[action];
  return (a.from as readonly string[]).includes(current) ? a.to : null;
}

export const REFUND_STATUS_LABEL: Record<RefundStatusKey, string> = {
  not_applicable: "Nothing to refund",
  requested: "Waiting for the organizer",
  waiting_resale: "Refunded if the seat is taken",
  owed: "Refund on its way",
  refunded: "Refunded",
  declined: "No refund",
};
