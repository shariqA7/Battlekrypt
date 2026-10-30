// The duplicate-proof matching rule. Pure (no database) so it can be tested on its own.
// Used by lib/services/proof-fingerprints.ts.
//
// Two ways a proof can be a duplicate of another submission:
//   file      the very same screenshot file (SHA-256)
//   reference the same transaction ID typed by the payer (the reliable one: a re-saved or
//             re-screenshotted copy still carries the same ID)

export type ProofKindName = "registration" | "plan_request" | "invoice" | "club_fee";

export type ProofMatch = {
  /** How many OTHER submissions match. */
  count: number;
  /** What matched: the screenshot file, the transaction ID, or both. */
  by: "file" | "reference" | "both";
  /** One of the other submissions came from the same account. */
  sameUser: boolean;
  /** One of the other submissions was for the same organizer's events. */
  sameOrganizer: boolean;
};

export type Print = {
  kind: ProofKindName;
  refId: string;
  userId: string | null;
  organizerId: string | null;
  sha256: string | null;
  /** Normalized transaction ID (see normalizeReference), or null. */
  reference: string | null;
};

export const MIN_REFERENCE_LENGTH = 6;

/** A transaction ID with spacing, dashes and letter case taken out, so "ab-12 34 56" equals "AB123456". */
export function normalizeReference(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key.length < MIN_REFERENCE_LENGTH) return null;
  if (/^(.)\1+$/.test(key)) return null; // "000000", "AAAAAA": not a real ID
  return key;
}

/** What the payer typed, cleaned for display, plus its matching key. Null if it isn't a usable ID. */
export function parseReference(raw: unknown): { display: string; key: string } | null {
  const key = normalizeReference(raw);
  if (!key || typeof raw !== "string") return null;
  return { display: raw.trim().replace(/\s+/g, " ").slice(0, 120), key };
}

export const REFERENCE_REQUIRED_MESSAGE = "Enter the transaction ID shown on your payment receipt (at least 6 letters or numbers).";

/** A proof matches every OTHER proof with the same file hash or the same transaction ID (never itself). */
export function buildMatches(mine: Print[], all: Print[]): Map<string, ProofMatch> {
  const out = new Map<string, ProofMatch>();
  for (const a of mine) {
    const others = all.filter((b) => !(b.kind === a.kind && b.refId === a.refId));
    const byFile = others.filter((b) => a.sha256 !== null && b.sha256 === a.sha256);
    const byRef = others.filter((b) => a.reference !== null && b.reference === a.reference);
    const hits = others.filter((b) => byFile.includes(b) || byRef.includes(b));
    if (hits.length === 0) continue;
    out.set(a.refId, {
      count: hits.length,
      by: byFile.length && byRef.length ? "both" : byFile.length ? "file" : "reference",
      sameUser: !!a.userId && hits.some((b) => b.userId === a.userId),
      sameOrganizer: !!a.organizerId && hits.some((b) => b.organizerId === a.organizerId),
    });
  }
  return out;
}
