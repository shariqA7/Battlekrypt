// Public ranking tables. Players are ranked per game AND per mode (ratings are stored per
// mode). Club rankings rank club TEAMS, because the team is the unit that carries a rating.
import type { TournamentMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ageOn } from "@/lib/age";
import { ADULT_AGE } from "@/lib/consent-config";

export const PAGE_SIZE = 25;
// A club team's rating starts at 1000 and only moves when it places in a tournament, so a
// team still at exactly 1000 is treated as "hasn't competed yet" and left off the table.
const UNPLAYED_CLUB_RATING = 1000;

// How many ranked players / club teams each game has, for the game picker.
export async function rankedCounts(gameIds: string[]) {
  const [players, teams] = await Promise.all([
    prisma.playerGameRating.groupBy({ by: ["gameId"], where: { gameId: { in: gameIds } }, _count: { _all: true } }),
    prisma.clubTeam.groupBy({
      by: ["gameId"],
      where: { gameId: { in: gameIds }, rating: { not: UNPLAYED_CLUB_RATING }, club: { status: "approved" } },
      _count: { _all: true },
    }),
  ]);
  return {
    players: new Map(players.map((r) => [r.gameId, r._count._all])),
    teams: new Map(teams.map((r) => [r.gameId, r._count._all])),
  };
}

export async function modesWithPlayers(gameId: string): Promise<TournamentMode[]> {
  const rows = await prisma.playerGameRating.groupBy({ by: ["mode"], where: { gameId } });
  return rows.map((r) => r.mode);
}

// Equal ratings share a rank (1, 2, 2, 4). A page that starts mid-way still gets the
// right rank, because the first row's rank is "how many are strictly higher, plus one".
export function assignRanks<T extends { rating: number }>(rows: T[], higherThanFirst: number) {
  let lastRating: number | null = null;
  let lastRank = 0;
  return rows.map((row, i) => {
    const rank = lastRating === row.rating ? lastRank : higherThanFirst + i + 1;
    lastRating = row.rating;
    lastRank = rank;
    return { ...row, rank };
  });
}

// Public name: the username. Without one, an adult shows their display name; a player
// under 18 is only ever "Player" so a child's real name never appears on a public table.
export function publicName(p: { username: string | null; birthDate: Date | null; user: { displayName: string } }) {
  if (p.username) return p.username;
  const minor = !!p.birthDate && ageOn(p.birthDate) < ADULT_AGE;
  return minor ? "Player" : p.user.displayName;
}

export async function getPlayerRanking(gameId: string, mode: TournamentMode, page: number) {
  const where = { gameId, mode };
  const [total, rows] = await Promise.all([
    prisma.playerGameRating.count({ where }),
    prisma.playerGameRating.findMany({
      where,
      orderBy: [{ rating: "desc" }, { updatedAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        player: { select: { username: true, birthDate: true, country: true, user: { select: { displayName: true } } } },
      },
    }),
  ]);
  const higher = rows.length ? await prisma.playerGameRating.count({ where: { ...where, rating: { gt: rows[0].rating } } }) : 0;
  const ranked = assignRanks(rows, higher).map((r) => ({
    id: r.id,
    rank: r.rank,
    name: publicName(r.player),
    country: r.player.country,
    rating: r.rating,
  }));
  return { total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), rows: ranked };
}

export async function getClubTeamRanking(gameId: string, page: number) {
  const where = { gameId, rating: { not: UNPLAYED_CLUB_RATING }, club: { status: "approved" as const } };
  const [total, rows] = await Promise.all([
    prisma.clubTeam.count({ where }),
    prisma.clubTeam.findMany({
      where,
      orderBy: [{ rating: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, name: true, rating: true, club: { select: { id: true, clubName: true } } },
    }),
  ]);
  const higher = rows.length ? await prisma.clubTeam.count({ where: { ...where, rating: { gt: rows[0].rating } } }) : 0;
  const ranked = assignRanks(rows, higher).map((r) => ({
    id: r.id,
    rank: r.rank,
    team: r.name,
    clubId: r.club.id,
    clubName: r.club.clubName,
    rating: r.rating,
  }));
  return { total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), rows: ranked };
}
