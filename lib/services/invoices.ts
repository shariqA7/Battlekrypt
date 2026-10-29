// Invoices against organizations.
//
// An invoice is created when an organization is added by an admin, or when an application is
// approved. It bills the subscription plan and, optionally, a refundable security fee. While the
// payment gateway is off the organization pays outside the platform, uploads a screenshot, and an
// admin checks the money arrived and marks the invoice paid. Only then does anything happen:
//   - the plan is granted (same rules as an approved plan request),
//   - a refundable security deposit is recorded (the existing deposit flow takes over),
//   - the money received is added to the admin payments record.
// A screenshot alone never counts as income.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeNewExpiry } from "@/lib/plans";
import { isSupportedCurrency, formatMoney } from "@/lib/money";
import {
  DEFAULT_INVOICE_CURRENCY,
  MAX_TAX_RATE,
  computeInvoiceTotals,
  displayStatus,
  formatInvoiceNumber,
  parseDueDate,
  roundMoney,
  type DisplayStatus,
} from "@/lib/invoice-math";
import { cursorArgs, toPage, type Page, type PageQuery } from "@/lib/admin-paging";
import { notify } from "@/lib/services/notifications";
import { getInvoiceSettings } from "@/lib/services/payment-methods";

export const INVOICE_ERRORS = {
  validation_error: { status: 400, message: "Invalid request." },
  not_found: { status: 404, message: "Invoice not found." },
  forbidden: { status: 403, message: "That invoice isn't yours." },
  not_open: { status: 409, message: "This invoice is already paid or cancelled." },
  no_proof: { status: 409, message: "There is no payment proof to reject." },
} as const;
export type InvoiceErrorCode = keyof typeof INVOICE_ERRORS;
type Fail = { error: InvoiceErrorCode; message?: string };
const fail = (error: InvoiceErrorCode, message?: string): Fail => ({ error, message });

const OPEN = ["unpaid", "proof_submitted"] as const;
const money = (v: { toString(): string } | number | null | undefined) => Number(v?.toString() ?? 0);

// ------------------------------------------------------------
// Numbering
// ------------------------------------------------------------

async function nextInvoiceNumber(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getUTCFullYear();
  // One atomic upsert-and-increment: two invoices created at once never get the same number.
  const row = await tx.invoiceCounter.upsert({
    where: { year },
    create: { year, last: 1 },
    update: { last: { increment: 1 } },
  });
  return formatInvoiceNumber(year, row.last);
}

// ------------------------------------------------------------
// Creating
// ------------------------------------------------------------

export interface CreateInvoiceInput {
  organizerId: string;
  source: "admin_added" | "application_approved" | "admin_manual";
  createdById?: string | null;
  currency?: string;
  planCode?: string | null;
  /** The plan fee in the invoice currency. Defaults to the plan's own price when currencies match. */
  planAmount?: number | null;
  includeSecurityFee?: boolean;
  securityFeeAmount?: number | null;
  /** "YYYY-MM-DD", or null/undefined for no due date. */
  dueDate?: unknown;
  taxRate?: number | null;
  note?: string | null;
}

