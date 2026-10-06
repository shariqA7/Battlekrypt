// Pure rules for challenge safety: report thresholds, the 18+ rule for cash
// prizes, and how two accounts' browsing records are compared for collusion.

export const REPORT_HIDE_THRESHOLD = 3; // open reports from different people that hide a challenge
export const MAX_REPORTS_PER_DAY = 10; // per person, so reporting can't be used to spam
export const MIN_CASH_AGE = 18;

// IP overlap only counts when few accounts use that address. A shared
// household has 2-5; a mobile carrier or an internet café has far more.
export const MAX_ACCOUNTS_PER_SHARED_IP = 5;
export const SESSION_LOOKBACK_DAYS = 60;
export const REPEAT_PAIR_MIN = 3; // the third time the same two accounts are paired
export const REPEAT_PAIR_WINDOW_DAYS = 90;

export const REPORT_REASONS = [
  { value: "scam", label: "Looks like a scam" },
  { value: "misleading", label: "Misleading or false prize" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export function isReportReason(v: unknown): v is ReportReason {
  return REPORT_REASONS.some((r) => r.value === v);
}

// Cash prizes are for adults. `age` is the self-reported profile age; missing
// means we can't tell, which is treated as "not yet allowed".
export function cashAgeCheck(age: number | null | undefined): "ok" | "age_required" | "too_young" {
  if (age === null || age === undefined) return "age_required";
  return age >= MIN_CASH_AGE ? "ok" : "too_young";
}

export interface SessionLite {
  ip: string | null;
  userAgent: string | null;
}

export interface Overlap {
  kind: "same_device" | "same_network";
  ips: string[];
}

// Compares two accounts' sessions. `accountsPerIp` says how many different
// accounts have used each address — busy addresses are ignored.
export function classifyOverlap(
  poster: SessionLite[],
  challenger: SessionLite[],
  accountsPerIp: Map<string, number>
): Overlap | null {
  const usable = (s: SessionLite): s is SessionLite & { ip: string } =>
    !!s.ip && (accountsPerIp.get(s.ip) ?? 0) <= MAX_ACCOUNTS_PER_SHARED_IP;

  const posterIps = new Set(poster.filter(usable).map((s) => s.ip));
  const sharedIps = [...new Set(challenger.filter(usable).map((s) => s.ip))].filter((ip) => posterIps.has(ip));
  if (sharedIps.length === 0) return null;

  const posterKeys = new Set(poster.filter(usable).map((s) => `${s.ip}|${s.userAgent ?? ""}`));
  const sameDevice = challenger.filter(usable).some((s) => s.userAgent && posterKeys.has(`${s.ip}|${s.userAgent}`));
  return { kind: sameDevice ? "same_device" : "same_network", ips: sharedIps.slice(0, 5) };
}
