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
  maxPerMatch?: number | null;
  matchLimitNote?: string | null;
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
// Within a genre: featured games first, then the admin's order number (lower first), then A to Z.
// A game with neither set (the default) is simply sorted by name, as before.
export function groupByGenre<T extends GameRules & { name: string; isFeatured?: boolean | null; sortOrder?: number | null }>(games: T[]): { genre: string; games: T[] }[] {
  const byName = (a: T, b: T) =>
    Number(!!b.isFeatured) - Number(!!a.isFeatured) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
  const groups = (GENRES as readonly string[])
    .map((genre) => ({ genre, games: games.filter((x) => x.genre === genre).sort(byName) }))
    .filter((x) => x.games.length > 0);
  const rest = games.filter((x) => !x.genre || !(GENRES as readonly string[]).includes(x.genre)).sort(byName);
  if (rest.length) groups.push({ genre: "Other games", games: rest });
  return groups;
}

// ---- Room size --------------------------------------------------------------------------------

/** True for a game whose match is always two sides (1v1 or team vs team): rooms are not used for it. */
export const isHeadToHead = (g: GameRules) => g.maxPerMatch != null && g.maxPerMatch <= 2;

/** What "entries" means for this game: players in solo games, teams otherwise. */
export const entryWord = (g: GameRules, n = 2) =>
  (g.teamSizeMax ?? 2) <= 1 ? (n === 1 ? "player" : "players") : n === 1 ? "team" : "teams";

/**
 * The warning to show when an organizer sets a room above the game's usual size, or null when
 * it is fine (or the game has no set size). It is advice, never a block: custom lobbies can be bigger.
 */
export function roomSizeWarning(g: GameRules & { name?: string }, perRoom: number): string | null {
  if (g.maxPerMatch == null || isHeadToHead(g) || !Number.isFinite(perRoom) || perRoom <= g.maxPerMatch) return null;
  return `${g.name ? `${g.name} rooms` : "Rooms of this game"} normally hold ${g.maxPerMatch} ${entryWord(g)}. ${perRoom} is above that, ` +
    "so check your lobby can really take it. You can still go ahead.";
}
