// Pure checks for rooms, placement and the waiting-list queue (no database).
// Run: npx tsx scripts/rooms-test.ts
import { buildRooms, decidePlacement, inPlayOrder, payDeadline, pickRoom, planPromotions, queueOrder, queuePosition, roomLabel, roomPlanError, seatsLeft, totalSeats, type RoomSeat } from "../lib/rooms";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

const T0 = new Date("2026-12-01T10:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const room = (number: number, min: number | null, capacity: number, taken: number): RoomSeat =>
  ({ id: `r${number}`, number, startAt: min == null ? null : at(min), capacity, taken });

// ---- pickRoom
{
  const rooms = [room(1, 0, 25, 25), room(2, 30, 25, 10), room(3, 60, 25, 0)];
  ok("asked-for room with a seat is used", pickRoom(rooms, "r2", T0)?.room.id === "r2" && pickRoom(rooms, "r2", T0)?.why === "preferred");
  ok("full room -> the nearest in time (Room 2 is 30 min from Room 1)", pickRoom(rooms, "r1", T0)?.room.id === "r2" && pickRoom(rooms, "r1", T0)?.why === "nearest");
  const rooms2 = [room(1, 0, 25, 0), room(2, 30, 25, 25), room(3, 60, 25, 0)];
  ok("equal distance -> the lower number", pickRoom(rooms2, "r2", T0)?.room.id === "r1");
  const rooms3 = [room(1, 0, 25, 25), room(2, 30, 25, 25), room(3, 300, 25, 3)];
  ok("only far room left -> still gets it", pickRoom(rooms3, "r1", T0)?.room.id === "r3");
  ok("no preference -> earliest open room", pickRoom([room(1, 0, 25, 25), room(2, 30, 25, 5), room(3, 60, 25, 0)], null, T0)?.room.id === "r2");
  ok("no preference, earliest by TIME not by number", pickRoom([room(1, 90, 25, 0), room(2, 30, 25, 0)], null, T0)?.room.id === "r2");
  ok("every room full -> null", pickRoom([room(1, 0, 2, 2), room(2, 30, 2, 2)], "r1", T0) === null);
  ok("unknown preferred id behaves like no preference", pickRoom([room(1, 0, 5, 0)], "nope", T0)?.why === "earliest");
  ok("rooms with no own start use the tournament's", pickRoom([room(1, null, 5, 5), room(2, null, 5, 0)], "r1", T0)?.room.id === "r2");
  ok("inPlayOrder sorts by time then number", inPlayOrder([room(2, 30, 1, 0), room(1, 30, 1, 0), room(3, 0, 1, 0)], T0).map((r) => r.number).join() === "3,1,2");
}

// ---- decidePlacement
const base = { tournamentStart: T0, maxTeams: 25, takenWithoutRoom: 0, waitlistEnabled: true, waitingCount: 0, rooms: [] as RoomSeat[] };
ok("single pool: seat while under the cap", decidePlacement({ ...base, takenWithoutRoom: 24 }).kind === "seat");
ok("single pool: the 25th team of 25 gets the last seat", (() => { const p = decidePlacement({ ...base, takenWithoutRoom: 24 }); return p.kind === "seat" && p.roomId === null; })());
ok("single pool: the 26th goes to the waiting list", decidePlacement({ ...base, takenWithoutRoom: 25 }).kind === "waitlist");
ok("waiting list off: the 26th is turned away", decidePlacement({ ...base, takenWithoutRoom: 25, waitlistEnabled: false }).kind === "full");
ok("a queue exists: newcomers queue behind it even if a seat shows free", decidePlacement({ ...base, takenWithoutRoom: 3, waitingCount: 2 }).kind === "waitlist");
ok("rooms: preferred room with a seat", (() => { const p = decidePlacement({ ...base, rooms: [room(1, 0, 25, 3)], preferredRoomId: "r1" }); return p.kind === "seat" && p.roomId === "r1"; })());
ok("rooms: all full -> waiting list", decidePlacement({ ...base, rooms: [room(1, 0, 25, 25), room(2, 30, 25, 25)], preferredRoomId: "r1" }).kind === "waitlist");
ok("rooms: all full + waiting list off -> full", decidePlacement({ ...base, waitlistEnabled: false, rooms: [room(1, 0, 25, 25)] }).kind === "full");
ok("rooms: the organizer's limit of 20 is honoured", decidePlacement({ ...base, rooms: [room(1, 0, 20, 20)] }).kind === "waitlist");

// ---- queue
{
  const w = [
    { id: "b", waitlistedAt: at(5) }, { id: "a", waitlistedAt: at(1) }, { id: "c", waitlistedAt: at(5) }, { id: "d", waitlistedAt: at(9) },
  ];
  ok("first come, first served", queueOrder(w).map((x) => x.id).join() === "a,b,c,d");
  ok("same-second ties are stable (by id)", queueOrder([...w].reverse()).map((x) => x.id).join() === "a,b,c,d");
  ok("position is 1-based", queuePosition(w, "a") === 1 && queuePosition(w, "d") === 4);
  ok("not queued -> null", queuePosition(w, "zzz") === null);
}

// ---- promotions
{
  const waiting = Array.from({ length: 5 }, (_, i) => ({ id: `w${i + 1}`, waitlistedAt: at(i) }));
  const p1 = planPromotions({ rooms: [], tournamentStart: T0, maxTeams: 25, takenWithoutRoom: 23, waiting });
  ok("2 free seats in the pool -> the first 2 in line", p1.map((x) => x.registrationId).join() === "w1,w2" && p1.every((x) => x.roomId === null));
  ok("no free seat -> nobody promoted", planPromotions({ rooms: [], tournamentStart: T0, maxTeams: 25, takenWithoutRoom: 25, waiting }).length === 0);
  const rooms = [room(1, 0, 25, 24), room(2, 30, 25, 24)];
  const p2 = planPromotions({ rooms, tournamentStart: T0, maxTeams: 50, takenWithoutRoom: 0, waiting });
  ok("rooms: free seats in two rooms -> first two in line, earliest room first", p2.map((x) => `${x.registrationId}>${x.roomId}`).join() === "w1>r1,w2>r2");
  const p3 = planPromotions({ rooms: [room(1, 0, 3, 0)], tournamentStart: T0, maxTeams: 3, takenWithoutRoom: 0, waiting });
  ok("one room with 3 free seats takes 3 from the queue", p3.map((x) => x.registrationId).join() === "w1,w2,w3");
  ok("input rooms are not mutated", rooms[0].taken === 24 && rooms[1].taken === 24);
}

// ---- building rooms
{
  const plan = { count: 4, capacity: 25, firstStartAt: T0, everyMinutes: 30 };
  const built = buildRooms(plan);
  ok("4 rooms numbered 1 to 4", built.map((r) => r.number).join() === "1,2,3,4");
  ok("spaced 30 minutes apart", built.map((r) => (r.startAt!.getTime() - T0.getTime()) / 60000).join() === "0,30,60,90");
  ok("each has the planned seats", built.every((r) => r.capacity === 25));
  ok("adding more continues the numbering", buildRooms({ ...plan, count: 2 }, 5).map((r) => r.number).join() === "5,6");
  ok("no start time -> rooms use the tournament's", buildRooms({ ...plan, firstStartAt: null }).every((r) => r.startAt === null));
  ok("gap 0 -> all at once", new Set(buildRooms({ ...plan, everyMinutes: 0 }).map((r) => r.startAt!.getTime())).size === 1);
  ok("50 rooms x 25 seats = 1250 (thousands of teams are fine)", totalSeats(buildRooms({ ...plan, count: 50 }), 0) === 1250);
  ok("no rooms -> total is maxTeams", totalSeats([], 64) === 64);
  ok("plan: 0 rooms refused", roomPlanError({ ...plan, count: 0 }) !== null);
  ok("plan: 501 rooms refused", roomPlanError({ ...plan, count: 501 }) !== null);
  ok("plan: 0 seats refused", roomPlanError({ ...plan, capacity: 0 }) !== null);
  ok("plan: 1001 seats refused", roomPlanError({ ...plan, capacity: 1001 }) !== null);
  ok("plan: negative gap refused", roomPlanError({ ...plan, everyMinutes: -1 }) !== null);
  ok("plan: a normal plan is fine", roomPlanError(plan) === null);
}

ok("label: number or custom name", roomLabel({ number: 3 }) === "Room 3" && roomLabel({ number: 3, name: " Final lobby " }) === "Final lobby");
ok("seatsLeft never negative", seatsLeft({ capacity: 5, taken: 9 }) === 0 && seatsLeft({ capacity: 5, taken: 2 }) === 3);
ok("pay deadline", payDeadline(T0, 60).getTime() === T0.getTime() + 3_600_000 && payDeadline(T0, 0).getTime() === T0.getTime() + 60_000);

console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
