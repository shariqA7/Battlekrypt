// "Customize your plan" requests: what an organizer may ask for, and what an admin may quote.
// Pure rules (no database, no React), shared by the form, the API and the tests.
import { LIMIT_KEYS, parseLimits, validateLimitsInput } from "@/lib/plan-limits";
import { isValidEmail, normalizeEmail } from "@/lib/validation/auth";

export const MAX_OPEN_CUSTOM_REQUESTS = 3;
export const MAX_REQUESTED_NUMBER = 1_000_000;

/** Every organizer plan option with the values of a typical paid plan: the starting point of the form. */
export function organizerPlanDefaults(): Record<string, number | boolean | null> {
  return parseLimits("organizer", {}, true) as unknown as Record<string, number | boolean | null>;
}

/** Fills missing options with the defaults, then applies the plan rules. Returns every option. */
export function completeOrganizerLimits(raw: unknown): { ok: true; value: Record<string, number | boolean | null> } | { ok: false; message: string } {
  if (raw === undefined || raw === null) return { ok: true, value: organizerPlanDefaults() };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "The plan options must be an object." };
  const checked = validateLimitsInput("organizer", { ...organizerPlanDefaults(), ...(raw as Record<string, unknown>) });
  if (!checked.ok) return checked;
  for (const [k, v] of Object.entries(checked.value)) {
    if (typeof v === "number" && (v < 0 || v > MAX_REQUESTED_NUMBER)) {
      return { ok: false, message: `"${k}" must be between 0 and ${MAX_REQUESTED_NUMBER.toLocaleString("en-US")}, or empty for unlimited.` };
    }
  }
  return checked;
}

export type CustomRequestInput = {
  contactName: string; contactEmail: string | null; contactPhone: string | null;
  limits: Record<string, number | boolean | null>; note: string | null;
};

export function validateCustomRequest(raw: Record<string, unknown>): { ok: true; value: CustomRequestInput } | { ok: false; message: string } {
  const name = typeof raw.contactName === "string" ? raw.contactName.trim() : "";
  if (name.length < 2 || name.length > 80) return { ok: false, message: "Enter your name (2–80 characters)." };
  const email = normalizeEmail(raw.contactEmail);
  if (email && !isValidEmail(email)) return { ok: false, message: "That email address doesn't look right." };
  const phone = typeof raw.contactPhone === "string" ? raw.contactPhone.trim() : "";
  if (phone && !/^[0-9+()\-\s]{6,20}$/.test(phone)) return { ok: false, message: "That phone number doesn't look right." };
  if (!email && !phone) return { ok: false, message: "Give an email or a phone number so we can reach you." };
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (note.length > 1000) return { ok: false, message: "The note can be at most 1000 characters." };
  const limits = completeOrganizerLimits(raw.limits);
  if (!limits.ok) return limits;
  return { ok: true, value: { contactName: name, contactEmail: email || null, contactPhone: phone || null, limits: limits.value, note: note || null } };
}

/** Option names in the order the form shows them (the plan's own order). */
export const ORGANIZER_LIMIT_ORDER = Object.keys(LIMIT_KEYS.organizer);
