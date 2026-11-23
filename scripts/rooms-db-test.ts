// Rooms, safe seat counting and the waiting list, against a real database.
// Needs a Postgres with all migrations applied (see phase8-1-test.ts for how to run).
import { prisma } from "../lib/prisma";
import { approveRegistration, manualAddRegistration, registerForTournament, rejectRegistration, updateTournament } from "../lib/services/tournaments";
import { submitSeatPayment } from "../lib/services/seat-payments";
import { createRooms, deleteRoom, getEntryPlacement, getSeatSummary, moveEntryToRoom, refreshSeats, updateRoom } from "../lib/services/rooms";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);

const HOUR = 3_600_000;
const kind = (r: unknown) => (r as { placement?: { kind: string } }).placement?.kind;
let counter = 0;

async function main() {
  await prisma.user.create({ data: { id: "org", email: "org@x.com", displayName: "Org", kycStatus: "approved" } });
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "OrgCo", limitsLifted: true } });
  const game = (await prisma.game.findUnique({ where: { name: "PUBG Mobile" } }))!; // the migrations add the catalog games
  ok("PUBG Mobile is loaded from the migration", Boolean(game));
  const start = new Date(Date.now() + 48 * HOUR);

  async function players(n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const k = ++counter;
      await prisma.user.create({ data: { id: `u${k}`, email: `u${k}@x.com`, displayName: `Player ${k}` } });
      const p = await prisma.playerProfile.create({ data: { userId: `u${k}`, birthDate: new Date("2000-01-01") } });
      ids.push(p.id);
    }
    return ids;
  }
  async function tournament(name: string, o: { maxTeams: number; entryType?: "free" | "paid"; waitlistEnabled?: boolean; payWindowMinutes?: number }) {
    return prisma.tournament.create({
      data: {
        slug: name.toLowerCase().replace(/\W+/g, "-"), name, organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo",
        maxTeams: o.maxTeams, format: "single_elimination", entryType: o.entryType ?? "free", status: "registration_open", startAt: start,
        waitlistEnabled: o.waitlistEnabled ?? true, payWindowMinutes: o.payWindowMinutes ?? 60,
        ...(o.entryType === "paid" ? { entryFeeAmount: 500, entryFeeCurrency: "PKR" } : {}),
      },
    });
  }
  const join = (tournamentId: string, playerId: string, extra: Record<string, unknown> = {}) =>
    registerForTournament({ tournamentId, playerId, ...extra } as Parameters<typeof registerForTournament>[0]);
  const count = (tournamentId: string, status: string) => prisma.registration.count({ where: { tournamentId, status: status as never } });
  const seated = (tournamentId: string) => prisma.registration.count({ where: { tournamentId, status: { in: ["pending", "approved"] } } });

  // ---------------------------------------------------------------------------------------------
  // 1. 30 teams hit a 25-seat room at the same instant: exactly 25 get in, 5 queue
  // ---------------------------------------------------------------------------------------------
  const t1 = await tournament("Room 10:30", { maxTeams: 25 });
  const p30 = await players(30);
  const results = await Promise.all(p30.map((pid) => join(t1.id, pid)));
  ok("30 simultaneous joins: no errors", results.every((r) => !err(r)));
  ok("exactly 25 hold a seat (never overfilled)", (await seated(t1.id)) === 25);
  ok("the other 5 are on the waiting list", (await count(t1.id, "waitlisted")) === 5);
  ok("the placement says seat or waitlist", results.filter((r) => kind(r) === "seat").length === 25 && results.filter((r) => kind(r) === "waitlist").length === 5);
  const queued = await prisma.registration.findMany({ where: { tournamentId: t1.id, status: "waitlisted" }, orderBy: { waitlistedAt: "asc" } });
  const positions = await Promise.all(queued.map((q) => getEntryPlacement(q.id)));
  ok("queue positions are 1..5, each once", positions.map((p) => p?.position).sort().join() === "1,2,3,4,5");
  ok("a waitlisted entry holds no seat and no room", queued.every((q) => q.roomId === null));
  const sum1 = await getSeatSummary(t1.id);
  ok("summary: 25 of 25 taken, 5 waiting, none left", sum1?.taken === 25 && sum1.totalSeats === 25 && sum1.waiting === 5 && sum1.seatsLeft === 0);

  // a waitlisted team can't join twice
  const dup = await join(t1.id, queued[0].playerId!);
  ok("already waitlisted -> can't join again", err(dup) === "already_registered");

  // 2. a seat frees (organizer rejects one): the FIRST in line is promoted, and told
  const holder = await prisma.registration.findFirst({ where: { tournamentId: t1.id, status: "pending" } });
  ok("reject frees the seat", !err(await rejectRegistration(holder!.id, org.id)));
  ok("still 25 seated (the queue filled the seat)", (await seated(t1.id)) === 25);
  ok("queue is down to 4", (await count(t1.id, "waitlisted")) === 4);
  const first = await prisma.registration.findUnique({ where: { id: queued[0].id } });
  ok("the first in line was promoted", first?.status === "pending" && first.promotedAt !== null);
  const note = await prisma.notification.findFirst({ where: { type: "seat_opened" }, orderBy: { createdAt: "desc" } });
  ok("and was notified", note?.title.includes("A seat opened") === true);

  // 3. a newcomer can't jump the queue even when a seat is open for a moment
  const [late] = await players(1);
  const lateRes = await join(t1.id, late);
  ok("a newcomer to a full room joins the back of the queue", kind(lateRes) === "waitlist");
  const latePos = await getEntryPlacement((lateRes as { data: { id: string } }).data.id);
  ok("…at position 5", latePos?.position === 5);

  // ---------------------------------------------------------------------------------------------
  // 4. the organizer's own limit: 20
  // ---------------------------------------------------------------------------------------------
  const t2 = await tournament("Limit 20", { maxTeams: 20 });
  const p22 = await players(22);
  await Promise.all(p22.map((pid) => join(t2.id, pid)));
  ok("organizer limit 20: 20 seated", (await seated(t2.id)) === 20);
  ok("organizer limit 20: 2 waiting", (await count(t2.id, "waitlisted")) === 2);

  // waiting list switched off: turned away
  const t3 = await tournament("No queue", { maxTeams: 2, waitlistEnabled: false });
  const p3 = await players(3);
  const r3 = [await join(t3.id, p3[0]), await join(t3.id, p3[1]), await join(t3.id, p3[2])];
  ok("waiting list off: the third is told it's full", err(r3[2]) === "full" && (await count(t3.id, "waitlisted")) === 0);

  // ---------------------------------------------------------------------------------------------
  // 5. rooms: 3 rooms x 2 seats, 30 minutes apart; teams that ask for Room 1 spill to the nearest
  // ---------------------------------------------------------------------------------------------
  const t4 = await tournament("Many rooms", { maxTeams: 1 });
  const made = await createRooms(t4.id, org.id, { count: 3, capacity: 2, firstStartAt: new Date(start.getTime()), everyMinutes: 30 });
  ok("3 rooms created", !err(made) && (await prisma.tournamentRoom.count({ where: { tournamentId: t4.id } })) === 3);
  ok("maxTeams became the total of the rooms (6)", (await prisma.tournament.findUnique({ where: { id: t4.id } }))!.maxTeams === 6);
  const rooms = await prisma.tournamentRoom.findMany({ where: { tournamentId: t4.id }, orderBy: { number: "asc" } });
  const p8 = await players(8);
  for (const pid of p8) await join(t4.id, pid, { roomId: rooms[0].id }); // everyone wants Room 1
  const perRoom = await Promise.all(rooms.map((r) => prisma.registration.count({ where: { roomId: r.id, status: { in: ["pending", "approved"] } } })));
  ok("no room is over its 2 seats", perRoom.every((n) => n <= 2));
  ok("rooms 1, 2, 3 each took 2 (nearest first)", perRoom.join() === "2,2,2");
  ok("the last 2 of 8 are waiting", (await count(t4.id, "waitlisted")) === 2);
  const sum4 = await getSeatSummary(t4.id);
  ok("summary lists the rooms in time order with their seats", sum4?.hasRooms === true && sum4.rooms.map((r) => `${r.label}:${r.taken}/${r.capacity}`).join() === "Room 1:2/2,Room 2:2/2,Room 3:2/2");

  // a room that is far away is only used when nearer ones are full
  const t5 = await tournament("Nearest", { maxTeams: 1 });
  await createRooms(t5.id, org.id, { count: 1, capacity: 1, firstStartAt: start, everyMinutes: 0 });
  await createRooms(t5.id, org.id, { count: 1, capacity: 1, firstStartAt: new Date(start.getTime() + 30 * 60_000), everyMinutes: 0 });
  await createRooms(t5.id, org.id, { count: 1, capacity: 1, firstStartAt: new Date(start.getTime() + 5 * HOUR), everyMinutes: 0 });
  const r5 = await prisma.tournamentRoom.findMany({ where: { tournamentId: t5.id }, orderBy: { number: "asc" } });
  const q = await players(3);
  await join(t5.id, q[0], { roomId: r5[0].id });
  const second = await join(t5.id, q[1], { roomId: r5[0].id });
  const secondReg = await prisma.registration.findUnique({ where: { id: (second as { data: { id: string } }).data.id } });
  ok("Room 1 full -> the second team lands in Room 2 (30 min later), not Room 3 (5 h later)", secondReg?.roomId === r5[1].id);

  // growing a room moves the queue
  const upd = await updateRoom(rooms[0].id, org.id, { capacity: 4 });
  ok("a bigger room is accepted", !err(upd));
  ok("the 2 waiting teams took the 2 new seats", (await count(t4.id, "waitlisted")) === 0 && (await seated(t4.id)) === 8);
  ok("maxTeams followed (8)", (await prisma.tournament.findUnique({ where: { id: t4.id } }))!.maxTeams === 8);
  ok("a room can't shrink below the entries it has", err(await updateRoom(rooms[0].id, org.id, { capacity: 3 })) === "capacity_below_taken");
  ok("an empty room can be deleted only when it has no entries", err(await deleteRoom(rooms[1].id, org.id)) === "has_entries");
  ok("someone else's organizer can't edit it", err(await updateRoom(rooms[0].id, "not-the-organizer", { capacity: 9 })) === "forbidden");

  // seat settings on an existing tournament
  ok("with rooms, changing the total seats directly is refused", (await updateTournament(t4.id, org.id, { maxTeams: 99 }) as { error?: string }).error === "capacity_by_rooms");
  ok("resending the current total is fine", !(await updateTournament(t4.id, org.id, { maxTeams: 8 }) as { error?: string }).error);
  ok("refund policy can't change once teams have entered", (await updateTournament(t4.id, org.id, { refundPolicy: "no_refund" }) as { error?: string }).error === "refund_locked");
  ok("…resending the same policy is fine", !(await updateTournament(t4.id, org.id, { refundPolicy: "organizer_decides" }) as { error?: string }).error);
  const tEmpty = await tournament("Policy free", { maxTeams: 4 });
  ok("refund policy can change while nobody has entered", !(await updateTournament(tEmpty.id, org.id, { refundPolicy: "full_before_cutoff", refundCutoffHours: 12 }) as { error?: string }).error
    && (await prisma.tournament.findUnique({ where: { id: tEmpty.id } }))?.refundPolicy === "full_before_cutoff");
  ok("waiting list and payment window can change any time", !(await updateTournament(t4.id, org.id, { waitlistEnabled: false, payWindowMinutes: 20 }) as { error?: string }).error
    && (await prisma.tournament.findUnique({ where: { id: t4.id } }))?.payWindowMinutes === 20);
  await prisma.tournament.update({ where: { id: t4.id }, data: { waitlistEnabled: true } });

  // more seats in a plain tournament let the queue in
  const tGrow = await tournament("Grow", { maxTeams: 1 });
  const gp = await players(3);
  for (const pid of gp) await join(tGrow.id, pid);
  ok("grow: 1 seated, 2 waiting", (await seated(tGrow.id)) === 1 && (await count(tGrow.id, "waitlisted")) === 2);
  await updateTournament(tGrow.id, org.id, { maxTeams: 3 });
  ok("raising the limit to 3 seats both waiting teams", (await seated(tGrow.id)) === 3 && (await count(tGrow.id, "waitlisted")) === 0);

  // moving an entry
  const inRoom1 = await prisma.registration.findFirst({ where: { roomId: rooms[0].id, status: "pending" } });
  ok("moving into a full room is refused", err(await moveEntryToRoom(inRoom1!.id, org.id, rooms[1].id)) === "room_full");
  ok("moving to a room with a seat works", !err(await moveEntryToRoom(inRoom1!.id, org.id, rooms[0].id)));

  // organizer approvals can't smuggle a queueing or withdrawn team into a seat
  const tAp = await tournament("Approvals", { maxTeams: 1 });
  const [ap1, ap2] = await players(2);
  await join(tAp.id, ap1);
  const apQ = await join(tAp.id, ap2);
  const apQid = (apQ as { data: { id: string } }).data.id;
  ok("approving a team that is still queueing is refused", (await approveRegistration(apQid, org.id) as { error?: string }).error === "waitlisted");
  ok("…and it stays on the waiting list with no seat", (await prisma.registration.findUnique({ where: { id: apQid } }))?.status === "waitlisted");
  await prisma.registration.update({ where: { id: apQid }, data: { status: "withdrawn" } });
  ok("approving a withdrawn team is refused", (await approveRegistration(apQid, org.id) as { error?: string }).error === "withdrawn");
  ok("rejecting a withdrawn team is refused (keeps its refund record)", (await rejectRegistration(apQid, org.id) as { error?: string }).error === "withdrawn");

  // an organizer adding someone by hand lands in a room with a seat
  const tMan = await tournament("Manual", { maxTeams: 1 });
  await createRooms(tMan.id, org.id, { count: 2, capacity: 1, firstStartAt: start, everyMinutes: 30 });
  const manRooms = await prisma.tournamentRoom.findMany({ where: { tournamentId: tMan.id }, orderBy: { number: "asc" } });
  for (const email of ["m1@x.com", "m2@x.com", "m3@x.com"]) {
    const k = ++counter;
    await prisma.user.create({ data: { id: `u${k}`, email, displayName: `Manual ${k}` } });
    await prisma.playerProfile.create({ data: { userId: `u${k}`, birthDate: new Date("2000-01-01") } });
  }
  const m1 = await manualAddRegistration(tMan.id, org.id, "m1@x.com", "waived" as never) as { data?: { roomId: string | null } };
  const m2 = await manualAddRegistration(tMan.id, org.id, "m2@x.com", "waived" as never) as { data?: { roomId: string | null } };
  ok("manual add: first goes to Room 1, second to Room 2", m1.data?.roomId === manRooms[0].id && m2.data?.roomId === manRooms[1].id);
  const m3 = await manualAddRegistration(tMan.id, org.id, "m3@x.com", "waived" as never) as { data?: { roomId: string | null }; error?: string };
  ok("manual add never turns the organizer away: with every room full it sits outside the rooms", !m3.error && m3.data?.roomId === null);

  // ---------------------------------------------------------------------------------------------
  // 6. paid events: the queue pays nothing; a promoted team has a payment window
  // ---------------------------------------------------------------------------------------------
  const t6 = await tournament("Paid", { maxTeams: 2, entryType: "paid", payWindowMinutes: 30 });
  const pp = await players(5);
  const proof = { paymentProofUrl: "https://example.com/proof.png", paymentReference: "TXN123456" };
  await join(t6.id, pp[0], proof);
  await join(t6.id, pp[1], proof);
  const tOpen = await tournament("Paid open", { maxTeams: 1, entryType: "paid" });
  ok("a paid seat still needs proof while seats are open", err(await join(tOpen.id, pp[4])) === "payment_proof_required");
  ok("…and a reference too", err(await join(tOpen.id, pp[4], { paymentProofUrl: "https://example.com/p.png" })) === "payment_reference_required");
  const wl = await join(t6.id, pp[2]); // full now: no proof asked
  ok("a team joining the queue of a PAID event is not asked to pay", !err(wl) && kind(wl) === "waitlist");
  const wlReg = await prisma.registration.findUnique({ where: { id: (wl as { data: { id: string } }).data.id } });
  ok("…and has no payment on file", wlReg?.paymentProofUrl === null && wlReg.status === "waitlisted");
  const wl2 = await join(t6.id, pp[3]);
  ok("second in the paid queue", kind(wl2) === "waitlist");

  const victim = await prisma.registration.findFirst({ where: { tournamentId: t6.id, status: "pending", playerId: pp[0] } });
  await rejectRegistration(victim!.id, org.id);
  const promoted = await prisma.registration.findUnique({ where: { id: wlReg!.id } });
  ok("promoted: pending, with a payment deadline ~30 min away", promoted?.status === "pending" && !!promoted.payDueAt && Math.abs(promoted.payDueAt.getTime() - (Date.now() + 30 * 60_000)) < 60_000);
  const pl = await getEntryPlacement(promoted!.id);
  ok("the entry reports that payment is needed", pl?.needsPayment === true);

  // the clock runs out: the seat goes to the next team
  await prisma.registration.update({ where: { id: promoted!.id }, data: { payDueAt: new Date(Date.now() - 1000) } });
  await refreshSeats(t6.id);
  const lapsed = await prisma.registration.findUnique({ where: { id: promoted!.id } });
  ok("payment window over -> the seat is released", lapsed?.status === "withdrawn" && lapsed.releaseReason === "payment_window_expired");
  const next = await prisma.registration.findUnique({ where: { id: (wl2 as { data: { id: string } }).data.id } });
  ok("…and the next team in line got it, with its own deadline", next?.status === "pending" && !!next.payDueAt);
  const lost = await prisma.notification.findFirst({ where: { type: "seat_released" } });
  ok("the team that lost its seat was told", !!lost);

  // sending the payment for a seat won off the waiting list
  const nextOwner = (await prisma.playerProfile.findUnique({ where: { id: pp[3] } }))!.userId;
  const stranger = (await prisma.playerProfile.findUnique({ where: { id: pp[1] } }))!.userId;
  ok("someone else can't pay for the entry", ("error" in (await submitSeatPayment(next!.id, stranger, { paymentProofUrl: "https://example.com/p2.png", paymentReference: "TXN999999" }))));
  ok("a payment with no screenshot is refused", (await submitSeatPayment(next!.id, nextOwner, { paymentReference: "TXN999999" }) as { error: string }).error === "payment_proof_required");
  ok("a payment with no reference is refused", (await submitSeatPayment(next!.id, nextOwner, { paymentProofUrl: "https://example.com/p2.png" }) as { error: string }).error === "payment_reference_required");
  ok("the payer sends the payment", "ok" in (await submitSeatPayment(next!.id, nextOwner, { paymentProofUrl: "https://example.com/p2.png", paymentReference: "TXN999999" })));
  const paid = await prisma.registration.findUnique({ where: { id: next!.id } });
  ok("proof saved and the deadline cleared", paid?.paymentProofUrl === "https://example.com/p2.png" && paid.payDueAt === null && paid.paymentReference !== null);
  ok("paying twice is refused", (await submitSeatPayment(next!.id, nextOwner, { paymentProofUrl: "https://example.com/p3.png", paymentReference: "TXN999998" }) as { error: string }).error === "not_waiting_for_payment");
  ok("the organizer was told a payment arrived", !!(await prisma.notification.findFirst({ where: { type: "payment_submitted" } })));

  // too late to pay: the seat is released at once
  const [lateP] = await players(1);
  const lateJoin = await join(t6.id, lateP); // queue (the room is full)
  await prisma.registration.update({ where: { id: next!.id }, data: { status: "rejected" } });
  await refreshSeats(t6.id); // lateP promoted
  const lateReg = await prisma.registration.findFirst({ where: { tournamentId: t6.id, playerId: lateP } });
  ok("promoted again with a deadline", lateReg?.status === "pending" && !!lateReg.payDueAt);
  await prisma.registration.update({ where: { id: lateReg!.id }, data: { payDueAt: new Date(Date.now() - 5000) } });
  const lateOwner = (await prisma.playerProfile.findUnique({ where: { id: lateP } }))!.userId;
  ok("paying after the deadline: told it's over", (await submitSeatPayment(lateReg!.id, lateOwner, { paymentProofUrl: "https://example.com/p4.png", paymentReference: "TXN777777" }) as { error: string }).error === "payment_window_over");
  ok("…and the seat was released", (await prisma.registration.findUnique({ where: { id: lateReg!.id } }))?.status === "withdrawn");
  void lateJoin;
  // put the board back for the checks below: free the seat that was just opened
  await prisma.registration.updateMany({ where: { tournamentId: t6.id, status: "pending", paymentProofUrl: null }, data: { status: "rejected" } });

  // a team that already sent proof is never released by the clock
  const [keeper] = await players(1);
  await join(t6.id, keeper, proof);
  const keep = await prisma.registration.findFirst({ where: { tournamentId: t6.id, playerId: keeper } });
  await prisma.registration.update({ where: { id: keep!.id }, data: { payDueAt: new Date(Date.now() - 1000) } });
  await refreshSeats(t6.id);
  ok("a team that has paid keeps its seat", (await prisma.registration.findUnique({ where: { id: keep!.id } }))?.status !== "withdrawn");

  // refreshSeats with nothing to do is harmless
  await refreshSeats(t6.id);
  await refreshSeats("no-such-tournament");
  ok("refreshing when there is nothing to do is harmless", true);

  // ---------------------------------------------------------------------------------------------
  // 7. plain tournaments (no rooms) behave exactly as before
  // ---------------------------------------------------------------------------------------------
  const t7 = await tournament("Legacy", { maxTeams: 3 });
  const l = await players(4);
  const lr = [] as unknown[];
  for (const pid of l) lr.push(await join(t7.id, pid));
  ok("no rooms: 3 seats, 1 waiting", (await seated(t7.id)) === 3 && (await count(t7.id, "waitlisted")) === 1);
  ok("no rooms: the seated entries have no room", (await prisma.registration.count({ where: { tournamentId: t7.id, roomId: { not: null } } })) === 0);
  const s7 = await getSeatSummary(t7.id);
  ok("summary for a plain tournament", s7?.hasRooms === false && s7.totalSeats === 3 && s7.taken === 3 && s7.waiting === 1);
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
