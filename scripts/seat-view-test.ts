// Pure checks for the seat wording shown on screens.
import { joinOutcomeMessage, seatsLeftText, seatsLine, toPublicSeats } from "../lib/seat-view";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

ok("25 of 25", seatsLine({ taken: 25, totalSeats: 25, waiting: 0 }) === "25/25");
ok("25 of 25 and 4 waiting", seatsLine({ taken: 25, totalSeats: 25, waiting: 4 }) === "25/25 · 4 waiting");
ok("seats left wording", seatsLeftText(0) === "Full" && seatsLeftText(1) === "1 seat left" && seatsLeftText(7) === "7 seats left" && seatsLeftText(-2) === "Full");

const asked = { label: "Room 1" };
ok("seated where asked", joinOutcomeMessage({ status: "pending", room: { label: "Room 1" } }, asked, { paid: false }).text === "You're in Room 1.");
const moved = joinOutcomeMessage({ status: "pending", room: { label: "Room 2" } }, asked, { paid: false });
ok("sent to another room: says Room 1 was full and where they are", moved.text.includes("Room 1 was full") && moved.text.includes("Room 2") && moved.kind === "info");
const wl = joinOutcomeMessage({ status: "waitlisted", position: 3, waitingTotal: 9 }, asked, { paid: false });
ok("waiting list: shows the place in line", wl.text.includes("#3") && wl.text.includes("waiting list"));
ok("waiting list, paid event: says you pay only when a seat opens", joinOutcomeMessage({ status: "waitlisted", position: 1 }, null, { paid: true }).text.includes("pay only then"));
ok("waiting list, free event: no talk of paying", !joinOutcomeMessage({ status: "waitlisted", position: 1 }, null, { paid: false }).text.includes("pay"));
ok("no room, no entry info: still friendly", joinOutcomeMessage(null, null, { paid: false }).text === "You're in." && joinOutcomeMessage({ status: "pending" }, null, { paid: false }).text === "You're in.");

const pub = toPublicSeats({
  hasRooms: true, totalSeats: 50, taken: 50, seatsLeft: 0, waiting: 3, waitlistEnabled: true,
  rooms: [{ id: "r1", number: 1, name: null, startAt: new Date("2026-12-01T10:30:00Z"), capacity: 25, taken: 25, label: "Room 1", seatsLeft: 0 }],
});
ok("public seats: dates become strings, full is true when no seat is left", pub.rooms[0].startAt === "2026-12-01T10:30:00.000Z" && pub.full === true && pub.waiting === 3);
ok("public seats: not full when a seat is left", toPublicSeats({ hasRooms: false, rooms: [], totalSeats: 10, taken: 9, seatsLeft: 1, waiting: 0, waitlistEnabled: true }).full === false);
console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
