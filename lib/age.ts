// Age rules shared by the profile form, the API and the registration gate.
// Dates of birth are stored as a date only (UTC midnight) and ages are worked
// out in UTC, so a player is never a day off because of a time zone.

export const PLATFORM_MIN_AGE = 13;
export const AGE_REQUIREMENTS = [13, 16, 18] as const;
export type AgeRequirement = (typeof AGE_REQUIREMENTS)[number];

export function isAgeRequirement(n: unknown): n is AgeRequirement {
  return typeof n === "number" && (AGE_REQUIREMENTS as readonly number[]).includes(n);
}

// "YYYY-MM-DD" -> Date at UTC midnight, or null if it isn't a real calendar
// date, is in the future, or is implausibly old.
export function parseBirthDate(value: string, now: Date = new Date()): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (date.getTime() > now.getTime()) return null;
  if (y < 1900) return null;
  return date;
}

// Whole years completed on `now`. A 29 February birthday counts from 1 March in
// non-leap years.
export function ageOn(birth: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// The latest date of birth that is still 13 today, as YYYY-MM-DD (for the
// date input's `max`).
export function latestAllowedBirthDate(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear() - PLATFORM_MIN_AGE, now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString().slice(0, 10);
}
