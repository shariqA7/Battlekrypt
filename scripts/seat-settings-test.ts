// Pure checks for the organizer's seat settings (no database).
import { describeRefundPolicy, parseSeatSettings, REFUND_POLICIES } from "../lib/seat-settings";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const good = (b: Record<string, unknown>) => { const r = parseSeatSettings(b); return r.ok ? r.value : null; };
const bad = (b: Record<string, unknown>) => { const r = parseSeatSettings(b); return r.ok ? null : r.message; };

const d = good({})!;
ok("defaults: waiting list on", d.waitlistEnabled === true);
ok("defaults: 60 minutes to pay", d.payWindowMinutes === 60);
ok("defaults: organizer decides refunds, 24 h cut-off, no rooms", d.refundPolicy === "organizer_decides" && d.refundCutoffHours === 24 && d.rooms === null);
ok("waiting list can be switched off", good({ waitlistEnabled: false })?.waitlistEnabled === false);
ok("waiting list must be a boolean", bad({ waitlistEnabled: "yes" }) !== null);
ok("pay window: 30 ok, strings accepted", good({ payWindowMinutes: "30" })?.payWindowMinutes === 30);
ok("pay window: 4 too short, 1441 too long, 2.5 not whole", bad({ payWindowMinutes: 4 }) !== null && bad({ payWindowMinutes: 1441 }) !== null && bad({ payWindowMinutes: 2.5 }) !== null);
ok("empty pay window means the default", good({ payWindowMinutes: "" })?.payWindowMinutes === 60);
for (const p of REFUND_POLICIES) ok(`refund policy ${p} accepted`, good({ refundPolicy: p })?.refundPolicy === p);
ok("an unknown refund policy is refused", bad({ refundPolicy: "whatever" }) !== null);
ok("cut-off 0 ok, 720 ok, 721 and -1 refused", good({ refundCutoffHours: 0 })?.refundCutoffHours === 0 && good({ refundCutoffHours: 720 }) !== null && bad({ refundCutoffHours: 721 }) !== null && bad({ refundCutoffHours: -1 }) !== null);
const r = good({ rooms: { count: 4, capacity: 25, firstStartAt: "2026-12-01T10:30:00Z", everyMinutes: 30 } })?.rooms;
ok("rooms plan is read", r?.count === 4 && r.capacity === 25 && r.everyMinutes === 30 && r.firstStartAt?.toISOString() === "2026-12-01T10:30:00.000Z");
ok("rooms: no gap means all at once", good({ rooms: { count: 2, capacity: 10 } })?.rooms?.everyMinutes === 0);
ok("rooms: 0 rooms refused", bad({ rooms: { count: 0, capacity: 10 } }) !== null);
ok("rooms: 0 seats refused", bad({ rooms: { count: 2, capacity: 0 } }) !== null);
ok("rooms: a bad date refused", bad({ rooms: { count: 2, capacity: 10, firstStartAt: "not a date" } }) !== null);
ok("rooms: null means none", good({ rooms: null })?.rooms === null);
ok("thousands of teams: 400 rooms x 25 = 10000 is fine", good({ rooms: { count: 400, capacity: 25 } }) !== null);

ok("policy text: no refund", describeRefundPolicy("no_refund", 24).startsWith("No refunds"));
ok("policy text: cut-off says the hours", describeRefundPolicy("full_before_cutoff", 24).includes("24 hours"));
ok("policy text: 1 hour is singular", describeRefundPolicy("full_before_cutoff", 1).includes("1 hour "));
ok("policy text: resale", describeRefundPolicy("if_resold", 24).includes("waiting list"));
ok("policy text: discretion", describeRefundPolicy("organizer_decides", 24).includes("organizer"));
console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
