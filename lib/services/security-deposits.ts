// Organizer security deposits (see schema comment on SecurityDeposit).
//
// Flow: the deposit is added to an organizer plan request → admin approves
// the request (plan-requests.ts creates the SecurityDeposit, status "held")
// → while held it backs the organizer's events (organizer-trust.ts) → the
// organizer leaves the paid plan (requestDepositRefund: plan drops to free,
// status "refund_requested", eligible after depositRefundDays) → an admin
// refunds it once nothing is unsettled, or forfeits it after upheld problems.
// Processing fees and tax are never part of a deposit and are not refunded.
import { prisma } from "@/lib/prisma";
import { FREE_PLAN_CODE } from "@/lib/plans";
import { getPayoutHolds, HOLD_REASON_TEXT } from "@/lib/services/organizer-trust";
import { notify } from "@/lib/services/notifications";

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getDepositSettings() {
  const s = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  return {
    enabled: s?.depositEnabled ?? false,
    refundDays: s?.depositRefundDays ?? 30,
    multiplier: Number(s?.depositExposureMultiplier ?? 5),
  };
}

// What this user must add on top of the plan price for this plan right now.
// Zero when deposits are off, the plan has none, or they already hold enough
// (same currency) — an upgrade to a bigger plan only pays the difference.
export async function getDepositDue(
  userId: string,
  plan: { audience: string; depositAmount: { toString(): string } | null; priceCurrency: string | null }
): Promise<number> {
  if (plan.audience !== "organizer" || !plan.depositAmount || !plan.priceCurrency) return 0;
  const required = Number(plan.depositAmount.toString());
  if (!(required > 0)) return 0;
  const { enabled } = await getDepositSettings();
  if (!enabled) return 0;

  const org = await prisma.organizerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!org) return round2(required);
  const held = await prisma.securityDeposit.findMany({
    where: { organizerId: org.id, status: "held", currency: plan.priceCurrency },
    select: { amount: true },
  });
  const have = held.reduce((sum, d) => sum + Number(d.amount.toString()), 0);
  return round2(Math.max(0, required - have));
}

export async function getMyDeposits(userId: string) {
  const org = await prisma.organizerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!org) return [];
  return prisma.securityDeposit.findMany({
    where: { organizerId: org.id, status: { in: ["held", "refund_requested"] } },
    orderBy: { heldAt: "asc" },
  });
}

// Anything that must be finished before a deposit can go back: live paid or
// prized events, and prize payouts that are unmarked or disputed.
export async function getRefundBlockers(organizerId: string): Promise<string[]> {
  const out: string[] = [];
  const live = await prisma.tournament.findMany({
    where: {
      organizerId,
      status: { in: ["published", "registration_open", "in_progress"] },
      OR: [{ entryType: "paid" }, { prizePoolAmount: { not: null } }],
    },
    select: { name: true },
  });
  for (const t of live) out.push(`"${t.name}" is still live`);
  const holds = await getPayoutHolds(organizerId, 0);
  for (const h of holds) {
    out.push(`"${h.name}": ${HOLD_REASON_TEXT[h.reason]}`);
  }
  return out;
}

// The organizer leaves the paid plan. Their plan drops to free right away
// (so the verified badge and paid perks stop); the deposit starts its wait.
export async function requestDepositRefund(userId: string) {
  const org = await prisma.organizerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!org) return { error: "no_account" as const };
  const held = await prisma.securityDeposit.findMany({ where: { organizerId: org.id, status: "held" } });
  if (held.length === 0) return { error: "no_deposit" as const };

  const { refundDays } = await getDepositSettings();
  const now = new Date();
  const eligibleAt = new Date(now.getTime() + refundDays * DAY_MS);
  await prisma.$transaction([
    prisma.securityDeposit.updateMany({
      where: { organizerId: org.id, status: "held" },
      data: { status: "refund_requested", refundRequestedAt: now, refundEligibleAt: eligibleAt },
    }),
    prisma.organizerProfile.update({
      where: { id: org.id },
      data: { planCode: FREE_PLAN_CODE.organizer, planExpiresAt: null },
    }),
  ]);
  return { data: { eligibleAt, count: held.length } };
}