export async function createInvoice(input: CreateInvoiceInput) {
  const currency = (input.currency ?? DEFAULT_INVOICE_CURRENCY).toUpperCase();
  if (!isSupportedCurrency(currency)) return fail("validation_error", "Choose a supported currency.");

  const org = await prisma.organizerProfile.findUnique({
    where: { id: input.organizerId },
    select: { id: true, userId: true, orgName: true },
  });
  if (!org) return fail("not_found", "That organization doesn't exist.");

  const due = parseDueDate(input.dueDate);
  if (due === "invalid") return fail("validation_error", "Enter the due date as a valid date.");

  const settings = await getInvoiceSettings();
  const taxRate = input.taxRate ?? settings.invoiceTaxRate;
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > MAX_TAX_RATE) {
    return fail("validation_error", "Tax rate must be between 0 and 100.");
  }

  const plan = input.planCode ? await prisma.plan.findUnique({ where: { code: input.planCode } }) : null;
  if (input.planCode && (!plan || plan.audience !== "organizer" || !plan.isPaid)) {
    return fail("validation_error", "Choose a paid organizer plan.");
  }

  const lines: { kind: "plan" | "security_deposit"; description: string; amount: number; refundable: boolean }[] = [];
  if (plan) {
    const sameCurrency = plan.priceCurrency === currency;
    const amount = input.planAmount ?? (sameCurrency && plan.priceAmount !== null ? money(plan.priceAmount) : null);
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      return fail(
        "validation_error",
        sameCurrency
          ? "Enter the plan amount."
          : `${plan.name} is priced in ${plan.priceCurrency ?? "another currency"}. Enter the amount in ${currency}.`
      );
    }
    lines.push({ kind: "plan", description: `${plan.name} plan — ${plan.durationDays} days`, amount: roundMoney(amount, currency), refundable: false });
  }
  if (input.includeSecurityFee) {
    const sameCurrency = plan?.priceCurrency === currency;
    const amount = input.securityFeeAmount ?? (plan && sameCurrency && plan.depositAmount ? money(plan.depositAmount) : null);
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      return fail("validation_error", "Enter the security fee amount.");
    }
    lines.push({ kind: "security_deposit", description: "Security fee (refundable)", amount: roundMoney(amount, currency), refundable: true });
  }
  if (lines.length === 0) return fail("validation_error", "An invoice needs a plan, a security fee, or both.");

  const totals = computeInvoiceTotals({ lines, taxRate, currency });
  if (!(totals.total > 0)) return fail("validation_error", "The invoice total must be greater than zero.");

  const now = new Date();
  const invoice = await prisma.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx, now);
    return tx.invoice.create({
      data: {
        number,
        organizerId: org.id,
        userId: org.userId,
        source: input.source,
        currency,
        planCode: plan?.code ?? null,
        planName: plan?.name ?? null,
        planPeriodDays: plan?.durationDays ?? null,
        subtotal: totals.subtotal,
        taxRate,
        taxLabel: settings.invoiceTaxLabel,
        taxAmount: totals.taxAmount,
        gatewayFee: totals.gatewayFee,
        total: totals.total,
        issuedAt: now,
        dueDate: due,
        note: input.note?.trim().slice(0, 500) || null,
        createdById: input.createdById ?? null,
        lines: {
          create: lines.map((l, i) => ({
            kind: l.kind,
            description: l.description,
            unitAmount: l.amount,
            amount: l.amount,
            refundable: l.refundable,
            sortOrder: i,
          })),
        },
      },
      include: { lines: true },
    });
  });

  if (input.createdById) {
    await prisma.adminActionLog.create({
      data: {
        adminId: input.createdById,
        action: "created_invoice",
        targetType: "Invoice",
        targetId: invoice.id,
        notes: `${invoice.number} · ${org.orgName} · ${formatMoney(totals.total, currency)}`,
      },
    });
  }
  await notify(org.userId, {
    type: "invoice",
    title: `New invoice ${invoice.number}`,
    body: `${formatMoney(totals.total, currency)}${due instanceof Date ? ` · due ${due.toLocaleDateString("en-GB", { timeZone: "UTC" })}` : ""}. Open it to see how to pay.`,
    href: `/invoices/${invoice.id}`,
  });
  return { data: invoice };
}

// Called when an admin approves an organization application: bills the plan the applicant
// picked (nothing to bill for the free plan). The security fee follows the existing deposit
// rules: only when deposits are switched on and the plan has one.
export async function createInvoiceForApprovedApplication(userId: string, planCode: string, adminId: string) {
  const [org, plan, settings] = await Promise.all([
    prisma.organizerProfile.findUnique({ where: { userId }, select: { id: true } }),
    prisma.plan.findUnique({ where: { code: planCode } }),
    prisma.siteSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!org || !plan || !plan.isPaid || plan.audience !== "organizer" || plan.priceAmount === null || !plan.priceCurrency) return null;

  const already = await prisma.invoice.count({ where: { organizerId: org.id, source: "application_approved" } });
  if (already > 0) return null;

  const deposit = settings?.depositEnabled && plan.depositAmount ? money(plan.depositAmount) : 0;
  const r = await createInvoice({
    organizerId: org.id,
    source: "application_approved",
    createdById: adminId,
    currency: plan.priceCurrency,
    planCode: plan.code,
    includeSecurityFee: deposit > 0,
    securityFeeAmount: deposit > 0 ? deposit : null,
    dueDate: null,
  });
  return "data" in r ? r.data : null;
}

// ------------------------------------------------------------
// Reading
// ------------------------------------------------------------

const withParts = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  organizer: { select: { id: true, orgName: true, userId: true, user: { select: { email: true, displayName: true } } } },
};

