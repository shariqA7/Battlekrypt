// Rating-award engine (spec §9). Runs once, when a Tournament transitions
// in_progress -> completed (see updateTournamentStatus) — never for
// Leagues/Scrims, and never re-run automatically if a placement is
// corrected after completion (see awardTournamentRatings's doc comment).
import { prisma } from "@/lib/prisma";

// Retune here for now — not yet in the admin-configurable settings table
// the way tier thresholds are (see competitive-tiers.ts). Worth promoting
// there once there's real rating data to tune against.
const K_FACTOR = 32;
const RATING_FLOOR = 100; // never let a bad run send someone to 0 or negative

// Standard Elo expected-score curve: how likely `rating` is to "win"
// against a field averaging `fieldAvgRating`. This is the entire
// anti-gaming mechanism — an inflated tier label never enters this
// calculation, only the ratings of who actually showed up.
export function expectedScore(rating: number, fieldAvgRating: number): number {
  return 1 / (1 + 10 ** ((fieldAvgRating - rating) / 400));
}

// Placement spread linearly across the field: 1st = 1.0, last = 0.0. A
// single-participant "tournament" has nothing to compare against, so it's
// scored perfectly neutral (0.5) rather than a division by zero.
export function actualScoreFromPlacement(placement: number, fieldSize: number): number {
  if (fieldSize <= 1) return 0.5;
  return (fieldSize - placement) / (fieldSize - 1);
}

interface RatedParticipant {
  // Exactly one of these — an individual player's own rating, or a club
  // team's shared rating (see ClubTeam.rating).
  playerId?: string;
  clubTeamId?: string;
  rating: number;
  placement: number;
}

function computeNewRating(
  participant: RatedParticipant,
  fieldSize: number,
  fieldAvgRatingExcludingSelf: number
): number {
  const expected = expectedScore(participant.rating, fieldAvgRatingExcludingSelf);
  const actual = actualScoreFromPlacement(participant.placement, fieldSize);
  const delta = Math.round(K_FACTOR * (actual - expected));
  return Math.max(RATING_FLOOR, participant.rating + delta);
}

// The main entry point. Idempotency is NOT handled here — callers must
// only invoke this once per tournament (the in_progress -> completed
// transition is one-way, so in practice it only ever fires once).
export async function awardTournamentRatings(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return;
  // "Rating is earned from Tournaments only — not Leagues or Daily Scrims."
  if (tournament.type !== "tournament") return;

  const registrations = await prisma.registration.findMany({
    where: { tournamentId, status: "approved", placement: { not: null } },
    include: {
      teamEntry: { include: { members: true } },
    },
  });
  if (registrations.length === 0) return;

  // Build the list of rated units: one per club-team entry, one per
  // individual player otherwise (solo registration, or an ad-hoc
  // non-club squad — each member rated on their own).
  type Unit = { playerId?: string; clubTeamId?: string; placement: number };
  const units: Unit[] = [];
  for (const reg of registrations) {
    if (reg.teamEntry?.clubTeamId) {
      units.push({ clubTeamId: reg.teamEntry.clubTeamId, placement: reg.placement! });
    } else if (reg.teamEntry) {
      // Ad-hoc squad/duo — no persistent team identity, so each member's
      // own rating moves individually against the shared placement.
      for (const member of reg.teamEntry.members) {
        units.push({ playerId: member.playerId, placement: reg.placement! });
      }
    } else if (reg.playerId) {
      units.push({ playerId: reg.playerId, placement: reg.placement! });
    }
  }
  if (units.length === 0) return;

  // Load current ratings for every unit up front — the field average
  // below is computed from these, and every unit's rating change also
  // starts from these same pre-tournament values (all deltas apply
  // relative to who you were BEFORE this result, not compounding on each
  // other mid-calculation).
  const playerIds = [...new Set(units.filter((u) => u.playerId).map((u) => u.playerId!))];
  const clubTeamIds = [...new Set(units.filter((u) => u.clubTeamId).map((u) => u.clubTeamId!))];

  const [playerRatings, clubTeams] = await Promise.all([
    playerIds.length
      ? prisma.playerGameRating.findMany({
          where: { gameId: tournament.gameId, playerId: { in: playerIds } },
        })
      : Promise.resolve([]),
    clubTeamIds.length
      ? prisma.clubTeam.findMany({ where: { id: { in: clubTeamIds } } })
      : Promise.resolve([]),
  ]);
  const playerRatingMap = new Map(playerRatings.map((r) => [r.playerId, r.rating]));
  const clubTeamRatingMap = new Map(clubTeams.map((t) => [t.id, t.rating]));

  const rated: RatedParticipant[] = units.map((u) => ({
    ...u,
    rating: u.playerId
      ? playerRatingMap.get(u.playerId) ?? 1000 // unrated = fresh baseline
      : clubTeamRatingMap.get(u.clubTeamId!) ?? 1000,
  }));

  // Two different "field sizes": the placement score is about how many
  // ENTRIES competed (a 4-player squad is one entry, one placement), while the
  // average rating compares against every rated unit. Using the unit count for
  // the score made a last-place 4-player squad look like it finished well up
  // the field.
  const entryCount = registrations.length;
  const fieldSize = rated.length;
  const totalRating = rated.reduce((sum, u) => sum + u.rating, 0);

  // Apply all changes in one transaction — either every unit's rating
  // moves, or (on some failure) none does, so the field never ends up
  // half-updated.
  await prisma.$transaction(
    rated.map((unit) => {
      // Field average EXCLUDING this unit's own rating, so a single
      // dominant player doesn't drag down their own expected-score
      // baseline just by being rated highly.
      const fieldAvgExcludingSelf =
        fieldSize > 1 ? (totalRating - unit.rating) / (fieldSize - 1) : unit.rating;
      const newRating = computeNewRating(unit, entryCount, fieldAvgExcludingSelf);

      return unit.playerId
        ? prisma.playerGameRating.upsert({
            where: { playerId_gameId: { playerId: unit.playerId, gameId: tournament.gameId } },
            create: { playerId: unit.playerId, gameId: tournament.gameId, rating: newRating },
            update: { rating: newRating },
          })
        : prisma.clubTeam.update({
            where: { id: unit.clubTeamId! },
            data: { rating: newRating },
          });
    })
  );
}

// Spec §9: "Club ranking = aggregated per-game tournament points across its
// rostered teams." Computed on read (same pattern as Phase 4's organizer
// stats and National-tier eligibility) rather than a synced counter — a
// club can run several teams for the same game (see ClubTeam's
// clubId+gameId+name uniqueness), so this sums across all of them.
export async function getClubRankingForGame(clubId: string, gameId: string) {
  const teams = await prisma.clubTeam.findMany({
    where: { clubId, gameId },
    select: { id: true, name: true, rating: true },
  });
  return {
    totalRating: teams.reduce((sum, t) => sum + t.rating, 0),
    teams,
  };
}
