// Pure checks for the game catalog, its rules helpers and the migration SQL (no database).
// Run: npx tsx scripts/game-rules-test.ts
import { readFileSync } from "node:fs";
import { GAME_CATALOG, GENRES } from "../lib/game-catalog";
import { describeRules, gameRosterCap, groupByGenre, tournamentDefaults } from "../lib/game-rules";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

// The table the owner supplied, typed out separately so the catalog is checked against it:
// [name, genre, min active, max active, max subs, coach slot]
const OWNER: [string, string, number, number, number, boolean][] = [
  ["Valorant", "FPS / Shooters", 5, 5, 1, true], ["Counter-Strike 2", "FPS / Shooters", 5, 5, 1, true],
  ["Call of Duty: Warzone", "FPS / Shooters", 3, 3, 1, true], ["Call of Duty: Black Ops 7", "FPS / Shooters", 4, 4, 1, true],
  ["Overwatch 2", "FPS / Shooters", 5, 5, 2, true], ["Rainbow Six Siege X", "FPS / Shooters", 5, 5, 1, true], ["Crossfire", "FPS / Shooters", 5, 5, 1, true],
  ["Dota 2", "MOBA", 5, 5, 1, true], ["League of Legends", "MOBA", 5, 5, 2, true],
  ["Mobile Legends: Bang Bang", "MOBA", 5, 5, 2, true], ["Honor of Kings", "MOBA", 5, 5, 2, true],
  ["Apex Legends", "Battle Royale", 3, 3, 1, true], ["PUBG: Battlegrounds", "Battle Royale", 4, 4, 1, true],
  ["PUBG Mobile", "Battle Royale", 4, 4, 2, true], ["Free Fire", "Battle Royale", 4, 4, 2, true], ["Fortnite", "Battle Royale", 2, 2, 0, true],
  ["Tekken 8", "Fighting Games", 1, 1, 0, true], ["Street Fighter 6", "Fighting Games", 1, 1, 0, true], ["Fatal Fury: City of the Wolves", "Fighting Games", 1, 1, 0, true],
  ["EA Sports FC 26", "Sports / Racing", 1, 1, 0, true], ["Rocket League", "Sports / Racing", 3, 3, 1, true], ["Trackmania", "Sports / Racing", 1, 2, 1, true],
  ["Teamfight Tactics", "Strategy / Other", 1, 1, 0, true], ["Chess", "Strategy / Other", 1, 1, 0, false],
];

ok("24 games in the catalog", GAME_CATALOG.length === 24 && OWNER.length === 24);
ok("every game name is unique", new Set(GAME_CATALOG.map((x) => x.name)).size === 24);
ok("genre counts match the owner's list (7, 4, 5, 3, 3, 2)", GENRES.map((gn) => GAME_CATALOG.filter((x) => x.genre === gn).length).join() === "7,4,5,3,3,2");
for (const [name, genre, min, max, subs, coach] of OWNER) {
  const x = GAME_CATALOG.find((c) => c.name === name);
  ok(`${name}: ${genre}, ${min === max ? max : `${min}-${max}`} players, up to ${subs} sub(s), coach ${coach ? "yes" : "no"}`,
    !!x && x.genre === genre && x.teamSizeMin === min && x.teamSizeMax === max && x.maxSubstitutes === subs && x.allowsCoach === coach);
}
ok("only Chess has no coach slot", GAME_CATALOG.filter((x) => !x.allowsCoach).map((x) => x.name).join() === "Chess");
ok("formats: Tekken/SF/Fatal Fury/FC/Chess 1v1, TFT free-for-all, Trackmania both",
  ["Tekken 8", "Street Fighter 6", "Fatal Fury: City of the Wolves", "EA Sports FC 26", "Chess"].every((n) => GAME_CATALOG.find((x) => x.name === n)!.format === "one_on_one") &&
  GAME_CATALOG.find((x) => x.name === "Teamfight Tactics")!.format === "free_for_all" && GAME_CATALOG.find((x) => x.name === "Trackmania")!.format === "both");

