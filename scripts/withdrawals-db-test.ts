// Withdrawals and refunds against a real database.
import { prisma } from "../lib/prisma";
import { registerForTournament } from "../lib/services/tournaments";
import { createRooms, refreshSeats } from "../lib/services/rooms";
import { actOnRefund, closeUnsoldResales, listRefunds, withdrawEntry } from "../lib/services/withdrawals";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const HOUR = 3_600_000;
let counter = 0;

async function main() {
  await prisma.user.create({ data: { id: "org", email: "org@x.com", displayName: "Org", kycStatus: "approved" } });
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "OrgCo", limitsLifted: true } });
  const game = (await prisma.game.findUnique({ where: { name: "Tekken 8" } }))!;
  const other = await prisma.user.create({ data: { id: "other", email: "o@x.com", displayName: "Other" } });
  void other;

  async function player() {
    const k = ++counter;
    await prisma.user.create({ data: { id: `u${k}`, email: `u${k}@x.com`, displayName: `Player ${k}` } });
    const p = await prisma.playerProfile.create({ data: { userId: `u${k}`, birthDate: new Date("2000-01-01") } });
    return { playerId: p.id, userId: `u${k}` };
  }
  async function tournament(name: string, o: { maxTeams: number; policy: "organizer_decides" | "no_refund" | "full_before_cutoff" | "if_resold"; paid?: boolean; startInHours?: number; cutoff?: number }) {
    return prisma.tournament.create({
      data: {
        slug: name.toLowerCase().replace(/\W+/g, "-"), name, organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo",
        maxTeams: o.maxTeams, format: "single_elimination", entryType: o.paid === false ? "free" : "paid", status: "registration_open",
        startAt: new Date(Date.now() + (o.startInHours ?? 72) * HOUR), refundPolicy: o.policy, refundCutoffHours: o.cutoff ?? 24,
        ...(o.paid === false ? {} : { entryFeeAmount: 500, entryFeeCurrency: "PKR" }),
      },
    });
  }
  const proof = { paymentProofUrl: "https://example.com/proof.png", paymentReference: "TXN123456" };
  const joinPaid = async (tid: string) => { const p = await player(); const r = await registerForTournament({ tournamentId: tid, playerId: p.playerId, ...proof } as never); return { ...p, reg: (r as { data: { id: string } }).data }; };
  const get = (id: string) => prisma.registration.findUnique({ where: { id } });

  // ---- no refund
  const tNo = await tournament("No refund", { maxTeams: 4, policy: "no_refund" });
  const a = await joinPaid(tNo.id);
  const wa = await withdrawEntry(a.reg.id, a.userId, "changed my mind");
  ok("withdraw works", "ok" in wa && wa.hadSeat);
  const ra = await get(a.reg.id);
  ok("no_refund: status withdrawn, refund declined, reason saved", ra?.status === "withdrawn" && ra.refundStatus === "declined" && ra.withdrawReason === "changed my mind" && ra.withdrawnAt !== null);
  ok("the seat is free again", (await prisma.registration.count({ where: { tournamentId: tNo.id, status: { in: ["pending", "approved"] } } })) === 0);
  ok("withdrawing twice is refused", ("error" in (await withdrawEntry(a.reg.id, a.userId)) && (await withdrawEntry(a.reg.id, a.userId) as { error: string }).error === "not_active"));
  const b = await joinPaid(tNo.id);
  ok("someone else can't withdraw your entry", (await withdrawEntry(b.reg.id, "other") as { error: string }).error === "forbidden");
  ok("an unknown entry is not found", (await withdrawEntry("nope", b.userId) as { error: string }).error === "not_found");
  ok("the organizer was told", !!(await prisma.notification.findFirst({ where: { userId: "org", type: "entry_withdrawn" } })));
  ok("the player got a confirmation with the reason", (await prisma.notification.findFirst({ where: { userId: a.userId, type: "withdrawal_confirmed" } }))?.body?.includes("doesn't refund") === true);

  // ---- full refund before a cut-off
  const tCut = await tournament("Cutoff", { maxTeams: 4, policy: "full_before_cutoff", cutoff: 24, startInHours: 72 });
  const c = await joinPaid(tCut.id);
  await withdrawEntry(c.reg.id, c.userId);
  ok("cut-off: 72h before a 24h cut-off -> refund owed", (await get(c.reg.id))?.refundStatus === "owed");
  const tLate = await tournament("Cutoff late", { maxTeams: 4, policy: "full_before_cutoff", cutoff: 24, startInHours: 5 });
  const d = await joinPaid(tLate.id);
  await withdrawEntry(d.reg.id, d.userId);
  ok("cut-off: 5h before a 24h cut-off -> declined", (await get(d.reg.id))?.refundStatus === "declined");

  // ---- organizer decides
  const tDec = await tournament("Decides", { maxTeams: 4, policy: "organizer_decides" });
  const e = await joinPaid(tDec.id);
  await withdrawEntry(e.reg.id, e.userId);
  ok("organizer_decides: refund requested", (await get(e.reg.id))?.refundStatus === "requested");
  const list = await listRefunds(tDec.id, org.id);
  ok("the organizer sees it, with amount, reference and who paid", "rows" in list && list.rows.length === 1 && list.rows[0].amount.includes("500") && list.rows[0].paymentReference !== null && list.rows[0].payerName === e.userId.replace("u", "Player "));
  ok("someone else can't see the refunds", (await listRefunds(tDec.id, "not-the-organizer") as { error: string }).error === "forbidden");
  ok("only the organizer can act on it", (await actOnRefund(e.reg.id, "not-the-organizer", "owe") as { error: string }).error === "forbidden");
  ok("can't mark refunded before it is owed", (await actOnRefund(e.reg.id, org.id, "refunded") as { error: string }).error === "not_allowed");
  ok("organizer approves the refund", (await actOnRefund(e.reg.id, org.id, "owe") as { status: string }).status === "owed");
  ok("the player was told", !!(await prisma.notification.findFirst({ where: { userId: e.userId, type: "refund_owed" } })));
  ok("organizer marks it sent", (await actOnRefund(e.reg.id, org.id, "refunded") as { status: string }).status === "refunded" && (await get(e.reg.id))?.refundedAt !== null);
  ok("a refunded entry is final", (await actOnRefund(e.reg.id, org.id, "decline") as { error: string }).error === "not_allowed");
  const f = await joinPaid(tDec.id);
  await withdrawEntry(f.reg.id, f.userId);
  ok("organizer can decline", (await actOnRefund(f.reg.id, org.id, "decline") as { status: string }).status === "declined");
  ok("…and change their mind", (await actOnRefund(f.reg.id, org.id, "owe") as { status: string }).status === "owed");

  // ---- refund only if the seat is resold
  const tRes = await tournament("Resale", { maxTeams: 1, policy: "if_resold" });
  const g1 = await joinPaid(tRes.id);
  const waiter = await player();
  await registerForTournament({ tournamentId: tRes.id, playerId: waiter.playerId } as never); // joins the queue, pays nothing
  const w1 = await withdrawEntry(g1.reg.id, g1.userId);
  ok("resale: the waiting team took the seat, so the refund is owed straight away", "ok" in w1 && w1.refund.status === "owed" && (await get(g1.reg.id))?.refundStatus === "owed");
  ok("the waiting team now holds the seat", (await prisma.registration.count({ where: { tournamentId: tRes.id, playerId: waiter.playerId, status: "pending" } })) === 1);
  ok("the player's reason says another team took the seat", "ok" in w1 && w1.refund.reason.includes("took your seat"));

  const tRes2 = await tournament("Resale 2", { maxTeams: 2, policy: "if_resold", startInHours: 6 });
  const h1 = await joinPaid(tRes2.id);
  const h2 = await joinPaid(tRes2.id);
  const wh = await withdrawEntry(h1.reg.id, h1.userId);
  ok("resale: nobody waiting -> refund waits", "ok" in wh && wh.refund.status === "waiting_resale" && (await get(h1.reg.id))?.refundStatus === "waiting_resale");
  const late = await player();
  await registerForTournament({ tournamentId: tRes2.id, playerId: late.playerId, ...proof } as never); // takes the free seat directly
  ok("a newcomer taking the open seat directly doesn't settle it (not from the waiting list)", (await get(h1.reg.id))?.refundStatus === "waiting_resale");
  void h2;
  // the room starts without a resale: declined
  await prisma.tournament.update({ where: { id: tRes2.id }, data: { startAt: new Date(Date.now() - HOUR) } });
  ok("closing unsold resales declines them once the room has started", (await closeUnsoldResales(tRes2.id)) === 1 && (await get(h1.reg.id))?.refundStatus === "declined");

  // ---- a team on the waiting list that already sent proof is refunded in full
  const tQ = await tournament("Queue paid", { maxTeams: 1, policy: "no_refund" });
  await joinPaid(tQ.id);
  const q = await player();
  const qr = await registerForTournament({ tournamentId: tQ.id, playerId: q.playerId, ...proof } as never); // full -> queue, but already paid
  const qid = (qr as { data: { id: string } }).data.id;
  ok("joined the queue", (await get(qid))?.status === "waitlisted");
  const wq = await withdrawEntry(qid, q.userId);
  ok("left the queue after paying: refunded in full whatever the policy", "ok" in wq && !wq.hadSeat && (await get(qid))?.refundStatus === "owed");

  // ---- free events: nothing to refund
  const tFree = await tournament("Free", { maxTeams: 4, policy: "no_refund", paid: false });
  const fp = await player();
  const fr = await registerForTournament({ tournamentId: tFree.id, playerId: fp.playerId } as never);
  const wf = await withdrawEntry((fr as { data: { id: string } }).data.id, fp.userId);
  ok("free event: withdraw is fine, nothing to refund", "ok" in wf && wf.refund.status === "not_applicable");
  ok("…and a free withdrawal doesn't show in the refunds list", ((await listRefunds(tFree.id, org.id)) as { rows: unknown[] }).rows.length === 0);

  // ---- a team that never paid
  const tUn = await tournament("Never paid", { maxTeams: 1, policy: "organizer_decides" });
  await joinPaid(tUn.id);
  const nq = await player();
  await registerForTournament({ tournamentId: tUn.id, playerId: nq.playerId } as never); // queue, no money
  await prisma.registration.updateMany({ where: { tournamentId: tUn.id, status: "pending" }, data: { status: "rejected" } });
  await refreshSeats(tUn.id); // promoted, owes payment
  const promoted = await prisma.registration.findFirst({ where: { tournamentId: tUn.id, playerId: nq.playerId } });
  const wn = await withdrawEntry(promoted!.id, nq.userId);
  ok("never sent money: nothing to refund", "ok" in wn && wn.refund.status === "not_applicable");

  // ---- too late
  const tStart = await tournament("Started", { maxTeams: 4, policy: "organizer_decides", startInHours: -1 });
  const sp = await player();
  const sr = await prisma.registration.create({ data: { tournamentId: tStart.id, playerId: sp.playerId, status: "approved", paymentStatus: "paid", paymentProofUrl: proof.paymentProofUrl, payerUserId: sp.userId } });
  ok("after the start time: too late", (await withdrawEntry(sr.id, sp.userId) as { error: string }).error === "started");
  const tClosed = await tournament("In progress", { maxTeams: 4, policy: "organizer_decides" });
  await prisma.tournament.update({ where: { id: tClosed.id }, data: { status: "in_progress" } });
  const cp = await player();
  const cr = await prisma.registration.create({ data: { tournamentId: tClosed.id, playerId: cp.playerId, status: "approved", payerUserId: cp.userId } });
  ok("tournament in progress: closed", (await withdrawEntry(cr.id, cp.userId) as { error: string }).error === "closed");

  // ---- rooms: the room's own start time governs the cut-off
  const tRoom = await tournament("Rooms cutoff", { maxTeams: 1, policy: "full_before_cutoff", cutoff: 24, startInHours: 100 });
  await createRooms(tRoom.id, org.id, { count: 2, capacity: 1, firstStartAt: new Date(Date.now() + 10 * HOUR), everyMinutes: 24 * 60 });
  const rooms = await prisma.tournamentRoom.findMany({ where: { tournamentId: tRoom.id }, orderBy: { number: "asc" } });
  const r1 = await player(), r2 = await player();
  await registerForTournament({ tournamentId: tRoom.id, playerId: r1.playerId, roomId: rooms[0].id, ...proof } as never);
  await registerForTournament({ tournamentId: tRoom.id, playerId: r2.playerId, roomId: rooms[1].id, ...proof } as never);
  const reg1 = await prisma.registration.findFirst({ where: { tournamentId: tRoom.id, playerId: r1.playerId } });
  const reg2 = await prisma.registration.findFirst({ where: { tournamentId: tRoom.id, playerId: r2.playerId } });
  await withdrawEntry(reg1!.id, r1.userId);
  await withdrawEntry(reg2!.id, r2.userId);
  ok("Room 1 starts in 10h: inside the 24h cut-off -> no refund", (await get(reg1!.id))?.refundStatus === "declined");
  ok("Room 2 starts in 34h: outside the cut-off -> refund owed", (await get(reg2!.id))?.refundStatus === "owed");
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
