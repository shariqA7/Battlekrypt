// Sends the invoice emails. Best-effort, like notifications: a failed email is logged and never
// undoes the invoice, the payment or the plan change that triggered it.
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { getInvoiceSettings } from "@/lib/services/payment-methods";
import {
  invoiceIssuedEmail,
  invoicePaidEmail,
  invoiceProofRejectedEmail,
  type InvoiceEmailData,
} from "@/lib/invoice-emails";

const num = (v: { toString(): string }) => Number(v.toString());

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

async function load(invoiceId: string): Promise<(InvoiceEmailData & { source: string; paidAt: Date | null; paidMethodName: string | null; paidReference: string | null; planName: string | null }) | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, organizer: { select: { orgName: true, user: { select: { email: true, displayName: true } } } } },
  });
  if (!inv?.organizer.user.email) return null;
  const settings = await getInvoiceSettings();
  return {
    to: inv.organizer.user.email,
    recipientName: inv.organizer.user.displayName,
    orgName: inv.organizer.orgName,
    number: inv.number,
    currency: inv.currency,
    link: `${siteBase()}/invoices/${inv.id}`,
    dueDate: inv.dueDate,
    lines: inv.lines.map((l) => ({ description: l.description, amount: num(l.waived ? l.unitAmount : l.amount), waived: l.waived })),
    taxLabel: inv.taxLabel,
    taxAmount: num(inv.taxAmount),
    gatewayFee: num(inv.gatewayFee),
    total: num(inv.total),
    issuerName: settings.invoiceIssuerName,
    footerNote: settings.invoiceFooterNote || null,
    source: inv.source,
    paidAt: inv.paidAt,
    paidMethodName: inv.paidMethodName,
    paidReference: inv.paidReference,
    planName: inv.planName,
  };
}

async function deliver(label: string, build: () => Promise<Parameters<typeof sendEmail>[0] | null>) {
  try {
    const msg = await build();
    if (!msg) return;
    const r = await sendEmail(msg);
    if (!r.ok) console.error(`invoice email (${label}) not sent`, r.error, r.detail ?? "");
  } catch (e) {
    console.error(`invoice email (${label}) failed`, e);
  }
}

export function emailInvoiceIssued(invoiceId: string) {
  return deliver("issued", async () => {
    const d = await load(invoiceId);
    if (!d) return null;
    return invoiceIssuedEmail(d, d.source === "renewal" ? "renewal" : d.source === "plan_change" ? "upgrade" : "invoice");
  });
}

export function emailInvoicePaid(invoiceId: string, planText: string | null) {
  return deliver("paid", async () => {
    const d = await load(invoiceId);
    if (!d || !d.paidAt) return null;
    return invoicePaidEmail({ ...d, paidAt: d.paidAt, method: d.paidMethodName, reference: d.paidReference, planText });
  });
}

export function emailInvoiceProofRejected(invoiceId: string, reason: string) {
  return deliver("proof rejected", async () => {
    const d = await load(invoiceId);
    return d ? invoiceProofRejectedEmail({ ...d, reason }) : null;
  });
}
