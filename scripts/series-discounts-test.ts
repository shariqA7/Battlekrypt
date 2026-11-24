// Booking discounts for scrim series, what was actually paid per session, refunds and disputes using it,
// and refunds that settle themselves. Needs a Postgres with all migrations applied (see phase8-1-test.ts).
import { prisma } from "../lib/prisma";
import { createSeries } from "../lib/services/scrim-series";
import {
  createBooking, approveBooking, cancelSeriesSession, chooseForCancelled, listMyChoices, listMyBookings,
  listPendingBookingsForOrganizer, listRefundsOwed,
} from "../lib/services/series-booking";
import { actOnRefund, listRefunds } from "../lib/services/withdrawals";
import { decideDispute } from "../lib/services/payment-disputes";
import { discountFor, priceBooking, validateDiscountTiers, validateSeries, dateInZone } from "../lib/scrim-series-rules";
import { entryAmount } from "../lib/registration-amount";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const code = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const PROOF = "https://proofs.example/receipt.png";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const today = dateInZone(new Date(), "Asia/Karachi");
const sum = (a: number[]) => Math.round(a.reduce((n, x) => n + x, 0) * 100) / 100;

async function main() {
  // ---- tiers ----
  ok("tiers: none given is fine", validateDiscountTiers(undefined).ok && validateDiscountTiers([]).ok && validateDiscountTiers("").ok);
  const t = validateDiscountTiers([{ minSessions: "6", percentOff: "20" }, { minSessions: 3, percentOff: 10 }, { minSessions: "", percentOff: "" }]);
  ok("tiers: sorted, numbers cleaned, empty rows ignored", t.ok && t.value.length === 2 && t.value[0].minSessions === 3 && t.value[1].percentOff === 20);
  ok("tiers: bad numbers refused", !validateDiscountTiers([{ minSessions: 1, percentOff: 10 }]).ok && !validateDiscountTiers([{ minSessions: 41, percentOff: 10 }]).ok && !validateDiscountTiers([{ minSessions: 5, percentOff: 0 }]).ok && !validateDiscountTiers([{ minSessions: 5, percentOff: 91 }]).ok && !validateDiscountTiers([{ minSessions: 5.5, percentOff: 10 }]).ok);
  ok("tiers: same start twice, or a smaller discount for more sessions, refused", !validateDiscountTiers([{ minSessions: 5, percentOff: 10 }, { minSessions: 5, percentOff: 20 }]).ok && !validateDiscountTiers([{ minSessions: 5, percentOff: 20 }, { minSessions: 10, percentOff: 15 }]).ok && !validateDiscountTiers([{ minSessions: 5, percentOff: 10 }, { minSessions: 10, percentOff: 10 }]).ok);
  ok("tiers: at most five", !validateDiscountTiers([2, 3, 4, 5, 6, 7].map((m) => ({ minSessions: m, percentOff: m * 5 }))).ok && validateDiscountTiers([2, 3, 4, 5, 6].map((m) => ({ minSessions: m, percentOff: m * 5 }))).ok);
  const tiers = [{ minSessions: 3, percentOff: 10 }, { minSessions: 6, percentOff: 20 }];
  ok("discount: the best tier reached applies", discountFor(tiers, 1) === 0 && discountFor(tiers, 2) === 0 && discountFor(tiers, 3) === 10 && discountFor(tiers, 5) === 10 && discountFor(tiers, 6) === 20 && discountFor(tiers, 40) === 20 && discountFor(null, 10) === 0);

  // ---- price and split ----
  const p10 = priceBooking(100, 10, [{ minSessions: 10, percentOff: 10 }]);
  ok("price: 10 sessions at 100 with 10% off = 900, 90 each", p10.total === 900 && p10.gross === 1000 && p10.saved === 100 && p10.perSession.every((x) => x === 90) && p10.percentOff === 10);
  ok("price: no discount below the tier", priceBooking(100, 9, [{ minSessions: 10, percentOff: 10 }]).total === 900 && priceBooking(100, 9, [{ minSessions: 10, percentOff: 10 }]).percentOff === 0);
  const odd = priceBooking(33.33, 2, [{ minSessions: 2, percentOff: 10 }]);
  ok("price: spare cents go to the earliest sessions and the parts add up to the total exactly", odd.total === 59.99 && odd.perSession[0] === 30 && odd.perSession[1] === 29.99 && sum(odd.perSession) === odd.total);
  ok("price: parts always add up (many shapes)", [1, 3, 7, 33.33, 0.99, 149.5].every((fee) => [1, 2, 3, 7, 10, 31, 40].every((n) => [0, 5, 10, 33, 90].every((pct) => { const r = priceBooking(fee, n, pct ? [{ minSessions: 1, percentOff: pct }] : []); return sum(r.perSession) === r.total && r.perSession.length === n && r.perSession.every((x) => x >= 0); }))));
  ok("amount: what was paid wins over the list price", entryAmount({ paidAmount: 4.5 }, { entryFeeAmount: 5 }) === 4.5 && entryAmount({ paidAmount: null }, { entryFeeAmount: 5 }) === 5 && entryAmount({}, {}) === null);

  // ---- series validation ----
  const good = { name: "Night", gameId: "g", mode: "solo", maxTeams: 10, entryType: "paid", entryFeeAmount: 5, entryFeeCurrency: "USD", paymentInstructions: "Easypaisa 0300-0000000", timezone: "Asia/Karachi", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotTimes: ["20:00"], startDate: today, endDate: addDays(today, 20) };
  const pro = { maxScrimSeries: 3, maxSeriesDays: 93, maxSlotsPerDay: 4 };
  ok("series: valid discounts are accepted and kept", (() => { const r = validateSeries({ ...good, discountTiers: tiers }, pro, 0); return r.ok && r.value.discountTiers.length === 2; })());
  ok("series: discounts on a free series are refused", !validateSeries({ ...good, entryType: "free", discountTiers: tiers }, pro, 0).ok);
  ok("series: bad discounts are refused with a message", (() => { const r = validateSeries({ ...good, discountTiers: [{ minSessions: 5, percentOff: 99 }] }, pro, 0); return !r.ok && r.message.includes("percentage"); })());

  // ---- bookings with a discount ----
  await prisma.user.createMany({ data: ["orgU", "p1", "p2", "adm"].map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, kycStatus: "approved" as const, isAdmin: u === "adm" })) });
  const org = await prisma.organizerProfile.create({ data: { userId: "orgU", orgName: "Night Org", planCode: "organizer_pro", createdAt: new Date(Date.now() - 400 * 86400000) } });
  const prof = (u: string) => prisma.playerProfile.create({ data: { userId: u, firstName: u, lastName: "P", birthDate: new Date("2000-01-01"), planCode: "player_basic" } });
  const [pp1] = await Promise.all([prof("p1"), prof("p2")]);
  const game = await prisma.game.create({ data: { name: "Game A", isApproved: true } });
  const base = { gameId: game.id, mode: "solo", maxTeamSize: 1, maxTeams: 10, timezone: "Asia/Karachi", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotTimes: ["20:00"], startDate: today, endDate: addDays(today, 30), entryType: "paid", entryFeeAmount: 5, entryFeeCurrency: "USD", paymentInstructions: "Send to Easypaisa 0300-0000000" };
  ok("create: a series with discounts is saved", !code(await createSeries("orgU", { ...base, name: "Disc Nights", discountTiers: tiers })));
  const series = await prisma.scrimSeries.findFirstOrThrow({ where: { name: "Disc Nights" } });
  ok("create: the tiers are stored on the series", Array.isArray(series.discountTiers) && (series.discountTiers as unknown[]).length === 2);
  ok("create: discounts on a free series are refused and nothing is made", code(await createSeries("orgU", { ...base, name: "Free Disc", entryType: "free", discountTiers: tiers })) === "validation_error" && (await prisma.scrimSeries.count({ where: { name: "Free Disc" } })) === 0);
  const S = await prisma.tournament.findMany({ where: { seriesId: series.id }, orderBy: { startAt: "asc" } });
  const ids = (...i: number[]) => i.map((x) => S[x].id);

  const b2 = await createBooking("p2", series.slug, { sessionIds: ids(0, 1), paymentProofUrl: PROOF, paymentReference: "TXN-2001" });
  ok("booking: two sessions is below the tier, so it costs the list price", !code(b2) && (b2 as { data: { total: number; discountPercent: number } }).data.total === 10 && (b2 as { data: { discountPercent: number } }).data.discountPercent === 0);

  const b3 = await createBooking("p1", series.slug, { sessionIds: ids(2, 3, 4), paymentProofUrl: PROOF, paymentReference: "TXN-1001" });
  const d3 = (b3 as { data: { bookingId: string; total: number; discountPercent: number; saved: number } }).data;
  ok("booking: three sessions reach the 10% tier: 13.50 instead of 15", !code(b3) && d3.total === 13.5 && d3.discountPercent === 10 && d3.saved === 1.5);
  const bk = await prisma.seriesBooking.findUniqueOrThrow({ where: { id: d3.bookingId } });
  const regs = await prisma.registration.findMany({ where: { bookingId: d3.bookingId }, orderBy: { tournament: { startAt: "asc" } } });
  ok("booking: the booking records the discount and the total", bk.discountPercent === 10 && Number(bk.totalAmount!.toString()) === 13.5 && Number(bk.feePerSession!.toString()) === 5);
  ok("booking: each session remembers what was paid for it (4.50), adding up to the total", regs.length === 3 && regs.every((r) => Number(r.paidAmount!.toString()) === 4.5) && sum(regs.map((r) => Number(r.paidAmount!.toString()))) === 13.5);
  ok("booking: the organizer is told the amount and the discount", await prisma.notification.findFirst({ where: { userId: "orgU", title: "New booking to review", body: { contains: "10% discount" } } }).then((n) => !!n && /13\.50/.test(n.body!)));
  const queue = await listPendingBookingsForOrganizer("orgU");
  ok("organizer queue: shows what actually arrived, with the discount", queue.some((q) => q.total === 13.5 && q.discountPercent === 10) && queue.some((q) => q.total === 10 && q.discountPercent === 0));
  ok("my bookings: shows the discounted total", (await listMyBookings("p1"))[0].total === 13.5 && (await listMyBookings("p1"))[0].discountPercent === 10);

  const b6 = await createBooking("p2", series.slug, { sessionIds: ids(5, 6, 7, 8, 9, 10), paymentProofUrl: PROOF, paymentReference: "TXN-6001" });
  ok("booking: six sessions reach the 20% tier: 24 instead of 30", (b6 as { data: { total: number; discountPercent: number } }).data.total === 24 && (b6 as { data: { discountPercent: number } }).data.discountPercent === 20);

  // an uneven split
  await createSeries("orgU", { ...base, name: "Odd Nights", entryFeeAmount: 3.33, discountTiers: [{ minSessions: 2, percentOff: 10 }] });
  const odds = await prisma.scrimSeries.findFirstOrThrow({ where: { name: "Odd Nights" } });
  const O = await prisma.tournament.findMany({ where: { seriesId: odds.id }, orderBy: { startAt: "asc" } });
  const bo = await createBooking("p1", odds.slug, { sessionIds: [O[0].id, O[1].id], paymentProofUrl: PROOF, paymentReference: "TXN-5001" });
  const oregs = await prisma.registration.findMany({ where: { bookingId: (bo as { data: { bookingId: string } }).data.bookingId }, orderBy: { tournament: { startAt: "asc" } } });
  ok("booking: an uneven split adds up exactly (3.00 + 2.99 = 5.99)", (bo as { data: { total: number } }).data.total === 5.99 && oregs.map((r) => Number(r.paidAmount!.toString())).join() === "3,2.99");

  // ---- a cancelled session refunds what was paid ----
  await approveBooking("orgU", d3.bookingId);
  await cancelSeriesSession("orgU", S[2].id);
  const r2 = regs[0];
  const choices = await listMyChoices("p1");
  ok("choice: the player is shown what they paid for that session (4.50), not the list price", choices.length === 1 && choices[0].fee === 4.5);
  await chooseForCancelled("p1", r2.id, "refund");
  ok("refund: both notifications name the amount actually paid", await Promise.all([
    prisma.notification.findFirst({ where: { userId: "p1", title: "Refund requested" } }),
    prisma.notification.findFirst({ where: { userId: "orgU", title: "A player asked for a refund" } }),
  ]).then(([a, b]) => /4\.50/.test(a!.body!) && /4\.50/.test(b!.body!) && !/5\.00/.test(a!.body!)));
  const owed = await listRefundsOwed("orgU", S[2].id);
  ok("refund list: one line for the payer with 4.50 and a Mark refunded state", !!owed && owed.items.length === 1 && owed.items[0].amount === 4.5 && owed.items[0].refundStatus === "owed" && owed.items[0].payer === "p1");
  const usual = await listRefunds(S[2].id, org.id);
  ok("the usual Refunds tab shows 4.5 too", !("error" in usual) && usual.rows[0].amount.includes("4.5") && usual.rows[0].payerName === "p1");

  // ---- refunds settle themselves ----
  const t2 = await prisma.tournament.findUniqueOrThrow({ where: { id: S[2].id } });
  ok("settle: while a refund is owed the session is not confirmed and the hold clock runs", t2.cancelRefundsDueAt !== null && t2.refundsConfirmedAt === null);
  await actOnRefund(r2.id, org.id, "refunded");
  ok("settle: marking the refund sent confirms the session by itself", (await prisma.tournament.findUniqueOrThrow({ where: { id: S[2].id } })).refundsConfirmedAt !== null);

  // two payers in one session: confirmed only when both are done
  const [x1, x2] = [await prisma.registration.findFirstOrThrow({ where: { tournamentId: S[4].id, playerId: pp1.id } }), null];
  void x2;
  const extra = await prisma.registration.create({ data: { tournamentId: S[4].id, playerId: (await prisma.playerProfile.findUniqueOrThrow({ where: { userId: "p2" } })).id, status: "approved", paymentStatus: "paid", payerUserId: "p2", paymentReference: "T-X", paidAmount: 5 } });
  await cancelSeriesSession("orgU", S[4].id);
  await chooseForCancelled("p1", x1.id, "refund");
  await chooseForCancelled("p2", extra.id, "refund");
  await actOnRefund(x1.id, org.id, "refunded");
  ok("settle: with one refund still owed the session stays unconfirmed", (await prisma.tournament.findUniqueOrThrow({ where: { id: S[4].id } })).refundsConfirmedAt === null);
  await actOnRefund(extra.id, org.id, "refunded");
  ok("settle: the last refund marked sent confirms it", (await prisma.tournament.findUniqueOrThrow({ where: { id: S[4].id } })).refundsConfirmedAt !== null);

  // a player still choosing keeps it open; moving them away settles it
  const third = await prisma.registration.findFirstOrThrow({ where: { tournamentId: S[3].id, playerId: pp1.id } });
  const other = await prisma.registration.create({ data: { tournamentId: S[3].id, playerId: (await prisma.playerProfile.findUniqueOrThrow({ where: { userId: "p2" } })).id, status: "approved", paymentStatus: "paid", payerUserId: "p2", paymentReference: "T-Y", paidAmount: 5 } });
  await cancelSeriesSession("orgU", S[3].id);
  await chooseForCancelled("p2", other.id, "refund");
  await actOnRefund(other.id, org.id, "refunded");
  ok("settle: a payer who hasn't chosen yet keeps the session open", (await prisma.tournament.findUniqueOrThrow({ where: { id: S[3].id } })).refundsConfirmedAt === null);
  const moved = await chooseForCancelled("p1", third.id, "next");
  ok("settle: once the last payer chooses (here: moved), the session settles", !code(moved) && (await prisma.tournament.findUniqueOrThrow({ where: { id: S[3].id } })).refundsConfirmedAt !== null);
  const carried = await prisma.registration.findFirstOrThrow({ where: { carriedFromId: third.id } });
  ok("move: the new session carries the same paid amount (4.50)", Number(carried.paidAmount!.toString()) === 4.5 && carried.status === "approved" && carried.paymentStatus === "paid");

  // ---- disputes: the most that can be refunded is what was paid ----
  const adminOk = (r: unknown) => !code(r);
  const dispute = (reg: { id: string }, payer: string) => prisma.paymentDispute.create({ data: { registrationId: reg.id, tournamentId: S[5].id, organizerId: org.id, payerUserId: payer, organizerUserId: "orgU", kind: "wrong_amount", openedByUserId: payer, reason: "The amount was wrong", status: "awaiting_admin", responseDueAt: new Date() } });
  const regPaid = await prisma.registration.findFirstOrThrow({ where: { bookingId: (b6 as { data: { bookingId: string } }).data.bookingId, tournamentId: S[5].id } });
  ok("dispute: the registration was paid 4.00 under the 20% tier", Number(regPaid.paidAmount!.toString()) === 4);
  const d1 = await dispute(regPaid, "p2");
  ok("dispute: refunding more than was paid (5.00 list price) is refused", code(await decideDispute({ adminId: "adm", disputeId: d1.id, outcome: "for_payer", note: "Refund the payer", refundAmount: 5 })) === "validation_error");
  ok("dispute: refunding the full 4.00 paid is allowed and means 'everything'", adminOk(await decideDispute({ adminId: "adm", disputeId: d1.id, outcome: "for_payer", note: "Refund the payer", refundAmount: 4 })) && (await prisma.paymentDispute.findUniqueOrThrow({ where: { id: d1.id } })).refundAmount === null);
  const regOther = await prisma.registration.findFirstOrThrow({ where: { bookingId: (b6 as { data: { bookingId: string } }).data.bookingId, tournamentId: S[6].id } });
  const d2 = await dispute(regOther, "p2");
  ok("dispute: a part refund (1.50) is kept as the amount", adminOk(await decideDispute({ adminId: "adm", disputeId: d2.id, outcome: "for_payer", note: "Part refund", refundAmount: 1.5 })) && Number((await prisma.paymentDispute.findUniqueOrThrow({ where: { id: d2.id } })).refundAmount!.toString()) === 1.5);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
