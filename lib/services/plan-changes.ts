// Moving an organization from one paid plan to another.
//
//   Upgrade (e.g. Pro -> Business): an invoice is created for the new plan, with a credit for the
//   unused part of the current period and, if the new plan holds a bigger security fee, only the
//   difference. When it is paid the new plan starts that day for a full period.
//   Downgrade (Business -> Pro): nothing is charged now. The current plan runs to its end date
//   (no refund) and the next renewal invoice bills the lower plan.
//   Stop renewing: auto-renew is switched off, so the plan simply ends.
import { prisma } from "@/lib/prisma";
import { FREE_PLAN_CODE, resolvePlan } from "@/lib/plans";
import { classifyChange, computeUpgradeCredit, type ChangeKind } from "@/lib/plan-change-rules";
import { computeInvoiceTotals } from "@/lib/invoice-math";
import { formatMoney } from "@/lib/money";
import { createInvoice, systemCancelInvoice } from "@/lib/services/invoices";
import { getDepositDue } from "@/lib/services/security-deposits";
import { getInvoiceSettings } from "@/lib/services/payment-methods";
import { createRenewalInvoice } from "@/lib/services/renewals";
import { notify } from "@/lib/services/notifications";

export type ChangeErrorCode =
  | "not_found"
  | "no_active_plan"
  | "invalid_target"
  | "same_plan"
  | "change_scheduled"
  | "invoice_open"
  | "request_pending"
  | "renewal_in_review"
  | "no_period_left"
  | "failed";
export type ChangeFail = { error: ChangeErrorCode; message: string };
const fail = (error: ChangeErrorCode, message: string): ChangeFail => ({ error, message });

const num = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? null : Number(v.toString()));
const fmtDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

async function context(organizerId: string) {
  const org = await prisma.organizerProfile.findUnique({ where: { id: organizerId } });
  if (!org) return null;
  const effective = await resolvePlan("organizer", org);
  const current = effective.isPaid && !effective.expired ? await prisma.plan.findUnique({ where: { code: effective.code } }) : null;
  const openPlanInvoices = await prisma.invoice.findMany({
    where: { organizerId, status: { in: ["unpaid", "proof_submitted"] }, lines: { some: { kind: "plan", waived: false } } },
    select: { id: true, number: true, status: true, source: true },
  });
  const pendingRequest = await prisma.planRequest.count({ where: { userId: org.userId, audience: "organizer", status: "pending" } });
  return { org, effective, current, openPlanInvoices, pendingRequest };
}

type Ctx = NonNullable<Awaited<ReturnType<typeof context>>>;

// Why the organization can't change plan right now (null = free to proceed).
function blocker(c: Ctx, kind: ChangeKind | "stop"): ChangeFail | null {
  if (!c.current) return fail("no_active_plan", "There is no active paid plan to change. Buy a plan from the plans page instead.");
  if (c.org.nextPlanCode && c.org.nextPlanStartsAt) {
    return fail("change_scheduled", `A plan change is already paid for and starts on ${fmtDay(c.org.nextPlanStartsAt)}. It can be changed after that.`);
  }
  if (c.pendingRequest > 0) return fail("request_pending", "A plan request is waiting for approval. Wait for the decision first.");
  const other = c.openPlanInvoices.find((i) => i.source !== "renewal");
  if (other && kind !== "stop") return fail("invoice_open", `Invoice ${other.number} for a plan is still unpaid. Pay it, or ask an admin to cancel it, before changing plan.`);
  const review = c.openPlanInvoices.find((i) => i.source === "renewal" && i.status === "proof_submitted");
  if (review) return fail("renewal_in_review", `The payment proof for renewal invoice ${review.number} is being checked. Wait for it to be confirmed before changing plan.`);
  return null;
}

async function targetPlan(code: string) {
  const t = await prisma.plan.findUnique({ where: { code } });
  if (!t || t.audience !== "organizer" || !t.isPaid || !t.isActive || t.priceAmount === null || !t.priceCurrency) return null;
  return t;
}

export interface ChangePreview {
  kind: ChangeKind;
  targetCode: string;
  targetName: string;
  currency: string;
  // upgrade
  planFee: number;
  credit: number;
  remainingDays: number;
  securityFee: number;
  tax: number;
  taxLabel: string;
  total: number;
  // downgrade
  effectiveOn: string | null; // ISO
}

