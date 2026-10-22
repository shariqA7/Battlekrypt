// Pure rules for parental consent — no database, so they can be tested directly.
import { createHash, randomBytes } from "node:crypto";
import { ageOn } from "@/lib/age";
import { ADULT_AGE } from "@/lib/consent-config";

// "withdrawn": the guardian approved once and later took the approval back.
export type ConsentState = "approved" | "pending" | "declined" | "expired" | "withdrawn" | "none";

export interface ConsentRecord {
  status: "pending" | "approved" | "declined" | "revoked" | "superseded";
  validUntil: Date | null;
  linkExpiresAt: Date;
  decidedAt: Date | null;
  createdAt: Date;
  revokedAt?: Date | null;
}

// Minors (13 to 17) can only view the platform until a guardian has approved: they can't
// join tournaments, scrims, leagues or challenges. Applies whenever the platform consent
// switch is on and the player's date of birth says they are under 18. A player with no
// date of birth on file is not treated as a minor here (the profile form asks for one).
export function joinNeedsConsent(
  birthDate: Date | null | undefined,
  enabled: boolean,
  now: Date = new Date()
): boolean {
  if (!enabled || !birthDate) return false;
  return ageOn(birthDate, now) < ADULT_AGE;
}

// Does this player, for this tournament, need a guardian's consent right now?
// (Off when the platform switch is off, when the tournament doesn't ask for it,
// when the player is 18+, or when no date of birth is known.)
export function consentNeeded(
  t: { requireParentalConsent: boolean },
  birthDate: Date | null | undefined,
  enabled: boolean,
  now: Date = new Date()
): boolean {
  if (!enabled || !t.requireParentalConsent || !birthDate) return false;
  return ageOn(birthDate, now) < ADULT_AGE;
}

// The player's current consent state from all their requests. One valid approval
// wins; otherwise a live pending link; otherwise how the last attempt ended.
export function deriveConsentState(
  records: ConsentRecord[],
  now: Date = new Date()
): { state: ConsentState; validUntil: Date | null } {
  const approved = records
    .filter((r) => r.status === "approved" && r.validUntil && r.validUntil > now)
    .sort((a, b) => b.validUntil!.getTime() - a.validUntil!.getTime())[0];
  if (approved) return { state: "approved", validUntil: approved.validUntil };

  if (records.some((r) => r.status === "pending" && r.linkExpiresAt > now)) {
    return { state: "pending", validUntil: null };
  }

  const when = (r: ConsentRecord) => (r.revokedAt ?? r.decidedAt ?? r.createdAt).getTime();
  const decided = records
    .filter((r) => r.status === "declined" || r.status === "revoked" || (r.status === "approved" && r.validUntil))
    .sort((a, b) => when(b) - when(a))[0];
  if (decided?.status === "revoked") return { state: "withdrawn", validUntil: null };
  if (decided?.status === "declined") return { state: "declined", validUntil: null };
  if (decided?.status === "approved") return { state: "expired", validUntil: decided.validUntil };
  return { state: "none", validUntil: null };
}

// Token in the emailed link: 32 random bytes, only the SHA-256 is stored.
export function newConsentToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashConsentToken(token) };
}
export function hashConsentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isPlausibleEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// "parent.name@gmail.com" -> "p•••••••e@gmail.com" (shown only to the player who typed it).
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const shown = local.length <= 2 ? local[0] : local[0] + "•".repeat(Math.min(local.length - 2, 8)) + local.slice(-1);
  return `${shown}@${domain}`;
}

// A typed legal name: at least 3 characters, letters, and not just spaces.
export function isValidSignedName(name: string): boolean {
  const n = name.trim().replace(/\s+/g, " ");
  return n.length >= 3 && n.length <= 100 && /\p{L}/u.test(n);
}

// "Ahmed Khan" -> "Ahmed K." — what the consent page and email call the child.
export function childDisplayName(firstName: string | null, lastName: string | null): string {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  if (!f && !l) return "your child";
  return l ? `${f} ${l[0].toUpperCase()}.`.trim() : f;
}

export type EntryConsentStatus = "not_required" | "approved" | "pending" | "declined";

// Organizer's column for one registration: every player on the entry who needs
// consent must have it. Never exposes anything but the status.
export function entryConsentStatus(
  members: { needed: boolean; state: ConsentState }[]
): EntryConsentStatus {
  const needing = members.filter((m) => m.needed);
  if (needing.length === 0) return "not_required";
  if (needing.every((m) => m.state === "approved")) return "approved";
  if (needing.some((m) => m.state === "declined" || m.state === "withdrawn")) return "declined";
  return "pending";
}
