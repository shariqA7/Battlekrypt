// Pure helpers for organizer identity verification (no database, no network),
// so the rules can be tested on their own and used from client components.
// See IdentityVerification in prisma/schema.prisma for the model and the
// data-minimisation design. (The keyed hash lives in identity-hash.ts because
// it needs Node's crypto and must stay out of browser bundles.)

export const ID_BUCKET = "identity-documents";
export const DOC_TYPES = ["nic", "passport"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export type FileKind = "front" | "back" | "selfie";

export const DOC_LABEL: Record<DocType, string> = { nic: "National ID card (NIC)", passport: "Passport" };

// Strip spaces/dashes and upper-case: "35202-1234567-1" -> "3520212345671".
export function normalizeDocNumber(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

// Deliberately lenient (organizers come from several countries): 6-20 letters
// or digits once separators are removed. The reviewer checks it against the photo.
export function isPlausibleDocNumber(raw: string): boolean {
  const n = normalizeDocNumber(raw);
  return n.length >= 6 && n.length <= 20;
}

// A storage path the organizer may submit: inside their own folder, no tricks.
export function isOwnUpload(userId: string, path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith(`${userId}/`) &&
    !path.includes("..") &&
    path.length < 200 &&
    !path.slice(userId.length + 1).includes("/")
  );
}

export type IdentityLike = { status: "pending" | "approved" | "rejected"; validUntil: Date | null } | null | undefined;

export type IdentityState = "none" | "pending" | "approved" | "expired" | "rejected";

export function identityState(row: IdentityLike, now: Date = new Date()): IdentityState {
  if (!row) return "none";
  if (row.status === "approved") return row.validUntil && row.validUntil <= now ? "expired" : "approved";
  return row.status;
}

// The ONLY test for "identity verified": drives the Verified badge and lifts the
// starter limits.
export function isIdentityVerified(row: IdentityLike, now: Date = new Date()): boolean {
  return identityState(row, now) === "approved";
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

// When the images are deleted: sooner after a rejection than after an approval.
export function purgeAfterFor(
  decision: "approve" | "reject",
  cfg: { idRetentionDays: number; idRejectedRetentionDays: number },
  now: Date = new Date()
): Date {
  return addDays(now, decision === "approve" ? cfg.idRetentionDays : cfg.idRejectedRetentionDays);
}
