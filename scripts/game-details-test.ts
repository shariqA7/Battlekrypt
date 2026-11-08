// Pure checks for the Admin -> Games rules (no database). Run: npx tsx scripts/game-details-test.ts
import { readFileSync } from "node:fs";
import { GAME_CATALOG } from "../lib/game-catalog";
import { ALL_LOCAL_VERSIONS } from "../lib/game-regions";
import {
  GAME_LIMITS, cleanGameInput, gameImagePath, gameSlugBase, isGameImageUrl, isSeededGameName, pickUniqueSlug, removedImages,
} from "../lib/game-details";
import { groupByGenre } from "../lib/game-rules";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

const SB = "https://abc.supabase.co";
const img = (f: string) => `${SB}/storage/v1/object/public/game-assets/gallery/${f}`;
const bad = (r: ReturnType<typeof cleanGameInput>) => !r.ok;
const msg = (r: ReturnType<typeof cleanGameInput>) => (r.ok ? "" : r.message);

// ---- addresses
ok("slug: lower case, punctuation becomes one dash", gameSlugBase("PUBG: Battlegrounds") === "pubg-battlegrounds" && gameSlugBase("Moba Legends: 5v5!") === "moba-legends-5v5");
ok("slug: edges trimmed, runs collapsed", gameSlugBase("  --Dota   2-- ") === "dota-2");
ok("slug: nothing usable falls back to 'game'", gameSlugBase("!!!") === "game" && gameSlugBase("") === "game");
ok("slug: long names are cut at 60 with no trailing dash", gameSlugBase("a".repeat(59) + " b").length <= 60 && !gameSlugBase("a".repeat(59) + " b").endsWith("-"));
ok("every built-in game gets a different address", new Set(GAME_CATALOG.map((g) => gameSlugBase(g.name))).size === GAME_CATALOG.length);
ok("unique slug: free name is kept", pickUniqueSlug("valorant", new Set()) === "valorant");
ok("unique slug: a taken name gets -2, then -3", pickUniqueSlug("valorant", new Set(["valorant"])) === "valorant-2" && pickUniqueSlug("valorant", new Set(["valorant", "valorant-2"])) === "valorant-3");

// ---- built-in games
ok("catalog and local-version games are built-in; a made-up one is not", isSeededGameName("Valorant") && isSeededGameName("BGMI") && ALL_LOCAL_VERSIONS.every((g) => isSeededGameName(g.name)) && !isSeededGameName("My New Game"));

// ---- pictures
ok("a link into the game-assets bucket is accepted", isGameImageUrl(img("a.png"), SB));
ok("another bucket is refused", !isGameImageUrl(`${SB}/storage/v1/object/public/tournament-assets/x.png`, SB));
ok("another site is refused when our storage URL is known", !isGameImageUrl("https://evil.example/storage/v1/object/public/game-assets/x.png", SB));
ok("plain http, junk, empty and non-strings are refused", !isGameImageUrl(img("a.png").replace("https", "http"), SB) && !isGameImageUrl("nope", SB) && !isGameImageUrl("", SB) && !isGameImageUrl(5, SB) && !isGameImageUrl(null, SB));
ok("the bucket root without a file is refused", !isGameImageUrl(`${SB}/storage/v1/object/public/game-assets/`, SB));
ok("a path inside the bucket is recovered (and decoded)", gameImagePath(img("my%20pic.png")) === "gallery/my pic.png" && gameImagePath("https://x.com/other.png") === null);
ok("pictures taken off a game are listed for deletion, kept ones are not",
  JSON.stringify(removedImages({ coverImageUrl: img("c.png"), images: [img("1.png"), img("2.png")] }, { coverImageUrl: img("c.png"), images: [img("2.png"), img("3.png")] })) === JSON.stringify([img("1.png")]));
ok("a picture moved from cover to gallery is not deleted", removedImages({ coverImageUrl: img("c.png"), images: [] }, { coverImageUrl: null, images: [img("c.png")] }).length === 0);

