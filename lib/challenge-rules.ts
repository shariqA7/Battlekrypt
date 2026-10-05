// Pure rules for challenge applications — no database, so they can be tested
// on their own. The services call these with data they have already loaded.

export interface ChallengeFacts {
  status: string;
  posterUserId: string;
  gameId: string;
  entrantType: "player" | "team" | "either";
  minRating: number | null;
  applicationsCloseAt: Date;
  maxApplicants: number;
}

export type EntrantKind = "player" | "team";

// Why this applicant can't apply, or null if they can. Order matters: the
// first problem found is the one shown.
export function applyBlocker(opts: {
  challenge: ChallengeFacts;
  userId: string;
  kind: EntrantKind;
  rating: number;
  hasPlanAccess: boolean;
  activeApplications: number; // applications currently in "applied"
  alreadyApplied: boolean; // has an applied/selected row already
  now?: Date;
}): { code: string; message: string } | null {
  const { challenge: c, now = new Date() } = opts;

  if (c.posterUserId === opts.userId) return { code: "own_challenge", message: "You can't apply to your own challenge." };
  if (c.status !== "open") return { code: "closed", message: "This challenge isn't taking applications." };
  if (c.applicationsCloseAt <= now) return { code: "closed", message: "Applications for this challenge have closed." };
  if (opts.alreadyApplied) return { code: "already_applied", message: "You've already applied to this challenge." };
  if (!opts.hasPlanAccess) {
    return {
      code: "plan_required",
      message: opts.kind === "team" ? "Your club's plan doesn't include joining challenges." : "Your plan doesn't include joining challenges.",
    };
  }
  if (c.entrantType === "player" && opts.kind === "team") return { code: "wrong_entrant", message: "This challenge is for solo players only." };
  if (c.entrantType === "team" && opts.kind === "player") return { code: "wrong_entrant", message: "This challenge is for teams only." };
  if (c.minRating !== null && opts.rating < c.minRating) {
    return { code: "rating_too_low", message: `You need a rating of ${c.minRating} or higher (yours is ${opts.rating}).` };
  }
  if (opts.activeApplications >= c.maxApplicants) {
    return { code: "full", message: "This challenge has reached its application limit." };
  }
  return null;
}

// Checks a poster's pick before anything is written. They must confirm, pick
// at least one and at most `slots`, and only from people who actually applied.
export function selectionBlocker(opts: {
  status: string;
  slots: number;
  chosenIds: string[];
  appliedIds: string[];
  confirm: boolean;
}): { code: string; message: string } | null {
  if (opts.status !== "open") return { code: "not_open", message: "This challenge isn't open for picking any more." };
  if (!opts.confirm) return { code: "not_confirmed", message: "Confirm your selection first." };
  const unique = new Set(opts.chosenIds);
  if (unique.size !== opts.chosenIds.length) return { code: "invalid_selection", message: "Each applicant can only be picked once." };
  if (unique.size < 1) return { code: "nothing_selected", message: "Pick at least one applicant." };
  if (unique.size > opts.slots) {
    return { code: "too_many", message: `You can pick at most ${opts.slots} applicant${opts.slots === 1 ? "" : "s"}.` };
  }
  const applied = new Set(opts.appliedIds);
  if (![...unique].every((id) => applied.has(id))) {
    return { code: "invalid_selection", message: "One of those applicants is no longer available." };
  }
  return null;
}

// Days a poster has to pick after applications close, before the challenge
// expires. (With nobody applied it expires as soon as applications close.)
export const PICK_GRACE_DAYS = 7;