export type InvoiceRow = {
  id: string;
  number: string;
  orgName: string;
  orgId: string;
  currency: string;
  total: number;
  status: DisplayStatus;
  issuedAt: string;
  dueDate: string | null;
};

function toRow(i: Prisma.InvoiceGetPayload<{ include: typeof withParts }>): InvoiceRow {
  return {
    id: i.id,
    number: i.number,
    orgName: i.organizer.orgName,
    orgId: i.organizerId,
    currency: i.currency,
    total: money(i.total),
    status: displayStatus(i.status, i.dueDate),
    issuedAt: i.issuedAt.toISOString(),
    dueDate: i.dueDate?.toISOString().slice(0, 10) ?? null,
  };
}

export type InvoiceFilter = "all" | "open" | "proof_submitted" | "overdue" | "paid" | "cancelled";

export async function listInvoicesPage({ q, cursor, limit }: PageQuery, filter: InvoiceFilter = "all"): Promise<Page<InvoiceRow>> {
  const now = new Date();
  const where: Prisma.InvoiceWhereInput = {};
  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { organizer: { orgName: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (filter === "open") where.status = { in: [...OPEN] };
  else if (filter === "proof_submitted") where.status = "proof_submitted";
  else if (filter === "paid") where.status = "paid";
  else if (filter === "cancelled") where.status = "cancelled";
  else if (filter === "overdue") {
    where.status = { in: [...OPEN] };
    where.dueDate = { not: null, lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) };
  }
  const rows = await prisma.invoice.findMany({
    where,
    orderBy: [{ issuedAt: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...cursorArgs(cursor),
    include: withParts,
  });
  const page = toPage(rows, limit);
  return { nextCursor: page.nextCursor, items: page.items.map(toRow) };
}

export async function countInvoicesAwaitingReview() {
  return prisma.invoice.count({ where: { status: "proof_submitted" } });
}

export async function getInvoiceDetail(id: string) {
  const i = await prisma.invoice.findUnique({ where: { id }, include: withParts });
  if (!i) return null;
  const [paidMethod, proofMethod] = await Promise.all([
    i.paidMethodId ? prisma.paymentMethod.findUnique({ where: { id: i.paidMethodId }, select: { name: true } }) : null,
    i.proofMethodId ? prisma.paymentMethod.findUnique({ where: { id: i.proofMethodId }, select: { name: true } }) : null,
  ]);
  return { invoice: i, status: displayStatus(i.status, i.dueDate), paidMethodName: i.paidMethodName ?? paidMethod?.name ?? null, proofMethodName: proofMethod?.name ?? null };
}

export async function listMyInvoices(userId: string) {
  const rows = await prisma.invoice.findMany({
    where: { userId },
    orderBy: [{ issuedAt: "desc" }],
    include: withParts,
    take: 100,
  });
  return rows.map(toRow);
}

export async function getMyInvoice(userId: string, id: string) {
  const i = await prisma.invoice.findUnique({ where: { id }, include: withParts });
  if (!i || i.userId !== userId) return null;
  return { invoice: i, status: displayStatus(i.status, i.dueDate) };
}

// True when this organization has an unpaid plan invoice (so buying the same plan again through
// the screenshot form would double-charge them).
export async function hasOpenPlanInvoice(userId: string) {
  return (
    (await prisma.invoice.count({
      where: { userId, status: { in: [...OPEN] }, lines: { some: { kind: "plan" } } },
    })) > 0
  );
}

// ------------------------------------------------------------
// Organization side: uploading proof
// ------------------------------------------------------------

export async function submitInvoiceProof(
  userId: string,
  invoiceId: string,
  input: { proofUrl: unknown; methodId?: unknown; reference?: unknown }
) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return fail("not_found");
  if (inv.userId !== userId) return fail("forbidden");
  if (inv.status !== "unpaid" && inv.status !== "proof_submitted") return fail("not_open");
  if (typeof input.proofUrl !== "string" || !input.proofUrl.startsWith("http")) {
    return fail("validation_error", "Upload your payment screenshot first.");
  }
  let methodId: string | null = null;
  if (typeof input.methodId === "string" && input.methodId) {
    const m = await prisma.paymentMethod.findUnique({ where: { id: input.methodId }, select: { id: true } });
    if (!m) return fail("validation_error", "Choose the method you paid through.");
    methodId = m.id;
  }
  const reference = typeof input.reference === "string" && input.reference.trim() ? input.reference.trim().slice(0, 120) : null;

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "proof_submitted",
      proofUrl: input.proofUrl,
      proofSubmittedAt: new Date(),
      proofMethodId: methodId,
      proofReference: reference,
      proofRejectedNote: null,
    },
  });
  return { data: { ok: true as const } };
}

