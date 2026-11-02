// Paying an invoice online with crypto through NOWPayments.
//
// startCryptoCheckout  : the organization opens a hosted NOWPayments page for one of its invoices.
// handleNotification   : NOWPayments tells us about each step (signed). Only a verified "finished"
//                        payment for the right amount marks the invoice paid, through the same
//                        markInvoicePaid an admin uses, so the plan, the deposit, the payment
//                        record, the receipt email and the ledger all behave identically.
// refreshGatewayPayment: an admin asks NOWPayments for the latest status (if a notification was missed).
// Anything unusual (a part payment, a refund, an amount that doesn't match, a double payment) is
// flagged for an admin and never auto-resolved.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CHECKOUT_REUSE_MS,
  IN_FLIGHT,
  NOWPAYMENTS_METHOD_NAME,
  STATUS_TEXT,
  buildInvoiceRequest,
  checkReceived,
  checkSettlement,
  classifyStatus,
  getNowPaymentsConfig,
  gatewaySupportsCurrency,
  verifySignature,
} from "@/lib/nowpayments";
import { isChannelEnabled } from "@/lib/services/payment-channels";
import { markInvoicePaid, type InvoiceErrorCode } from "@/lib/services/invoices";
import { formatMoney } from "@/lib/money";

type Fail = { error: InvoiceErrorCode; message?: string };
const fail = (error: InvoiceErrorCode, message?: string): Fail => ({ error, message });
const num = (v: { toString(): string } | number | null | undefined) => Number(v?.toString() ?? 0);
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

// ---- availability ----

export async function getGatewayInfo() {
  const cfg = getNowPaymentsConfig();
  return {
    enabled: await isChannelEnabled("nowpayments"),
    configured: cfg.configured,
    hasIpnSecret: cfg.hasIpnSecret,
    sandbox: cfg.sandbox,
    webhookUrl: `${siteUrl() || "https://your-site"}/api/webhooks/nowpayments`,
  };
}

// Whether an organization is offered "pay with crypto" for an invoice in this currency.
export async function cryptoCheckoutAvailable(currency: string): Promise<boolean> {
  const g = await getGatewayInfo();
  return g.enabled && g.configured && g.hasIpnSecret && gatewaySupportsCurrency(currency);
}

// ---- starting a checkout ----

export async function startCryptoCheckout(userId: string, invoiceId: string): Promise<{ data: { url: string } } | Fail> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { organizer: { select: { orgName: true } } } });
  if (!inv) return fail("not_found");
  if (inv.userId !== userId) return fail("forbidden");
  if (inv.status === "proof_submitted") return fail("validation_error", "Your payment proof for this invoice is being checked, so it can't be paid online as well.");
  if (inv.status !== "unpaid") return fail("not_open");
  if (!(await cryptoCheckoutAvailable(inv.currency))) {
    return fail("validation_error", "Online crypto payment isn't available for this invoice. Please use one of the other payment methods.");
  }
  const total = num(inv.total);

  const attempts = await prisma.gatewayPayment.findMany({ where: { invoiceId, provider: "nowpayments" }, orderBy: { createdAt: "desc" } });
  const inFlight = attempts.find((a) => IN_FLIGHT.includes(a.status));
  if (inFlight) {
    return fail("validation_error", `A crypto payment for this invoice is already in progress (${STATUS_TEXT[inFlight.status] ?? inFlight.status}). Wait for it to complete, or contact support if it looks stuck.`);
  }
  // Reuse a recent checkout nothing has been paid on, so repeated clicks don't pile up checkouts.
  const reusable = attempts.find(
    (a) => (a.status === "created" || a.status === "waiting") && a.checkoutUrl && num(a.priceAmount) === total && Date.now() - a.createdAt.getTime() < CHECKOUT_REUSE_MS
  );
  if (reusable?.checkoutUrl) return { data: { url: reusable.checkoutUrl } };

  const base = siteUrl();
  if (!base) return fail("validation_error", "Online payment isn't set up yet (the site address is missing). Please use another method.");

  const row = await prisma.gatewayPayment.create({
    data: { invoiceId, provider: "nowpayments", priceAmount: total, priceCurrency: inv.currency },
  });
  const cfg = getNowPaymentsConfig();
  try {
    const res = await fetch(`${cfg.apiUrl}/invoice`, {
      method: "POST",
      headers: { "x-api-key": cfg.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(buildInvoiceRequest({ priceAmount: total, priceCurrency: inv.currency, orderId: row.id, description: `Invoice ${inv.number} · ${inv.organizer.orgName}`, siteUrl: base, invoiceId })),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string | number; invoice_url?: string; message?: string };
    if (!res.ok || !body.invoice_url) throw new Error(body.message ?? `HTTP ${res.status}`);
    await prisma.gatewayPayment.update({ where: { id: row.id }, data: { providerInvoiceId: body.id !== undefined ? String(body.id) : null, checkoutUrl: body.invoice_url, status: "waiting" } });
    return { data: { url: body.invoice_url } };
  } catch (e) {
    console.error("NOWPayments create invoice failed", e);
    await prisma.gatewayPayment.update({ where: { id: row.id }, data: { status: "failed", reviewNote: `Could not open the checkout: ${e instanceof Error ? e.message : "unknown error"}` } });
    return fail("validation_error", "We couldn't open the online payment page just now. Please try again in a moment, or use another payment method.");
  }
}

// ---- applying a status update (from a notification or a refresh) ----

interface GatewayPayload {
  payment_id?: string | number;
  payment_status?: string;
  price_amount?: number | string;
  price_currency?: string;
  pay_currency?: string;
  pay_amount?: number | string;
  actually_paid?: number | string;
  outcome_amount?: number | string;
  outcome_currency?: string;
  order_id?: string;
}

const dec = (v: number | string | undefined) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : String(v));

