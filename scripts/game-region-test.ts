// Pure checks for regional game visibility (no database). Run: npx tsx scripts/game-region-test.ts
import { readFileSync } from "node:fs";
import { GAME_CATALOG } from "../lib/game-catalog";
import { ALL_BLOCKED_RULES as BLOCKED_RULES, ALL_LOCAL_VERSIONS as LOCAL_VERSIONS, EAST_ASIA_BLOCKED, EAST_ASIA_LOCAL, LOCAL_VERSIONS as INDIA_LOCAL, BLOCKED_RULES as INDIA_BLOCKED } from "../lib/game-regions";
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
ok("India: still sees Honor of Kings (launched there March 2026) and every game that isn't limited to another country or banned in India", india.includes("Honor of Kings") && games.filter((g) => (g.onlyInCountries ?? []).length === 0 && !(g.blockedInCountries ?? []).includes("IN")).every((g) => india.includes(g.name)));
ok("India: sees none of the East Asian local versions", ["Game for Peace", "PUBG Mobile KRJP", "PUBG Mobile VN", "PUBG Mobile TW", "Arena of Valor"].every((n) => !india.includes(n)));
for (const c of ["PK", "US", "AE", "SA"]) {
  const s = seen(c);
  ok(`${c}: sees the global versions and none of the Indian ones`, GLOBAL3.every((n) => s.includes(n)) && LOCAL3.every((n) => !s.includes(n)));
}
const unknown = seen(null);
ok("unknown country: global versions yes, local versions never", GLOBAL3.every((n) => unknown.includes(n)) && LOCAL3.every((n) => !unknown.includes(n)));
ok("Honor of Kings is visible everywhere except Thailand, Vietnam and Taiwan", ["IN", "PK", "US", "CN", "KR", "JP", null].every((c) => seen(c as string | null).includes("Honor of Kings")) && ["TH", "VN", "TW"].every((c) => !seen(c).includes("Honor of Kings")));
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
ok("admin grouping: India lists its three local versions", groups.find((x) => x.code === "IN")?.games.map((g) => g.name).join() === "BGMI,Free Fire MAX,Moba Legends: 5v5!");
ok("admin grouping: one group per country with a local version, in name order", groups.map((x) => x.label).join("|") === "China|India|Japan|South Korea|Taiwan|Thailand|Vietnam");
ok("admin grouping: Arena of Valor appears under each of Thailand, Vietnam and Taiwan", ["TH", "VN", "TW"].every((c) => groups.find((x) => x.code === c)!.games.some((g) => g.name === "Arena of Valor")));

// ---- data consistency
ok("every local version stands in for a game that is blocked in the same countries", LOCAL_VERSIONS.every((v) => { const r = BLOCKED_RULES.find((b) => b.name === v.localVersionOf); return !!r && v.onlyIn.every((c) => r.blockedIn.includes(c)); }));
ok("every country a game is blocked in has a local version of it there", BLOCKED_RULES.every((r) => r.blockedIn.every((c) => LOCAL_VERSIONS.some((v) => v.localVersionOf === r.name && v.onlyIn.includes(c)))));
ok("Honor of Kings is blocked only where Arena of Valor replaces it (TH, VN, TW), and India, where it launched, is not among them", [...BLOCKED_RULES.find((r) => r.name === "Honor of Kings")!.blockedIn].sort().join() === "TH,TW,VN" && !BLOCKED_RULES.find((r) => r.name === "Honor of Kings")!.blockedIn.includes("IN"));
ok("new local game names don't clash with the catalog", LOCAL_VERSIONS.filter((v) => !v.existing).every((v) => !GAME_CATALOG.some((g) => g.name === v.name)));
ok("local versions use the same rules as the game they replace", LOCAL_VERSIONS.every((v) => { const g = GAME_CATALOG.find((x) => x.name === v.localVersionOf)!; return g.teamSizeMax === v.teamSizeMax && g.maxSubstitutes === v.maxSubstitutes && g.genre === v.genre; }));

