// Subscription plans (Phase 5, spec §7).
//
// Plans are rows in the `Plan` table (admin-editable). An account stores only
// a plan CODE (+ optional expiry) on its profile; everything else — limits,
// price, badge/ad-free status — is derived here, never stored separately.
//
// Guardrail from the spec: free plans never block anything competitive
// (joining, rating, tier eligibility). Every limit below is a convenience or
// cosmetic one. Keep it that way when adding new keys.

import type { PlanAudience } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const FREE_PLAN_CODE: Record<PlanAudience, string> = {
  organizer: "organizer_free",
  club: "club_free",
  player: "player_free",
};

// ------------------------------------------------------------
// Limit shapes — one per audience. The DB stores them as JSON on the Plan
// row; LIMIT_KEYS is the single source of truth for which keys exist and
// what type each one is (used both to read them safely and to validate
// admin edits).
// ------------------------------------------------------------

// "limit": whole number >= 0, or null = unlimited
// "count": whole number >= 0 (always finite)
// "flag":  boolean
type LimitKind = "limit" | "count" | "flag";

export const LIMIT_KEYS = {
  organizer: {
    maxTournamentsPerMonth: "limit",
    maxGames: "limit",
    maxTemplates: "limit",
    advancedAnalytics: "flag",
    prioritySupport: "flag",
  },
  club: {
    maxEntriesPerGame: "limit",
    maxGames: "limit",
    maxPlayersPerTeam: "count",
    maxSubstitutesPerTeam: "count",
    canSetCoach: "flag",
    merchStore: "flag",
    enhancedProfile: "flag",
  },
  player: {
    priorityRegistration: "flag",
    extendedStats: "flag",
  },
} as const satisfies Record<PlanAudience, Record<string, LimitKind>>;

export interface OrganizerLimits {
  maxTournamentsPerMonth: number | null;
  maxGames: number | null;
  maxTemplates: number | null;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
}

export interface ClubPlanLimits {
  // Max (teams + solo players) a club may field in ONE game. null = unlimited.
  maxEntriesPerGame: number | null;
  // Max distinct games a club may field entries in. null = unlimited.
  maxGames: number | null;
  maxPlayersPerTeam: number;
  maxSubstitutesPerTeam: number;
  canSetCoach: boolean;
  // Merch store (Phase 9) — flag only, nothing consumes it yet.
  merchStore: boolean;
  enhancedProfile: boolean;
}

export interface PlayerLimits {
  priorityRegistration: boolean;
  extendedStats: boolean;
}

export interface LimitsByAudience {
  organizer: OrganizerLimits;
  club: ClubPlanLimits;
  player: PlayerLimits;
}

// Fallbacks used only when the Plan row is missing or has a bad/absent key,
// so a broken row can never accidentally grant paid features. They mirror
// the seeded rows in the phase-5 migration.
const FREE_DEFAULTS: LimitsByAudience = {
  organizer: {
    maxTournamentsPerMonth: 3,
    maxGames: 2,
    maxTemplates: 1,
    advancedAnalytics: false,
    prioritySupport: false,
  },
  club: {
    maxEntriesPerGame: 1,
    maxGames: 2,
    maxPlayersPerTeam: 6,
    maxSubstitutesPerTeam: 0,
    canSetCoach: false,
    merchStore: false,
    enhancedProfile: false,
  },
  player: { priorityRegistration: false, extendedStats: false },
};

const PAID_DEFAULTS: LimitsByAudience = {
  organizer: {
    maxTournamentsPerMonth: null,
    maxGames: null,
    maxTemplates: null,
    advancedAnalytics: true,
    prioritySupport: true,
  },
  club: {
    maxEntriesPerGame: null,
    maxGames: null,
    maxPlayersPerTeam: 6,
    maxSubstitutesPerTeam: 2,
    canSetCoach: true,
    merchStore: true,
    enhancedProfile: true,
  },
  player: { priorityRegistration: true, extendedStats: true },
};

function isWholeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

// Read a limits JSON blob, keeping only well-formed keys and filling the
// rest from the defaults for that (audience, paid/free) combination.
export function parseLimits<A extends PlanAudience>(
  audience: A,
  raw: unknown,
  isPaid: boolean
): LimitsByAudience[A] {
  const defaults = (isPaid ? PAID_DEFAULTS : FREE_DEFAULTS)[audience] as unknown as Record<
    string,
    number | boolean | null
  >;
  const kinds = LIMIT_KEYS[audience] as Record<string, LimitKind>;
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const out: Record<string, number | boolean | null> = {};
  for (const key of Object.keys(kinds)) {
    const kind = kinds[key];
    const v = src[key];
    if (kind === "flag") out[key] = typeof v === "boolean" ? v : defaults[key];
    else if (kind === "limit") out[key] = v === null || isWholeNumber(v) ? (v as number | null) : defaults[key];
    else out[key] = isWholeNumber(v) ? v : defaults[key];
  }
  return out as unknown as LimitsByAudience[A];
}

