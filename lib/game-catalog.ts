// The launch games, grouped by genre, with each game's roster rules.
// Single source of truth: the database migration (prisma/migrations/20261020000000_game_rules)
// and prisma/seed.ts are generated from / read this list, and scripts/game-rules-test.ts checks them.
//
// Roster rules, per game:
//   teamSizeMin..teamSizeMax  players who actually play (a range only where a format varies)
//   maxSubstitutes            the most substitutes a team may register (upper end of the usual range)
//   allowsCoach               whether a team may name a coach
//   format                    multiplayer | one_on_one | free_for_all | both
// A game that isn't in this list (for example one added through "Request a game") has no
// rules, and so no limits beyond a club's plan.

export const GENRES = [
  "FPS / Shooters",
  "MOBA",
  "Battle Royale",
  "Fighting Games",
  "Sports / Racing",
  "Strategy / Other",
] as const;
export type Genre = (typeof GENRES)[number];

export type GameFormat = "multiplayer" | "one_on_one" | "free_for_all" | "both";

export interface CatalogGame {
  name: string;
  genre: Genre;
  // The older platform label (mobile / pc) the rule picker filters on. Existing games
  // keep theirs; new ones get one here.
  category: "mobile" | "pc";
  format: GameFormat;
  teamSizeMin: number;
  teamSizeMax: number;
  maxSubstitutes: number;
  allowsCoach: boolean;
  notes: string;
}

const g = (
  name: string,
  genre: Genre,
  category: "mobile" | "pc",
  format: GameFormat,
  teamSizeMin: number,
  teamSizeMax: number,
  maxSubstitutes: number,
  allowsCoach: boolean,
  notes: string
): CatalogGame => ({ name, genre, category, format, teamSizeMin, teamSizeMax, maxSubstitutes, allowsCoach, notes });

export const GAME_CATALOG: CatalogGame[] = [
  // ---- FPS / Shooters
  g("Valorant", "FPS / Shooters", "pc", "multiplayer", 5, 5, 1, true, "Rosters typically need at least 6 players (5 active + 1 sub). Teams may have 1-2 coaches."),
  g("Counter-Strike 2", "FPS / Shooters", "pc", "multiplayer", 5, 5, 1, true, "Coaches sit behind the team but are muted during live rounds."),
  g("Call of Duty: Warzone", "FPS / Shooters", "pc", "multiplayer", 3, 3, 1, true, "The standard global esports format uses 3-player squads (trios)."),
  g("Call of Duty: Black Ops 7", "FPS / Shooters", "pc", "multiplayer", 4, 4, 1, true, "The Call of Duty League format is 4v4 competitive."),
  g("Overwatch 2", "FPS / Shooters", "pc", "multiplayer", 5, 5, 2, true, "5v5: 1 Tank, 2 Damage, 2 Support."),
  g("Rainbow Six Siege X", "FPS / Shooters", "pc", "multiplayer", 5, 5, 1, true, "5v5 tactical shooter line-ups."),
  g("Crossfire", "FPS / Shooters", "pc", "multiplayer", 5, 5, 1, true, "Traditional 5v5 tactical shooter team structure."),
  // ---- MOBA
  g("Dota 2", "MOBA", "pc", "multiplayer", 5, 5, 1, true, "Substitutes are rare but allowed under strict tournament stand-in rules."),
  g("League of Legends", "MOBA", "pc", "multiplayer", 5, 5, 2, true, "Coaches take part directly in the live pick and ban phase."),
  g("Mobile Legends: Bang Bang", "MOBA", "mobile", "multiplayer", 5, 5, 2, true, "A manager or data analyst is also often registered on stage."),
  g("Honor of Kings", "MOBA", "mobile", "multiplayer", 5, 5, 2, true, "Like other mobile MOBAs, coaches manage the pick and ban phase."),
  // ---- Battle Royale
  g("Apex Legends", "Battle Royale", "pc", "multiplayer", 3, 3, 1, true, "The ALGS allows a 4th registered roster member as a substitute."),
  g("PUBG: Battlegrounds", "Battle Royale", "pc", "multiplayer", 4, 4, 1, true, "The standard global competitive format is 4-player squads."),
  g("PUBG Mobile", "Battle Royale", "mobile", "multiplayer", 4, 4, 2, true, "Rosters often carry 5 to 6 players in total so they can swap for different maps."),
  g("Free Fire", "Battle Royale", "mobile", "multiplayer", 4, 4, 2, true, "Played in 4-player squads with additional backup players."),
  g("Fortnite", "Battle Royale", "pc", "multiplayer", 2, 2, 0, true, "The main competitive scene runs Duos; some events use Solos or Trios. No mid-match substitutes."),
  // ---- Fighting Games
  g("Tekken 8", "Fighting Games", "pc", "one_on_one", 1, 1, 0, true, "Matches are 1v1. Team leagues use crews of 3 to 4 players."),
  g("Street Fighter 6", "Fighting Games", "pc", "one_on_one", 1, 1, 0, true, "Coaches or anchors can support between matches in team league formats."),
  g("Fatal Fury: City of the Wolves", "Fighting Games", "pc", "one_on_one", 1, 1, 0, true, "Played entirely as an individual 1v1 fighting game."),
  // ---- Sports / Racing
  g("EA Sports FC 26", "Sports / Racing", "pc", "one_on_one", 1, 1, 0, true, "Played individually; players often have a coach or mental trainer on stage."),
  g("Rocket League", "Sports / Racing", "pc", "multiplayer", 3, 3, 1, true, "The RLCS format is 3v3, with 1 substitute allowed on the roster."),
  g("Trackmania", "Sports / Racing", "pc", "both", 1, 2, 1, true, "Individual time trials as well as 2v2 team formats, depending on the circuit."),
  // ---- Strategy / Other
  g("Teamfight Tactics", "Strategy / Other", "pc", "free_for_all", 1, 1, 0, true, "8 players enter each match individually, so it is a solo strategy game."),
  g("Chess", "Strategy / Other", "pc", "one_on_one", 1, 1, 0, false, "Traditional 1v1. In team events (Olympiads) a team is 4 active players, 1 reserve and a team captain."),
];

