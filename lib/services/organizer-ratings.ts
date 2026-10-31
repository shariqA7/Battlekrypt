// Player ratings of organizers.
//
// A player who took part in a COMPLETED event (an approved entry, solo or as a team member)
// can rate its organizer from 1 to 5 stars, once per event, and change it later. A low rating
// (1 or 2 stars) needs a few words, so an admin can see what went wrong. The organizer and its
// team can't rate themselves. An admin can hide a rating (abuse, wrong event); hidden ratings
// don't count in the average, and the player can't bring one back by editing it.
import { prisma } from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/services/feature-flags";

export const MAX_RATING_COMMENT = 500;
export const MIN_LOW_RATING_COMMENT = 10;
export const RATINGS_PER_DAY = 20;
const DAY_MS = 86_400_000;

export type RatingError =
  | { error: "feature_off" | "not_found" | "forbidden" | "rate_limited" }
  | { error: "validation_error"; message: string };

// Can this person rate this event? Returns what the form shows, or null.
export async function canRateTournament(userId: string, tournamentId: string) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      name: true,
      status: true,
      organizer: { select: { userId: true, orgName: true, members: { where: { userId: { not: null } }, select: { userId: true } } } },
    },
  });
  if (!t || t.status !== "completed") return null;
  if (t.organizer.userId === userId || t.organizer.members.some((m) => m.userId === userId)) return null;
  const took = await prisma.registration.count({
    where: {
      tournamentId,
      status: "approved",
      OR: [{ player: { userId } }, { teamEntry: { members: { some: { player: { userId } } } } }],
    },
  });
  if (took === 0) return null;
  const existing = await prisma.organizerRating.findUnique({
    where: { tournamentId_raterUserId: { tournamentId, raterUserId: userId } },
    select: { stars: true, comment: true },
  });
  return { tournamentName: t.name, organizerName: t.organizer.orgName, existing };
}

export async function rateOrganizer(input: { userId: string; tournamentId: string; stars: unknown; comment: unknown }): Promise<RatingError | { data: { id: string; stars: number }; updated: boolean }> {
  if (!(await getFeatureFlags()).organizerRatings) return { error: "feature_off" };
  const stars = typeof input.stars === "number" ? input.stars : Number(input.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: "validation_error", message: "Choose 1 to 5 stars." };
  const comment = typeof input.comment === "string" ? input.comment.trim() : "";
  if (comment.length > MAX_RATING_COMMENT) return { error: "validation_error", message: `Keep the comment under ${MAX_RATING_COMMENT} characters.` };
  if (stars <= 2 && comment.length < MIN_LOW_RATING_COMMENT) {
    return { error: "validation_error", message: "Tell us briefly what went wrong (at least 10 characters) when you give 1 or 2 stars." };
  }

  const t = await prisma.tournament.findUnique({ where: { id: input.tournamentId }, select: { organizerId: true } });
  if (!t) return { error: "not_found" };
  if (!(await canRateTournament(input.userId, input.tournamentId))) return { error: "forbidden" };

  const recent = await prisma.organizerRating.count({ where: { raterUserId: input.userId, updatedAt: { gte: new Date(Date.now() - DAY_MS) } } });
  if (recent >= RATINGS_PER_DAY) return { error: "rate_limited" };

  const key = { tournamentId_raterUserId: { tournamentId: input.tournamentId, raterUserId: input.userId } };
  const before = await prisma.organizerRating.findUnique({ where: key, select: { id: true } });
  // Editing never touches the hidden fields: a hidden rating stays hidden.
  const row = await prisma.organizerRating.upsert({
    where: key,
    update: { stars, comment: comment || null },
    create: { organizerId: t.organizerId, tournamentId: input.tournamentId, raterUserId: input.userId, stars, comment: comment || null },
    select: { id: true, stars: true },
  });
  return { data: row, updated: before !== null };
}

export async function listMyRatings(userId: string) {
  const rows = await prisma.organizerRating.findMany({ where: { raterUserId: userId }, select: { tournamentId: true, stars: true } });
  return new Map(rows.map((r) => [r.tournamentId, r.stars]));
}

// What an admin sees about an organizer: the average (hidden ones left out), how the stars are
// spread, and the latest ratings with their comments (hidden ones included, marked).
export async function getRatingSummary(organizerId: string, recent = 8) {
  const [groups, rows] = await Promise.all([
    prisma.organizerRating.groupBy({ by: ["stars"], where: { organizerId, hiddenAt: null }, _count: true }),
    prisma.organizerRating.findMany({
      where: { organizerId },
      orderBy: { createdAt: "desc" },
      take: recent,
      select: { id: true, stars: true, comment: true, hiddenAt: true, hiddenReason: true, createdAt: true, raterUserId: true, tournament: { select: { name: true } } },
    }),
  ]);
  const distribution = [1, 2, 3, 4, 5].map((s) => ({ stars: s, count: groups.find((g) => g.stars === s)?._count ?? 0 }));
  const count = distribution.reduce((n, d) => n + d.count, 0);
  const sum = distribution.reduce((n, d) => n + d.stars * d.count, 0);
  const raters = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.raterUserId) } }, select: { id: true, displayName: true } });
  const name = new Map(raters.map((u) => [u.id, u.displayName]));
  return {
    count,
    average: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
    distribution,
    hiddenCount: await prisma.organizerRating.count({ where: { organizerId, hiddenAt: { not: null } } }),
    recent: rows.map((r) => ({
      id: r.id,
      stars: r.stars,
      comment: r.comment,
      hidden: r.hiddenAt !== null,
      hiddenReason: r.hiddenReason,
      tournament: r.tournament.name,
      rater: name.get(r.raterUserId) ?? "A player",
      at: r.createdAt.toISOString(),
    })),
  };
}

export async function setRatingHidden(input: { adminId: string; ratingId: string; hidden: boolean; reason?: string }) {
  const reason = input.reason?.trim() ?? "";
  if (input.hidden && reason.length < 3) return { error: "validation_error" as const, message: "Say why you are hiding it." };
  const r = await prisma.organizerRating.findUnique({ where: { id: input.ratingId }, select: { id: true, organizerId: true, hiddenAt: true } });
  if (!r) return { error: "not_found" as const };
  await prisma.$transaction([
    prisma.organizerRating.update({
      where: { id: r.id },
      data: input.hidden ? { hiddenAt: new Date(), hiddenById: input.adminId, hiddenReason: reason } : { hiddenAt: null, hiddenById: null, hiddenReason: null },
    }),
    prisma.adminActionLog.create({
      data: { adminId: input.adminId, action: input.hidden ? "hid_rating" : "unhid_rating", targetType: "OrganizerProfile", targetId: r.organizerId, notes: input.hidden ? reason : null },
    }),
  ]);
  return { data: { id: r.id, hidden: input.hidden } };
}