// ---- input: create
const good = cleanGameInput({ name: "  My   New Game ", genre: "MOBA", platforms: ["mobile", "pc", "pc"], shortDescription: " Fast. ", description: "", developer: "Acme", websiteUrl: "https://acme.example", sortOrder: "3", isFeatured: true, isApproved: false, coverImageUrl: img("c.png"), images: [img("1.png"), img("1.png"), img("2.png")], rubbish: "x", isAdmin: true }, "create", SB);
ok("a valid game is accepted", good.ok);
if (good.ok) {
  const d = good.data as Record<string, unknown>;
  ok("name is trimmed and single-spaced", d.name === "My New Game");
  ok("platforms are de-duplicated in a fixed order", JSON.stringify(d.platforms) === '["pc","mobile"]');
  ok("empty text becomes null, text is trimmed", d.description === null && d.shortDescription === "Fast.");
  ok("sort order text becomes a number", d.sortOrder === 3);
  ok("gallery duplicates are dropped, order kept", JSON.stringify(d.images) === JSON.stringify([img("1.png"), img("2.png")]));
  ok("unknown fields are ignored (never trust the browser)", !("rubbish" in d) && !("isAdmin" in d));
  ok("visible / featured flags pass through", d.isFeatured === true && d.isApproved === false);
}
ok("create needs a name", bad(cleanGameInput({}, "create", SB)) && bad(cleanGameInput({ name: "   " }, "create", SB)));
ok("a name that is too long is refused", bad(cleanGameInput({ name: "x".repeat(GAME_LIMITS.name + 1) }, "create", SB)));
ok("body that is not an object is refused", bad(cleanGameInput(null, "create", SB)) && bad(cleanGameInput([], "create", SB)) && bad(cleanGameInput("x", "update", SB)));
ok("unknown genre refused, empty genre means none", bad(cleanGameInput({ name: "A", genre: "Cooking" }, "create", SB)) && cleanGameInput({ name: "A", genre: "" }, "create", SB).ok);
ok("unknown platform refused", bad(cleanGameInput({ name: "A", platforms: ["pc", "toaster"] }, "create", SB)) && bad(cleanGameInput({ name: "A", platforms: "pc" }, "create", SB)));
ok("website must be http(s)", bad(cleanGameInput({ name: "A", websiteUrl: "javascript:alert(1)" }, "create", SB)) && bad(cleanGameInput({ name: "A", websiteUrl: "acme.example" }, "create", SB)) && cleanGameInput({ name: "A", websiteUrl: "http://a.example" }, "create", SB).ok);
ok("descriptions over the limit are refused", bad(cleanGameInput({ name: "A", description: "x".repeat(GAME_LIMITS.description + 1) }, "create", SB)) && bad(cleanGameInput({ name: "A", shortDescription: "x".repeat(GAME_LIMITS.shortDescription + 1) }, "create", SB)));
ok("a cover or gallery picture from elsewhere is refused", bad(cleanGameInput({ name: "A", coverImageUrl: "https://evil.example/a.png" }, "create", SB)) && bad(cleanGameInput({ name: "A", images: ["https://evil.example/a.png"] }, "create", SB)));
ok("more than the maximum gallery pictures is refused", bad(cleanGameInput({ name: "A", images: Array.from({ length: GAME_LIMITS.maxImages + 1 }, (_, i) => img(`${i}.png`)) }, "create", SB)));
ok("sort order must be a whole number in range", [-1, 1.5, "abc", 10_000, null].every((v) => bad(cleanGameInput({ name: "A", sortOrder: v }, "create", SB))));
ok("flags must be true/false", bad(cleanGameInput({ name: "A", isFeatured: "yes" }, "create", SB)) && bad(cleanGameInput({ name: "A", isApproved: 1 }, "create", SB)));
ok("error messages are written for people", msg(cleanGameInput({}, "create", SB)) === "A game needs a name.");

// ---- input: update only keeps what was sent
const part = cleanGameInput({ isApproved: false }, "update", SB);
ok("update with one field changes only that field", part.ok && JSON.stringify(part.data) === '{"isApproved":false}');
ok("update may clear a picture", (() => { const r = cleanGameInput({ coverImageUrl: null, images: [] }, "update", SB); return r.ok && r.data.coverImageUrl === null && r.data.images?.length === 0; })());
ok("update does not demand a name, but refuses a blank one", cleanGameInput({ genre: "MOBA" }, "update", SB).ok && bad(cleanGameInput({ name: " " }, "update", SB)));

// ---- ordering on the public page
const g = (name: string, extra: object = {}) => ({ name, genre: "MOBA", ...extra });
const order = (games: ReturnType<typeof g>[]) => groupByGenre(games)[0].games.map((x) => x.name).join();
ok("no featured flag or order: A to Z, as before", order([g("Zeta"), g("Alpha"), g("Mid")]) === "Alpha,Mid,Zeta");
ok("featured games come first", order([g("Alpha"), g("Zeta", { isFeatured: true })]) === "Zeta,Alpha");
ok("then the order number, lower first, then A to Z", order([g("Alpha", { sortOrder: 5 }), g("Zeta", { sortOrder: 1 }), g("Beta", { sortOrder: 5 })]) === "Zeta,Alpha,Beta");

// ---- the migration
const sql = readFileSync("prisma/migrations/20261106100000_game_details/migration.sql", "utf8");
ok("migration only adds columns and an index (nothing dropped, deleted or reset)", !/\b(DROP|DELETE|TRUNCATE)\b/i.test(sql) && /ADD COLUMN "slug" TEXT/.test(sql) && /CREATE UNIQUE INDEX "Game_slug_key"/.test(sql));
ok("migration gives every existing game an address before the unique index", sql.indexOf('UPDATE "Game"') > -1 && sql.indexOf('UPDATE "Game"') < sql.indexOf("CREATE UNIQUE INDEX"));
ok("migration keeps new columns optional or defaulted (old rows and the request flow still work)", !/ADD COLUMN "[a-zA-Z]+" [A-Z\[\]]+ NOT NULL(?! DEFAULT)/.test(sql));

process.exit(fails ? 1 : 0);
