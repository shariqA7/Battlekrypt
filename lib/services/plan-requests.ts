// Plan purchase flow + admin plan management (Phase 5).
//
// No payment gateway yet (that's Phase 7): an account picks a paid plan,
// pays out-of-band, uploads a screenshot proof — the same flow as the club
// registration fee — and an admin approves or rejects. Approval grants the
// plan for `durationDays`; when that lapses the account silently reverts to
// free at read time (see resolvePlan), nothing needs to run on a schedule.

import type { PaymentKind, PlanAudience } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isIdentityVerified } from "@/lib/identity";
import {
  FREE_PLAN_CODE,
  computeNewExpiry,
  isVerified,
  resolvePlan,
  validateLimitsInput,
  type EffectivePlan,
} from "@/lib/plans";
import { isSupportedCurrency, ZERO_DECIMAL_CURRENCIES } from "@/lib/money";
import { currenciesNotEnabled } from "@/lib/services/currencies";
import { getDepositDue } from "@/lib/services/security-deposits";
import { validateExtras } from "@/lib/services/plan-fields";

export const PLAN_REQUEST_ERRORS = {
  validation_error: { status: 400, message: "Invalid request." },
  no_account: { status: 403, message: "You don't have that kind of account." },
  club_not_approved: { status: 403, message: "Your club must be approved before you can buy a plan." },
  plan_not_found: { status: 404, message: "That plan doesn't exist or isn't available." },
  already_pending: { status: 409, message: "You already have a plan request waiting for review." },
  not_found: { status: 404, message: "Request not found." },
  not_pending: { status: 409, message: "That request has already been reviewed." },
} as const;

export type PlanRequestErrorCode = keyof typeof PLAN_REQUEST_ERRORS;
type Fail = { error: PlanRequestErrorCode; message?: string };
const fail = (error: PlanRequestErrorCode, message?: string): Fail => ({ error, message });

const AUDIENCES: PlanAudience[] = ["organizer", "club", "player"];

const PAYMENT_KIND_BY_AUDIENCE: Record<PlanAudience, PaymentKind> = {
  organizer: "org_plan",
  club: "club_upgrade",
  player: "player_plan",
};
export function isAudience(v: unknown): v is PlanAudience {
  return typeof v === "string" && (AUDIENCES as string[]).includes(v);
}

// ------------------------------------------------------------
// Reading plans
// ------------------------------------------------------------

function serializePlan(p: {
  code: string;
  audience: PlanAudience;
  name: string;
  isPaid: boolean;
  priceAmount: { toString(): string } | null;
  priceCurrency: string | null;
  durationDays: number;
  limits: unknown;
  depositAmount?: { toString(): string } | null;
  extras?: unknown;
  isActive: boolean;
  sortOrder: number;
}) {
  return {
    code: p.code,
    audience: p.audience,
    name: p.name,
    isPaid: p.isPaid,
    priceAmount: p.priceAmount === null ? null : Number(p.priceAmount.toString()),
    priceCurrency: p.priceCurrency,
    durationDays: p.durationDays,
    limits: p.limits as Record<string, number | boolean | null>,
    depositAmount: p.depositAmount == null ? null : Number(p.depositAmount.toString()),
    extras: (p.extras && typeof p.extras === "object" && !Array.isArray(p.extras) ? p.extras : {}) as Record<string, string | number | boolean>,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
  };
}

export async function listPlans(opts: { audience?: PlanAudience; activeOnly?: boolean } = {}) {
  const rows = await prisma.plan.findMany({
    where: {
      ...(opts.audience && { audience: opts.audience }),
      ...(opts.activeOnly && { isActive: true }),
    },
    orderBy: [{ audience: "asc" }, { sortOrder: "asc" }],
  });
  return rows.map(serializePlan);
}

