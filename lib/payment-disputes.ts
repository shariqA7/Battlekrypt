// Payment disputes: the rules that decide who may open what, when, and when a refund counts as late.
// Pure (no database) so they can be tested on their own; the database side is
// lib/services/payment-disputes.ts.

export type DisputeKind = "rejected_after_paying" | "no_room_details" | "event_not_held" | "wrong_amount" | "fake_proof";
export type DisputeSide = "payer" | "organizer";

export const RESPONSE_HOURS = 48; // the other side's time to answer
export const REFUND_DAYS = 5; // how long an organizer has to pay a refund an admin ordered
export const PENDING_IGNORED_HOURS = 48; // a pending payment untouched this long counts as "ignored"
export const EVENT_NOT_HELD_DAYS = 14; // approved this long ago and the event still isn't finished
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const DISPUTE_KINDS: { kind: DisputeKind; side: DisputeSide; label: string; hint: string }[] = [
  { kind: "rejected_after_paying", side: "payer", label: "I paid but was rejected or ignored", hint: "Your entry was rejected, or sat unanswered after you paid." },
  { kind: "no_room_details", side: "payer", label: "I was approved but never got the room details", hint: "The event started and you still have no room ID or venue details." },
  { kind: "event_not_held", side: "payer", label: "The event was cancelled or never happened", hint: "You want your entry fee back." },
  { kind: "wrong_amount", side: "payer", label: "The wrong amount was taken or accepted", hint: "The organizer's record doesn't match what you paid." },
  { kind: "fake_proof", side: "organizer", label: "This payment proof looks fake", hint: "The screenshot or transaction ID doesn't match any payment you received." },
];

export type DisputeContext = {
  entryType: "free" | "paid";
  hasProof: boolean;
  registrationStatus: "pending" | "approved" | "rejected" | "disqualified";
  tournamentStatus: "draft" | "published" | "registration_open" | "registration_closed" | "in_progress" | "completed" | "cancelled";
  registeredAt: Date;
  approvedAt: Date | null;
  now: Date;
};

/** null when the case may be opened, otherwise a short reason it can't be. */
export function disputeBlockedReason(kind: DisputeKind, c: DisputeContext): string | null {
  if (c.entryType !== "paid" || !c.hasProof) return "Payment disputes are for paid entries with a payment proof.";
  switch (kind) {
    case "rejected_after_paying":
      return c.registrationStatus === "rejected" ||
        (c.registrationStatus === "pending" && c.now.getTime() - c.registeredAt.getTime() > PENDING_IGNORED_HOURS * HOUR)
        ? null
        : `This only applies once the entry is rejected, or has waited more than ${PENDING_IGNORED_HOURS} hours for an answer.`;
    case "no_room_details":
      return c.registrationStatus === "approved" && (c.tournamentStatus === "in_progress" || c.tournamentStatus === "completed")
        ? null
        : "This only applies to an approved entry once the event has started.";
    case "event_not_held":
      if (c.tournamentStatus === "cancelled") return null;
      return c.registrationStatus === "approved" &&
        c.tournamentStatus !== "completed" &&
        c.approvedAt !== null &&
        c.now.getTime() - c.approvedAt.getTime() > EVENT_NOT_HELD_DAYS * DAY
        ? null
        : `This only applies if the event was cancelled, or you were approved more than ${EVENT_NOT_HELD_DAYS} days ago and it still hasn't finished.`;
    case "wrong_amount":
      return c.registrationStatus === "disqualified" ? "Disqualified entries can't be disputed here." : null;
    case "fake_proof":
      return c.registrationStatus === "pending" || c.registrationStatus === "approved" ? null : "This only applies while the entry is pending or approved.";
  }
}

/** The refund an admin ordered is late when it was not marked sent by its due date, or the payer contested it. */
export function isRefundOverdue(d: { refundDueAt: Date | null; refundSentAt: Date | null; refundReceivedAt: Date | null; refundContestedAt: Date | null }, now: Date): boolean {
  if (d.refundReceivedAt) return false;
  if (d.refundContestedAt) return true;
  return !!d.refundDueAt && !d.refundSentAt && d.refundDueAt.getTime() < now.getTime();
}

export const addHours = (d: Date, h: number) => new Date(d.getTime() + h * HOUR);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** A partial refund must be positive and no more than what was paid. */
export function refundAmountError(amount: number | null, entryFee: number): string | null {
  if (amount === null) return null;
  if (!Number.isFinite(amount) || amount <= 0) return "Enter a refund amount above zero.";
  if (amount > entryFee) return "A refund can't be more than the entry fee.";
  return null;
}

export type DisputeStateInput = {
  status: "awaiting_response" | "awaiting_admin" | "resolved";
  outcome: "for_payer" | "for_organizer" | null;
  kind: DisputeKind;
  refundDueAt: Date | null;
  refundSentAt: Date | null;
  refundReceivedAt: Date | null;
  refundContestedAt: Date | null;
};

/** One plain-words state for a case, shown in lists. */
export function disputeStateLabel(d: DisputeStateInput): { label: string; tone: "amber" | "teal" | "danger" | "muted" } {
  if (d.status === "awaiting_response") return { label: "Waiting for a response", tone: "amber" };
  if (d.status === "awaiting_admin") return { label: "With an admin", tone: "amber" };
  if (d.outcome === "for_payer" && d.refundDueAt) {
    if (d.refundReceivedAt) return { label: "Refund received", tone: "teal" };
    if (d.refundContestedAt) return { label: "Refund disputed", tone: "danger" };
    if (d.refundSentAt) return { label: "Refund sent: waiting for the player to confirm", tone: "amber" };
    return { label: "Refund ordered", tone: "amber" };
  }
  return { label: d.outcome === "for_payer" ? "Decided for the player" : "Decided for the organizer", tone: "muted" };
}

export const disputeKindLabel = (k: DisputeKind) => DISPUTE_KINDS.find((x) => x.kind === k)?.label ?? k;
