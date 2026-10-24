// Pure-function checks for lib/tournament-view.ts and lib/services/prize-tiers.ts.
// Run: npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' -r ./alias.js scripts/d3-view-test.ts
import { buildRail, eventDateRange, ctaFor } from "../lib/tournament-view";
import { parsePrizeTiers, checkAgainstPool, totalPayout, ordinal, placeLabel } from "../lib/services/prize-tiers";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const d = (s: string) => new Date(`2026-${s}T12:00:00Z`);
const now = d("10-25");
const st = (id: string, name: string, order: number, startAt: Date | null, status: string | null = null) => ({ id, name, order, startAt, status });

// ---- rail
const stages = [st("a", "Qualifiers", 0, d("10-24")), st("b", "Semifinals", 1, d("10-26")), st("c", "Finals", 2, d("10-28"))];
let r = buildRail({ status: "published", startAt: d("10-24") }, stages, now);
ok("open registration is live, stages upcoming", r[0].state === "live" && r[0].note === "open" && r.slice(1).every((n) => n.state === "upcoming"));
r = buildRail({ status: "in_progress", startAt: d("10-24") }, stages, now);
ok("in progress: registration closed", r[0].state === "done" && r[0].note === "closed");
ok("in progress: started stage is live, later ones upcoming", r[1].state === "live" && r[2].state === "upcoming" && r[3].state === "upcoming");
ok("upcoming stage shows its start", r[2].note === "starts" && r[2].date?.getTime() === d("10-26").getTime());
ok("only the final stage is flagged last", r.filter((n) => n.last).length === 1 && r[3].last);
r = buildRail({ status: "in_progress", startAt: null }, [st("a", "Q", 0, d("10-20")), st("b", "S", 1, d("10-24")), st("c", "F", 2, d("10-30"))], now);
ok("earlier stages before the live one are done", r[1].state === "done" && r[2].state === "live" && r[3].state === "upcoming");
r = buildRail({ status: "in_progress", startAt: null }, [st("a", "Q", 0, d("10-20"), "completed"), st("b", "S", 1, d("10-24"), "live"), st("c", "F", 2, null)], now);
ok("explicit stage status wins", r[1].state === "done" && r[2].state === "live" && r[3].note === "tba");
r = buildRail({ status: "completed", startAt: null }, stages, now);
ok("completed tournament: everything done", r.every((n) => n.state === "done"));
ok("no stages: just registration", buildRail({ status: "published", startAt: null }, [], now).length === 1);
r = buildRail({ status: "in_progress", startAt: null }, [st("a", "F", 5, d("10-20")), st("b", "Q", 1, d("10-10"))], now);
ok("stages are ordered by their order field", r[1].label === "Q" && r[2].label === "F");

// ---- date range
ok("range from start to last stage", (() => { const x = eventDateRange({ startAt: d("10-24") }, stages)!; return x.from.getTime() === d("10-24").getTime() && x.to!.getTime() === d("10-28").getTime(); })());
ok("single day has no end", eventDateRange({ startAt: d("10-24") }, [])!.to === null);
ok("no dates -> null", eventDateRange({ startAt: null }, [{ startAt: null }]) === null);

// ---- CTA
ok("open: enter now", ctaFor({ status: "registration_open", maxTeams: 10 }, 3).kind === "join");
ok("full: closed", ctaFor({ status: "registration_open", maxTeams: 10 }, 10).label === "Full");
ok("in progress / completed / cancelled / draft", ctaFor({ status: "in_progress", maxTeams: 9 }, 1).label === "Live now" && ctaFor({ status: "completed", maxTeams: 9 }, 1).label === "Completed" && ctaFor({ status: "cancelled", maxTeams: 9 }, 1).label === "Cancelled" && ctaFor({ status: "draft", maxTeams: 9 }, 1).kind === "closed");

// ---- prize tiers
ok("ordinals", ordinal(1) === "1st" && ordinal(2) === "2nd" && ordinal(3) === "3rd" && ordinal(4) === "4th" && ordinal(11) === "11th" && ordinal(12) === "12th" && ordinal(13) === "13th" && ordinal(21) === "21st" && ordinal(112) === "112th");
ok("labels", placeLabel(1, 1) === "1st place" && placeLabel(4, 8) === "4th–8th");
const p = parsePrizeTiers([{ from: 4, to: 8, amount: 50000 }, { from: 1, amount: 750000 }, { from: 2, to: 2, amount: 350000 }, { from: 3, amount: 150000 }]);
ok("parse sorts and defaults 'to'", p.ok && p.tiers.map((t) => `${t.from}-${t.to}`).join() === "1-1,2-2,3-3,4-8");
ok("payout: 750+350+150+5*50 = 1,500,000", p.ok && totalPayout(p.tiers) === 1500000);
ok("fits a $1.5M pool exactly", p.ok && checkAgainstPool(p.tiers, 1500000) === null);
ok("over the pool is refused", p.ok && !!checkAgainstPool(p.tiers, 1000000));
ok("a split needs a pool", p.ok && !!checkAgainstPool(p.tiers, 0) && !!checkAgainstPool(p.tiers, null));
ok("empty split is always fine", checkAgainstPool([], 0) === null);
ok("overlap refused", !parsePrizeTiers([{ from: 1, to: 3, amount: 10 }, { from: 3, to: 4, amount: 10 }]).ok);
ok("bad rows refused", !parsePrizeTiers([{ from: 0, amount: 10 }]).ok && !parsePrizeTiers([{ from: 3, to: 2, amount: 10 }]).ok && !parsePrizeTiers([{ from: 1, amount: 0 }]).ok && !parsePrizeTiers([{ from: 1, amount: -5 }]).ok && !parsePrizeTiers([{ from: 1.5, amount: 5 }]).ok && !parsePrizeTiers("x").ok);
ok("too many rows refused", !parsePrizeTiers(Array.from({ length: 21 }, (_, i) => ({ from: i + 1, amount: 1 }))).ok);
ok("undefined/null means none", parsePrizeTiers(undefined).ok && parsePrizeTiers(null).ok);
ok("amounts rounded to cents", (() => { const x = parsePrizeTiers([{ from: 1, amount: 10.456 }]); return x.ok && x.tiers[0].amount === 10.46; })());
process.exit(fails ? 1 : 0);