export async function previewPlanChange(organizerId: string, targetCode: string, now: Date = new Date()): Promise<{ data: ChangePreview } | ChangeFail> {
  const c = await context(organizerId);
  if (!c) return fail("not_found", "Organization not found.");
  const t = await targetPlan(targetCode);
  if (!t || !c.current) return fail(c.current ? "invalid_target" : "no_active_plan", c.current ? "That plan isn't available." : "There is no active paid plan to change.");

  const kind = classifyChange(
    { code: c.current.code, price: num(c.current.priceAmount), currency: c.current.priceCurrency, sortOrder: c.current.sortOrder },
    { code: t.code, price: num(t.priceAmount), currency: t.priceCurrency, sortOrder: t.sortOrder }
  );
  if (kind === "same") return fail("same_plan", "That is already your plan.");

  const settings = await getInvoiceSettings();
  const base = { kind, targetCode: t.code, targetName: t.name, currency: t.priceCurrency!, planFee: num(t.priceAmount)!, credit: 0, remainingDays: 0, securityFee: 0, tax: 0, taxLabel: settings.invoiceTaxLabel, total: 0, effectiveOn: null as string | null };

  if (kind === "downgrade") {
    return { data: { ...base, effectiveOn: c.effective.expiresAt?.toISOString() ?? null } };
  }
  const { credit, remainingDays } = computeUpgradeCredit({
    oldPrice: num(c.current.priceAmount),
    oldCurrency: c.current.priceCurrency,
    oldPeriodDays: c.current.durationDays,
    expiresAt: c.effective.expiresAt,
    now,
    newFee: base.planFee,
    newCurrency: base.currency,
  });
  const securityFee = await getDepositDue(c.org.userId, { audience: "organizer", depositAmount: t.depositAmount, priceCurrency: t.priceCurrency });
  const totals = computeInvoiceTotals({
    currency: base.currency,
    taxRate: settings.invoiceTaxRate,
    lines: [{ amount: base.planFee }, ...(credit > 0 ? [{ amount: -credit }] : []), ...(securityFee > 0 ? [{ amount: securityFee, refundable: true }] : [])],
  });
  return { data: { ...base, credit, remainingDays, securityFee, tax: totals.taxAmount, total: totals.total } };
}

// Cancels the unpaid renewal invoices for this organization (a plan change replaces them).
async function cancelOpenRenewals(c: Ctx, why: string) {
  for (const inv of c.openPlanInvoices.filter((i) => i.source === "renewal" && i.status === "unpaid")) {
    await systemCancelInvoice(inv.id, why);
  }
}

export async function requestPlanChange(input: { organizerId: string; targetCode: string; adminId?: string | null }) {
  const c = await context(input.organizerId);
  if (!c) return fail("not_found", "Organization not found.");
  const preview = await previewPlanChange(input.organizerId, input.targetCode);
  if ("error" in preview) return preview;
  const p = preview.data;
  const blocked = blocker(c, p.kind);
  if (blocked) return blocked;
  const current = c.current!;
  const now = new Date();

  if (p.kind === "upgrade") {
    const r = await createInvoice({
      organizerId: c.org.id,
      source: "plan_change",
      createdById: input.adminId ?? null,
      currency: p.currency,
      planCode: p.targetCode,
      discountType: p.credit > 0 ? "amount" : null,
      discountValue: p.credit > 0 ? p.credit : null,
      discountReason: p.credit > 0 ? `Credit for unused ${current.name} time (${p.remainingDays} days)` : null,
      includeSecurityFee: p.securityFee > 0,
      securityFeeAmount: p.securityFee > 0 ? p.securityFee : null,
      dueDate: null,
      note: `Upgrade from ${current.name} to ${p.targetName}`,
    });
    if ("error" in r) return fail("failed", r.message ?? "The invoice could not be created.");
    await cancelOpenRenewals(c, `Replaced by the upgrade to ${p.targetName} (${r.data.number}).`);
    if (input.adminId) {
      await prisma.adminActionLog.create({
        data: { adminId: input.adminId, action: "started_plan_upgrade", targetType: "OrganizerProfile", targetId: c.org.id, notes: `${current.name} → ${p.targetName} · invoice ${r.data.number} · credit ${formatMoney(p.credit, p.currency)}` },
      });
    }
    return { data: { kind: "upgrade" as const, invoiceId: r.data.id, invoiceNumber: r.data.number } };
  }

  // downgrade: takes effect when the current period ends
  const expiry = c.effective.expiresAt;
  if (!expiry) return fail("no_period_left", "This plan has no end date, so there is nothing to wait for. Ask an admin to change it.");
  await prisma.organizerProfile.update({ where: { id: c.org.id }, data: { pendingPlanCode: p.targetCode, autoRenew: true } });
  await cancelOpenRenewals(c, `Replaced: the plan will change to ${p.targetName} when the current period ends.`);

  // If the renewal window has opened, bill the lower plan now; otherwise the daily job will.
  const settings = await getInvoiceSettings();
  const refreshed = await prisma.organizerProfile.findUnique({ where: { id: c.org.id } });
  let invoiceNumber: string | null = null;
  if (refreshed && settings.renewalInvoicesEnabled && expiry.getTime() <= now.getTime() + settings.renewalLeadDays * 86_400_000) {
    const t = await targetPlan(p.targetCode);
    if (t) {
      const r = await createRenewalInvoice(refreshed, t, expiry.toISOString().slice(0, 10));
      if ("data" in r) invoiceNumber = r.data.number;
    }
  }
  if (input.adminId) {
    await prisma.adminActionLog.create({
      data: { adminId: input.adminId, action: "scheduled_plan_downgrade", targetType: "OrganizerProfile", targetId: c.org.id, notes: `${current.name} → ${p.targetName} on ${expiry.toISOString().slice(0, 10)}` },
    });
  }
  await notify(c.org.userId, {
    type: "invoice",
    title: `Your plan will change to ${p.targetName}`,
    body: `You keep ${current.name} until ${fmtDay(expiry)}. After that you move to ${p.targetName}${invoiceNumber ? `; the invoice ${invoiceNumber} is ready to pay` : ", and the renewal invoice will be for that plan"}.`,
    href: invoiceNumber ? "/invoices" : "/plans",
  });
  return { data: { kind: "downgrade" as const, effectiveOn: expiry.toISOString(), invoiceNumber } };
}