// ------------------------------------------------------------
// Admin side: reject proof / mark paid / cancel
// ------------------------------------------------------------

export async function rejectInvoiceProof(adminId: string, invoiceId: string, note: unknown) {
  const text = typeof note === "string" ? note.trim().slice(0, 500) : "";
  if (!text) return fail("validation_error", "Tell them why the proof was not accepted.");
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return fail("not_found");
  if (inv.status !== "proof_submitted") return fail(inv.status === "unpaid" ? "no_proof" : "not_open");

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "unpaid", proofUrl: null, proofSubmittedAt: null, proofMethodId: null, proofReference: null, proofRejectedNote: text },
    }),
    prisma.adminActionLog.create({ data: { adminId, action: "rejected_invoice_proof", targetType: "Invoice", targetId: invoiceId, notes: `${inv.number}: ${text}` } }),
  ]);
  await notify(inv.userId, {
    type: "invoice",
    title: `Payment proof for ${inv.number} was not accepted`,
    body: text,
    href: `/invoices/${invoiceId}`,
  });
  return { data: { ok: true as const } };
}

export interface MarkPaidInput {
  adminId: string;
  invoiceId: string;
  methodId?: string | null;
  /** Used when the money came in a way that isn't a saved method (cash, a one-off transfer). */
  methodName?: string | null;
  reference?: string | null;
  note?: string | null;
  /** The amount actually received. Must equal the invoice total. */
  amount: number;
  paidAt?: string | null; // YYYY-MM-DD
}

