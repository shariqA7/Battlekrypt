// Pure checks for the organizer's seat form.
import { DEFAULT_SEAT_FORM, seatDefaultsForGame, seatFormError, seatPayload, totalSeatsOf, type SeatForm } from "../lib/seat-form";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const F = (o: Partial<SeatForm>): SeatForm => ({ ...DEFAULT_SEAT_FORM, ...o });

// game defaults
const pubg = seatDefaultsForGame(DEFAULT_SEAT_FORM, { maxPerMatch: 25 });
ok("a lobby game turns rooms on, sized to the game", pubg.useRooms === true && pubg.perRoom === "25");
ok("a head-to-head game turns rooms off", seatDefaultsForGame(F({ useRooms: true }), { maxPerMatch: 2 }).useRooms === false);
ok("a game with no size leaves the form alone", seatDefaultsForGame(F({ useRooms: true, perRoom: "9" }), { maxPerMatch: null }).perRoom === "9");
ok("no game leaves the form alone", seatDefaultsForGame(DEFAULT_SEAT_FORM, null) === DEFAULT_SEAT_FORM);
ok("TFT: rooms of 8", seatDefaultsForGame(DEFAULT_SEAT_FORM, { maxPerMatch: 8 }).perRoom === "8");

// totals
ok("rooms: 50 x 25 = 1250", totalSeatsOf(F({ useRooms: true, roomCount: "50", perRoom: "25" })) === 1250);
ok("rooms: thousands of teams: 400 x 25 = 10000", totalSeatsOf(F({ useRooms: true, roomCount: "400", perRoom: "25" })) === 10000);
ok("pool: the max teams", totalSeatsOf(F({ maxTeams: "32" })) === 32);
ok("incomplete rooms: no total", totalSeatsOf(F({ useRooms: true, roomCount: "", perRoom: "25" })) === null);
ok("bad pool: no total", totalSeatsOf(F({ maxTeams: "0" })) === null && totalSeatsOf(F({ maxTeams: "abc" })) === null);

// validation
ok("a normal pool is fine", seatFormError(F({}), false) === null);
ok("pool of 0 refused", seatFormError(F({ maxTeams: "0" }), false) !== null);
ok("rooms: 0 rooms refused", seatFormError(F({ useRooms: true, roomCount: "0", perRoom: "25" }), false) !== null);
ok("rooms: 501 rooms refused", seatFormError(F({ useRooms: true, roomCount: "501", perRoom: "25" }), false) !== null);
ok("rooms: no seats refused", seatFormError(F({ useRooms: true, roomCount: "2", perRoom: "" }), false) !== null);
ok("rooms: 1001 seats refused", seatFormError(F({ useRooms: true, roomCount: "2", perRoom: "1001" }), false) !== null);
ok("rooms: a bad gap refused when there are several rooms", seatFormError(F({ useRooms: true, roomCount: "3", perRoom: "25", everyMinutes: "-5" }), false) !== null);
ok("rooms: the gap doesn't matter for one room", seatFormError(F({ useRooms: true, roomCount: "1", perRoom: "25", everyMinutes: "" }), false) === null);
ok("going above the game's size is NOT an error (it only warns)", seatFormError(F({ useRooms: true, roomCount: "1", perRoom: "40" }), false) === null);
ok("paid: pay window 4 refused when the waiting list is on", seatFormError(F({ payWindowMinutes: "4" }), true) !== null);
ok("paid: pay window ignored when the waiting list is off", seatFormError(F({ payWindowMinutes: "4", waitlistEnabled: false }), true) === null);
ok("free: pay window not checked", seatFormError(F({ payWindowMinutes: "4" }), false) === null);
ok("paid: cut-off 721 refused only for the cut-off policy", seatFormError(F({ refundPolicy: "full_before_cutoff", refundCutoffHours: "721" }), true) !== null && seatFormError(F({ refundPolicy: "no_refund", refundCutoffHours: "721" }), true) === null);

// payload
const start = "2026-12-01T10:00:00.000Z";
const p1 = seatPayload(F({ useRooms: true, roomCount: "4", perRoom: "25", everyMinutes: "30" }), false, start);
ok("rooms payload: total, plan, start from the tournament", p1.maxTeams === 100 && (p1.rooms as { count: number; capacity: number; firstStartAt: string; everyMinutes: number }).count === 4 && (p1.rooms as { firstStartAt: string }).firstStartAt === start && (p1.rooms as { everyMinutes: number }).everyMinutes === 30);
ok("rooms payload: free events send no refund settings", !("refundPolicy" in p1) && !("payWindowMinutes" in p1) && p1.waitlistEnabled === true);
const first = new Date("2026-12-02T09:00").toISOString();
ok("rooms payload: a chosen first-room time wins", (seatPayload(F({ useRooms: true, roomCount: "2", perRoom: "10", firstStart: "2026-12-02T09:00" }), false, start).rooms as { firstStartAt: string }).firstStartAt === first);
ok("one room: no gap sent", (seatPayload(F({ useRooms: true, roomCount: "1", perRoom: "25", everyMinutes: "30" }), false, start).rooms as { everyMinutes: number }).everyMinutes === 0);
const p2 = seatPayload(F({ maxTeams: "32" }), false, start);
ok("pool payload: just the total and no rooms", p2.maxTeams === 32 && !("rooms" in p2));
const p3 = seatPayload(F({ refundPolicy: "full_before_cutoff", refundCutoffHours: "12", payWindowMinutes: "30" }), true, start);
ok("paid payload: policy, cut-off and pay window", p3.refundPolicy === "full_before_cutoff" && p3.refundCutoffHours === 12 && p3.payWindowMinutes === 30);
const p4 = seatPayload(F({ refundPolicy: "no_refund", refundCutoffHours: "12", waitlistEnabled: false }), true, start);
ok("paid payload: cut-off only sent for that policy; waiting list off", p4.refundCutoffHours === 24 && p4.waitlistEnabled === false && p4.payWindowMinutes === 60);
console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
