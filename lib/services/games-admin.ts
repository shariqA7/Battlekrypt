// Admin -> Games: add, edit, show/hide and delete games, with their pictures.
// Every change is written to AdminActionLog. The rules about what is allowed are in
// lib/game-details.ts (pure); this file talks to the database and to storage.
import { prisma } from "@/lib/prisma";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  GAME_BUCKET, gameImagePath, gameSlugBase, isSeededGameName, pickUniqueSlug, removedImages,
  type GameDetails,
} from "@/lib/game-details";

export type AdminGameRow = {
  id: string;
  name: string;
  slug: string | null;
  genre: string | null;
  coverImageUrl: string | null;
  platforms: string[];
  isApproved: boolean;
  isFeatured: boolean;
  sortOrder: number;
  tournaments: number;
  seeded: boolean;
};

export type AdminGameDetail = AdminGameRow & {
  shortDescription: string | null;
  description: string | null;
  images: string[];
  developer: string | null;
  websiteUrl: string | null;
  usage: { tournaments: number; challenges: number; rosters: number; teams: number; invites: number; templates: number; ratings: number; requests: number };
};

const log = (adminId: string, action: string, gameId: string, notes: string) =>
  prisma.adminActionLog.create({ data: { adminId, action, targetType: "Game", targetId: gameId, notes } });

/** The first free public address for a game with this name. */
export async function uniqueGameSlug(name: string): Promise<string> {
  const base = gameSlugBase(name);
  const rows = await prisma.game.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
  return pickUniqueSlug(base, new Set(rows.flatMap((r) => (r.slug ? [r.slug] : []))));
}

export async function listGamesForAdmin(): Promise<AdminGameRow[]> {
  const games = await prisma.game.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true, name: true, slug: true, genre: true, coverImageUrl: true, platforms: true,
      isApproved: true, isFeatured: true, sortOrder: true,
      _count: { select: { tournaments: true } },
    },
  });
  return games.map(({ _count, ...g }) => ({ ...g, tournaments: _count.tournaments, seeded: isSeededGameName(g.name) }));
}

export async function getGameForAdmin(id: string): Promise<AdminGameDetail | null> {
  const g = await prisma.game.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          tournaments: true, challenges: true, clubRosters: true, clubTeams: true, clubInvites: true,
          templates: true, playerRatings: true, gameRequests: true,
        },
      },
    },
  });
  if (!g) return null;
  return {
    id: g.id, name: g.name, slug: g.slug, genre: g.genre, coverImageUrl: g.coverImageUrl, platforms: g.platforms,
    isApproved: g.isApproved, isFeatured: g.isFeatured, sortOrder: g.sortOrder,
    tournaments: g._count.tournaments, seeded: isSeededGameName(g.name),
    shortDescription: g.shortDescription, description: g.description, images: g.images,
    developer: g.developer, websiteUrl: g.websiteUrl,
    usage: {
      tournaments: g._count.tournaments, challenges: g._count.challenges, rosters: g._count.clubRosters,
      teams: g._count.clubTeams, invites: g._count.clubInvites, templates: g._count.templates,
      ratings: g._count.playerRatings, requests: g._count.gameRequests,
    },
  };
}

type GameError = "not_found" | "name_taken" | "name_locked" | "in_use" | "seeded";
const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/** Best effort: a picture that can't be removed from storage is only an orphan, never a failure. */
async function removeFromStorage(urls: string[]) {
  const paths = urls.flatMap((u) => { const p = gameImagePath(u); return p ? [p] : []; });
  if (paths.length === 0) return;
  try {
    await createServiceClient().storage.from(GAME_BUCKET).remove(paths);
  } catch {
    /* ignore */
  }
}

export async function createGame(adminId: string, details: Partial<GameDetails> & { name: string }): Promise<{ error: GameError } | { ok: true; id: string }> {
  const clash = await prisma.game.findFirst({ where: { name: { equals: details.name, mode: "insensitive" } }, select: { id: true } });
  if (clash) return { error: "name_taken" };
  try {
    const game = await prisma.game.create({
      data: { ...details, slug: await uniqueGameSlug(details.name) },
      select: { id: true },
    });
    await log(adminId, "game_created", game.id, details.name);
    return { ok: true, id: game.id };
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "name_taken" };
    throw e;
  }
}

export async function updateGame(adminId: string, id: string, patch: Partial<GameDetails>): Promise<{ error: GameError } | { ok: true }> {
  const before = await prisma.game.findUnique({ where: { id }, select: { name: true, coverImageUrl: true, images: true } });
  if (!before) return { error: "not_found" };

  if (patch.name !== undefined && patch.name !== before.name) {
    if (isSeededGameName(before.name)) return { error: "name_locked" };
    const clash = await prisma.game.findFirst({ where: { name: { equals: patch.name, mode: "insensitive" }, NOT: { id } }, select: { id: true } });
    if (clash) return { error: "name_taken" };
  }

  try {
    await prisma.game.update({ where: { id }, data: patch });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "name_taken" };
    throw e;
  }

  const changed = Object.keys(patch).join(", ") || "nothing";
  await log(adminId, "game_updated", id, `${before.name}: ${changed}`);

  // Pictures taken off the game are deleted from storage (after the save, so a failed save keeps them).
  if (patch.coverImageUrl !== undefined || patch.images !== undefined) {
    await removeFromStorage(
      removedImages(before, {
        coverImageUrl: patch.coverImageUrl !== undefined ? patch.coverImageUrl : before.coverImageUrl,
        images: patch.images ?? before.images,
      }),
    );
  }
  return { ok: true };
}

/**
 * Super admin only (the route checks). Refused while anything points at the game, and for games
 * the seed creates: those would simply come back, so they are hidden instead.
 */
export async function deleteGame(adminId: string, id: string): Promise<{ error: GameError } | { ok: true }> {
  const game = await getGameForAdmin(id);
  if (!game) return { error: "not_found" };
  if (game.seeded) return { error: "seeded" };
  if (Object.values(game.usage).some((n) => n > 0)) return { error: "in_use" };

  const pictures = [...(game.coverImageUrl ? [game.coverImageUrl] : []), ...game.images];
  await prisma.game.delete({ where: { id } });
  await log(adminId, "game_deleted", id, game.name);
  await removeFromStorage(pictures);
  return { ok: true };
}
