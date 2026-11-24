// Pure checks for the per-game match size (no database).
// Run: npx tsx scripts/match-limits-test.ts
import { readFileSync } from "node:fs";
import { GAME_CATALOG, MATCH_LIMITS, matchLimitFor } from "../lib/game-catalog";
import { cleanGameInput } from "../lib/game-details";
import { entryWord, isHeadToHead, roomSizeWarning } from "../lib/game-rules";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

ok("every catalog game has a match size", GAME_CATALOG.every((g) => matchLimitFor(g.name) !== null));
ok("no match size for a game that is not in the catalog", Object.keys(MATCH_LIMITS).every((n) => GAME_CATALOG.some((g) => g.name === n)));

// The official numbers: [game, entries]
const OFFICIAL: [string, number][] = [
  ["PUBG Mobile", 25], ["PUBG: Battlegrounds", 25], ["Free Fire", 12], ["Apex Legends", 20], ["Fortnite", 50],
  ["Teamfight Tactics", 8], ["Trackmania", 64], ["Call of Duty: Warzone", 50],
];
for (const [name, n] of OFFICIAL) ok(`${name}: ${n} per room`, matchLimitFor(name)?.max === n);

const TWO = ["Valorant", "Counter-Strike 2", "Call of Duty: Black Ops 7", "Overwatch 2", "Rainbow Six Siege X", "Crossfire", "Dota 2", "League of Legends",
  "Mobile Legends: Bang Bang", "Honor of Kings", "Tekken 8", "Street Fighter 6", "Fatal Fury: City of the Wolves", "EA Sports FC 26", "Rocket League", "Chess"];
for (const n of TWO) ok(`${n}: two sides`, matchLimitFor(n)?.max === 2);
ok("16 head-to-head games + 8 lobby games = 24", TWO.length + OFFICIAL.length === 24);

// A lobby of squads: players / squad size.
ok("PUBG Mobile = 100 players / squads of 4", 25 * 4 === 100);
ok("Free Fire = 12 squads of 4 = 48 players", 12 * 4 === 48);
ok("Apex = 20 trios = 60 players", 20 * 3 === 60);
ok("Fortnite = 50 duos = 100 players", 50 * 2 === 100);

// helpers
const pubg = { name: "PUBG Mobile", maxPerMatch: 25, teamSizeMax: 4 };
ok("at the limit: no warning", roomSizeWarning(pubg, 25) === null);
ok("below the limit: no warning", roomSizeWarning(pubg, 10) === null);
const w = roomSizeWarning(pubg, 30);
ok("above the limit: warns, naming the game, the limit and the number", !!w && w.includes("PUBG Mobile") && w.includes("25") && w.includes("30"));
ok("the warning says it can still be done", !!w && w.includes("You can still go ahead"));
ok("a game with no set size never warns", roomSizeWarning({ name: "X", maxPerMatch: null }, 500) === null);
ok("a head-to-head game never warns (rooms aren't used)", roomSizeWarning({ name: "Tekken 8", maxPerMatch: 2, teamSizeMax: 1 }, 64) === null);
ok("isHeadToHead", isHeadToHead({ maxPerMatch: 2 }) && !isHeadToHead({ maxPerMatch: 8 }) && !isHeadToHead({ maxPerMatch: null }));
ok("solo games count players, team games teams", entryWord({ teamSizeMax: 1 }) === "players" && entryWord({ teamSizeMax: 4 }) === "teams" && entryWord({ teamSizeMax: 4 }, 1) === "team");
ok("TFT warning counts players", (roomSizeWarning({ name: "Teamfight Tactics", maxPerMatch: 8, teamSizeMax: 1 }, 16) ?? "").includes("8 players"));

// admin input
const good = cleanGameInput({ maxPerMatch: "25", matchLimitNote: " 100 players " }, "update");
ok("admin: a number string is accepted and trimmed", good.ok && good.data.maxPerMatch === 25 && good.data.matchLimitNote === "100 players");
ok("admin: empty clears the limit", (() => { const r = cleanGameInput({ maxPerMatch: "" }, "update"); return r.ok && r.data.maxPerMatch === null; })());
ok("admin: null clears the limit", (() => { const r = cleanGameInput({ maxPerMatch: null }, "update"); return r.ok && r.data.maxPerMatch === null; })());
ok("admin: 0 is refused", !cleanGameInput({ maxPerMatch: 0 }, "update").ok);
ok("admin: a negative is refused", !cleanGameInput({ maxPerMatch: -3 }, "update").ok);
ok("admin: a fraction is refused", !cleanGameInput({ maxPerMatch: 2.5 }, "update").ok);
ok("admin: text is refused", !cleanGameInput({ maxPerMatch: "lots" }, "update").ok);
ok("admin: 1001 is refused", !cleanGameInput({ maxPerMatch: 1001 }, "update").ok);
ok("admin: a too long note is refused", !cleanGameInput({ matchLimitNote: "x".repeat(301) }, "update").ok);
ok("admin: not sending it leaves it alone", (() => { const r = cleanGameInput({ developer: "Krafton" }, "update"); return r.ok && !("maxPerMatch" in r.data); })());

// the migration SQL is exactly what the generator prints from the catalog
const sql = readFileSync("prisma/migrations/20261125000000_game_match_limits/migration.sql", "utf8");
ok("migration has an UPDATE for each of the 24 games", (sql.match(/^UPDATE "Game"/gm) ?? []).length === 24);
ok("migration only fills games that have no limit yet", (sql.match(/AND "maxPerMatch" IS NULL;/g) ?? []).length === 24);
ok("migration adds both columns", sql.includes('ADD COLUMN "maxPerMatch" INTEGER') && sql.includes('ADD COLUMN "matchLimitNote" TEXT'));

console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