// Strict version for admin edits: reject anything malformed instead of
// silently falling back. Returns the cleaned object or an error message.
export function validateLimitsInput(
  audience: PlanAudience,
  raw: unknown
): { ok: true; value: Record<string, number | boolean | null> } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "Limits must be an object." };
  }
  const src = raw as Record<string, unknown>;
  const kinds = LIMIT_KEYS[audience] as Record<string, LimitKind>;
  const out: Record<string, number | boolean | null> = {};

  for (const key of Object.keys(src)) {
    if (!(key in kinds)) return { ok: false, message: `Unknown limit "${key}" for ${audience} plans.` };
  }
  for (const key of Object.keys(kinds)) {
    const kind = kinds[key];
    const v = src[key];
    if (kind === "flag") {
      if (typeof v !== "boolean") return { ok: false, message: `"${key}" must be true or false.` };
      out[key] = v;
    } else if (kind === "limit") {
      if (v !== null && !isWholeNumber(v)) {
        return { ok: false, message: `"${key}" must be a whole number, or empty for unlimited.` };
      }
      out[key] = v as number | null;
    } else {
      if (!isWholeNumber(v)) return { ok: false, message: `"${key}" must be a whole number.` };
      out[key] = v;
    }
  }
  return { ok: true, value: out };
}

// ------------------------------------------------------------
// Effective plan for an account
// ------------------------------------------------------------

export interface PlanHolder {
  planCode: string;
  planExpiresAt: Date | null;
}

export interface EffectivePlan<A extends PlanAudience = PlanAudience> {
  audience: A;
  // The plan actually in force (the free plan if the paid one has lapsed).
  code: string;
  name: string;
  isPaid: boolean;
  // Set when the account holds a paid plan that has lapsed.
  expired: boolean;
  expiresAt: Date | null;
  limits: LimitsByAudience[A];
}

export async function resolvePlan<A extends PlanAudience>(
  audience: A,
  holder: PlanHolder,
  now: Date = new Date()
): Promise<EffectivePlan<A>> {
  const freeCode = FREE_PLAN_CODE[audience];
  const lapsed =
    holder.planCode !== freeCode && holder.planExpiresAt !== null && holder.planExpiresAt <= now;
  const wantedCode = lapsed ? freeCode : holder.planCode;

  let row = await prisma.plan.findUnique({ where: { code: wantedCode } });
  // Unknown code, or a plan of the wrong audience: fall back to free rather
  // than guessing. (A deactivated plan still applies to existing holders —
  // isActive only hides it from new purchases.)
  if (!row || row.audience !== audience) {
    row = wantedCode === freeCode ? null : await prisma.plan.findUnique({ where: { code: freeCode } });
    if (row && row.audience !== audience) row = null;
  }

  const isPaid = row?.isPaid ?? false;
  return {
    audience,
    code: row?.code ?? freeCode,
    name: row?.name ?? "Free",
    isPaid,
    expired: lapsed,
    expiresAt: isPaid ? holder.planExpiresAt : null,
    limits: parseLimits(audience, row?.limits, isPaid),
  };
}

// ------------------------------------------------------------
// Derived flags (never stored — spec §7)
// ------------------------------------------------------------

// Organizer/Club: paid plan AND approved (organizer KYC / club approval).
// Player: paid plan is enough.
export function isVerified(audience: PlanAudience, plan: { isPaid: boolean }, approved: boolean) {
  return audience === "player" ? plan.isPaid : plan.isPaid && approved;
}

// ------------------------------------------------------------
// Plan changes
// ------------------------------------------------------------

// New expiry when a paid plan is granted: extends from the current expiry if
// the same plan is still running (so renewing early doesn't waste days),
// otherwise starts now.
export function computeNewExpiry(
  current: { planCode: string; planExpiresAt: Date | null },
  grantedCode: string,
  durationDays: number,
  now: Date = new Date()
): Date {
  const stillRunning =
    current.planCode === grantedCode && current.planExpiresAt !== null && current.planExpiresAt > now;
  const start = stillRunning ? (current.planExpiresAt as Date) : now;
  return new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);
}

// ------------------------------------------------------------
// Bulk badge check (lists of organizers etc.)
// ------------------------------------------------------------

// Codes of every paid plan, fetched once so a list page can decide
// "verified?" for many accounts synchronously instead of one query each.
export async function getPaidPlanCodes(): Promise<Set<string>> {
  const rows = await prisma.plan.findMany({ where: { isPaid: true }, select: { code: true } });
  return new Set(rows.map((r) => r.code));
}

// Same lapse rule as resolvePlan: a paid plan with a past expiry doesn't count.
export function holdsPaidPlan(
  holder: PlanHolder,
  paidCodes: Set<string>,
  now: Date = new Date()
): boolean {
  if (!paidCodes.has(holder.planCode)) return false;
  return holder.planExpiresAt === null || holder.planExpiresAt > now;
}
