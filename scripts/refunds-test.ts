// Pure checks for withdrawal and refund rules (no database).
import { decideRefund, hoursUntil, nextRefundStatus, resolveResales, withdrawBlock, type RefundInput } from "../lib/refunds";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

const NOW = new Date("2026-12-01T10:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const base: RefundInput = { policy: "organizer_decides", cutoffHours: 24, entryType: "paid", sentMoney: true, hadSeat: true, roomStart: inHours(48), now: NOW };
const d = (o: Partial<RefundInput>) => decideRefund({ ...base, ...o }).status;

ok("free event: nothing to refund", d({ entryType: "free" }) === "not_applicable");
ok("never sent money: nothing to refund", d({ sentMoney: false }) === "not_applicable");
ok("no_refund policy: declined", d({ policy: "no_refund" }) === "declined");
ok("organizer decides: requested", d({ policy: "organizer_decides" }) === "requested");
ok("resale policy: waiting for resale", d({ policy: "if_resold" }) === "waiting_resale");
ok("cut-off: 48h before with a 24h cut-off -> owed", d({ policy: "full_before_cutoff" }) === "owed");
ok("cut-off: exactly 24h before -> still owed", d({ policy: "full_before_cutoff", roomStart: inHours(24) }) === "owed");
ok("cut-off: 23h before -> declined", d({ policy: "full_before_cutoff", roomStart: inHours(23) }) === "declined");
ok("cut-off 0: any time before the start -> owed", d({ policy: "full_before_cutoff", cutoffHours: 0, roomStart: inHours(0.1) }) === "owed");
ok("cut-off with no known start time -> owed", d({ policy: "full_before_cutoff", roomStart: null }) === "owed");
ok("never had a seat (waiting list): always a full refund, whatever the policy", (["no_refund", "organizer_decides", "if_resold", "full_before_cutoff"] as const).every((p) => d({ policy: p, hadSeat: false }) === "owed"));
ok("the declined reason names the cut-off", decideRefund({ ...base, policy: "full_before_cutoff", roomStart: inHours(5) }).reason.includes("24 hours"));
ok("hoursUntil", Math.abs(hoursUntil(inHours(3), NOW) - 3) < 1e-9 && hoursUntil(null, NOW) === Infinity);

// who can still withdraw
const wb = (o: Partial<{ entryStatus: string; tournamentStatus: string; roomStart: Date | null }>) =>
  withdrawBlock({ entryStatus: "approved", tournamentStatus: "registration_open", roomStart: inHours(5), now: NOW, ...o });
ok("a seated team can withdraw before its room starts", wb({}) === null);
ok("pending and waitlisted can too", wb({ entryStatus: "pending" }) === null && wb({ entryStatus: "waitlisted" }) === null);
ok("after the room started: blocked", wb({ roomStart: inHours(-1) }) === "started");
ok("exactly at the start: blocked", wb({ roomStart: inHours(0) }) === "started");
ok("no start time set: allowed", wb({ roomStart: null }) === null);
ok("already rejected / withdrawn / disqualified: not active", ["rejected", "withdrawn", "disqualified"].every((s) => wb({ entryStatus: s }) === "not_active"));
ok("in progress / completed / cancelled tournament: closed", ["in_progress", "completed", "cancelled"].every((s) => wb({ tournamentStatus: s }) === "closed"));
ok("registration closed but not started: can still withdraw", wb({ tournamentStatus: "registration_closed" }) === null);

// resale matching: oldest withdrawal first
const w = (id: string, h: number) => ({ id, withdrawnAt: inHours(h) });
const r1 = resolveResales([w("c", 3), w("a", 1), w("b", 2)], 2);
ok("2 seats resold: the two oldest withdrawals are owed", r1.owed.join() === "a,b" && r1.stillWaiting.join() === "c");
ok("0 resold: nobody owed", resolveResales([w("a", 1)], 0).owed.length === 0);
ok("more resold than waiting: all owed, no crash", resolveResales([w("a", 1)], 5).owed.join() === "a");
ok("nothing waiting", resolveResales([], 3).owed.length === 0);

// organizer actions
ok("requested -> owe -> owed", nextRefundStatus("owe", "requested") === "owed");
ok("requested -> decline -> declined", nextRefundStatus("decline", "requested") === "declined");
ok("declined can be turned into owed (the organizer relents)", nextRefundStatus("owe", "declined") === "owed");
ok("waiting_resale can be settled by hand", nextRefundStatus("owe", "waiting_resale") === "owed");
ok("owed -> refunded", nextRefundStatus("refunded", "owed") === "refunded");
ok("can't mark refunded something that isn't owed", nextRefundStatus("refunded", "requested") === null && nextRefundStatus("refunded", "declined") === null);
ok("a refunded entry is final", nextRefundStatus("decline", "refunded") === null && nextRefundStatus("owe", "refunded") === null);
ok("nothing to refund can't be actioned", nextRefundStatus("owe", "not_applicable") === null);
console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
