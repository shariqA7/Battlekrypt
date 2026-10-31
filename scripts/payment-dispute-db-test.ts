// Payment disputes against a real database: opening, responding, deadlines, deciding, refund
// tracking, and the consequences for an organizer who ignores an ordered refund.
// Needs a Postgres with all migrations applied (npm test provides one).
import { prisma } from "../lib/prisma";
import {
  adminRefundAction, confirmRefundReceived, contestRefund, decideDispute, listDisputesForAdmin, markRefundSent,
  openDispute, respondToDispute, sweepDisputes, getDisputeForViewer,
} from "../lib/services/payment-disputes";
import { getPayoutHolds } from "../lib/services/organizer-trust";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const idOf = (r: unknown) => (r && typeof r === "object" && "data" in r ? (r as { data: { id: string } }).data.id : "");
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

async function main() {
  await prisma.user.createMany({ data: ["adm", "org", "payer", "other"].map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, isAdmin: u === "adm" })) });
  const organizer = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "Org" } });
  const game = await prisma.game.create({ data: { name: "G" } });
  const t = await prisma.tournament.create({ data: { organizerId: organizer.id, gameId: game.id, type: "tournament", maxTeams: 10, format: "single_elimination", status: "registration_open", slug: "pd1", name: "Paid Cup", mode: "solo", entryType: "paid", entryFeeAmount: 500, entryFeeCurrency: "PKR" } });
  const profile = await prisma.playerProfile.create({ data: { userId: "payer", firstName: "P", lastName: "x", birthDate: new Date("2000-01-01") } });
  const reg = (status: "pending" | "approved" | "rejected", extra: object = {}) =>
    prisma.registration.create({ data: { tournamentId: t.id, playerId: profile.id, status, paymentStatus: "unpaid", paymentProofUrl: "https://x/p.png", payerUserId: "payer", ...extra } });

  // ---- opening
  const rejected = await reg("rejected");
  ok("a stranger can't open a case", err(await openDispute({ userId: "other", registrationId: rejected.id, kind: "rejected_after_paying", reason: "I paid and was rejected" })) === "forbidden");
  ok("the organizer can't open a payer-side case", err(await openDispute({ userId: "org", registrationId: rejected.id, kind: "rejected_after_paying", reason: "I paid and was rejected" })) === "forbidden");
  ok("a too-short reason is refused", err(await openDispute({ userId: "payer", registrationId: rejected.id, kind: "rejected_after_paying", reason: "short" })) === "validation_error");
  ok("a case the rules don't allow yet is refused", err(await openDispute({ userId: "payer", registrationId: rejected.id, kind: "no_room_details", reason: "No room details at all" })) === "not_allowed");
  const opened = await openDispute({ userId: "payer", registrationId: rejected.id, kind: "rejected_after_paying", reason: "I paid on time and was rejected without a reason." });
  const d1 = idOf(opened);
  ok("the payer opens a case", !!d1);
  ok("only one open case per entry", err(await openDispute({ userId: "payer", registrationId: rejected.id, kind: "wrong_amount", reason: "Another problem entirely" })) === "already_open");
  ok("the organizer is told", (await prisma.notification.count({ where: { userId: "org", type: "payment_dispute" } })) === 1);
  ok("the other person can't see the case", (await getDisputeForViewer("other", d1)) === null && (await getDisputeForViewer("payer", d1))?.role === "payer");

  // ---- responding
  ok("the payer can't answer their own case", err(await respondToDispute({ userId: "payer", disputeId: d1, note: "Hello there" })) === "forbidden");
  ok("an empty reply is refused", err(await respondToDispute({ userId: "org", disputeId: d1, note: "" })) === "validation_error");
  ok("the organizer responds and it goes to an admin", "data" in (await respondToDispute({ userId: "org", disputeId: d1, note: "The proof showed the wrong amount." })) && (await prisma.paymentDispute.findUnique({ where: { id: d1 } }))?.status === "awaiting_admin");

  // ---- a case nobody answers
  const pending = await reg("pending", { registeredAt: hoursAgo(60) });
  const d2 = idOf(await openDispute({ userId: "payer", registrationId: pending.id, kind: "rejected_after_paying", reason: "Ignored for days after paying." }));
  await prisma.paymentDispute.update({ where: { id: d2 }, data: { responseDueAt: hoursAgo(1) } });
  await sweepDisputes();
  const lapsed = await prisma.paymentDispute.findUnique({ where: { id: d2 } });
  ok("an unanswered case goes to an admin, marked as missed", lapsed?.status === "awaiting_admin" && lapsed.missedDeadline === true);

  // ---- deciding
  ok("an invalid outcome is refused", err(await decideDispute({ adminId: "adm", disputeId: d1, outcome: "maybe", note: "Because I said so" })) === "validation_error");
  ok("a refund above the entry fee is refused", err(await decideDispute({ adminId: "adm", disputeId: d1, outcome: "for_payer", note: "Refund too much", refundAmount: 900 })) === "validation_error");
  ok("a decision needs a note", err(await decideDispute({ adminId: "adm", disputeId: d1, outcome: "for_payer", note: "" })) === "validation_error");
  ok("admin rules for the payer with a partial refund", "data" in (await decideDispute({ adminId: "adm", disputeId: d1, outcome: "for_payer", note: "Proof was fine.", refundAmount: 200 })));
  const decided = await prisma.paymentDispute.findUnique({ where: { id: d1 } });
  ok("the case is resolved with a refund order", decided?.status === "resolved" && decided.outcome === "for_payer" && Number(decided.refundAmount?.toString()) === 200 && decided.refundCurrency === "PKR" && !!decided.refundDueAt);
  ok("a decided case can't be decided again", err(await decideDispute({ adminId: "adm", disputeId: d1, outcome: "for_organizer", note: "Changing my mind" })) === "wrong_state");

  // ---- refund tracking
  ok("the payer can't mark the refund as sent", err(await markRefundSent({ userId: "payer", disputeId: d1 })) === "forbidden");
  ok("an unpaid ordered refund is a payout hold", (await getPayoutHolds(organizer.id, 0)).some((h) => h.reason === "refund_unpaid"));
  ok("the organizer marks it sent", "data" in (await markRefundSent({ userId: "org", disputeId: d1 })));
  ok("a sent refund is no longer a hold", !(await getPayoutHolds(organizer.id, 0)).some((h) => h.reason === "refund_unpaid"));
  ok("the payer says it never arrived", "data" in (await contestRefund({ userId: "payer", disputeId: d1 })));
  ok("a contested refund is a hold again, and shows to admins", (await getPayoutHolds(organizer.id, 0)).some((h) => h.reason === "refund_unpaid") && (await listDisputesForAdmin()).some((d) => d.id === d1));
  ok("an admin can give more time", "data" in (await adminRefundAction({ adminId: "adm", disputeId: d1, action: "give_more_time", days: 3 })));
  ok("the organizer pays again", "data" in (await markRefundSent({ userId: "org", disputeId: d1 })));
  ok("the payer confirms it arrived", "data" in (await confirmRefundReceived({ userId: "payer", disputeId: d1 })));
  ok("a confirmed refund clears the hold and the admin queue", !(await getPayoutHolds(organizer.id, 0)).some((h) => h.reason === "refund_unpaid") && !(await listDisputesForAdmin()).some((d) => d.id === d1));

  // ---- an organizer who ignores a refund order is paused
  ok("admin rules for the payer on the second case", "data" in (await decideDispute({ adminId: "adm", disputeId: d2, outcome: "for_payer", note: "Ignored the player." })));
  await prisma.paymentDispute.update({ where: { id: d2 }, data: { refundDueAt: hoursAgo(1) } });
  await sweepDisputes();
  const paused = await prisma.organizerProfile.findUnique({ where: { id: organizer.id } });
  ok("an unpaid refund past its date pauses the organizer's paid events", !!paused?.reportsPausedAt && (paused.reportsPauseReason ?? "").includes("refund"));
  const notes = await prisma.notification.count({ where: { userId: "org", title: "Your paid events are paused" } });
  await sweepDisputes();
  ok("sweeping again doesn't pause or notify twice", (await prisma.notification.count({ where: { userId: "org", title: "Your paid events are paused" } })) === notes);

  // ---- the organizer disputing a fake proof
  const approved = await reg("approved", { approvedAt: hoursAgo(2) });
  const d3 = idOf(await openDispute({ userId: "org", registrationId: approved.id, kind: "fake_proof", reason: "The screenshot isn't in our account at all." }));
  ok("the organizer opens a fake-proof case", !!d3);
  await respondToDispute({ userId: "payer", disputeId: d3, note: "The payment is real, here is the receipt." });
  ok("admin rules for the organizer", "data" in (await decideDispute({ adminId: "adm", disputeId: d3, outcome: "for_organizer", note: "Receipt doesn't match." })));
  const after = await prisma.paymentDispute.findUnique({ where: { id: d3 } });
  ok("a fake proof never orders a refund, and the entry is rejected", after?.refundDueAt === null && (await prisma.registration.findUnique({ where: { id: approved.id } }))?.status === "rejected");

  await prisma.$disconnect();
  if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
  console.log("\nall passed");
}
main().catch(async (e) => { console.error("FAIL crashed", e); await prisma.$disconnect(); process.exit(1); });