// ---- the migration
const sql = readFileSync("prisma/migrations/20261020010000_game_regions/migration.sql", "utf8");
ok("migration never deletes or drops anything", !/\b(DELETE|DROP|TRUNCATE)\b/i.test(sql));
ok("migration only adds missing games (ON CONFLICT DO NOTHING) and updates empty columns", (sql.match(/INSERT INTO "Game"/g) ?? []).length === 2 && (sql.match(/ON CONFLICT \("name"\) DO NOTHING/g) ?? []).length === 2 && (sql.match(/cardinality\("(blockedInCountries|onlyInCountries)"\) = 0;/g) ?? []).length === 4);
const sets = [...sql.matchAll(/UPDATE "Game" SET (.*?) WHERE /g)].map((m) => m[1]);
ok("updates never touch a name, platform category or approval", sets.length === 4 && sets.every((s) => !/"(name|category|id|isApproved)"\s*=/.test(s)));

// ---- East and Southeast Asia
const sees = (c: string, names: string[]) => names.every((n) => seen(c).includes(n));
const hides = (c: string, names: string[]) => names.every((n) => !seen(c).includes(n));
ok("China: Game for Peace instead of PUBG Mobile", sees("CN", ["Game for Peace"]) && hides("CN", ["PUBG Mobile", "BGMI", "PUBG Mobile KRJP", "PUBG Mobile VN", "PUBG Mobile TW", "Arena of Valor"]));
ok("South Korea and Japan: PUBG Mobile KRJP instead of PUBG Mobile", ["KR", "JP"].every((c) => sees(c, ["PUBG Mobile KRJP"]) && hides(c, ["PUBG Mobile", "Game for Peace", "PUBG Mobile VN"])));
ok("Vietnam: PUBG Mobile VN and Arena of Valor instead of PUBG Mobile and Honor of Kings", sees("VN", ["PUBG Mobile VN", "Arena of Valor"]) && hides("VN", ["PUBG Mobile", "Honor of Kings", "PUBG Mobile TW"]));
ok("Taiwan: PUBG Mobile TW and Arena of Valor instead of PUBG Mobile and Honor of Kings", sees("TW", ["PUBG Mobile TW", "Arena of Valor"]) && hides("TW", ["PUBG Mobile", "Honor of Kings", "PUBG Mobile VN"]));
ok("Thailand: Arena of Valor instead of Honor of Kings, and PUBG Mobile is unchanged", sees("TH", ["Arena of Valor", "PUBG Mobile"]) && hides("TH", ["Honor of Kings"]));
ok("Pakistan and the US never see any East Asian local version", ["PK", "US"].every((c) => hides(c, ["Game for Peace", "PUBG Mobile KRJP", "PUBG Mobile VN", "PUBG Mobile TW", "Arena of Valor"])));
ok("an unknown visitor sees global PUBG Mobile and Honor of Kings and no local version", sees(null as unknown as string, []) && seen(null).includes("PUBG Mobile") && seen(null).includes("Honor of Kings") && hides(null as unknown as string, ["Game for Peace", "Arena of Valor"]));
ok("PUBG Mobile is hidden in exactly India, China, Korea, Japan, Vietnam and Taiwan", [...BLOCKED_RULES.find((r) => r.name === "PUBG Mobile")!.blockedIn].sort().join() === "CN,IN,JP,KR,TW,VN");
ok("the India rules are unchanged by the East Asia additions", INDIA_BLOCKED.length === 3 && INDIA_LOCAL.length === 3 && EAST_ASIA_LOCAL.length === 5 && EAST_ASIA_BLOCKED.length === 2);

const sql2 = readFileSync("prisma/migrations/20261021010000_east_asia_game_regions/migration.sql", "utf8");
ok("East Asia migration adds each new local version once, never overwriting a game", EAST_ASIA_LOCAL.every((v) => sql2.split(`'${v.name}'`).length - 1 === 1) && (sql2.match(/INSERT INTO "Game"/g) ?? []).length === 5 && (sql2.match(/ON CONFLICT \("name"\) DO NOTHING/g) ?? []).length === 5);
ok("East Asia migration never deletes or drops, and only ever adds countries to a blocked list", !/\b(DELETE|DROP|TRUNCATE)\b/i.test(sql2) && [...sql2.matchAll(/UPDATE "Game" SET (.*?) WHERE /g)].every((m) => /^"blockedInCountries" = ARRAY\(SELECT DISTINCT c FROM unnest\("blockedInCountries" \|\|/.test(m[1])));
ok("migration files contain no tool output", !/npm notice|npm warn/i.test(sql2) && !/npm notice|npm warn/i.test(sql));

process.exit(fails ? 1 : 0);