// Undo a downgrade that hasn't been paid for yet: the plan renews as it is.
export async function undoPendingDowngrade(organizerId: string) {
  const c = await context(organizerId);
  if (!c) return fail("not_found", "Organization not found.");
  if (!c.org.pendingPlanCode) return fail("invalid_target", "No plan change is waiting.");
  const review = c.openPlanInvoices.find((i) => i.status === "proof_submitted");
  if (review) return fail("renewal_in_review", `The payment proof for ${review.number} is being checked. Wait for it to be confirmed first.`);
  await prisma.organizerProfile.update({ where: { id: organizerId }, data: { pendingPlanCode: null } });
  await cancelOpenRenewals(c, "The plan change was undone.");
  // If the renewal window has opened, bill the current plan again right away (the daily job skips
  // a plan end that already had an invoice, even a cancelled one).
  const settings = await getInvoiceSettings();
  const expiry = c.effective.expiresAt;
  let invoiceNumber: string | null = null;
  if (c.current && expiry && settings.renewalInvoicesEnabled && expiry.getTime() <= Date.now() + settings.renewalLeadDays * 86_400_000) {
    const org = await prisma.organizerProfile.findUnique({ where: { id: organizerId } });
    if (org) {
      const r = await createRenewalInvoice(org, c.current, expiry.toISOString().slice(0, 10));
      if ("data" in r) invoiceNumber = r.data.number;
    }
  }
  return { data: { ok: true as const, invoiceNumber } };
}

// Stop renewing: the plan runs to its end date and then falls back to the free plan.
export async function stopRenewing(organizerId: string, adminId?: string | null) {
  const c = await context(organizerId);
  if (!c) return fail("not_found", "Organization not found.");
  const blocked = blocker(c, "stop");
  if (blocked) return blocked;
  await prisma.organizerProfile.update({ where: { id: organizerId }, data: { autoRenew: false, pendingPlanCode: null } });
  await cancelOpenRenewals(c, "Renewal was switched off.");
  if (adminId) {
    await prisma.adminActionLog.create({ data: { adminId, action: "stopped_renewal", targetType: "OrganizerProfile", targetId: organizerId, notes: c.org.orgName } });
  }
  return { data: { endsOn: c.effective.expiresAt?.toISOString() ?? null, freePlan: FREE_PLAN_CODE.organizer } };
}

// Everything the "Change my plan" card on the plans page needs (organizers on an active paid plan).
export async function getPlanChangeView(userId: string) {
  const org = await prisma.organizerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!org) return null;
  const c = await context(org.id);
  if (!c || !c.current) return null;

  const names = new Map((await prisma.plan.findMany({ where: { audience: "organizer" }, select: { code: true, name: true } })).map((p) => [p.code, p.name]));
  const pending = c.org.pendingPlanCode ? { name: names.get(c.org.pendingPlanCode) ?? c.org.pendingPlanCode, on: c.effective.expiresAt?.toISOString() ?? null } : null;
  const scheduled = c.org.nextPlanCode && c.org.nextPlanStartsAt ? { name: names.get(c.org.nextPlanCode) ?? c.org.nextPlanCode, on: c.org.nextPlanStartsAt.toISOString() } : null;

  const others = await prisma.plan.findMany({
    where: { audience: "organizer", isPaid: true, isActive: true, NOT: { code: c.current.code } },
    orderBy: { sortOrder: "asc" },
    select: { code: true },
  });
  const options: ChangePreview[] = [];
  for (const o of others) {
    const p = await previewPlanChange(org.id, o.code);
    if ("data" in p) options.push(p.data);
  }
  const blocked = blocker(c, "upgrade");
  return {
    currentName: c.current.name,
    expiresAt: c.effective.expiresAt?.toISOString() ?? null,
    autoRenew: c.org.autoRenew,
    pending,
    scheduled,
    blockedMessage: blocked?.message ?? null,
    options,
  };
}