// The plan-holding account for one audience, or null if the user doesn't
// have that kind of account.
async function getAccount(userId: string, audience: PlanAudience) {
  if (audience === "organizer") {
    const o = await prisma.organizerProfile.findUnique({ where: { userId } });
    return o
      ? { planCode: o.planCode, planExpiresAt: o.planExpiresAt, approved: undefined as boolean | undefined }
      : null;
  }
  if (audience === "club") {
    const c = await prisma.clubProfile.findUnique({ where: { userId } });
    return c
      ? {
          planCode: c.subscriptionPlanCode,
          planExpiresAt: c.planExpiresAt,
          approved: c.status === "approved",
        }
      : null;
  }
  const p = await prisma.playerProfile.findUnique({ where: { userId } });
  return p ? { planCode: p.planCode, planExpiresAt: p.planExpiresAt, approved: undefined } : null;
}

export interface AccountPlanState {
  audience: PlanAudience;
  plan: EffectivePlan;
  verified: boolean;
  pendingRequest: { id: string; planCode: string; createdAt: Date } | null;
  lastRejection: { planCode: string; note: string | null } | null;
}

// Everything the "My plans" page needs: one entry per account type the user
// actually has.
export async function getMyPlanStates(userId: string): Promise<AccountPlanState[]> {
  const states: AccountPlanState[] = [];

  for (const audience of AUDIENCES) {
    const account = await getAccount(userId, audience);
    if (!account) continue;

    const plan = await resolvePlan(audience, account);
    // Organizer verification rides on a verified identity (not just the approved
    // application); a club's on club approval.
    const identity =
      audience === "organizer"
        ? await prisma.identityVerification.findFirst({
            where: { organizer: { userId } },
            select: { status: true, validUntil: true },
          })
        : null;
    const approved = audience === "organizer" ? isIdentityVerified(identity) : account.approved ?? true;

    const [pending, rejected] = await Promise.all([
      prisma.planRequest.findFirst({
        where: { userId, audience, status: "pending" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.planRequest.findFirst({
        where: { userId, audience, status: "rejected" },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    states.push({
      audience,
      plan,
      verified: isVerified(audience, plan, approved),
      pendingRequest: pending
        ? { id: pending.id, planCode: pending.planCode, createdAt: pending.createdAt }
        : null,
      // Only worth showing if it's newer than any pending one.
      lastRejection:
        rejected && !pending
          ? { planCode: rejected.planCode, note: rejected.adminNote }
          : null,
    });
  }
  return states;
}

// ------------------------------------------------------------
// Requesting a plan
// ------------------------------------------------------------

export async function createPlanRequest(
  userId: string,
  input: { audience: unknown; planCode: unknown; proofUrl: unknown }
) {
  if (!isAudience(input.audience)) return fail("validation_error", "Unknown account type.");
  if (typeof input.planCode !== "string") return fail("validation_error", "Choose a plan.");
  if (typeof input.proofUrl !== "string" || !input.proofUrl.startsWith("http")) {
    return fail("validation_error", "Proof of payment is required.");
  }
  const audience = input.audience;

  const account = await getAccount(userId, audience);
  if (!account) return fail("no_account");
  if (audience === "club" && !account.approved) return fail("club_not_approved");

  const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
  if (!plan || plan.audience !== audience || !plan.isActive || !plan.isPaid) {
    return fail("plan_not_found");
  }

  const pending = await prisma.planRequest.findFirst({
    where: { userId, audience, status: "pending" },
  });
  if (pending) return fail("already_pending");

  // Refundable security deposit to include with the payment (0 when deposits
  // are off, this plan has none, or they already hold enough).
  const depositDue = await getDepositDue(userId, plan);

  const request = await prisma.planRequest.create({
    data: {
      userId,
      audience,
      planCode: plan.code,
      proofUrl: input.proofUrl,
      depositAmount: depositDue > 0 ? depositDue : null,
    },
  });
  return { data: request };
}

// ------------------------------------------------------------
// Admin review
// ------------------------------------------------------------

export async function listPendingPlanRequests() {
  const rows = await prisma.planRequest.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { displayName: true, email: true } }, plan: true },
  });
  return rows.map((r) => ({
    id: r.id,
    audience: r.audience,
    planCode: r.planCode,
    planName: r.plan.name,
    priceAmount: r.plan.priceAmount === null ? null : Number(r.plan.priceAmount.toString()),
    priceCurrency: r.plan.priceCurrency,
    proofUrl: r.proofUrl,
    createdAt: r.createdAt,
    userName: r.user.displayName,
    userEmail: r.user.email,
  }));
}

export async function approvePlanRequest(requestId: string, adminId: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.planRequest.findUnique({
      where: { id: requestId },
      include: { plan: true },
    });
    if (!req) return fail("not_found");
    if (req.status !== "pending") return fail("not_pending");

    const now = new Date();
    let granted: { planCode: string; planExpiresAt: Date };

    if (req.audience === "organizer") {
      const acct = await tx.organizerProfile.findUnique({ where: { userId: req.userId } });
      if (!acct) return fail("no_account");
      granted = {
        planCode: req.planCode,
        planExpiresAt: computeNewExpiry(acct, req.planCode, req.plan.durationDays, now),
      };
      await tx.organizerProfile.update({ where: { id: acct.id }, data: granted });
    } else if (req.audience === "club") {
      const acct = await tx.clubProfile.findUnique({ where: { userId: req.userId } });
      if (!acct) return fail("no_account");
      granted = {
        planCode: req.planCode,
        planExpiresAt: computeNewExpiry(
          { planCode: acct.subscriptionPlanCode, planExpiresAt: acct.planExpiresAt },
          req.planCode,
          req.plan.durationDays,
          now
        ),
      };
      await tx.clubProfile.update({
        where: { id: acct.id },
        data: { subscriptionPlanCode: granted.planCode, planExpiresAt: granted.planExpiresAt },
      });
    } else {
      const acct = await tx.playerProfile.findUnique({ where: { userId: req.userId } });
      if (!acct) return fail("no_account");
      granted = {
        planCode: req.planCode,
        planExpiresAt: computeNewExpiry(acct, req.planCode, req.plan.durationDays, now),
      };
      await tx.playerProfile.update({ where: { id: acct.id }, data: granted });
    }

    await tx.planRequest.update({
      where: { id: requestId },
      data: { status: "approved", reviewedAt: now },
    });
    // The refundable deposit paid with this request is recorded separately
    // from the plan fee: only the deposit can ever be refunded.
    if (req.audience === "organizer" && req.depositAmount && Number(req.depositAmount.toString()) > 0 && req.plan.priceCurrency) {
      const org = await tx.organizerProfile.findUnique({ where: { userId: req.userId }, select: { id: true } });
      if (org) {
        await tx.securityDeposit.create({
          data: {
            organizerId: org.id,
            planCode: req.planCode,
            planRequestId: req.id,
            amount: req.depositAmount,
            currency: req.plan.priceCurrency,
          },
        });
        await tx.paymentRecord.create({
          data: {
            userId: req.userId,
            kind: PAYMENT_KIND_BY_AUDIENCE[req.audience],
            amount: req.depositAmount,
            currency: req.plan.priceCurrency,
            method: "Screenshot proof",
            reference: `${req.id}-deposit`,
            note: `Security deposit (refundable) — ${req.plan.name}`,
            recordedById: adminId,
          },
        });
      }
    }
    // Keep the admin payments ledger complete: every approved plan purchase
    // is money the platform received. (Skipped only if the plan has no price.)
    if (req.plan.priceAmount !== null && req.plan.priceCurrency) {
      await tx.paymentRecord.create({
        data: {
          userId: req.userId,
          kind: PAYMENT_KIND_BY_AUDIENCE[req.audience],
          amount: req.plan.priceAmount,
          currency: req.plan.priceCurrency,
          method: "Screenshot proof",
          reference: req.id,
          note: `${req.plan.name} (${req.planCode})`,
          recordedById: adminId,
        },
      });
    }
    await tx.adminActionLog.create({
      data: {
        adminId,
        action: "approved_plan_request",
        targetType: "PlanRequest",
        targetId: requestId,
        notes: `${req.audience}: ${req.planCode} until ${granted.planExpiresAt.toISOString()}`,
      },
    });
    return { data: { planCode: granted.planCode, planExpiresAt: granted.planExpiresAt } };
  });
}

export async function rejectPlanRequest(requestId: string, adminId: string, note?: string) {
  const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;
  return prisma.$transaction(async (tx) => {
    const req = await tx.planRequest.findUnique({ where: { id: requestId } });
    if (!req) return fail("not_found");
    if (req.status !== "pending") return fail("not_pending");

    await tx.planRequest.update({
      where: { id: requestId },
      data: { status: "rejected", adminNote: cleanNote, reviewedAt: new Date() },
    });
    await tx.adminActionLog.create({
      data: {
        adminId,
        action: "rejected_plan_request",
        targetType: "PlanRequest",
        targetId: requestId,
        notes: cleanNote,
      },
    });
    return { data: { ok: true as const } };
  });
}

// ------------------------------------------------------------
// Admin: edit plans
// ------------------------------------------------------------

export interface UpdatePlanInput {
  name?: unknown;
  priceAmount?: unknown;
  priceCurrency?: unknown;
  durationDays?: unknown;
  limits?: unknown;
  depositAmount?: unknown;
  extras?: unknown;
  isActive?: unknown;
}

export async function updatePlan(code: string, adminId: string, input: UpdatePlanInput) {
  const plan = await prisma.plan.findUnique({ where: { code } });
  if (!plan) return fail("plan_not_found");

  const data: {
    name?: string;
    priceAmount?: number | null;
    priceCurrency?: string | null;
    durationDays?: number;
    limits?: Record<string, number | boolean | null>;
    depositAmount?: number | null;
    extras?: Record<string, string | number | boolean>;
    isActive?: boolean;
  } = {};

  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim().length < 2 || input.name.trim().length > 60) {
      return fail("validation_error", "Plan name must be 2–60 characters.");
    }
    data.name = input.name.trim();
  }

  if (input.priceAmount !== undefined || input.priceCurrency !== undefined) {
    if (!plan.isPaid) return fail("validation_error", "Free plans can't have a price.");
    const amount = input.priceAmount ?? Number(plan.priceAmount?.toString() ?? NaN);
    const currency = input.priceCurrency ?? plan.priceCurrency;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      return fail("validation_error", "Enter a valid price.");
    }
    if (typeof currency !== "string" || !isSupportedCurrency(currency)) {
      return fail("validation_error", "Unsupported currency.");
    }
    // Any catalog currency that is switched on in /admin/currencies; a plan already priced in
    // another one can keep it.
    if (currency !== plan.priceCurrency) {
      const off = await currenciesNotEnabled([currency]);
      if (off) return fail("validation_error", off);
    }
    // Yen, won and dong have no cents.
    if ((ZERO_DECIMAL_CURRENCIES as readonly string[]).includes(currency) && !Number.isInteger(amount)) {
      return fail("validation_error", `A price in ${currency} must be a whole number.`);
    }
    data.priceAmount = Math.round(amount * 100) / 100;
    data.priceCurrency = currency;
  }

  if (input.durationDays !== undefined) {
    if (
      typeof input.durationDays !== "number" ||
      !Number.isInteger(input.durationDays) ||
      input.durationDays < 1 ||
      input.durationDays > 3650
    ) {
      return fail("validation_error", "Duration must be a whole number of days (1–3650).");
    }
    data.durationDays = input.durationDays;
  }

  if (input.limits !== undefined) {
    const checked = validateLimitsInput(plan.audience, input.limits);
    if (!checked.ok) return fail("validation_error", checked.message);
    data.limits = checked.value;
  }

  if (input.depositAmount !== undefined) {
    if (plan.audience !== "organizer" || !plan.isPaid) {
      return fail("validation_error", "Only paid organizer plans can have a security deposit.");
    }
    if (input.depositAmount === null || input.depositAmount === "") {
      data.depositAmount = null;
    } else if (
      typeof input.depositAmount !== "number" ||
      !Number.isFinite(input.depositAmount) ||
      input.depositAmount < 0 ||
      input.depositAmount > 1_000_000_000
    ) {
      return fail("validation_error", "Enter a valid deposit amount (or leave empty for none).");
    } else {
      data.depositAmount = input.depositAmount === 0 ? null : Math.round(input.depositAmount * 100) / 100;
    }
  }

  if (input.extras !== undefined) {
    const checked = await validateExtras(plan.audience, input.extras);
    if (!checked.ok) return fail("validation_error", checked.message);
    data.extras = checked.value;
  }

  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") return fail("validation_error", "Invalid active flag.");
    // The free plan is every new account's fallback — never hide it.
    if (!input.isActive && code === FREE_PLAN_CODE[plan.audience]) {
      return fail("validation_error", "The free plan can't be deactivated.");
    }
    // A paid plan with no price can't be sold — the new Basic/Business plans
    // start off sale until an admin prices them.
    const priceAfter = data.priceAmount !== undefined ? data.priceAmount : plan.priceAmount;
    if (input.isActive && plan.isPaid && (priceAfter === null || priceAfter === undefined)) {
      return fail("validation_error", "Set a price before putting this plan on sale.");
    }
    data.isActive = input.isActive;
  }

  if (Object.keys(data).length === 0) return fail("validation_error", "Nothing to update.");

  const updated = await prisma.plan.update({ where: { code }, data });
  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "updated_plan",
      targetType: "Plan",
      targetId: code,
      notes: Object.keys(data).join(", "),
    },
  });
  return { data: serializePlan(updated) };
}

