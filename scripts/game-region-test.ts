// Pure checks for regional game visibility (no database). Run: npx tsx scripts/game-region-test.ts
import { readFileSync } from "node:fs";
import { GAME_CATALOG } from "../lib/game-catalog";
import { BLOCKED_RULES, LOCAL_VERSIONS } from "../lib/game-regions";
import { gameVisibilityWhere, isGameVisibleIn, pickViewerCountry, regionalGroups, toCountryCode, type RegionalGame } from "../lib/game-region";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

// ---- country detection
ok("country codes and names are understood", toCountryCode("IN") === "IN" && toCountryCode("india") === "IN" && toCountryCode(" India ") === "IN" && toCountryCode("Pakistan") === "PK");
ok("junk, empty and unknown give null", toCountryCode("") === null && toCountryCode(null) === null && toCountryCode("Narnia") === null);
ok("profile country wins over organization over request", pickViewerCountry({ profileCountry: "India", organizerCountry: "Pakistan", requestCountry: "US" }) === "IN" && pickViewerCountry({ organizerCountry: "Pakistan", requestCountry: "US" }) === "PK" && pickViewerCountry({ requestCountry: "US" }) === "US");
ok("an unreadable profile country falls back to where the request came from", pickViewerCountry({ profileCountry: "Bharat", requestCountry: "IN" }) === "IN");
ok("nothing known -> null", pickViewerCountry({}) === null);

// ---- who sees what. The whole game set, as it will be in the database.
type G = RegionalGame & { name: string };
const games: G[] = [
  ...GAME_CATALOG.map((g) => ({ name: g.name, onlyInCountries: [] as string[], blockedInCountries: [] as string[] })),
  { name: "BGMI", onlyInCountries: [], blockedInCountries: [] },
];
for (const r of BLOCKED_RULES) games.find((g) => g.name === r.name)!.blockedInCountries = r.blockedIn;
for (const v of LOCAL_VERSIONS) {
  const ex = games.find((g) => g.name === v.name);
  if (ex) ex.onlyInCountries = v.onlyIn; else games.push({ name: v.name, onlyInCountries: v.onlyIn, blockedInCountries: [] });
}
const seen = (country: string | null) => games.filter((g) => isGameVisibleIn(g, country)).map((g) => g.name);
const GLOBAL3 = ["Mobile Legends: Bang Bang", "Free Fire", "PUBG Mobile"];
const LOCAL3 = ["Moba Legends: 5v5!", "Free Fire MAX", "BGMI"];

const india = seen("IN");
ok("India: sees the three local versions", LOCAL3.every((n) => india.includes(n)));
ok("India: does not see the three banned global versions", GLOBAL3.every((n) => !india.includes(n)));
ok("India: still sees Honor of Kings (launched there March 2026) and every other game", india.includes("Honor of Kings") && games.length - GLOBAL3.length === india.length);
for (const c of ["PK", "US", "AE", "SA", "CN"]) {
  const s = seen(c);
  ok(`${c}: sees the global versions and none of the Indian ones`, GLOBAL3.every((n) => s.includes(n)) && LOCAL3.every((n) => !s.includes(n)));
}
const unknown = seen(null);
ok("unknown country: global versions yes, local versions never", GLOBAL3.every((n) => unknown.includes(n)) && LOCAL3.every((n) => !unknown.includes(n)));
ok("Honor of Kings is visible everywhere", ["IN", "PK", "US", null].every((c) => seen(c as string | null).includes("Honor of Kings")));
ok("an Indian visitor and a Pakistani visitor never see the same swap twice", india.filter((n) => GLOBAL3.includes(n) || LOCAL3.includes(n)).length === 3 && seen("PK").filter((n) => GLOBAL3.includes(n) || LOCAL3.includes(n)).length === 3);

// ---- the database filter must agree with the pure rule for every game and country
type Where = { AND?: Where[]; OR?: Where[]; NOT?: Where; onlyInCountries?: { isEmpty?: boolean; has?: string }; blockedInCountries?: { has?: string } };
function matches(w: Where, g: RegionalGame): boolean {
  if (w.AND && !w.AND.every((x) => matches(x, g))) return false;
  if (w.OR && !w.OR.some((x) => matches(x, g))) return false;
  if (w.NOT && matches(w.NOT, g)) return false;
  if (w.onlyInCountries?.isEmpty !== undefined && ((g.onlyInCountries ?? []).length === 0) !== w.onlyInCountries.isEmpty) return false;
  if (w.onlyInCountries?.has !== undefined && !(g.onlyInCountries ?? []).includes(w.onlyInCountries.has)) return false;
  if (w.blockedInCountries?.has !== undefined && !(g.blockedInCountries ?? []).includes(w.blockedInCountries.has)) return false;
  return true;
}
for (const c of ["IN", "PK", "US", "CN", null]) {
  const w = gameVisibilityWhere(c as string | null) as Where;
  ok(`database filter for ${c ?? "unknown"} gives the same games as the rule`, games.every((g) => matches(w, g) === isGameVisibleIn(g, c as string | null)));
}

// ---- admin grouping
const groups = regionalGroups(games);
ok("admin grouping: one group, India, with the three local versions", groups.length === 1 && groups[0].code === "IN" && groups[0].label === "India" && groups[0].games.map((g) => g.name).join() === "BGMI,Free Fire MAX,Moba Legends: 5v5!");

// ---- data consistency
ok("every local version stands in for a game that is blocked in the same countries", LOCAL_VERSIONS.every((v) => { const r = BLOCKED_RULES.find((b) => b.name === v.localVersionOf); return !!r && v.onlyIn.every((c) => r.blockedIn.includes(c)); }));
ok("every blocked game has a local version in that country", BLOCKED_RULES.every((r) => LOCAL_VERSIONS.some((v) => v.localVersionOf === r.name)));
ok("Honor of Kings is not restricted anywhere", !BLOCKED_RULES.some((r) => r.name === "Honor of Kings") && !LOCAL_VERSIONS.some((v) => v.name.includes("Honor of Kings")));
ok("new local game names don't clash with the catalog", LOCAL_VERSIONS.filter((v) => !v.existing).every((v) => !GAME_CATALOG.some((g) => g.name === v.name)));
ok("local versions use the same rules as the game they replace", LOCAL_VERSIONS.every((v) => { const g = GAME_CATALOG.find((x) => x.name === v.localVersionOf)!; return g.teamSizeMax === v.teamSizeMax && g.maxSubstitutes === v.maxSubstitutes && g.genre === v.genre; }));

// ---- the migration
const sql = readFileSync("prisma/migrations/20261020010000_game_regions/migration.sql", "utf8");
ok("migration never deletes or drops anything", !/\b(DELETE|DROP|TRUNCATE)\b/i.test(sql));
ok("migration only adds missing games (ON CONFLICT DO NOTHING) and updates empty columns", (sql.match(/INSERT INTO "Game"/g) ?? []).length === 2 && (sql.match(/ON CONFLICT \("name"\) DO NOTHING/g) ?? []).length === 2 && (sql.match(/cardinality\("(blockedInCountries|onlyInCountries)"\) = 0;/g) ?? []).length === 4);
const sets = [...sql.matchAll(/UPDATE "Game" SET (.*?) WHERE /g)].map((m) => m[1]);
ok("updates never touch a name, platform category or approval", sets.length === 4 && sets.every((s) => !/"(name|category|id|isApproved)"\s*=/.test(s)));

process.exit(fails ? 1 : 0);
