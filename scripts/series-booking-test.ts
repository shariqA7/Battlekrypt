// Multi-session bookings for scrim series: one payment for several sessions, all-or-nothing booking,
// approving a whole booking, a cancelled session (carry over or refund, the deadline default), and the
// refund list. Needs a Postgres with all migrations applied (see phase8-1-test.ts).
import { prisma } from "../lib/prisma";
import { createSeries } from "../lib/services/scrim-series";
import {
  createBooking, approveBooking, rejectBooking, cancelSeriesSession, chooseForCancelled, processExpiredChoices,
  listMyChoices, listMyBookings, listPendingBookingsForOrganizer, listRefundsOwed, MAX_BOOKING_SESSIONS, CHOICE_HOURS,
} from "../lib/services/series-booking";
import { confirmRefunds } from "../lib/services/change-requests";
import { actOnRefund } from "../lib/services/withdrawals";
import { dateInZone } from "../lib/scrim-series-rules";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const code = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const PROOF = "https://proofs.example/receipt.png";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const today = dateInZone(new Date(), "Asia/Karachi");

async function main() {
  ok("limits: booking size and choice window are set", MAX_BOOKING_SESSIONS === 40 && CHOICE_HOURS === 48);

  // ---- setup ----
  const names = ["orgU", "other", "p1", "p2", "p3", "stranger", "clubOwner", "member"];
  await prisma.user.createMany({ data: names.map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, kycStatus: "approved" as const, phone: u === "p1" ? "+92 300 0000001" : null })) });
  const org = await prisma.organizerProfile.create({ data: { userId: "orgU", orgName: "Night Org", planCode: "organizer_pro", createdAt: new Date(Date.now() - 400 * 86400000) } });
  await prisma.organizerProfile.create({ data: { userId: "other", orgName: "Other Org", planCode: "organizer_pro" } });
  const prof = async (u: string) => prisma.playerProfile.create({ data: { userId: u, firstName: u, lastName: "Player", birthDate: new Date("2000-01-01"), planCode: "player_basic" } });
  const [pp1, pp2, pp3, ppOwner, ppMember] = await Promise.all([prof("p1"), prof("p2"), prof("p3"), prof("clubOwner"), prof("member")]);
  const game = await prisma.game.create({ data: { name: "Game A", isApproved: true } });
  const base = { gameId: game.id, mode: "solo", maxTeamSize: 1, maxTeams: 10, timezone: "Asia/Karachi", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], slotTimes: ["20:00"], startDate: today, endDate: addDays(today, 30) };
  const made = await createSeries("orgU", { ...base, name: "Paid Nights", entryType: "paid", entryFeeAmount: 5, entryFeeCurrency: "USD", paymentInstructions: "Send to Easypaisa 0300-0000000" });
  ok("setup: a paid series with sessions", !code(made));
  const series = await prisma.scrimSeries.findFirstOrThrow({ where: { name: "Paid Nights" } });
  const S = await prisma.tournament.findMany({ where: { seriesId: series.id }, orderBy: { startAt: "asc" } });
  ok("setup: about two weeks of sessions exist", S.length >= 13);
  const slug = series.slug;
  const ids = (...i: number[]) => i.map((x) => S[x].id);
  const pay = { paymentProofUrl: PROOF, paymentReference: "TXN-1001" };

  // ---- validation ----
  ok("book: no sessions", code(await createBooking("p1", slug, { sessionIds: [], ...pay })) === "validation_error");
  ok("book: too many sessions", code(await createBooking("p1", slug, { sessionIds: Array.from({ length: MAX_BOOKING_SESSIONS + 1 }, (_, i) => `x${i}`), ...pay })) === "validation_error");
  ok("book: unknown series", code(await createBooking("p1", "nope", { sessionIds: ids(0), ...pay })) === "not_found");
  ok("book: sessions that aren't part of this series", code(await createBooking("p1", slug, { sessionIds: ["nope"], ...pay })) === "invalid_sessions");
  ok("book: paid needs proof and a transaction id", code(await createBooking("p1", slug, { sessionIds: ids(0) })) === "payment_proof_required" && code(await createBooking("p1", slug, { sessionIds: ids(0), paymentProofUrl: PROOF })) === "payment_reference_required");
  ok("book: a player without a profile can't", code(await createBooking("stranger", slug, { sessionIds: ids(0), ...pay })) === "no_player_profile");
  ok("book: nothing was saved by the refused attempts", (await prisma.seriesBooking.count()) === 0 && (await prisma.registration.count()) === 0);

  // ---- a good booking ----
  const b1 = await createBooking("p1", slug, { sessionIds: ids(0, 1, 2), ...pay });
  ok("book: three sessions, one payment", !code(b1) && (b1 as { data: { sessions: number; total: number; currency: string } }).data.sessions === 3 && (b1 as { data: { total: number } }).data.total === 15);
  const bid1 = (b1 as { data: { bookingId: string } }).data.bookingId;
  const regs1 = await prisma.registration.findMany({ where: { bookingId: bid1 }, orderBy: { tournament: { startAt: "asc" } } });
  ok("book: every session has its own entry, waiting for approval, all sharing the one proof", regs1.length === 3 && regs1.every((r) => r.status === "pending" && r.paymentStatus === "unpaid" && r.paymentProofUrl === PROOF && r.paymentReference === "TXN-1001" && r.payerUserId === "p1" && r.playerId === pp1.id));
  ok("book: the booking records the fee and count", await prisma.seriesBooking.findUniqueOrThrow({ where: { id: bid1 } }).then((b) => b.status === "pending" && b.sessionCount === 3 && Number(b.feePerSession!.toString()) === 5 && b.currency === "USD"));
  ok("book: the organizer is told once", (await prisma.notification.count({ where: { userId: "orgU", type: "booking" } })) === 1);
  const pending = await listPendingBookingsForOrganizer("orgU");
  ok("organizer queue: shows the booking with its total, payer and a proof to open", pending.length === 1 && pending[0].total === 15 && pending[0].payer === "p1" && pending[0].proofRegistrationId !== null && pending[0].reference === "TXN-1001");
  ok("organizer queue: another organizer sees nothing", (await listPendingBookingsForOrganizer("other")).length === 0);

  // ---- all-or-nothing ----
  const before = await prisma.registration.count();
  const counts = async () => (await prisma.tournament.findMany({ where: { id: { in: ids(2, 3) } }, select: { registrationCount: true } })).map((t) => t.registrationCount).join();
  const countsBefore = await counts();
  const dup = await createBooking("p1", slug, { sessionIds: ids(3, 2), ...pay }); // session 2 is already p1's, and comes second
  ok("book: if any session fails the whole booking is refused, with the session named", code(dup) === "already_registered" && (dup as { message: string }).message.includes(S[2].name));
  ok("book: and nothing is left behind (no entries, no booking, counts unchanged)", (await prisma.registration.count()) === before && (await prisma.seriesBooking.count()) === 1 && (await counts()) === countsBefore);

  await prisma.tournament.update({ where: { id: S[6].id }, data: { maxTeams: 1 } });
  ok("book: a session with a free place can be booked", !code(await createBooking("p2", slug, { sessionIds: ids(6), paymentProofUrl: PROOF, paymentReference: "TXN-2001" })));
  const full = await createBooking("p3", slug, { sessionIds: ids(5, 6), paymentProofUrl: PROOF, paymentReference: "TXN-3001" });
  ok("book: a full session refuses the booking (never the waiting list) and the earlier session is rolled back", code(full) === "session_full" && (await prisma.registration.count({ where: { playerId: pp3.id } })) === 0 && (await prisma.seriesBooking.count({ where: { userId: "p3" } })) === 0);

  // ---- approve / reject a whole booking ----
  ok("approve: only the organizer of the series", code(await approveBooking("other", bid1)) === "forbidden" && code(await approveBooking("p1", bid1)) === "forbidden" && code(await approveBooking("orgU", "nope")) === "not_found");
  const ap = await approveBooking("orgU", bid1);
  const after = await prisma.registration.findMany({ where: { bookingId: bid1 } });
  ok("approve: all sessions are confirmed and marked paid at once", !code(ap) && (ap as { data: { approved: number } }).data.approved === 3 && after.every((r) => r.status === "approved" && r.paymentStatus === "paid" && r.approvedAt) && (await prisma.seriesBooking.findUniqueOrThrow({ where: { id: bid1 } })).status === "approved");
  ok("approve: the player gets ONE notification, not one per session", (await prisma.notification.count({ where: { userId: "p1", type: "booking" } })) === 1);
  ok("approve: a second approval is refused", code(await approveBooking("orgU", bid1)) === "invalid_status");
  const p2b = (await prisma.seriesBooking.findFirstOrThrow({ where: { userId: "p2" } })).id;
  const rj = await rejectBooking("orgU", p2b, "Payment not received");
  ok("reject: all sessions are rejected, the player is told why", !code(rj) && (await prisma.registration.count({ where: { bookingId: p2b, status: "rejected" } })) === 1 && (await prisma.notification.findFirst({ where: { userId: "p2", title: "Your booking wasn't approved" } }))?.body?.includes("Payment not received") === true);
  ok("my bookings: lists the sessions with their status", await listMyBookings("p1").then((l) => l.length === 1 && l[0].total === 15 && l[0].sessions.length === 3 && l[0].status === "approved"));

  // ---- a cancelled session ----
  ok("cancel: only the series' organizer, only real series sessions", code(await cancelSeriesSession("other", S[0].id)) === "forbidden" && code(await cancelSeriesSession("orgU", "nope")) === "not_a_series_session");
  const plain = await prisma.tournament.create({ data: { organizerId: org.id, gameId: game.id, name: "Plain", slug: "plain", type: "scrim", mode: "solo", maxTeamSize: 1, maxTeams: 4, format: "points_table", entryType: "free", status: "published" } });
  ok("cancel: a normal event isn't handled here", code(await cancelSeriesSession("orgU", plain.id)) === "not_a_series_session");
  const bPend = await createBooking("p3", slug, { sessionIds: ids(7), paymentProofUrl: PROOF, paymentReference: "TXN-3002" });
  ok("cancel: a payment still under review must be settled first", code(await cancelSeriesSession("orgU", S[7].id)) === "pending_payments" && !code(bPend));
  await approveBooking("orgU", (bPend as { data: { bookingId: string } }).data.bookingId);

  const c0 = await cancelSeriesSession("orgU", S[0].id, "Server problems");
  const r0 = await prisma.registration.findFirstOrThrow({ where: { tournamentId: S[0].id, playerId: pp1.id } });
  ok("cancel: the session is cancelled and the paid entry waits for the player's choice", !code(c0) && (c0 as { data: { needChoice: number } }).data.needChoice === 1 && (await prisma.tournament.findUniqueOrThrow({ where: { id: S[0].id } })).status === "cancelled" && r0.choiceStatus === "pending");
  ok("cancel: the player has about 48 hours to choose", r0.choiceDeadline !== null && Math.abs(r0.choiceDeadline.getTime() - (Date.now() + 48 * 3600000)) < 120000);
  ok("cancel: the player is told, with the reason and the deadline", await prisma.notification.findFirst({ where: { userId: "p1", title: "A session you paid for was cancelled" } }).then((n) => !!n && n.body!.includes("Server problems") && n.body!.includes("refund")));
  ok("cancel: cancelling twice is refused", code(await cancelSeriesSession("orgU", S[0].id)) === "invalid_status");
  const choices = await listMyChoices("p1");
  ok("choices: the player sees the pending choice, the fee and which session they'd move to", choices.length === 1 && choices[0].fee === 5 && choices[0].next?.name === S[3].name);

  // refund
  ok("choose: nobody else can decide for the player", code(await chooseForCancelled("stranger", r0.id, "refund")) === "forbidden" && code(await chooseForCancelled("p1", "nope", "refund")) === "not_found");
  ok("choose: an unknown option is refused", code(await chooseForCancelled("p1", r0.id, "keep")) === "validation_error");
  const rf = await chooseForCancelled("p1", r0.id, "refund");
  const t0 = await prisma.tournament.findUniqueOrThrow({ where: { id: S[0].id } });
  ok("refund: recorded, and the existing refund deadline starts for the organizer", !code(rf) && (await prisma.registration.findUniqueOrThrow({ where: { id: r0.id } })).choiceStatus === "refund" && t0.cancelRefundsDueAt !== null && t0.refundsConfirmedAt === null);
  ok("refund: the organizer is told how much and where to confirm", await prisma.notification.findFirst({ where: { userId: "orgU", title: "A player asked for a refund" } }).then((n) => !!n && /5/.test(n.body!)));
  const refunded0 = await prisma.registration.findUniqueOrThrow({ where: { id: r0.id } });
  ok("refund: the entry joins the usual refund workflow (withdrawn, refund owed)", refunded0.status === "withdrawn" && refunded0.refundStatus === "owed" && refunded0.withdrawnAt !== null && refunded0.withdrawReason === "The organizer cancelled this session");
  ok("refund: the organizer can mark it refunded with the usual button, and the player is told", "ok" in (await actOnRefund(r0.id, org.id, "refunded")) && (await prisma.registration.findUniqueOrThrow({ where: { id: r0.id } })).refundStatus === "refunded" && !!(await prisma.notification.findFirst({ where: { userId: "p1", type: "refund_refunded" } })));
  ok("refund: marking the last refund sent settles the session by itself (no second confirm step)", (await prisma.tournament.findUniqueOrThrow({ where: { id: S[0].id } })).refundsConfirmedAt !== null);
  ok("refund: deciding twice is refused", code(await chooseForCancelled("p1", r0.id, "next")) === "already_chosen");
  const owed = await listRefundsOwed("orgU", S[0].id);
  ok("refund list: who to pay back, how much, which transaction, how to reach them", !!owed && owed.items.length === 1 && owed.items[0].amount === 5 && owed.items[0].reference === "TXN-1001" && owed.items[0].payer === "p1" && owed.items[0].email === "p1@x.com" && owed.items[0].phone === "+92 300 0000001" && owed.waiting === 0);
  ok("refund list: only the organizer of that session", (await listRefundsOwed("other", S[0].id)) === null);
  ok("refund: the organizer can confirm once nobody is still choosing", !code(await confirmRefunds(org.id, S[0].id)) && (await prisma.tournament.findUniqueOrThrow({ where: { id: S[0].id } })).refundsConfirmedAt !== null);

  // carry over
  await cancelSeriesSession("orgU", S[1].id);
  const r1 = await prisma.registration.findFirstOrThrow({ where: { tournamentId: S[1].id, playerId: pp1.id } });
  const mv = await chooseForCancelled("p1", r1.id, "next");
  const moved = await prisma.registration.findFirst({ where: { carriedFromId: r1.id } });
  ok("carry over: p1 is moved to the next session they aren't already in (session 3; 2 is theirs)", !code(mv) && moved?.tournamentId === S[3].id);
  ok("carry over: the new entry is confirmed and paid, in the same booking, with the same payment", moved?.status === "approved" && moved.paymentStatus === "paid" && moved.bookingId === bid1 && moved.paymentReference === "TXN-1001" && moved.payerUserId === "p1");
  ok("carry over: the old entry is marked moved and the player is told", (await prisma.registration.findUniqueOrThrow({ where: { id: r1.id } })).choiceStatus === "moved" && !!(await prisma.notification.findFirst({ where: { userId: "p1", title: "You were moved to the next session" } })));
  ok("carry over: deciding again is refused", code(await chooseForCancelled("p1", r1.id, "refund")) === "already_chosen");
  ok("carry over: no refund tracking was started for that session", (await prisma.tournament.findUniqueOrThrow({ where: { id: S[1].id } })).cancelRefundsDueAt === null);
  ok("my bookings: the moved entry shows as carried over", await listMyBookings("p1").then((l) => l[0].sessions.some((s) => s.carriedOver && s.slug === S[3].slug)));

  // a double click must not move the player twice
  await cancelSeriesSession("orgU", S[7].id);
  const r7 = await prisma.registration.findFirstOrThrow({ where: { tournamentId: S[7].id, playerId: pp3.id } });
  const both = await Promise.all([chooseForCancelled("p3", r7.id, "next"), chooseForCancelled("p3", r7.id, "next")]);
  ok("double click: only one of two simultaneous choices goes through", both.filter((r) => !code(r)).length === 1 && both.filter((r) => code(r) === "already_chosen").length === 1 && (await prisma.registration.count({ where: { carriedFromId: r7.id } })) === 1);
  ok("a failed move leaves the choice open (nothing was lost)", await (async () => { const rr = await prisma.registration.findFirstOrThrow({ where: { tournamentId: S[7].id, playerId: pp3.id } }); return rr.choiceStatus === "moved"; })());

  // the deadline: moved by default; refund when there is no later session
  await cancelSeriesSession("orgU", S[2].id);
  const r2 = await prisma.registration.findFirstOrThrow({ where: { tournamentId: S[2].id, playerId: pp1.id } });
  ok("deadline: a choice that is not due yet is left alone", (await processExpiredChoices()).checked === 0);
  await prisma.registration.update({ where: { id: r2.id }, data: { choiceDeadline: new Date(Date.now() - 1000) } });
  const job = await processExpiredChoices();
  const m2 = await prisma.registration.findFirst({ where: { carriedFromId: r2.id } });
  ok("deadline: nobody chose, so the player is moved to the next session (session 4)", job.moved === 1 && m2?.tournamentId === S[4].id && (await prisma.registration.findUniqueOrThrow({ where: { id: r2.id } })).choiceStatus === "moved");

  await cancelSeriesSession("orgU", S[3].id); // the session p1 was just moved into
  const r3 = await prisma.registration.findFirstOrThrow({ where: { tournamentId: S[3].id, playerId: pp1.id, choiceStatus: "pending" } });
  await prisma.tournament.updateMany({ where: { seriesId: series.id, startAt: { gt: S[3].startAt! }, status: { in: ["published", "registration_open"] } }, data: { status: "cancelled" } });
  ok("no later session: moving isn't possible and the player is told so", code(await chooseForCancelled("p1", r3.id, "next")) === "no_next_session" && (await listMyChoices("p1")).find((c) => c.registrationId === r3.id)?.next === null);
  await prisma.registration.update({ where: { id: r3.id }, data: { choiceDeadline: new Date(Date.now() - 1000) } });
  const job2 = await processExpiredChoices();
  const t3 = await prisma.tournament.findUniqueOrThrow({ where: { id: S[3].id } });
  ok("deadline: with no later session the entry becomes a refund and the refund deadline starts", job2.refunds === 1 && (await prisma.registration.findUniqueOrThrow({ where: { id: r3.id } })).choiceStatus === "refund" && t3.cancelRefundsDueAt !== null);
  ok("deadline: the organizer is told it was automatic", await prisma.notification.findFirst({ where: { userId: "orgU", body: { contains: "no later session was available" } } }).then((n) => !!n));

  // confirming refunds is held while a player is still choosing
  await prisma.registration.updateMany({ where: { tournamentId: S[3].id, id: { not: r3.id } }, data: {} });
  const extra = await prisma.registration.create({ data: { tournamentId: S[3].id, playerId: pp2.id, status: "approved", paymentStatus: "paid", payerUserId: "p2", choiceStatus: "pending", choiceDeadline: new Date(Date.now() + 3600000) } });
  await prisma.tournament.update({ where: { id: S[3].id }, data: { refundsConfirmedAt: null } });
  ok("confirm refunds: refused while a player is still choosing", code(await confirmRefunds(org.id, S[3].id)) === "waiting_for_players");
  await prisma.registration.delete({ where: { id: extra.id } });
  ok("confirm refunds: allowed once everyone has chosen", !code(await confirmRefunds(org.id, S[3].id)));

  // free sessions: nothing is owed, nobody is asked to choose
  const freeMade = await createSeries("orgU", { ...base, name: "Free Nights", entryType: "free" });
  const free = await prisma.scrimSeries.findFirstOrThrow({ where: { name: "Free Nights" } });
  const F = await prisma.tournament.findMany({ where: { seriesId: free.id }, orderBy: { startAt: "asc" } });
  const fb = await createBooking("p2", free.slug, { sessionIds: [F[0].id, F[1].id] });
  ok("free: booking needs no payment", !code(freeMade) && !code(fb) && (await prisma.registration.count({ where: { tournamentId: F[0].id, paymentStatus: "waived" } })) === 1);
  await approveBooking("orgU", (fb as { data: { bookingId: string } }).data.bookingId);
  const fc = await cancelSeriesSession("orgU", F[0].id);
  ok("free: cancelling asks nobody to choose", !code(fc) && (fc as { data: { needChoice: number } }).data.needChoice === 0 && (await prisma.registration.count({ where: { tournamentId: F[0].id, choiceStatus: { not: null } } })) === 0);

  // ---- a club's team books for the whole month ----
  const club = await prisma.clubProfile.create({ data: { userId: "clubOwner", clubName: "Night Club", subscriptionPlanCode: "club_pro" } });
  const team = await prisma.clubTeam.create({ data: { clubId: club.id, gameId: game.id, name: "Night Team" } });
  await prisma.clubRoster.create({ data: { clubId: club.id, playerId: ppOwner.id, gameId: game.id, teamId: team.id, isCaptain: true } });
  await prisma.clubRoster.create({ data: { clubId: club.id, playerId: ppMember.id, gameId: game.id, teamId: team.id } });
  await createSeries("orgU", { ...base, name: "Squad Nights", mode: "squad", maxTeamSize: 4, entryType: "free" });
  const sq = await prisma.scrimSeries.findFirstOrThrow({ where: { name: "Squad Nights" } });
  const Q = await prisma.tournament.findMany({ where: { seriesId: sq.id }, orderBy: { startAt: "asc" } });
  ok("team: a single player can't book a team series", code(await createBooking("p1", sq.slug, { sessionIds: [Q[0].id] })) === "team_required");
  ok("team: someone outside the club can't book for its team", code(await createBooking("stranger", sq.slug, { sessionIds: [Q[0].id], teamId: team.id, memberPlayerIds: [ppOwner.id] })) === "not_authorized");
  await prisma.notification.deleteMany({ where: { userId: "clubOwner" } });
  const tb = await createBooking("member", sq.slug, { sessionIds: [Q[0].id, Q[1].id, Q[2].id], teamId: team.id, memberPlayerIds: [ppOwner.id, ppMember.id] });
  ok("team: any club member books the team for several sessions", !code(tb) && (tb as { data: { sessions: number } }).data.sessions === 3);
  const te = await prisma.teamEntry.findMany({ where: { tournamentId: { in: [Q[0].id, Q[1].id, Q[2].id] } }, include: { members: true } });
  ok("team: each session has the club's team entry with both players", te.length === 3 && te.every((e) => e.clubTeamId === team.id && e.clubId === club.id && e.members.length === 2));
  ok("team: the club owner is told ONCE, not once per session", (await prisma.notification.count({ where: { userId: "clubOwner", type: "club" } })) === 1);
  ok("team: the booking records the team", (await prisma.seriesBooking.findFirstOrThrow({ where: { seriesId: sq.id } })).clubTeamId === team.id);
  const tfail = await createBooking("clubOwner", sq.slug, { sessionIds: [Q[3].id, Q[1].id], teamId: team.id, memberPlayerIds: [ppOwner.id] });
  ok("team: rolling back a failed team booking also removes its team entries", !!code(tfail) && (await prisma.teamEntry.count({ where: { tournamentId: Q[3].id } })) === 0 && (await prisma.teamMember.count({ where: { teamEntry: { tournamentId: Q[3].id } } })) === 0);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
