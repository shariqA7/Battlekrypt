// Team games (duo and squad) can only be entered through a club team. A single player can't join
// one alone: they need a club (free to create) with a team for that game, and the club owner or
// that team's captain enters the team. Solo games are unaffected.
//
// Pure rules (no database, no React). lib/services/team-entry.ts gathers the facts for a person.

export const requiresClubTeam = (mode: string | null | undefined) => mode === "duo" || mode === "squad";

export type TeamEntryFacts = {
  ownsClub: boolean;
  ownedClubApproved: boolean;
  /** Owner of an approved club that has a team for this game, or captain of such a team. */
  hasEligibleTeam: boolean;
  /** On the roster of a team that plays this game (but not its captain). */
  onTeamForGame: boolean;
  /** On any club's roster, for any game. */
  onClubRoster: boolean;
};

/**
 * ready             -> can enter a team right now
 * not_captain       -> on a team for this game, but only the owner or captain can enter it
 * no_team_for_game  -> has or belongs to a club, but there is no team for this game
 * club_pending      -> owns a club that isn't approved yet
 * no_club           -> no club at all: create one
 */
export type TeamEntryState = "ready" | "not_captain" | "no_team_for_game" | "club_pending" | "no_club";

export function teamEntryState(f: TeamEntryFacts): TeamEntryState {
  if (f.hasEligibleTeam) return "ready";
  if (f.onTeamForGame) return "not_captain";
  if (f.ownsClub) return f.ownedClubApproved ? "no_team_for_game" : "club_pending";
  if (f.onClubRoster) return "no_team_for_game";
  return "no_club";
}
