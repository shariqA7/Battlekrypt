// Account deletion rules that need no database.
import { COOLING_OFF_DAYS, CONFIRM_PHRASE, blockerMessage, confirmPhraseOk, deletionDueAt, deletionState, makeBlocker, splitFiles, withoutOwnFiles } from "../lib/account-deletion";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const now = new Date("2026-11-10T12:00:00Z");

ok("the due date is 14 days out", deletionDueAt(now).getTime() - now.getTime() === COOLING_OFF_DAYS * 86_400_000 && COOLING_OFF_DAYS === 14);
ok("the phrase must be typed (case and spacing don't matter)", confirmPhraseOk(CONFIRM_PHRASE) && confirmPhraseOk("  delete   my account ") && !confirmPhraseOk("delete") && !confirmPhraseOk("") && !confirmPhraseOk(undefined) && !confirmPhraseOk("DELETE MY ACCOUNT NOW"));
ok("no blocker when nothing is in the way", makeBlocker("payment_dispute", 0) === null);
ok("a blocker says how many, in plain words", makeBlocker("payment_dispute", 2)?.message === "You have 2 open payment disputes. Resolve them first." && blockerMessage("payment_dispute", 1) === "You have 1 open payment dispute. Resolve it first.");
ok("every kind of blocker has a message", (["staff", "payment_dispute", "refund_owed", "payout_hold", "organizer_events", "club_roster", "live_entries", "open_invoices", "challenge_posted", "challenge_entry", "prize_dispute"] as const).every((k) => blockerMessage(k, 3).length > 10));
ok("state: none, scheduled with days left, erased",
  deletionState({ deletionRequestedAt: null, deletionDueAt: null, deletedAt: null }, now).state === "none" &&
  (() => { const s = deletionState({ deletionRequestedAt: now, deletionDueAt: deletionDueAt(now), deletedAt: null }, now); return s.state === "scheduled" && s.daysLeft === 14; })() &&
  deletionState({ deletionRequestedAt: now, deletionDueAt: now, deletedAt: now }, now).state === "erased");
ok("days left never goes below zero", (() => { const s = deletionState({ deletionRequestedAt: now, deletionDueAt: new Date(now.getTime() - 5 * 86_400_000), deletedAt: null }, now); return s.state === "scheduled" && s.daysLeft === 0; })());
const { remove, kept } = splitFiles(["u/a.png", "u/b.png", "u/c.png"], new Set(["u/b.png"]));
ok("files backing kept financial records are kept, the rest removed", remove.join() === "u/a.png,u/c.png" && kept.join() === "u/b.png");
ok("only the person's own files are dropped from a list", withoutOwnFiles(["u1/x.png", "u2/y.png", "u1/z.png"], "u1").join() === "u2/y.png" && withoutOwnFiles(["u10/x.png"], "u1").length === 1);

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall passed");
