// Pure checks for ranking modes, labels, ranks and public names (no database).
// Run: npx tsx scripts/rankings-test.ts
import { GAME_CATALOG } from "../lib/game-catalog";
import { defaultMode, isTeamVsTeam, mainMode, modeLabel, modeTabs, parseMode, parsePage } from "../lib/ranking-modes";
import { assignRanks, publicName } from "../lib/services/rankings";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fails++; };
const g = (name: string) => {
  const x = GAME_CATALOG.find((c) => c.name === name);
  if (!x) throw new Error(`game not in catalog: ${name}`);
  return x;
};

// ---- main mode from team size
ok("1-player game -> solo", mainMode({ teamSizeMax: 1 }) === "solo");
ok("2-player game -> duo", mainMode({ teamSizeMax: 2 }) === "duo");
ok("3+ players -> squad", mainMode({ teamSizeMax: 3 }) === "squad" && mainMode({ teamSizeMax: 5 }) === "squad");
ok("unknown size -> squad", mainMode({ teamSizeMax: null }) === "squad");

// ---- labels on the real catalog
const label = (name: string, mode: "solo" | "duo" | "squad") => modeLabel(g(name), mode);
ok("Valorant squad is 5v5", label("Valorant", "squad") === "5v5");
ok("Dota 2 squad is 5v5", label("Dota 2", "squad") === "5v5");
ok("Mobile Legends squad is 5v5", label("Mobile Legends: Bang Bang", "squad") === "5v5");
ok("Call of Duty: Black Ops 7 squad is 4v4", label("Call of Duty: Black Ops 7", "squad") === "4v4");
ok("PUBG Mobile squad is a Squad (battle royale)", label("PUBG Mobile", "squad") === "Squad");
ok("Free Fire squad is a Squad", label("Free Fire", "squad") === "Squad");
ok("Apex Legends squad is a Squad, not 3v3", label("Apex Legends", "squad") === "Squad");
ok("Warzone squad is a Squad, not 3v3", label("Call of Duty: Warzone", "squad") === "Squad");
ok("Rocket League squad is 3v3", label("Rocket League", "squad") === "3v3");
ok("battle royale solo/duo keep their names", label("PUBG Mobile", "solo") === "Solo" && label("PUBG Mobile", "duo") === "Duo");
ok("one-on-one games are 1v1", label("Chess", "solo") === "1v1" || label("Tekken 8", "solo") === "1v1");
ok("a battle royale is never NvN", !isTeamVsTeam(g("PUBG Mobile")) && !isTeamVsTeam(g("Free Fire")));

// ---- which tabs show
const bo7 = g("Call of Duty: Black Ops 7");
ok("only modes with rated players are offered", modeTabs(bo7, ["squad"]).map((t) => t.mode).join() === "squad");
ok("tab label is 4v4 for Black Ops 7", modeTabs(bo7, ["squad"])[0].label === "4v4");
ok("a battle royale offers solo, duo and squad in order", modeTabs(g("PUBG Mobile"), ["squad", "solo", "duo"]).map((t) => t.label).join() === "Solo,Duo,Squad");
ok("the tab order never changes", modeTabs(g("PUBG Mobile"), ["squad", "duo", "solo"]).map((t) => t.mode).join() === "solo,duo,squad");
ok("opens on the game's main mode", defaultMode(g("PUBG Mobile"), ["solo", "duo", "squad"]) === "squad");
ok("a 1v1 game opens on solo", defaultMode(g("Chess"), ["solo"]) === "solo");
ok("falls back to the first mode that has players", defaultMode(g("PUBG Mobile"), ["solo", "duo"]) === "solo");
ok("no rated players -> no default", defaultMode(g("PUBG Mobile"), []) === null);
ok("no rated players -> no tabs", modeTabs(bo7, []).length === 0);

// ---- query parsing
ok("mode param only accepts the three modes", parseMode("squad") === "squad" && parseMode("trio") === null && parseMode(null) === null);
ok("page param is clamped", parsePage("3") === 3 && parsePage("0") === 1 && parsePage("-4") === 1 && parsePage("abc") === 1 && parsePage("99999") === 1 && parsePage(undefined) === 1);

// ---- ranks: ties share a rank, pages keep the right start
const rows = [1500, 1400, 1400, 1300].map((rating) => ({ rating }));
ok("ties share a rank (1,2,2,4)", assignRanks(rows, 0).map((r) => r.rank).join() === "1,2,2,4");
ok("page 2 starts at the right rank", assignRanks([{ rating: 1200 }, { rating: 1100 }], 25).map((r) => r.rank).join() === "26,27");
ok("a tie across a page break keeps the rank", assignRanks([{ rating: 1400 }, { rating: 1300 }], 1).map((r) => r.rank).join() === "2,3");
ok("empty page is fine", assignRanks([], 0).length === 0);

// ---- public names: a child's real name never shows
const adult = new Date("1995-01-01");
const child = new Date(Date.now() - 14 * 365.25 * 86400000);
const u = { displayName: "Ahmed Khan" };
ok("username is used when there is one", publicName({ username: "ahmed_7", birthDate: child, user: u }) === "ahmed_7");
ok("an adult without a username shows their display name", publicName({ username: null, birthDate: adult, user: u }) === "Ahmed Khan");
ok("a minor without a username shows only 'Player'", publicName({ username: null, birthDate: child, user: u }) === "Player");
ok("no date of birth: treated as an adult (display name)", publicName({ username: null, birthDate: null, user: u }) === "Ahmed Khan");

console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
