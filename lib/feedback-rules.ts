// Site feedback: the kinds, statuses and the validation. Pure (no database, no React) so the
// form, the API and the tests all use the same rules.
import { isValidEmail, normalizeEmail } from "@/lib/validation/auth";

export const FEEDBACK_KINDS = ["feature", "issue", "other"] as const;
export type FeedbackKindT = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_KIND_LABEL: Record<FeedbackKindT, string> = {
  feature: "Suggest a new feature",
  issue: "Report a problem",
  other: "Something else",
};

export const FEEDBACK_STATUSES = ["open", "reviewing", "planned", "done", "declined"] as const;
export type FeedbackStatusT = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatusT, string> = {
  open: "New",
  reviewing: "Looking into it",
  planned: "Planned",
  done: "Done",
  declined: "Won't do",
};

export const FEEDBACK_MESSAGE_MIN = 10;
export const FEEDBACK_MESSAGE_MAX = 2000;
export const FEEDBACK_NOTE_MAX = 1000;
/** Per sender: a visitor is counted by IP address, a signed-in user by account. */
export const FEEDBACK_PER_HOUR_BY_IP = 5;
export const FEEDBACK_PER_DAY_BY_USER = 10;

/** Only the path of a page, never the query string or #fragment (those can hold private tokens). */
export function cleanPagePath(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const path = v.trim().split(/[?#]/)[0];
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300) return null;
  return path;
}

export type FeedbackInput = { kind: FeedbackKindT; message: string; contactEmail: string | null; pageUrl: string | null };

export function validateFeedback(raw: { kind?: unknown; message?: unknown; email?: unknown; pageUrl?: unknown }): { ok: true; value: FeedbackInput } | { ok: false; message: string } {
  if (typeof raw.kind !== "string" || !FEEDBACK_KINDS.includes(raw.kind as FeedbackKindT)) {
    return { ok: false, message: "Choose what kind of feedback this is." };
  }
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (message.length < FEEDBACK_MESSAGE_MIN || message.length > FEEDBACK_MESSAGE_MAX) {
    return { ok: false, message: `Write ${FEEDBACK_MESSAGE_MIN}–${FEEDBACK_MESSAGE_MAX} characters.` };
  }
  const email = normalizeEmail(raw.email);
  if (email && !isValidEmail(email)) return { ok: false, message: "That email address doesn't look right." };
  return { ok: true, value: { kind: raw.kind as FeedbackKindT, message, contactEmail: email || null, pageUrl: cleanPagePath(raw.pageUrl) } };
}
