// Pure rules for the new-player onboarding steps (no database), so they can be tested.
// Each step answers { ok, checks[] } in the same shape as sign up, so the screen can show
// the same ticks and crosses.
import { isCountryCode } from "@/lib/geo-data";
import { PLATFORM_MIN_AGE } from "@/lib/age";
import {
  ADULT_AGE, birthInfo, isValidEmail, normalizeEmail, usernameChecks, type Check,
} from "@/lib/validation/auth";

export const MAX_FAVORITE_GAMES = 10;

// Hobbies are saved as one comma-separated string (no database change) but entered as tags.
// 8 tags x 20 characters + separators stays well inside the 200-character column limit.
export const MAX_HOBBY_TAGS = 8;
export const MAX_HOBBY_LENGTH = 20;

const cleanHobby = (t: string) => t.replace(/[\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_HOBBY_LENGTH).trim();

// "reading, chess" -> ["reading", "chess"]. Trims, drops empties and case-insensitive
// duplicates, and caps the count and length, so older free-text values still load safely.
export function parseHobbies(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (text ?? "").split(/[,;\n]/)) {
    const t = cleanHobby(raw);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_HOBBY_TAGS) break;
  }
  return out;
}

export const joinHobbies = (tags: string[]) => tags.join(", ");
export const GENDERS = ["male", "female", "other"] as const;
export const PLAY_STYLES = ["casual", "competitive"] as const;
export type PlayStyleValue = (typeof PLAY_STYLES)[number];

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;

// What the first step still has to ask for. Anything already on file (from the sign-up
// form, or locked after being saved once) is not asked again.
export interface AboutProfile {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  birthDate: Date | null;
  country: string | null;
  guardianEmail: string | null;
}

export function missingAbout(p: AboutProfile | null, now: Date = new Date()) {
  const birth = p?.birthDate ? birthInfo(p.birthDate.toISOString().slice(0, 10), now) : null;
  const minor = !!birth && birth.age >= PLATFORM_MIN_AGE && birth.age < ADULT_AGE;
  return {
    name: !p?.firstName || !p?.lastName,
    username: !p?.username,
    birthDate: !p?.birthDate,
    country: !p?.country,
    // Only relevant once we know they're under 18 and haven't given a guardian yet.
    guardianEmail: minor && !p?.guardianEmail,
  };
}

export const needsAboutStep = (m: ReturnType<typeof missingAbout>) => Object.values(m).some(Boolean);

export interface AboutInput {
  firstName: string;
  lastName: string;
  username: string;
  birthDate: string; // YYYY-MM-DD
  country: string; // ISO code
  guardianEmail: string;
}

export function aboutChecks(
  input: Partial<AboutInput>,
  missing: ReturnType<typeof missingAbout>,
  ctx: { usernameTaken?: boolean; ownEmail?: string; now?: Date } = {}
): Check[] {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, message: string) => checks.push({ id, ok, message });

  if (missing.name) {
    const f = (input.firstName ?? "").trim();
    const l = (input.lastName ?? "").trim();
    add("first_name", f.length >= 1 && f.length <= 50 && NAME_RE.test(f), "First name uses letters only (up to 50)");
    add("last_name", l.length >= 1 && l.length <= 50 && NAME_RE.test(l), "Last name uses letters only (up to 50)");
  }
  if (missing.username) checks.push(...usernameChecks(input.username ?? "", ctx.usernameTaken));
  let age: number | null = null;
  if (missing.birthDate) {
    const birth = birthInfo((input.birthDate ?? "").trim(), ctx.now);
    age = birth?.age ?? null;
    add("dob_valid", birth !== null, "Date of birth is a real date");
    add("dob_age", birth !== null && birth.age >= PLATFORM_MIN_AGE, `You must be ${PLATFORM_MIN_AGE} or older to join`);
  }
  if (missing.country) add("country", isCountryCode((input.country ?? "").trim().toUpperCase()), "Country is selected");
  // A guardian is needed when the date of birth (just given, or already on file) says under 18.
  if (missing.guardianEmail || (age !== null && age >= PLATFORM_MIN_AGE && age < ADULT_AGE)) {
    const g = normalizeEmail(input.guardianEmail);
    add("guardian_email", isValidEmail(g) && g !== normalizeEmail(ctx.ownEmail), "Parent or guardian email is valid and different from yours");
  }
  return checks;
}

export function gamesChecks(names: unknown, allowed: string[]): { checks: Check[]; value: string[] } {
  const list = Array.isArray(names) ? names.filter((n): n is string => typeof n === "string") : [];
  const unique = [...new Set(list.map((n) => n.trim()).filter(Boolean))];
  const allowedSet = new Set(allowed);
  return {
    value: unique.filter((n) => allowedSet.has(n)),
    checks: [
      // The games step needs at least one pick; a player with none chooses "Skip for now" instead.
      { id: "games_min", ok: unique.length >= 1, message: "Pick at least 1 game, or choose Skip for now" },
      { id: "games_count", ok: unique.length <= MAX_FAVORITE_GAMES, message: `Pick up to ${MAX_FAVORITE_GAMES} games` },
      { id: "games_known", ok: unique.every((n) => allowedSet.has(n)), message: "Every game is in the catalog" },
    ],
  };
}

export function styleChecks(input: { playStyle?: unknown; gender?: unknown; hobbies?: unknown }): {
  checks: Check[];
  value: { playStyle: PlayStyleValue | null; gender: string | null; hobbies: string | null };
} {
  const style = typeof input.playStyle === "string" && input.playStyle ? input.playStyle : null;
  const gender = typeof input.gender === "string" && input.gender ? input.gender : null;
  const hobbies = typeof input.hobbies === "string"
    ? input.hobbies.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim()
    : "";
  return {
    checks: [
      { id: "play_style", ok: style === null || (PLAY_STYLES as readonly string[]).includes(style), message: "Play style is casual or competitive" },
      { id: "gender", ok: gender === null || (GENDERS as readonly string[]).includes(gender), message: "Gender is one of the options" },
      { id: "hobbies", ok: hobbies.length <= 200, message: "Hobbies are 200 characters or fewer" },
    ],
    value: {
      playStyle: style && (PLAY_STYLES as readonly string[]).includes(style) ? (style as PlayStyleValue) : null,
      gender: gender && (GENDERS as readonly string[]).includes(gender) ? gender : null,
      hobbies: hobbies ? hobbies.slice(0, 200) : null,
    },
  };
}