// ------------------------------------------------------------
// Site settings that belong to Phase 5
// ------------------------------------------------------------

export async function getPlanSettings() {
  const s = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  return {
    planPaymentInstructions: s?.planPaymentInstructions ?? null,
    adsEnabled: s?.adsEnabled ?? false,
    depositEnabled: s?.depositEnabled ?? false,
    depositRefundDays: s?.depositRefundDays ?? 30,
    depositExposureMultiplier: Number(s?.depositExposureMultiplier ?? 5),
  };
}

export async function updatePlanSettings(input: {
  planPaymentInstructions?: unknown;
  adsEnabled?: unknown;
  depositEnabled?: unknown;
  depositRefundDays?: unknown;
  depositExposureMultiplier?: unknown;
}) {
  const data: {
    planPaymentInstructions?: string | null;
    adsEnabled?: boolean;
    depositEnabled?: boolean;
    depositRefundDays?: number;
    depositExposureMultiplier?: number;
  } = {};
  if (input.depositEnabled !== undefined) {
    if (typeof input.depositEnabled !== "boolean") return fail("validation_error", "Invalid deposit switch.");
    data.depositEnabled = input.depositEnabled;
  }
  if (input.depositRefundDays !== undefined) {
    const d = input.depositRefundDays;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > 365) {
      return fail("validation_error", "Refund waiting period must be 1–365 whole days.");
    }
    data.depositRefundDays = d;
  }
  if (input.depositExposureMultiplier !== undefined) {
    const m = input.depositExposureMultiplier;
    if (typeof m !== "number" || !Number.isFinite(m) || m < 1 || m > 100) {
      return fail("validation_error", "Deposit multiplier must be between 1 and 100.");
    }
    data.depositExposureMultiplier = m;
  }

  if (input.planPaymentInstructions !== undefined) {
    if (input.planPaymentInstructions !== null && typeof input.planPaymentInstructions !== "string") {
      return fail("validation_error", "Invalid payment instructions.");
    }
    const v = (input.planPaymentInstructions ?? "").toString().trim();
    if (v.length > 2000) return fail("validation_error", "Payment instructions are too long.");
    data.planPaymentInstructions = v || null;
  }
  if (input.adsEnabled !== undefined) {
    if (typeof input.adsEnabled !== "boolean") return fail("validation_error", "Invalid ads flag.");
    data.adsEnabled = input.adsEnabled;
  }
  if (Object.keys(data).length === 0) return fail("validation_error", "Nothing to update.");

  await prisma.siteSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
  return { data: await getPlanSettings() };
}
