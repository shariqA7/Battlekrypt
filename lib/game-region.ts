// Which games a visitor sees, based on their country. Pure, so it can be tested without a database.
import { COUNTRIES, countryName } from "@/lib/geo-data";

export interface RegionalGame {
  onlyInCountries?: string[] | null;
  blockedInCountries?: string[] | null;
}

// "India", "india", " IN " -> "IN". Free text from a profile that can't be matched -> null.
export function toCountryCode(input: string | null | undefined): string | null {
  const v = input?.trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(COUNTRIES, upper)) return upper;
  const lower = v.toLowerCase();
  const hit = Object.entries(COUNTRIES).find(([, c]) => c.name.toLowerCase() === lower);
  return hit ? hit[0] : null;
}

// The visitor's country: what they put on their profile wins (normalised), then their
// organization's country, then where the request came from. null = unknown.
export function pickViewerCountry(src: {
  profileCountry?: string | null;
  organizerCountry?: string | null;
  requestCountry?: string | null;
}): string | null {
  return toCountryCode(src.profileCountry) ?? toCountryCode(src.organizerCountry) ?? toCountryCode(src.requestCountry);
}

// A game is shown if it isn't limited to other countries, and isn't blocked in the visitor's country.
// With an unknown country only unrestricted games are shown: a local version is never
// shown to someone we can't place.
export function isGameVisibleIn(game: RegionalGame, country: string | null): boolean {
  const only = game.onlyInCountries ?? [];
  const blocked = game.blockedInCountries ?? [];
  if (only.length > 0 && (!country || !only.includes(country))) return false;
  if (country && blocked.includes(country)) return false;
  return true;
}

// The same rule as a database filter (for Prisma `where`).
export function gameVisibilityWhere(country: string | null) {
  const unrestricted = { onlyInCountries: { isEmpty: true } };
  if (!country) return unrestricted;
  return {
    AND: [
      { OR: [unrestricted, { onlyInCountries: { has: country } }] },
      { NOT: { blockedInCountries: { has: country } } },
    ],
  };
}

// Admin view: games that exist only in some countries, grouped by country (name order).
export function regionalGroups<T extends RegionalGame & { name: string }>(games: T[]) {
  const byCountry = new Map<string, T[]>();
  for (const g of games) {
    for (const c of g.onlyInCountries ?? []) byCountry.set(c, [...(byCountry.get(c) ?? []), g]);
  }
  return [...byCountry.entries()]
    .map(([code, list]) => ({ code, label: countryName(code) ?? code, games: list.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