// the five existing games must keep their platform label (the rule picker filters on it)
ok("existing mobile games are labelled mobile in the catalog", ["Free Fire", "PUBG Mobile", "Mobile Legends: Bang Bang"].every((n) => GAME_CATALOG.find((x) => x.name === n)!.category === "mobile"));
ok("existing pc games are labelled pc in the catalog", ["Valorant", "League of Legends"].every((n) => GAME_CATALOG.find((x) => x.name === n)!.category === "pc"));

// helper output
const byName = (n: string) => GAME_CATALOG.find((x) => x.name === n)!;
ok("describe: 5 players + 1 sub", describeRules(byName("Valorant")) === "5 players + 1 sub");
ok("describe: 4 players + 2 subs", describeRules(byName("PUBG Mobile")) === "4 players + 2 subs");
ok("describe: no subs -> just players", describeRules(byName("Fortnite")) === "2 players");
ok("describe: ranges, 1v1, free-for-all", describeRules(byName("Trackmania")) === "1-2 players + 1 sub" && describeRules(byName("Chess")) === "1v1" && describeRules(byName("Teamfight Tactics")) === "Solo, free-for-all");
ok("describe: a game with no rules shows nothing", describeRules({}) === null);
ok("tournament defaults: Valorant -> squad of 6 (5 + 1 sub)", JSON.stringify(tournamentDefaults(byName("Valorant"))) === '{"mode":"squad","maxTeamSize":6}');
ok("tournament defaults: Fortnite -> duo", tournamentDefaults(byName("Fortnite"))?.mode === "duo");
ok("tournament defaults: Warzone -> squad of 4", JSON.stringify(tournamentDefaults(byName("Call of Duty: Warzone"))) === '{"mode":"squad","maxTeamSize":4}');
ok("tournament defaults: 1v1, free-for-all and Trackmania -> solo", ["Tekken 8", "Teamfight Tactics", "Trackmania"].every((n) => tournamentDefaults(byName(n))?.mode === "solo"));
ok("tournament defaults: a game with no rules pre-fills nothing", tournamentDefaults({}) === null);
ok("roster caps: Valorant 5 players / 1 sub; Fortnite 0 subs; no rules -> no cap", gameRosterCap(byName("Valorant"), "player") === 5 && gameRosterCap(byName("Valorant"), "substitute") === 1 && gameRosterCap(byName("Fortnite"), "substitute") === 0 && gameRosterCap({}, "player") === null);

// grouping
const mixed = [{ name: "Zed", genre: null }, { name: "Valorant", genre: "FPS / Shooters" }, { name: "Chess", genre: "Strategy / Other" }, { name: "Dota 2", genre: "MOBA" }, { name: "BGMI", genre: null }];
const groups = groupByGenre(mixed);
ok("groups follow the genre order, ungrouped games go last", groups.map((x) => x.genre).join("|") === "FPS / Shooters|MOBA|Strategy / Other|Other games" && groups[3].games.map((x) => x.name).join() === "BGMI,Zed");

// the migration
const sql = readFileSync("prisma/migrations/20261020000000_game_rules/migration.sql", "utf8");
ok("migration adds every catalog game once", GAME_CATALOG.every((x) => sql.split(`'${x.name.replace(/'/g, "''")}'`).length - 1 === 2));
ok("migration only inserts with ON CONFLICT DO NOTHING (never overwrites a game)", (sql.match(/INSERT INTO "Game"/g) ?? []).length === 24 && (sql.match(/ON CONFLICT \("name"\) DO NOTHING/g) ?? []).length === 24);
const setClauses = [...sql.matchAll(/UPDATE "Game" SET (.*?) WHERE /g)].map((m) => m[1]);
ok("migration never deletes or drops anything", !/\b(DELETE|DROP|TRUNCATE)\b/i.test(sql));
ok("updates set only the new rule columns, never a name or platform category", setClauses.length === 24 && setClauses.every((c) => !/"(name|category|id|isApproved)"\s*=/.test(c)));
ok("updates only touch games whose rules are still empty", (sql.match(/AND "genre" IS NULL;/g) ?? []).length === 24);

process.exit(fails ? 1 : 0);