async function flag(id: string, note: string) {
  await prisma.gatewayPayment.update({ where: { id }, data: { needsReview: true, reviewNote: note.slice(0, 500) } });
}

async function applyUpdate(attemptId: string, p: GatewayPayload) {
  const attempt = await prisma.gatewayPayment.findUnique({ where: { id: attemptId }, include: { invoice: true } });
  if (!attempt) return;
  const status = String(p.payment_status ?? "");
  const paymentId = p.payment_id !== undefined ? String(p.payment_id) : null;

  await prisma.gatewayEvent.create({ data: { gatewayPaymentId: attempt.id, status: status || "unknown", payload: p as Prisma.InputJsonValue } });

  // A finished or refunded payment is not moved backwards by a late, out-of-order notification.
  const locked = attempt.status === "finished" || attempt.status === "refunded";
  await prisma.gatewayPayment.update({
    where: { id: attempt.id },
    data: {
      ...(locked && status !== "refunded" ? {} : { status: status || attempt.status }),
      providerPaymentId: paymentId ?? attempt.providerPaymentId,
      payCurrency: p.pay_currency ?? attempt.payCurrency,
      payAmount: dec(p.pay_amount) ?? attempt.payAmount,
      actuallyPaid: dec(p.actually_paid) ?? attempt.actuallyPaid,
      outcomeAmount: dec(p.outcome_amount) ?? attempt.outcomeAmount,
      outcomeCurrency: p.outcome_currency ?? attempt.outcomeCurrency,
    },
  });

  switch (classifyStatus(status)) {
    case "settled": {
      if (attempt.settledAt) return; // already handled (the gateway repeats notifications)
      const inv = attempt.invoice;
      const check = checkSettlement({
        attemptPrice: num(attempt.priceAmount),
        attemptCurrency: attempt.priceCurrency,
        invoiceTotal: num(inv.total),
        invoiceCurrency: inv.currency,
        ipnPrice: Number(p.price_amount),
        ipnCurrency: String(p.price_currency ?? ""),
      });
      if (!check.ok) return flag(attempt.id, `Payment finished but not accepted automatically: ${check.reason} Check it before marking the invoice paid.`);

      const r = await markInvoicePaid({
        adminId: null,
        invoiceId: inv.id,
        methodName: NOWPAYMENTS_METHOD_NAME,
        reference: paymentId ?? attempt.id,
        note: `NOWPayments payment ${paymentId ?? ""}: ${p.actually_paid ?? "?"} ${String(p.pay_currency ?? "").toUpperCase()}`.trim(),
        amount: num(inv.total),
      });
      if ("data" in r && r.data) {
        // Paid in full by the customer, so the plan stays. But if what reaches us is noticeably less
        // than the invoice, some fee is coming out of our side: flag it for an admin.
        const received = checkReceived({
          invoiceTotal: num(inv.total),
          invoiceCurrency: inv.currency,
          outcomeAmount: p.outcome_amount !== undefined ? Number(p.outcome_amount) : attempt.outcomeAmount ? num(attempt.outcomeAmount) : null,
          outcomeCurrency: p.outcome_currency ?? attempt.outcomeCurrency,
        });
        await prisma.gatewayPayment.update({
          where: { id: attempt.id },
          data: { settledAt: new Date(), needsReview: received.status === "short", reviewNote: received.status === "short" ? received.note.slice(0, 500) : null },
        });
        return;
      }
      // Already paid? If it was by this very payment (a repeated notification), that's fine.
      const now = await prisma.invoice.findUnique({ where: { id: inv.id }, select: { status: true, paidReference: true } });
      if (now?.status === "paid" && now.paidReference === (paymentId ?? attempt.id)) {
        await prisma.gatewayPayment.update({ where: { id: attempt.id }, data: { settledAt: new Date() } });
        return;
      }
      return flag(
        attempt.id,
        now && now.status !== "unpaid" && now.status !== "proof_submitted"
          ? `The money arrived (${formatMoney(num(attempt.priceAmount), attempt.priceCurrency)}), but the invoice was already ${now.status}. Check for a double payment and refund it if needed.`
          : `The money arrived but the invoice could not be marked paid: ${"message" in r && r.message ? r.message : "error"}. Mark it paid by hand after checking.`
      );
    }
    case "partial":
      return flag(attempt.id, `The customer sent less than the full amount (${p.actually_paid ?? "?"} of ${p.pay_amount ?? "?"} ${String(p.pay_currency ?? "").toUpperCase()}). Contact them to pay the rest, or mark the invoice paid by hand if you accept it.`);
    case "refunded":
      return flag(attempt.id, "The gateway refunded this payment. If the invoice was already marked paid, review whether the plan should stay.");
    default:
      return; // waiting / confirming / confirmed / sending / failed / expired: nothing to do yet
  }
}

