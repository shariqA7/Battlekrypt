// Pure rules for the rankings pages: which modes a game has and what to call them.
// No database, so they can be tested directly against the real game catalog.
import type { TournamentMode } from "@prisma/client";

export interface GameShape {
  genre: string | null;
  format: string | null;
  teamSizeMax: number | null;
}

export const MODE_ORDER: TournamentMode[] = ["solo", "duo", "squad"];

// The mode a game is "mainly" played in, from its team size. Used to place ratings that
// have no mode of their own (old ratings, challenge applicants) and as the default tab.
export function mainMode(game: Pick<GameShape, "teamSizeMax">): TournamentMode {
  const n = game.teamSizeMax ?? 0;
  return n === 1 ? "solo" : n === 2 ? "duo" : "squad";
}

// "5v5", "4v4", "3v3": two teams of N facing each other. Battle royales (many squads in one
// match) and 3-player Warzone are squads, not NvN.
export function isTeamVsTeam(game: GameShape): boolean {
  const n = game.teamSizeMax ?? 0;
  if (game.format !== "multiplayer" || n < 2) return false;
  if (game.genre === "Battle Royale") return false;
  if (game.genre === "FPS / Shooters" && n < 4) return false;
  return true;
}

export function modeLabel(game: GameShape, mode: TournamentMode): string {
  const n = game.teamSizeMax ?? 0;
  if (mode === "solo") return game.format === "one_on_one" ? "1v1" : "Solo";
  if (mode === "duo") return "Duo";
  return isTeamVsTeam(game) ? `${n}v${n}` : "Squad";
}

// Only modes that really have rated players, always in the order Solo, Duo, Squad.
export function modeTabs(game: GameShape, present: TournamentMode[]) {
  return MODE_ORDER.filter((m) => present.includes(m)).map((mode) => ({ mode, label: modeLabel(game, mode) }));
}

// The tab that opens first: the game's main mode when it has rated players, otherwise the
// first mode that does.
export function defaultMode(game: Pick<GameShape, "teamSizeMax">, present: TournamentMode[]): TournamentMode | null {
  const main = mainMode(game);
  if (present.includes(main)) return main;
  return MODE_ORDER.find((m) => present.includes(m)) ?? null;
}

export function parseMode(value: string | null | undefined): TournamentMode | null {
  return value === "solo" || value === "duo" || value === "squad" ? value : null;
}

// 1-based page number from a query string, clamped to something sane.
export function parsePage(value: string | null | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : 1;
}
