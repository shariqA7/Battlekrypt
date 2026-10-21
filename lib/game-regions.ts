// Games that have a separate local version in some country.
//
// India (verified October 2026):
//  - Mobile Legends: Bang Bang was banned in 2020; India's version is "Moba Legends: 5v5!"
//    (Vizta Games, April 2024), with its own national tournament, the Moba Legends Master Series.
//  - Free Fire was banned in February 2022. "Free Fire India" was announced for 2023 but has NOT
//    launched; what Indians play, and compete in, is Free Fire MAX (for example the Free Fire MAX India Cup).
//  - PUBG Mobile was banned in 2020; India's version is Battlegrounds Mobile India (BGMI, Krafton).
//  - Honor of Kings launched in India on 11 March 2026, so it is NOT restricted there.
//
// A game blocked in a country is hidden from people there; its local version is shown only to
// them. Everyone else sees the global game and never the local one.

export interface BlockedRule {
  name: string; // the global game, as named in the Game table
  blockedIn: string[]; // ISO country codes
}

export interface LocalVersion {
  name: string;
  localVersionOf: string; // the global game it stands in for
  onlyIn: string[];
  genre: string;
  category: "mobile" | "pc";
  format: "multiplayer";
  teamSizeMin: number;
  teamSizeMax: number;
  maxSubstitutes: number;
  notes: string;
  // true: the game already exists in the database (BGMI); only region columns and still-empty
  // rule columns are filled in. false: the game is added.
  existing: boolean;
}

export const BLOCKED_RULES: BlockedRule[] = [
  { name: "Mobile Legends: Bang Bang", blockedIn: ["IN"] },
  { name: "Free Fire", blockedIn: ["IN"] },
  { name: "PUBG Mobile", blockedIn: ["IN"] },
];

export const LOCAL_VERSIONS: LocalVersion[] = [
  {
    name: "Moba Legends: 5v5!", localVersionOf: "Mobile Legends: Bang Bang", onlyIn: ["IN"], genre: "MOBA", category: "mobile",
    format: "multiplayer", teamSizeMin: 5, teamSizeMax: 5, maxSubstitutes: 2, existing: false,
    notes: "India's version of Mobile Legends: Bang Bang, published by Vizta Games. Same 5v5 format and rosters as the global game.",
  },
  {
    name: "Free Fire MAX", localVersionOf: "Free Fire", onlyIn: ["IN"], genre: "Battle Royale", category: "mobile",
    format: "multiplayer", teamSizeMin: 4, teamSizeMax: 4, maxSubstitutes: 2, existing: false,
    notes: "The version of Free Fire playable in India (the original is banned there). Played in 4-player squads with backup players.",
  },
  {
    name: "BGMI", localVersionOf: "PUBG Mobile", onlyIn: ["IN"], genre: "Battle Royale", category: "mobile",
    format: "multiplayer", teamSizeMin: 4, teamSizeMax: 4, maxSubstitutes: 2, existing: true,
    notes: "Battlegrounds Mobile India, India's version of PUBG Mobile. Same 4-player squads and rosters as PUBG Mobile.",
  },
];

// ---------------------------------------------------------------------------
// East and Southeast Asia (added October 2026). The sources for these are older than the India
// ones above, so each is worth re-checking before relying on it: PUBG Mobile has had its own
// version in China ("Game for Peace", Tencent), Korea and Japan ("PUBG Mobile KRJP", Krafton),
// Vietnam ("PUBG Mobile VN", VNG) and Taiwan ("PUBG Mobile TW", HotCool); and the global
// Honor of Kings has not been offered in Thailand, Vietnam or Taiwan, where Garena runs
// Arena of Valor instead.
// ---------------------------------------------------------------------------

// Extra countries for games that are already hidden somewhere (PUBG Mobile also stays hidden in India).
export const EAST_ASIA_BLOCKED: BlockedRule[] = [
  { name: "PUBG Mobile", blockedIn: ["CN", "KR", "JP", "VN", "TW"] },
  { name: "Honor of Kings", blockedIn: ["TH", "VN", "TW"] },
];

const pubgLocal = (name: string, onlyIn: string[], notes: string): LocalVersion => ({
  name, localVersionOf: "PUBG Mobile", onlyIn, genre: "Battle Royale", category: "mobile",
  format: "multiplayer", teamSizeMin: 4, teamSizeMax: 4, maxSubstitutes: 2, existing: false, notes,
});

export const EAST_ASIA_LOCAL: LocalVersion[] = [
  pubgLocal("Game for Peace", ["CN"], "China's version of PUBG Mobile, published by Tencent. Same 4-player squads and rosters as PUBG Mobile."),
  pubgLocal("PUBG Mobile KRJP", ["KR", "JP"], "The Korea and Japan version of PUBG Mobile, published by Krafton. Same 4-player squads and rosters."),
  pubgLocal("PUBG Mobile VN", ["VN"], "Vietnam's version of PUBG Mobile, published by VNG. Same 4-player squads and rosters."),
  pubgLocal("PUBG Mobile TW", ["TW"], "Taiwan's version of PUBG Mobile. Same 4-player squads and rosters."),
  {
    name: "Arena of Valor", localVersionOf: "Honor of Kings", onlyIn: ["TH", "VN", "TW"], genre: "MOBA", category: "mobile",
    format: "multiplayer", teamSizeMin: 5, teamSizeMax: 5, maxSubstitutes: 2, existing: false,
    notes: "Garena's version of the Tencent MOBA for Thailand, Vietnam and Taiwan, where Honor of Kings is not offered. Same 5v5 format and rosters.",
  },
];

// Everything, merged: a game blocked in several countries lists them all.
export const ALL_BLOCKED_RULES: BlockedRule[] = (() => {
  const byName = new Map<string, Set<string>>();
  for (const r of [...BLOCKED_RULES, ...EAST_ASIA_BLOCKED]) {
    byName.set(r.name, new Set([...(byName.get(r.name) ?? []), ...r.blockedIn]));
  }
  return [...byName.entries()].map(([name, set]) => ({ name, blockedIn: [...set] }));
})();

export const ALL_LOCAL_VERSIONS: LocalVersion[] = [...LOCAL_VERSIONS, ...EAST_ASIA_LOCAL];
