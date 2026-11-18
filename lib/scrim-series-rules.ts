// Recurring scrim series: the pure rules (no database, no React). Validation against the organizer's
// plan, the schedule (which days and times), and turning that schedule into real session times in
// the organizer's own time zone. Shared by the form, the API, the daily generator and the tests.
import { isSupportedCurrency } from "@/lib/money";

export const SERIES_HORIZON_DAYS = 14; // sessions are created this far ahead
export const MAX_SLOTS_HARD = 8; // never more than this many sessions in one day
export const MAX_SKIP_DATES = 60;
export const SERIES_TIMEZONES = [
  "Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata", "Asia/Dhaka", "Asia/Singapore",
  "Europe/London", "Europe/Istanbul", "America/New_York", "UTC",
] as const;
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDateStr(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

/** Calendar date (YYYY-MM-DD) of a moment, as seen in a time zone. */
export function dateInZone(at: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function offsetMinutes(utcMs: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** The real moment for "this date at this clock time in this time zone". */
export function zonedTimeToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ms = guess - offsetMinutes(guess, tz) * 60000;
  ms = guess - offsetMinutes(ms, tz) * 60000; // settle across a daylight-saving change
  return new Date(ms);
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export type Schedule = { timezone: string; daysOfWeek: number[]; slotTimes: string[]; startDate: string; endDate: string | null; skipDates: string[] };
export type Occurrence = { sessionNo: number; date: string; time: string; startAt: Date };

/**
 * Every session of the schedule that falls between two dates (inclusive), in order.
 * sessionNo counts every slot from the first day, including skipped days, so a number never moves
 * when a date is skipped later and a session is never generated twice.
 */
export function occurrences(s: Schedule, from: string, to: string): Occurrence[] {
  const times = [...s.slotTimes].sort();
  const skip = new Set(s.skipDates);
  const last = s.endDate && s.endDate < to ? s.endDate : to;
  const out: Occurrence[] = [];
  let no = 0;
  const days = daysBetween(s.startDate, last);
  for (let i = 0; i <= days; i++) {
    const date = addDays(s.startDate, i);
    if (!s.daysOfWeek.includes(weekdayOf(date))) continue;
    for (const time of times) {
      no++;
      if (skip.has(date) || date < from) continue;
      out.push({ sessionNo: no, date, time, startAt: zonedTimeToUtc(date, time, s.timezone) });
    }
  }
  return out;
}

export function describeSchedule(s: Pick<Schedule, "daysOfWeek" | "slotTimes">): string {
  const d = [...new Set(s.daysOfWeek)].sort((a, b) => a - b);
  const key = d.join(",");
  const days =
    d.length === 7 ? "Every day"
      : key === "1,2,3,4,5" ? "Weekdays"
      : key === "0,6" ? "Weekends"
      : d.map((x) => DAY_NAMES[x].slice(0, 3)).join(", ");
  const t = [...s.slotTimes].sort().map((x) => {
    const [h, m] = x.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  });
  return `${days} at ${t.length > 1 ? `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}` : t[0]}`;
}

// ---- plan limits ----
export type SeriesLimits = { maxScrimSeries: number | null; maxSeriesDays: number | null; maxSlotsPerDay: number | null };

export type SeriesInput = {
  name: string; description: string | null; bannerUrl: string | null; gameId: string;
  mode: "solo" | "duo" | "squad"; maxTeamSize: number; maxTeams: number; playersPerRoom: number | null;
  entryType: "free" | "paid"; entryFeeAmount: number | null; entryFeeCurrency: string | null; paymentInstructions: string | null;
  rulesText: string | null; country: string | null;
} & Schedule;

type Res = { ok: true; value: SeriesInput } | { ok: false; message: string };
const str = (v: unknown, min: number, max: number) => { const t = typeof v === "string" ? v.trim() : ""; return t.length >= min && t.length <= max ? t : null; };
const optStr = (v: unknown, max: number) => { const t = typeof v === "string" ? v.trim() : ""; return t ? (t.length <= max ? t : null) : ""; };

export function validateSeries(raw: Record<string, unknown>, limits: SeriesLimits, activeCount: number, now = new Date()): Res {
  const fail = (message: string): Res => ({ ok: false, message });
  if (limits.maxScrimSeries === 0) return fail("Your plan doesn't include recurring scrim series. Upgrade your plan to use them.");
  if (limits.maxScrimSeries !== null && activeCount >= limits.maxScrimSeries) {
    return fail(`Your plan allows ${limits.maxScrimSeries} recurring series at once. End one, or upgrade, to start another.`);
  }

  const name = str(raw.name, 3, 80); if (!name) return fail("Give the series a name (3–80 characters).");
  const description = optStr(raw.description, 2000); if (description === null) return fail("The description can be at most 2000 characters.");
  const rulesText = optStr(raw.rulesText, 4000); if (rulesText === null) return fail("The rules can be at most 4000 characters.");
  const paymentInstructions = optStr(raw.paymentInstructions, 1000); if (paymentInstructions === null) return fail("The payment instructions can be at most 1000 characters.");
  const bannerUrl = typeof raw.bannerUrl === "string" && raw.bannerUrl.trim() ? raw.bannerUrl.trim() : null;
  if (bannerUrl && !/^https:\/\//.test(bannerUrl)) return fail("The banner must be a public https image.");
  const gameId = str(raw.gameId, 1, 100); if (!gameId) return fail("Choose a game.");

  const mode = raw.mode;
  if (mode !== "solo" && mode !== "duo" && mode !== "squad") return fail("Choose solo, duo or squad.");
  const maxTeamSize = mode === "solo" ? 1 : mode === "duo" ? 2 : Number(raw.maxTeamSize ?? 4);
  if (!Number.isInteger(maxTeamSize) || maxTeamSize < (mode === "squad" ? 3 : 1) || maxTeamSize > 6) return fail("A squad has 3 to 6 players.");
  const maxTeams = Number(raw.maxTeams);
  if (!Number.isInteger(maxTeams) || maxTeams < 2 || maxTeams > 500) return fail("Capacity must be a whole number from 2 to 500.");
  const ppr = raw.playersPerRoom === undefined || raw.playersPerRoom === null || raw.playersPerRoom === "" ? null : Number(raw.playersPerRoom);
  if (ppr !== null && (!Number.isInteger(ppr) || ppr < 2 || ppr > 500)) return fail("Players per room must be a whole number from 2 to 500.");

  const entryType = raw.entryType;
  if (entryType !== "free" && entryType !== "paid") return fail("Choose free or paid entry.");
  let entryFeeAmount: number | null = null, entryFeeCurrency: string | null = null;
  if (entryType === "paid") {
    const fee = Number(raw.entryFeeAmount);
    if (!Number.isFinite(fee) || fee <= 0 || fee > 1e8) return fail("Enter the entry fee per session.");
    if (!isSupportedCurrency(raw.entryFeeCurrency)) return fail("Choose the currency of the entry fee.");
    if (!paymentInstructions || paymentInstructions.length < 10) return fail("Tell players how to pay (at least 10 characters).");
    entryFeeAmount = Math.round(fee * 100) / 100; entryFeeCurrency = raw.entryFeeCurrency as string;
  }

  // schedule
  if (!isValidTimezone(raw.timezone)) return fail("Choose a time zone.");
  const timezone = raw.timezone;
  const days = Array.isArray(raw.daysOfWeek) ? [...new Set(raw.daysOfWeek.map(Number))] : [];
  if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return fail("Choose at least one day of the week.");
  const slots = Array.isArray(raw.slotTimes) ? [...new Set(raw.slotTimes.map(String))].sort() : [];
  if (slots.length === 0 || slots.some((t) => !TIME_RE.test(t))) return fail("Add at least one start time (like 20:00).");
  if (slots.length > MAX_SLOTS_HARD) return fail(`At most ${MAX_SLOTS_HARD} sessions per day.`);
  if (limits.maxSlotsPerDay !== null && slots.length > limits.maxSlotsPerDay) {
    return fail(`Your plan allows ${limits.maxSlotsPerDay} session${limits.maxSlotsPerDay === 1 ? "" : "s"} per day. Upgrade for more.`);
  }
  if (!isValidDateStr(raw.startDate)) return fail("Choose a start date.");
  const startDate = raw.startDate;
  if (startDate < dateInZone(now, timezone)) return fail("The start date can't be in the past.");
  const endDate = raw.endDate === undefined || raw.endDate === null || raw.endDate === "" ? null : raw.endDate;
  if (endDate !== null && !isValidDateStr(endDate)) return fail("The end date isn't a valid date.");
  if (endDate !== null && endDate < startDate) return fail("The end date must be on or after the start date.");
  const skipDates = Array.isArray(raw.skipDates) ? [...new Set(raw.skipDates.map(String))].sort() : [];
  if (skipDates.length > MAX_SKIP_DATES || skipDates.some((d) => !isValidDateStr(d))) return fail("Some skipped dates aren't valid.");

  if (limits.maxSeriesDays !== null) {
    if (endDate === null) return fail("A non-stop series needs a higher plan. Choose an end date, or upgrade.");
    if (daysBetween(startDate, endDate) + 1 > limits.maxSeriesDays) {
      return fail(`Your plan lets a series run up to ${limits.maxSeriesDays} days. Choose an earlier end date, or upgrade.`);
    }
  }
  if (endDate !== null && occurrences({ timezone, daysOfWeek: days, slotTimes: slots, startDate, endDate, skipDates }, startDate, endDate).length === 0) {
    return fail("That schedule has no sessions between the start and end dates.");
  }

  const country = typeof raw.country === "string" && raw.country.trim() ? raw.country.trim().toUpperCase().slice(0, 2) : null;
  return {
    ok: true,
    value: {
      name, description: description || null, bannerUrl, gameId, mode, maxTeamSize, maxTeams, playersPerRoom: ppr,
      entryType, entryFeeAmount, entryFeeCurrency, paymentInstructions: paymentInstructions || null, rulesText: rulesText || null, country,
      timezone, daysOfWeek: days.sort((a, b) => a - b), slotTimes: slots, startDate, endDate, skipDates,
    },
  };
}
