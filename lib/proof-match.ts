// The duplicate-proof matching rule. Pure (no database) so it can be tested on its own.
// Used by lib/services/proof-fingerprints.ts.

export type ProofKindName = "registration" | "plan_request" | "invoice" | "club_fee";

export type ProofMatch = {
  /** How many OTHER submissions are the very same file. */
  count: number;
  /** One of the other submissions came from the same account. */
  sameUser: boolean;
  /** One of the other submissions was for the same organizer's events. */
  sameOrganizer: boolean;
};

export type Print = { kind: ProofKindName; refId: string; userId: string | null; organizerId: string | null; sha256: string };

/** A proof matches every OTHER proof with the same file hash (never itself). */
export function buildMatches(mine: Print[], all: Print[]): Map<string, ProofMatch> {
  const out = new Map<string, ProofMatch>();
  for (const a of mine) {
    const others = all.filter((b) => b.sha256 === a.sha256 && !(b.kind === a.kind && b.refId === a.refId));
    if (others.length === 0) continue;
    out.set(a.refId, {
      count: others.length,
      sameUser: !!a.userId && others.some((b) => b.userId === a.userId),
      sameOrganizer: !!a.organizerId && others.some((b) => b.organizerId === a.organizerId),
    });
  }
  return out;
}
