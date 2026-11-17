// Team games (duo and squad) can only be entered through a club team. A single player can't join
// one alone: they need a club (free to create) with a team for that game. Then anyone in that club
// (the owner or any player on its roster) can enter the team. Solo games are unaffected.
//
// Pure rules (no database, no React). lib/services/team-entry.ts gathers the facts for a person.

export const requiresClubTeam = (mode: string | null | undefined) => mode === "duo" || mode === "squad";

export type TeamEntryFacts = {
  ownsClub: boolean;
  ownedClubApproved: boolean;
  /** An approved club they own or are on the roster of has a team for this game. */
  hasEligibleTeam: boolean;
  /** On any club's roster, for any game. */
  onClubRoster: boolean;
};

/**
 * ready             -> can enter a team right now
 * no_team_for_game  -> in a club, but the club has no team for this game
 * club_pending      -> owns a club that isn't approved yet
 * no_club           -> no club at all: create one
 */
export type TeamEntryState = "ready" | "no_team_for_game" | "club_pending" | "no_club";

export function teamEntryState(f: TeamEntryFacts): TeamEntryState {
  if (f.hasEligibleTeam) return "ready";
  if (f.ownsClub) return f.ownedClubApproved ? "no_team_for_game" : "club_pending";
  if (f.onClubRoster) return "no_team_for_game";
  return "no_club";
}
