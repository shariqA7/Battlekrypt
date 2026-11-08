// Admin -> Games on a real database: add, edit, rename, hide, delete and their guard rails.
// Needs a Postgres with all migrations applied (see phase8-1-test.ts).
import { prisma } from "../lib/prisma";
import { createGame, deleteGame, getGameForAdmin, listGamesForAdmin, uniqueGameSlug, updateGame } from "../lib/services/games-admin";
import { approveGameRequest } from "../lib/services/tournaments";
import { gameVisibilityWhere } from "../lib/game-region";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const code = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const idOf = (r: unknown) => (r as { id: string }).id;
const logs = (action: string, targetId: string) => prisma.adminActionLog.count({ where: { action, targetId } });
const SB = "https://abc.supabase.co/storage/v1/object/public/game-assets";

async function main() {
  await prisma.user.createMany({ data: ["adm", "org"].map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, isAdmin: u === "adm" })) });
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "Org" } });

  // ---- every game that existed before this feature got its own address (migration backfill)
  const all = await prisma.game.findMany({ select: { slug: true } });
  ok("every existing game has an address, all different", all.length > 0 && all.every((g) => !!g.slug) && new Set(all.map((g) => g.slug)).size === all.length);

  // ---- add a game
  const a = await createGame("adm", { name: "Star Brawl" });
  ok("a game is added", !code(a));
  const ga = await getGameForAdmin(idOf(a));
  ok("it gets an address from its name, is visible, and has no pictures yet", ga?.slug === "star-brawl" && ga.isApproved === true && ga.images.length === 0 && ga.coverImageUrl === null);
  ok("adding is written to the admin log", (await logs("game_created", idOf(a))) === 1);
  ok("the same name is refused, whatever the letter case", code(await createGame("adm", { name: "star brawl" })) === "name_taken" && code(await createGame("adm", { name: "STAR BRAWL" })) === "name_taken");
  const b = await createGame("adm", { name: "Star Brawl!" });
  ok("a different name that gives the same address gets -2", !code(b) && (await getGameForAdmin(idOf(b)))?.slug === "star-brawl-2");
  ok("uniqueGameSlug skips every taken address", (await uniqueGameSlug("Star Brawl")) === "star-brawl-3");

  // ---- edit
  const r1 = await updateGame("adm", idOf(a), {
    description: "A fast arena game.", developer: "Acme", platforms: ["pc", "mobile"], websiteUrl: "https://acme.example",
    coverImageUrl: `${SB}/covers/c.png`, images: [`${SB}/gallery/1.png`, `${SB}/gallery/2.png`], isFeatured: true, sortOrder: 2, genre: "MOBA",
  });
  const e1 = await getGameForAdmin(idOf(a));
  ok("details and pictures are saved, in order", !code(r1) && e1?.description === "A fast arena game." && e1.platforms.join() === "pc,mobile" && e1.images.join() === `${SB}/gallery/1.png,${SB}/gallery/2.png` && e1.coverImageUrl === `${SB}/covers/c.png` && e1.isFeatured && e1.sortOrder === 2 && e1.genre === "MOBA");
  ok("editing is written to the admin log", (await logs("game_updated", idOf(a))) === 1);
  ok("a partial edit leaves everything else alone", !code(await updateGame("adm", idOf(a), { description: "Changed." })) && (await getGameForAdmin(idOf(a)))?.developer === "Acme");
  ok("removing pictures saves even when storage can't be reached", !code(await updateGame("adm", idOf(a), { images: [`${SB}/gallery/2.png`], coverImageUrl: null })) && (await getGameForAdmin(idOf(a)))?.images.length === 1);
  ok("editing a game that doesn't exist says so", code(await updateGame("adm", "nope", { description: "x" })) === "not_found");

  // ---- rename: address stays, clashes refused
  ok("a game can be renamed", !code(await updateGame("adm", idOf(a), { name: "Star Brawl Arena" })));
  const renamed = await getGameForAdmin(idOf(a));
  ok("the address does NOT change when the name does (links keep working)", renamed?.name === "Star Brawl Arena" && renamed.slug === "star-brawl");
  ok("a rename onto another game's name is refused", code(await updateGame("adm", idOf(a), { name: "star brawl!" })) === "name_taken");
  ok("saving a game under its own name (different case) is fine", !code(await updateGame("adm", idOf(a), { name: "star brawl arena" })));

  // ---- built-in games: hide yes, rename no
  const valorant = await prisma.game.findUniqueOrThrow({ where: { name: "Valorant" } });
  ok("a built-in game can't be renamed", code(await updateGame("adm", valorant.id, { name: "Valorant 2" })) === "name_locked");
  ok("a built-in game can be hidden and described", !code(await updateGame("adm", valorant.id, { isApproved: false, description: "5v5 tactical shooter." })));
  ok("hiding a game removes it from what players see", (await prisma.game.findFirst({ where: { slug: valorant.slug!, isApproved: true, ...gameVisibilityWhere("PK") } })) === null);
  await updateGame("adm", valorant.id, { isApproved: true });
  ok("showing it again brings it back", (await prisma.game.findFirst({ where: { slug: valorant.slug!, isApproved: true, ...gameVisibilityWhere("PK") } }))?.id === valorant.id);
  ok("a built-in game can't be deleted (it would come back)", code(await deleteGame("adm", valorant.id)) === "seeded");

  // ---- list
  const list = await listGamesForAdmin();
  await updateGame("adm", idOf(b), { isApproved: false });
  ok("the admin list shows hidden games too", (await listGamesForAdmin()).some((g) => g.id === idOf(b) && !g.isApproved) && list.length > 20);
  ok("built-in games are marked", (await listGamesForAdmin()).find((g) => g.name === "Valorant")?.seeded === true);

  // ---- delete
  const lonely = await createGame("adm", { name: "Lonely Game" });
  ok("an unused game can be deleted", !code(await deleteGame("adm", idOf(lonely))) && (await prisma.game.findUnique({ where: { id: idOf(lonely) } })) === null);
  ok("deleting is written to the admin log", (await logs("game_deleted", idOf(lonely))) === 1);
  ok("deleting a game that is gone says so", code(await deleteGame("adm", idOf(lonely))) === "not_found");
  await prisma.tournament.create({ data: { slug: "t1", organizerId: org.id, gameId: idOf(a), name: "Event", type: "tournament", mode: "solo", maxTeams: 8, format: "single_elimination", entryType: "free", status: "completed" } });
  ok("a game with a tournament can't be deleted", code(await deleteGame("adm", idOf(a))) === "in_use");
  ok("…and it is still there", (await prisma.game.findUnique({ where: { id: idOf(a) } })) !== null);
  ok("usage is counted for the admin screen", (await getGameForAdmin(idOf(a)))?.usage.tournaments === 1 && (await listGamesForAdmin()).find((g) => g.id === idOf(a))?.tournaments === 1);

  // ---- approving a game request gives the new game an address
  const req = await prisma.gameRequest.create({ data: { organizerId: org.id, gameName: "Requested Game" } });
  const approved = await approveGameRequest(req.id, "adm");
  const made = await prisma.game.findUniqueOrThrow({ where: { name: "Requested Game" } });
  ok("an approved game request creates a game with an address", !("error" in approved && approved.error) && made.slug === "requested-game");
  ok("that game can't be deleted while its request points at it", code(await deleteGame("adm", made.id)) === "in_use");
}

main().then(() => { if (fails) console.log(`\n${fails} FAILED`); process.exit(fails ? 1 : 0); }).catch((e) => { console.error(e); process.exit(1); });
