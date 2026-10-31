// Payment dispute rules: who may open what and when, and when a refund counts as late. Pure.
import { DISPUTE_KINDS, addDays, addHours, disputeBlockedReason, disputeStateLabel, isRefundOverdue, refundAmountError, type DisputeContext, type DisputeStateInput } from "../lib/payment-disputes";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const now = new Date("2026-11-10T12:00:00Z");
const base: DisputeContext = { entryType: "paid", hasProof: true, registrationStatus: "pending", tournamentStatus: "registration_open", registeredAt: addHours(now, -1), approvedAt: null, now };
const ctx = (o: Partial<DisputeContext>): DisputeContext => ({ ...base, ...o });

ok("free entries and entries without a proof can't be disputed", disputeBlockedReason("wrong_amount", ctx({ entryType: "free" })) !== null && disputeBlockedReason("wrong_amount", ctx({ hasProof: false })) !== null);
ok("a rejected paid entry can be disputed", disputeBlockedReason("rejected_after_paying", ctx({ registrationStatus: "rejected" })) === null);
ok("a fresh pending entry can't yet (organizer still has time)", disputeBlockedReason("rejected_after_paying", ctx({})) !== null);
ok("a pending entry ignored for over 48 hours can", disputeBlockedReason("rejected_after_paying", ctx({ registeredAt: addHours(now, -49) })) === null);
ok("an approved entry can't claim 'rejected'", disputeBlockedReason("rejected_after_paying", ctx({ registrationStatus: "approved" })) !== null);
ok("no room details only once the event has started", disputeBlockedReason("no_room_details", ctx({ registrationStatus: "approved" })) !== null && disputeBlockedReason("no_room_details", ctx({ registrationStatus: "approved", tournamentStatus: "in_progress" })) === null);
ok("a cancelled event can always claim a refund", disputeBlockedReason("event_not_held", ctx({ tournamentStatus: "cancelled" })) === null);
ok("an event that isn't cancelled needs 14+ days since approval", disputeBlockedReason("event_not_held", ctx({ registrationStatus: "approved", tournamentStatus: "in_progress", approvedAt: addDays(now, -3) })) !== null && disputeBlockedReason("event_not_held", ctx({ registrationStatus: "approved", tournamentStatus: "in_progress", approvedAt: addDays(now, -15) })) === null);
ok("a completed event is never 'not held'", disputeBlockedReason("event_not_held", ctx({ registrationStatus: "approved", tournamentStatus: "completed", approvedAt: addDays(now, -30) })) !== null);
ok("organizer can dispute a pending or approved proof, not a rejected one", disputeBlockedReason("fake_proof", ctx({})) === null && disputeBlockedReason("fake_proof", ctx({ registrationStatus: "approved" })) === null && disputeBlockedReason("fake_proof", ctx({ registrationStatus: "rejected" })) !== null);
ok("fake_proof is the only organizer-side kind", DISPUTE_KINDS.filter((k) => k.side === "organizer").map((k) => k.kind).join() === "fake_proof");

const due = addDays(now, -1);
const open = { refundDueAt: due, refundSentAt: null, refundReceivedAt: null, refundContestedAt: null };
ok("an ordered refund past its due date is overdue", isRefundOverdue(open, now));
ok("not overdue before the due date", !isRefundOverdue({ ...open, refundDueAt: addDays(now, 2) }, now));
ok("marked sent in time is not overdue", !isRefundOverdue({ ...open, refundSentAt: addDays(now, -2) }, now));
ok("a contested refund is overdue until the payer confirms", isRefundOverdue({ ...open, refundSentAt: addDays(now, -3), refundContestedAt: addDays(now, -1) }, now));
ok("a confirmed refund is never overdue", !isRefundOverdue({ ...open, refundReceivedAt: now, refundContestedAt: now }, now));
ok("a case with no refund ordered is never overdue", !isRefundOverdue({ refundDueAt: null, refundSentAt: null, refundReceivedAt: null, refundContestedAt: null }, now));
ok("partial refund amounts are checked", refundAmountError(null, 500) === null && refundAmountError(200, 500) === null && refundAmountError(0, 500) !== null && refundAmountError(501, 500) !== null && refundAmountError(NaN, 500) !== null);

const st = (o: Partial<DisputeStateInput>): DisputeStateInput => ({ status: "resolved", outcome: "for_payer", kind: "wrong_amount", refundDueAt: due, refundSentAt: null, refundReceivedAt: null, refundContestedAt: null, ...o });
ok("state: waiting, with admin", disputeStateLabel(st({ status: "awaiting_response" })).label === "Waiting for a response" && disputeStateLabel(st({ status: "awaiting_admin" })).label === "With an admin");
ok("state: refund ordered, sent, contested, received", disputeStateLabel(st({})).label === "Refund ordered" && disputeStateLabel(st({ refundSentAt: now })).label.startsWith("Refund sent") && disputeStateLabel(st({ refundSentAt: now, refundContestedAt: now })).label === "Refund disputed" && disputeStateLabel(st({ refundReceivedAt: now })).label === "Refund received");
ok("state: decided with no refund", disputeStateLabel(st({ outcome: "for_organizer", refundDueAt: null })).label === "Decided for the organizer" && disputeStateLabel(st({ kind: "fake_proof", refundDueAt: null })).label === "Decided for the player");

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall passed");
