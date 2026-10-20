// Pure helpers over a game's roster rules (no database), shared by the games page,
// the tournament form and the club roster checks.
import { GENRES } from "@/lib/game-catalog";

export interface GameRules {
  genre?: string | null;
  format?: string | null;
  teamSizeMin?: number | null;
  teamSizeMax?: number | null;
  maxSubstitutes?: number | null;
  allowsCoach?: boolean | null;
}

export const hasRules = (g: GameRules) => g.teamSizeMax != null;

// "5 players + 1 sub", "1v1", "Solo, 8-player lobbies", "1-2 players + 1 sub", ...
export function describeRules(g: GameRules): string | null {
  if (!hasRules(g)) return null;
  if (g.format === "one_on_one") return "1v1";
  if (g.format === "free_for_all") return "Solo, free-for-all";
  const min = g.teamSizeMin ?? g.teamSizeMax!;
  const max = g.teamSizeMax!;
  const players = min === max ? `${max} player${max === 1 ? "" : "s"}` : `${min}-${max} players`;
  const subs = g.maxSubstitutes ?? 0;
  return subs > 0 ? `${players} + ${subs} sub${subs === 1 ? "" : "s"}` : players;
}

// What the create-tournament form pre-fills when an organizer picks a game.
// The organizer can still change everything. Games with no rules pre-fill nothing.
export function tournamentDefaults(g: GameRules): { mode: "solo" | "duo" | "squad"; maxTeamSize: number } | null {
  if (!hasRules(g)) return null;
  const size = g.format === "both" ? g.teamSizeMin ?? 1 : g.teamSizeMax!;
  const mode = size <= 1 ? "solo" : size === 2 ? "duo" : "squad";
  // Team size on an entry counts everyone who can be registered: players + substitutes.
  return { mode, maxTeamSize: Math.max(2, g.teamSizeMax! + (g.maxSubstitutes ?? 0)) };
}

// Most people one club team can hold in this role for this game, or null if the game
// sets no limit. Used together with the club's plan limit (the stricter one wins).
export function gameRosterCap(g: GameRules, role: "player" | "substitute"): number | null {
  if (!hasRules(g)) return null;
  return role === "player" ? g.teamSizeMax! : (g.maxSubstitutes ?? 0);
}

// Group games for display, in the order the genres are listed; games without a genre
// (older or requested games) go last under "Other games".
export function groupByGenre<T extends GameRules & { name: string }>(games: T[]): { genre: string; games: T[] }[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const groups = (GENRES as readonly string[])
    .map((genre) => ({ genre, games: games.filter((x) => x.genre === genre).sort(byName) }))
    .filter((x) => x.games.length > 0);
  const rest = games.filter((x) => !x.genre || !(GENRES as readonly string[]).includes(x.genre)).sort(byName);
  if (rest.length) groups.push({ genre: "Other games", games: rest });
  return groups;
}
