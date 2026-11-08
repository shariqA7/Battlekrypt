// Game showcase details (Admin -> Games): what staff may set, and the rules for it.
//
// Pure (no database, no React), so the API, the form and scripts/game-details-test.ts all use
// the same rules. The database side is lib/services/games-admin.ts.
//
// Roster rules (team size, substitutes, regions) are NOT edited here: they stay in
// lib/game-catalog.ts and lib/game-regions.ts, as before.
import { GAME_CATALOG, GENRES } from "./game-catalog";
import { ALL_BLOCKED_RULES, ALL_LOCAL_VERSIONS } from "./game-regions";

export const GAME_PLATFORMS = ["pc", "mobile", "console"] as const;
export type GamePlatform = (typeof GAME_PLATFORMS)[number];
export const GAME_PLATFORM_LABELS: Record<GamePlatform, string> = { pc: "PC", mobile: "Mobile", console: "Console" };

/** The public Supabase Storage bucket the pictures live in (SETUP.md, "Game pictures"). */
export const GAME_BUCKET = "game-assets";

export const GAME_LIMITS = {
  name: 80,
  shortDescription: 160,
  description: 4000,
  developer: 80,
  url: 500,
  maxImages: 12,
  sortOrderMax: 9999,
} as const;

// ---------------------------------------------------------------- addresses

/** "PUBG: Battlegrounds" -> "pubg-battlegrounds". Matches the rule used by the migration. */
export function gameSlugBase(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "game";
}

/** First free address: `base`, then `base-2`, `base-3`, ... `taken` is every slug already in use. */
export function pickUniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------- seeded games

// Games that `prisma db seed` creates or looks up BY NAME. Renaming one would make the next
// seed run add the original again, and deleting one would bring it back, so staff can hide
// these but not rename or delete them.
const SEEDED_NAMES: ReadonlySet<string> = new Set([
  ...GAME_CATALOG.map((g) => g.name),
  ...ALL_LOCAL_VERSIONS.map((g) => g.name),
  ...ALL_BLOCKED_RULES.map((g) => g.name),
  "BGMI",
]);
export const isSeededGameName = (name: string) => SEEDED_NAMES.has(name);

// ---------------------------------------------------------------- pictures

const PUBLIC_PATH = `/storage/v1/object/public/${GAME_BUCKET}/`;

/**
 * A picture must be an https link into OUR game-assets bucket. `supabaseUrl` is
 * NEXT_PUBLIC_SUPABASE_URL; when it is not known (a script), only the shape is checked.
 */
export function isGameImageUrl(value: unknown, supabaseUrl?: string | null): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > GAME_LIMITS.url) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || !u.pathname.startsWith(PUBLIC_PATH) || u.pathname.length === PUBLIC_PATH.length) return false;
  if (supabaseUrl) {
    try {
      if (new URL(supabaseUrl).origin !== u.origin) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** The file path inside the bucket (what storage.remove() needs), or null if it isn't one of ours. */
export function gameImagePath(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.pathname.startsWith(PUBLIC_PATH)) return null;
    return decodeURIComponent(u.pathname.slice(PUBLIC_PATH.length)) || null;
  } catch {
    return null;
  }
}

/** Pictures that were on the game before and are not any more (to delete from storage). */
export function removedImages(before: { coverImageUrl: string | null; images: string[] }, after: { coverImageUrl: string | null; images: string[] }): string[] {
  const keep = new Set([...(after.coverImageUrl ? [after.coverImageUrl] : []), ...after.images]);
  const was = new Set([...(before.coverImageUrl ? [before.coverImageUrl] : []), ...before.images]);
  return [...was].filter((u) => !keep.has(u));
}

// ---------------------------------------------------------------- input

export interface GameDetails {
  name: string;
  genre: string | null;
  shortDescription: string | null;
  description: string | null;
  coverImageUrl: string | null;
  images: string[];
  developer: string | null;
  platforms: GamePlatform[];
  websiteUrl: string | null;
  sortOrder: number;
  isFeatured: boolean;
  isApproved: boolean; // "visible to players"
}

