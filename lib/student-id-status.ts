// Pure rules for a player's stored student ID (no database access, so the
// tournament gate, the ID service and the UI can all share them).

export const ID_EXPIRING_SOON_DAYS = 30;
export const ID_MAX_YEARS_AHEAD = 10;

export type StudentIdStatus =
  | "none" // nothing stored
  | "valid" // usable
  | "expiring" // usable, but runs out within ID_EXPIRING_SOON_DAYS
  | "expired" // the card's expiry date has passed: add a new one
  | "other_institute"; // added for an institute the player has since left: add a new one

export interface StoredIdFields {
  idImagePath: string | null;
  idInstitutionId: string | null;
  idExpiresAt: Date | null;
  institutionId: string | null; // the player's CURRENT institute
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Dates are whole days (the card's printed date), compared in UTC: a card is
// good THROUGH its expiry date.
export const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function studentIdStatus(
  f: StoredIdFields,
  now = new Date()
): { status: StudentIdStatus; expiresAt: Date | null; daysLeft: number | null } {
  const expiresAt = f.idExpiresAt;
  if (!f.idImagePath) return { status: "none", expiresAt: null, daysLeft: null };
  if (!f.institutionId || f.idInstitutionId !== f.institutionId) {
    return { status: "other_institute", expiresAt, daysLeft: null };
  }
  if (!expiresAt) return { status: "valid", expiresAt: null, daysLeft: null };
  const daysLeft = Math.round((startOfUtcDay(expiresAt).getTime() - startOfUtcDay(now).getTime()) / DAY_MS);
  if (daysLeft < 0) return { status: "expired", expiresAt, daysLeft };
  return { status: daysLeft <= ID_EXPIRING_SOON_DAYS ? "expiring" : "valid", expiresAt, daysLeft };
}

export const isUsableStudentId = (s: StudentIdStatus) => s === "valid" || s === "expiring";

// "2027-03-31" -> a Date, or null if it isn't a real calendar date.
export function parseIdDate(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}
