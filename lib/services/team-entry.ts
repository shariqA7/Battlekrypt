// Where a person stands on entering a team game: which button the join page should show.
// See lib/team-entry.ts for the rule.
import { prisma } from "@/lib/prisma";
import { requiresClubTeam, teamEntryState, type TeamEntryState } from "@/lib/team-entry";

export type TeamEntryStatus =
  | { required: false }
  | { required: true; state: TeamEntryState; gameName: string; clubName: string | null; ownsClub: boolean };

export async function getTeamEntryStatus(userId: string, tournamentId: string): Promise<TeamEntryStatus | null> {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { mode: true, gameId: true, game: { select: { name: true } } } });
  if (!t) return null;
  if (!requiresClubTeam(t.mode)) return { required: false };

  const [club, rosters] = await Promise.all([
    prisma.clubProfile.findUnique({ where: { userId }, select: { id: true, clubName: true, status: true } }),
    prisma.clubRoster.findMany({ where: { player: { userId } }, select: { teamId: true, gameId: true, isCaptain: true, club: { select: { clubName: true } } } }),
  ]);
  const ownedApproved = club?.status === "approved";
  const ownedTeamsForGame = ownedApproved ? await prisma.clubTeam.count({ where: { clubId: club!.id, gameId: t.gameId } }) : 0;
  const forGame = rosters.filter((r) => r.teamId && r.gameId === t.gameId);

  const state = teamEntryState({
    ownsClub: !!club && club.status !== "disbanded",
    ownedClubApproved: ownedApproved,
    hasEligibleTeam: ownedTeamsForGame > 0 || forGame.some((r) => r.isCaptain),
    onTeamForGame: forGame.length > 0,
    onClubRoster: rosters.length > 0,
  });
  return { required: true, state, gameName: t.game.name, clubName: club?.clubName ?? rosters[0]?.club.clubName ?? null, ownsClub: !!club && club.status !== "disbanded" };
}