export type CleanResult = { ok: true; data: Partial<GameDetails> } | { ok: false; message: string };

const fail = (message: string): CleanResult => ({ ok: false, message });

// "" and whitespace become null; anything else is trimmed.
function text(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Checks what the browser sent and keeps only known fields (never trust the browser).
 * `create` needs a name; `update` takes only the fields that were sent. `supabaseUrl` is passed
 * so pictures can be pinned to our own storage.
 */
export function cleanGameInput(raw: unknown, mode: "create" | "update", supabaseUrl?: string | null): CleanResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("Send the game's details as an object.");
  const input = raw as Record<string, unknown>;
  const out: Partial<GameDetails> = {};

  if (input.name !== undefined || mode === "create") {
    const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
    if (!name) return fail("A game needs a name.");
    if (name.length > GAME_LIMITS.name) return fail(`The name can be at most ${GAME_LIMITS.name} characters.`);
    out.name = name;
  }

  if (input.genre !== undefined) {
    const g = text(input.genre);
    if (g !== null && !(GENRES as readonly string[]).includes(g as string)) return fail("Pick a genre from the list.");
    out.genre = g ?? null;
  }

  for (const [key, max, label] of [
    ["shortDescription", GAME_LIMITS.shortDescription, "The short description"],
    ["description", GAME_LIMITS.description, "The description"],
    ["developer", GAME_LIMITS.developer, "The developer"],
  ] as const) {
    if (input[key] === undefined) continue;
    const t = text(input[key]);
    if (t && t.length > max) return fail(`${label} can be at most ${max} characters.`);
    out[key] = t ?? null;
  }

  if (input.websiteUrl !== undefined) {
    const w = text(input.websiteUrl);
    if (w) {
      let ok = w.length <= GAME_LIMITS.url;
      try {
        ok = ok && ["http:", "https:"].includes(new URL(w).protocol);
      } catch {
        ok = false;
      }
      if (!ok) return fail("The website must be a full link starting with http:// or https://.");
    }
    out.websiteUrl = w ?? null;
  }

  if (input.coverImageUrl !== undefined) {
    const c = text(input.coverImageUrl);
    if (c && !isGameImageUrl(c, supabaseUrl)) return fail("The cover picture must be uploaded through the game form.");
    out.coverImageUrl = c ?? null;
  }

  if (input.images !== undefined) {
    if (!Array.isArray(input.images)) return fail("The gallery must be a list of pictures.");
    const seen = new Set<string>();
    for (const u of input.images) {
      if (!isGameImageUrl(u, supabaseUrl)) return fail("Every gallery picture must be uploaded through the game form.");
      seen.add(u);
    }
    if (seen.size > GAME_LIMITS.maxImages) return fail(`A game can have at most ${GAME_LIMITS.maxImages} gallery pictures.`);
    out.images = [...seen]; // duplicates dropped, order kept
  }

  if (input.platforms !== undefined) {
    if (!Array.isArray(input.platforms) || !input.platforms.every((p) => (GAME_PLATFORMS as readonly unknown[]).includes(p))) {
      return fail("Platforms can only be PC, Mobile or Console.");
    }
    out.platforms = GAME_PLATFORMS.filter((p) => (input.platforms as unknown[]).includes(p)); // fixed order, no repeats
  }

  if (input.sortOrder !== undefined) {
    const n = typeof input.sortOrder === "string" && input.sortOrder.trim() !== "" ? Number(input.sortOrder) : input.sortOrder;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > GAME_LIMITS.sortOrderMax) {
      return fail(`The order must be a whole number from 0 to ${GAME_LIMITS.sortOrderMax}.`);
    }
    out.sortOrder = n;
  }

  for (const key of ["isFeatured", "isApproved"] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") return fail(`${key} must be true or false.`);
    out[key] = input[key] as boolean;
  }

  return { ok: true, data: out };
}
