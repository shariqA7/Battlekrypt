// Subscription plans: the functions that read the Plan table. Server only.
// The rules, limit shapes and pure helpers live in lib/plan-limits.ts (safe for browser code) and
// are re-exported here, so `import ... from "@/lib/plans"` keeps working for server code.
import type { PlanAudience } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FREE_PLAN_CODE, parseLimits, type EffectivePlan, type PlanHolder } from "@/lib/plan-limits";

export * from "@/lib/plan-limits";

// ------------------------------------------------------------
// Effective plan for an account
// ------------------------------------------------------------

export async function resolvePlan<A extends PlanAudience>(
  audience: A,
  holder: PlanHolder,
  now: Date = new Date()
): Promise<EffectivePlan<A>> {
  const freeCode = FREE_PLAN_CODE[audience];
  // A scheduled plan that has started counts from its start date, even before the daily job has
  // written it to the account.
  if (holder.nextPlanCode && holder.nextPlanStartsAt && holder.nextPlanStartsAt <= now) {
    holder = {
      planCode: holder.nextPlanCode,
      planExpiresAt: new Date(holder.nextPlanStartsAt.getTime() + (holder.nextPlanDays ?? 30) * 86_400_000),
    };
  }
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

// Codes of every paid plan, fetched once so a list page can decide
// "verified?" for many accounts synchronously instead of one query each.
export async function getPaidPlanCodes(): Promise<Set<string>> {
  const rows = await prisma.plan.findMany({ where: { isPaid: true }, select: { code: true } });
  return new Set(rows.map((r) => r.code));
}