export async function markInvoicePaid(input: MarkPaidInput) {
  let methodName = input.methodName?.trim().slice(0, 60) || null;
  let methodId: string | null = null;
  if (input.methodId) {
    const m = await prisma.paymentMethod.findUnique({ where: { id: input.methodId }, select: { id: true, name: true } });
    if (!m) return fail("validation_error", "Choose how the money was received.");
    methodId = m.id;
    methodName = m.name;
  }
  if (!methodName) return fail("validation_error", "Choose how the money was received (or type the method).");

  let paidAt = new Date();
  if (input.paidAt) {
    const d = parseDueDate(input.paidAt);
    if (!(d instanceof Date)) return fail("validation_error", "Enter the date the money was received.");
    if (d.getTime() > Date.now() + 86_400_000) return fail("validation_error", "The payment date can't be in the future.");
    paidAt = d;
  }
  const reference = input.reference?.trim().slice(0, 120) || null;

  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: input.invoiceId }, include: { lines: true, organizer: true } });
    if (!inv) return fail("not_found");
    if (inv.status !== "unpaid" && inv.status !== "proof_submitted") return fail("not_open");
    if (roundMoney(input.amount, inv.currency) !== roundMoney(money(inv.total), inv.currency)) {
      return fail("validation_error", `Only full payment can be recorded. The invoice total is ${formatMoney(money(inv.total), inv.currency)}.`);
    }

    // Claim it first, so a double click can't pay it twice.
    const claimed = await tx.invoice.updateMany({
      where: { id: inv.id, status: { in: [...OPEN] } },
      data: {
        status: "paid",
        paidAt,
        paidAmount: inv.total,
        paidMethodId: methodId,
        paidMethodName: methodName,
        paidReference: reference ?? inv.proofReference,
        paidById: input.adminId,
        paidNote: input.note?.trim().slice(0, 500) || null,
      },
    });
    if (claimed.count !== 1) return fail("not_open");

    const org = inv.organizer;
    const planLine = inv.lines.find((l) => l.kind === "plan");
    const depositLines = inv.lines.filter((l) => l.refundable);
    const depositTotal = depositLines.reduce((s, l) => s + money(l.amount), 0);
    let expiresAt: Date | null = null;

    // 1. Grant the plan (same rules as an approved plan request: extends if already on it).
    if (planLine && inv.planCode) {
      const days = inv.planPeriodDays ?? 30;
      expiresAt = computeNewExpiry({ planCode: org.planCode, planExpiresAt: org.planExpiresAt }, inv.planCode, days, paidAt);
      await tx.organizerProfile.update({ where: { id: org.id }, data: { planCode: inv.planCode, planExpiresAt: expiresAt } });
    }

    // 2. The refundable security fee is held for the organization (existing deposit flow).
    if (depositTotal > 0) {
      await tx.securityDeposit.create({
        data: { organizerId: org.id, planCode: inv.planCode ?? org.planCode, amount: depositTotal, currency: inv.currency },
      });
    }

    // 3. Money received goes in the admin payments record: the deposit on its own (it is not
    //    income), everything else (plan + tax + gateway fee) as one entry.
    const incomePart = roundMoney(money(inv.total) - depositTotal, inv.currency);
    const note = `Invoice ${inv.number}${reference ? ` · ref ${reference}` : ""}`;
    if (incomePart > 0) {
      await tx.paymentRecord.create({
        data: {
          userId: inv.userId,
          kind: "org_plan",
          amount: incomePart,
          currency: inv.currency,
          method: methodName!,
          reference: inv.number,
          note,
          recordedById: input.adminId,
        },
      });
    }
    if (depositTotal > 0) {
      await tx.paymentRecord.create({
        data: {
          userId: inv.userId,
          kind: "org_plan",
          amount: depositTotal,
          currency: inv.currency,
          method: methodName!,
          reference: `${inv.number}-deposit`,
          note: `${note} · security fee (refundable)`,
          recordedById: input.adminId,
        },
      });
    }
    await tx.adminActionLog.create({
      data: {
        adminId: input.adminId,
        action: "marked_invoice_paid",
        targetType: "Invoice",
        targetId: inv.id,
        notes: `${inv.number} · ${formatMoney(money(inv.total), inv.currency)} via ${methodName}${expiresAt ? ` · plan until ${expiresAt.toISOString().slice(0, 10)}` : ""}`,
      },
    });
    return { data: { number: inv.number, userId: inv.userId, expiresAt, planName: inv.planName, total: money(inv.total), currency: inv.currency, id: inv.id } };
  });

  if ("data" in result && result.data) {
    const d = result.data;
    await notify(d.userId, {
      type: "invoice",
      title: `Invoice ${d.number} is paid`,
      body: d.planName && d.expiresAt
        ? `Thank you. Your ${d.planName} plan is active until ${d.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.`
        : "Thank you. Your payment was received.",
      href: `/invoices/${d.id}`,
    });
  }
  return result;
}

export async function cancelInvoice(adminId: string, invoiceId: string, note: unknown) {
  const text = typeof note === "string" ? note.trim().slice(0, 500) : "";
  if (!text) return fail("validation_error", "Add a short reason for cancelling.");
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return fail("not_found");
  const claimed = await prisma.invoice.updateMany({
    where: { id: invoiceId, status: { in: [...OPEN] } },
    data: { status: "cancelled", cancelledAt: new Date(), cancelNote: text },
  });
  if (claimed.count !== 1) return fail("not_open");
  await prisma.adminActionLog.create({
    data: { adminId, action: "cancelled_invoice", targetType: "Invoice", targetId: invoiceId, notes: `${inv.number}: ${text}` },
  });
  await notify(inv.userId, { type: "invoice", title: `Invoice ${inv.number} was cancelled`, body: text, href: `/invoices/${invoiceId}` });
  return { data: { ok: true as const } };
}
