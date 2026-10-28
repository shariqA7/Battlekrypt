// Pure helpers (no database imports) so client forms can use them too.
//
// How long an admin-assigned plan lasts: a number of calendar months or days, a
// fixed end date, or no expiry at all.

export type PlanDuration =
  | { kind: "months"; months: number }
  | { kind: "days"; days: number }
  | { kind: "until"; date: string } // YYYY-MM-DD, inclusive
  | { kind: "permanent" };

const MAX_MONTHS = 120;
const MAX_DAYS = 3650;
const DAY_MS = 86_400_000;

export const DURATION_PRESETS: { label: string; value: PlanDuration }[] = [
  { label: "1 month", value: { kind: "months", months: 1 } },
  { label: "3 months", value: { kind: "months", months: 3 } },
  { label: "6 months", value: { kind: "months", months: 6 } },
  { label: "1 year", value: { kind: "months", months: 12 } },
  { label: "2 years", value: { kind: "months", months: 24 } },
  { label: "3 years", value: { kind: "months", months: 36 } },
];

// Adds calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb).
export function addMonthsClamped(from: Date, months: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(y, m, Math.min(from.getUTCDate(), lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds())
  );
}

export function parsePlanDuration(raw: unknown, now: Date = new Date()): { ok: true; value: PlanDuration } | { ok: false; message: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  switch (o.kind) {
    case "permanent":
      return { ok: true, value: { kind: "permanent" } };
    case "months": {
      const n = Number(o.months);
      if (!Number.isInteger(n) || n < 1 || n > MAX_MONTHS) return { ok: false, message: `Months must be a whole number from 1 to ${MAX_MONTHS}.` };
      return { ok: true, value: { kind: "months", months: n } };
    }
    case "days": {
      const n = Number(o.days);
      if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) return { ok: false, message: `Days must be a whole number from 1 to ${MAX_DAYS}.` };
      return { ok: true, value: { kind: "days", days: n } };
    }
    case "until": {
      const s = typeof o.date === "string" ? o.date : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, message: "Choose an end date." };
      const end = endOfDayUtc(s);
      if (Number.isNaN(end.getTime())) return { ok: false, message: "That end date isn't valid." };
      if (end <= now) return { ok: false, message: "The end date must be in the future." };
      if (end.getTime() - now.getTime() > 20 * 366 * DAY_MS) return { ok: false, message: "The end date is too far away (20 years at most)." };
      return { ok: true, value: { kind: "until", date: s } };
    }
    default:
      return { ok: false, message: "Choose how long the plan lasts." };
  }
}

function endOfDayUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  // Reject overflow like 2026-02-31.
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : new Date(NaN);
}

// The new expiry, or null for "no expiry". With `extend`, a same plan that is
// still running keeps its remaining time and the new period is added on top.
export function computeAssignedExpiry(
  current: { planCode: string; planExpiresAt: Date | null },
  planCode: string,
  duration: PlanDuration,
  extend: boolean,
  now: Date = new Date()
): Date | null {
  if (duration.kind === "permanent") return null;
  if (duration.kind === "until") return endOfDayUtc(duration.date);
  const stillRunning = current.planCode === planCode && current.planExpiresAt !== null && current.planExpiresAt > now;
  const start = extend && stillRunning ? (current.planExpiresAt as Date) : now;
  return duration.kind === "months" ? addMonthsClamped(start, duration.months) : new Date(start.getTime() + duration.days * DAY_MS);
}