export async function listDepositsForAdmin() {
  const rows = await prisma.securityDeposit.findMany({
    where: { status: { in: ["held", "refund_requested"] } },
    orderBy: [{ status: "desc" }, { heldAt: "asc" }],
    include: { organizer: { select: { id: true, orgName: true, userId: true, user: { select: { email: true } } } } },
  });
  const out = [];
  for (const d of rows) {
    const blockers = d.status === "refund_requested" ? await getRefundBlockers(d.organizerId) : [];
    out.push({ ...d, blockers });
  }
  return out;
}

export async function resolveDeposit(input: {
  adminId: string;
  depositId: string;
  action: "refund" | "forfeit";
  amount?: number;
  note: string;
}) {
  const note = input.note.trim();
  if (!note) return { error: "validation_error" as const, message: "Add a note (e.g. the bank transfer reference, or why it was forfeited)." };
  const d = await prisma.securityDeposit.findUnique({ where: { id: input.depositId }, include: { organizer: { select: { userId: true } } } });
  if (!d) return { error: "not_found" as const };
  const total = Number(d.amount.toString());

  if (input.action === "refund") {
    if (d.status !== "refund_requested") return { error: "validation_error" as const, message: "The organizer hasn't asked for a refund." };
    if (!d.refundEligibleAt || d.refundEligibleAt > new Date()) {
      return { error: "validation_error" as const, message: `Not eligible until ${d.refundEligibleAt?.toLocaleDateString("en-GB") ?? "the waiting period ends"}.` };
    }
    const blockers = await getRefundBlockers(d.organizerId);
    if (blockers.length) return { error: "validation_error" as const, message: `Unsettled: ${blockers.join("; ")}.` };
    const amount = input.amount === undefined ? total : round2(input.amount);
    if (!(amount > 0) || amount > total) return { error: "validation_error" as const, message: "Refund amount must be between 0 and the deposit." };
    await prisma.$transaction([
      prisma.securityDeposit.update({
        where: { id: d.id },
        data: { status: "refunded", refundedAmount: amount, resolvedAt: new Date(), resolvedById: input.adminId, adminNote: note },
      }),
      prisma.adminActionLog.create({ data: { adminId: input.adminId, action: "refunded_security_deposit", targetType: "SecurityDeposit", targetId: d.id, notes: note } }),
    ]);
    await notify(d.organizer.userId, {
      type: "deposit",
      title: "Your security deposit was refunded",
      body: `${amount.toLocaleString()} ${d.currency} was sent back to you. Processing fees and tax are not refundable.`,
      href: "/plans",
    });
    return { data: { id: d.id } };
  }

  // forfeit
  if (d.status !== "held" && d.status !== "refund_requested") return { error: "validation_error" as const, message: "This deposit is already closed." };
  const forfeited = input.amount === undefined ? total : round2(input.amount);
  if (!(forfeited > 0) || forfeited > total) return { error: "validation_error" as const, message: "Forfeited amount must be between 0 and the deposit." };
  const remainder = round2(total - forfeited);
  await prisma.$transaction([
    prisma.securityDeposit.update({
      where: { id: d.id },
      data: { status: "forfeited", forfeitedAmount: forfeited, refundedAmount: remainder > 0 ? remainder : null, resolvedAt: new Date(), resolvedById: input.adminId, adminNote: note },
    }),
    prisma.adminActionLog.create({ data: { adminId: input.adminId, action: "forfeited_security_deposit", targetType: "SecurityDeposit", targetId: d.id, notes: `${forfeited} ${d.currency}: ${note}` } }),
  ]);
  await notify(d.organizer.userId, {
    type: "deposit",
    title: "Part or all of your security deposit was forfeited",
    body: `${forfeited.toLocaleString()} ${d.currency} was forfeited. ${remainder > 0 ? `${remainder.toLocaleString()} ${d.currency} remains to be returned. ` : ""}${note}`,
    href: "/plans",
  });
  return { data: { id: d.id, remainderToReturn: remainder } };
}
