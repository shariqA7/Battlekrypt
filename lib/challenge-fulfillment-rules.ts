// Pure rules for the proof -> payment -> dispute flow: the time limits and the
// input checks. No database, so they can be tested on their own.

export const HOUR = 3_600_000;

// How long each side has at each step. "Silence" outcomes are noted: a poster
// who never reviews proof is treated as confirming it; a challenger who never
// answers a payment is treated as having received it.
export const PROOF_REVIEW_HOURS = 48; // poster: confirm or dispute the proof
export const PAYOUT_DETAILS_DAYS = 7; // challenger: say where to send the prize
export const PAYMENT_HOURS = 72; // poster: pay / deliver and upload the receipt
export const PAYMENT_CONFIRM_HOURS = 120; // challenger: confirm receipt (5 days)
export const DISPUTE_RESPONSE_HOURS = 24; // accused side: answer with evidence
export const OWED_PAYMENT_HOURS = 24; // poster: pay after an admin says it is owed

export const addHours = (d: Date, h: number) => new Date(d.getTime() + h * HOUR);

export type Check<T> = { data: T } | { error: string; message: string };

const fail = (message: string): { error: string; message: string } => ({ error: "validation_error", message });

// Screenshots must be files uploaded to our own storage, not random links.
export function cleanUrls(
  urls: unknown,
  opts: { min: number; max: number; label: string; allowedPrefix?: string | null }
): Check<string[]> {
  const list = Array.isArray(urls) ? urls.filter((u): u is string => typeof u === "string").map((u) => u.trim()) : [];
  const unique = [...new Set(list)];
  if (unique.length < opts.min) {
    return fail(opts.min === 1 ? `Upload at least one ${opts.label}.` : `Upload at least ${opts.min} ${opts.label}s.`);
  }
  if (unique.length > opts.max) return fail(`You can attach at most ${opts.max} ${opts.label}s.`);
  for (const u of unique) {
    if (u.length > 600 || !/^https:\/\/\S+$/i.test(u)) return fail(`That ${opts.label} link isn't valid — upload the file instead.`);
    if (opts.allowedPrefix && !u.startsWith(opts.allowedPrefix)) return fail(`Upload your ${opts.label} here instead of linking elsewhere.`);
  }
  return { data: unique };
}

export function cleanText(
  value: unknown,
  opts: { min: number; max: number; label: string }
): Check<string> {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length < opts.min) return fail(`${opts.label} must be at least ${opts.min} characters.`);
  if (v.length > opts.max) return fail(`${opts.label} must be at most ${opts.max} characters.`);
  return { data: v };
}

export function optionalText(value: unknown, max: number, label: string): Check<string | null> {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return { data: null };
  if (v.length > max) return fail(`${label} must be at most ${max} characters.`);
  return { data: v };
}

// The stages an entry can still move out of.
export const OPEN_STAGES = [
  "playing",
  "proof_review",
  "proof_disputed",
  "awaiting_payout_details",
  "awaiting_payment",
  "payment_sent",
  "payment_disputed",
] as const;
export const TERMINAL_STAGES = ["completed", "failed"] as const;

export function isTerminal(stage: string) {
  return (TERMINAL_STAGES as readonly string[]).includes(stage);
}

// When every picked entry is finished, the challenge itself is: "completed"
// if anyone completed it, otherwise "expired" (nobody did).
export function challengeOutcome(stages: string[]): "completed" | "expired" | null {
  if (stages.length === 0 || !stages.every(isTerminal)) return null;
  return stages.includes("completed") ? "completed" : "expired";
}

// A payment can be reported as missing if the poster says it was sent, or if
// the poster's payment window has run out without a receipt.
export function canReportNotPaid(stage: string, stageDeadline: Date | null, now = new Date()): boolean {
  if (stage === "payment_sent") return true;
  return stage === "awaiting_payment" && !!stageDeadline && stageDeadline <= now;
}