// ---- the notification from NOWPayments ----

export async function handleNotification(rawBody: string, signature: string | null): Promise<{ status: number; body: Record<string, unknown> }> {
  const cfg = getNowPaymentsConfig();
  if (!cfg.hasIpnSecret) return { status: 503, body: { error: "not_configured" } };
  let payload: GatewayPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "bad_json" } };
  }
  if (!verifySignature(payload, signature, cfg.ipnSecret)) return { status: 401, body: { error: "bad_signature" } };

  const orderId = typeof payload.order_id === "string" ? payload.order_id : "";
  const attempt = orderId ? await prisma.gatewayPayment.findUnique({ where: { id: orderId }, select: { id: true } }) : null;
  if (!attempt) return { status: 200, body: { ok: true, ignored: true } }; // not ours: answer 200 so it isn't retried
  try {
    await applyUpdate(attempt.id, payload);
  } catch (e) {
    console.error("NOWPayments notification failed", e);
    return { status: 500, body: { error: "processing_failed" } }; // a non-200 makes NOWPayments try again
  }
  return { status: 200, body: { ok: true } };
}

// ---- admin: ask NOWPayments for the latest status ----

export async function refreshGatewayPayment(gatewayPaymentId: string): Promise<{ data: { status: string } } | Fail> {
  const a = await prisma.gatewayPayment.findUnique({ where: { id: gatewayPaymentId } });
  if (!a) return fail("not_found");
  if (!a.providerPaymentId) return fail("validation_error", "No payment has been made on this checkout yet, so there is nothing to refresh.");
  const cfg = getNowPaymentsConfig();
  if (!cfg.configured) return fail("validation_error", "NOWPayments isn't configured (no API key).");
  try {
    const res = await fetch(`${cfg.apiUrl}/payment/${encodeURIComponent(a.providerPaymentId)}`, { headers: { "x-api-key": cfg.apiKey }, signal: AbortSignal.timeout(15_000) });
    const body = (await res.json().catch(() => ({}))) as GatewayPayload & { message?: string };
    if (!res.ok || !body.payment_status) throw new Error(body.message ?? `HTTP ${res.status}`);
    await applyUpdate(a.id, { ...body, order_id: a.id });
    const now = await prisma.gatewayPayment.findUnique({ where: { id: a.id }, select: { status: true } });
    return { data: { status: now?.status ?? body.payment_status } };
  } catch (e) {
    return fail("validation_error", `Couldn't reach NOWPayments: ${e instanceof Error ? e.message : "unknown error"}`);
  }
}

// ---- reading ----

export async function listGatewayPayments(invoiceId: string) {
  const rows = await prisma.gatewayPayment.findMany({ where: { invoiceId }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    statusText: STATUS_TEXT[r.status] ?? r.status,
    payCurrency: r.payCurrency,
    payAmount: r.payAmount ? num(r.payAmount) : null,
    actuallyPaid: r.actuallyPaid ? num(r.actuallyPaid) : null,
    outcomeAmount: r.outcomeAmount ? num(r.outcomeAmount) : null,
    outcomeCurrency: r.outcomeCurrency,
    providerPaymentId: r.providerPaymentId,
    needsReview: r.needsReview,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt.toISOString(),
    settledAt: r.settledAt?.toISOString() ?? null,
  }));
}

export async function countGatewayNeedingReview() {
  return prisma.gatewayPayment.count({ where: { needsReview: true } });
}

// An admin has looked at a flagged payment and dealt with it (refunded, collected the rest, …).
export async function resolveGatewayReview(adminId: string, gatewayPaymentId: string): Promise<{ data: { ok: true } } | Fail> {
  const a = await prisma.gatewayPayment.findUnique({ where: { id: gatewayPaymentId }, include: { invoice: { select: { number: true } } } });
  if (!a) return fail("not_found");
  await prisma.gatewayPayment.update({ where: { id: a.id }, data: { needsReview: false } });
  await prisma.adminActionLog.create({
    data: { adminId, action: "resolved_gateway_review", targetType: "GatewayPayment", targetId: a.id, notes: `${a.invoice.number}: ${a.reviewNote ?? ""}`.slice(0, 500) },
  });
  return { data: { ok: true as const } };
}