// ---------------------------------------------------------------------------------------------
// Match size: the most entries (teams, or players in solo games) one match or room holds.
// From each publisher's rulebooks and announcements. Admin -> Games can change any of these, and
// can fill in a game that is not listed. It is a guide, not a wall: an organizer can go above it
// (the form warns first), because custom lobbies are often larger or smaller than the public one.
//
//   max   entries in one room. For a 2-entry game (max 2) a "room" is just one match, so a
//         tournament of that game is a bracket or a league and rooms are not used.
//   note  the working, shown to organizers and admins.
// ---------------------------------------------------------------------------------------------
export interface MatchLimit {
  max: number;
  note: string;
}

const HEAD_TO_HEAD = (what: string): MatchLimit => ({ max: 2, note: `${what} A match is always two sides, so a tournament runs as a bracket or league.` });

export const MATCH_LIMITS: Record<string, MatchLimit> = {
  "Valorant": HEAD_TO_HEAD("5v5."),
  "Counter-Strike 2": HEAD_TO_HEAD("5v5."),
  "Call of Duty: Warzone": { max: 50, note: "Trios. Verdansk holds up to 150 players (50 trios); other maps and modes hold 100 to 120. Lower it for a smaller map." },
  "Call of Duty: Black Ops 7": HEAD_TO_HEAD("4v4."),
  "Overwatch 2": HEAD_TO_HEAD("5v5."),
  "Rainbow Six Siege X": HEAD_TO_HEAD("5v5."),
  "Crossfire": HEAD_TO_HEAD("5v5."),
  "Dota 2": HEAD_TO_HEAD("5v5."),
  "League of Legends": HEAD_TO_HEAD("5v5."),
  "Mobile Legends: Bang Bang": HEAD_TO_HEAD("5v5."),
  "Honor of Kings": HEAD_TO_HEAD("5v5."),
  "Apex Legends": { max: 20, note: "20 trios (60 players). This is the lobby size EA uses in the Apex Legends Global Series." },
  "PUBG: Battlegrounds": { max: 25, note: "A full public lobby is 100 players, which is 25 squads of 4. Official esports rooms use 16 squads (64 players)." },
  "PUBG Mobile": { max: 25, note: "Up to 100 players, which is 25 squads of 4. Official PUBG Mobile esports groups use 16 squads." },
  "Free Fire": { max: 12, note: "Garena's tournament rulebooks allow at most 12 squads of 4 on one map. The public lobby holds 50 players." },
  "Fortnite": { max: 50, note: "A lobby holds 100 players, which is 50 duos. Epic's Fortnite Championship Series uses 50 duos in its finals." },
  "Tekken 8": HEAD_TO_HEAD("1v1."),
  "Street Fighter 6": HEAD_TO_HEAD("1v1."),
  "Fatal Fury: City of the Wolves": HEAD_TO_HEAD("1v1."),
  "EA Sports FC 26": HEAD_TO_HEAD("1v1."),
  "Rocket League": HEAD_TO_HEAD("3v3."),
  "Trackmania": { max: 64, note: "Up to 64 players on one match server, as in the official Cup of the Day." },
  "Teamfight Tactics": { max: 8, note: "8 players in every lobby (Riot's tournament format)." },
  "Chess": HEAD_TO_HEAD("1v1."),
};

/** The catalog's match limit for a game name, or null for a game that is not listed. */
export const matchLimitFor = (name: string): MatchLimit | null => MATCH_LIMITS[name] ?? null;
