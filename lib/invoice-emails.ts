// The emails sent about invoices. Pure builders (no database, no sending), so they can be tested.
import type { EmailMessage } from "@/lib/email";
import { formatMoney } from "@/lib/money";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface InvoiceEmailData {
  to: string;
  recipientName: string;
  orgName: string;
  number: string;
  currency: string;
  link: string; // the invoice page
  dueDate: Date | null;
  lines: { description: string; amount: number; waived?: boolean }[];
  taxLabel: string;
  taxAmount: number;
  gatewayFee: number;
  total: number;
  issuerName: string;
  footerNote?: string | null;
}

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function table(d: InvoiceEmailData): { html: string; text: string } {
  const m = (n: number) => formatMoney(n, d.currency);
  const rows: { label: string; value: string }[] = d.lines.map((l) => ({ label: l.description, value: l.waived ? "Waived" : m(l.amount) }));
  if (d.taxAmount > 0) rows.push({ label: d.taxLabel, value: m(d.taxAmount) });
  if (d.gatewayFee > 0) rows.push({ label: "Payment processing fee", value: m(d.gatewayFee) });
  const html =
    `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">` +
    rows.map((r) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e5e2d8">${esc(r.label)}</td><td style="padding:6px 0;border-bottom:1px solid #e5e2d8;text-align:right;font-family:monospace">${esc(r.value)}</td></tr>`).join("") +
    `<tr><td style="padding:8px 0;font-weight:bold">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold;font-family:monospace">${esc(m(d.total))}</td></tr></table>`;
  const text = rows.map((r) => `  ${r.label}: ${r.value}`).join("\n") + `\n  Total: ${m(d.total)}`;
  return { html, text };
}

function shell(d: InvoiceEmailData, heading: string, intro: string, introText: string, button: string, after: string, afterText: string): { html: string; text: string } {
  const t = table(d);
  const foot = d.footerNote ? `<p style="font-size:13px;color:#555">${esc(d.footerNote)}</p>` : "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1c1a14">
<h2 style="margin:0 0 4px">${esc(heading)}</h2>
<p style="margin:0 0 12px;color:#555;font-size:13px">Invoice ${esc(d.number)} · ${esc(d.orgName)}</p>
<p>${intro}</p>
${t.html}
<p style="margin:20px 0"><a href="${esc(d.link)}" style="background:#1c1a14;color:#fff;padding:12px 20px;text-decoration:none;font-weight:bold">${esc(button)}</a></p>
${after}
${foot}
<p style="font-size:12px;color:#777">${esc(d.issuerName)}</p>
</div>`;
  const text = `${heading}\nInvoice ${d.number} · ${d.orgName}\n\n${introText}\n\n${t.text}\n\n${button}: ${d.link}\n${afterText ? `\n${afterText}\n` : ""}${d.footerNote ? `\n${d.footerNote}\n` : ""}\n${d.issuerName}`;
  return { html, text };
}

// A new invoice, a renewal, or an upgrade invoice.
export function invoiceIssuedEmail(d: InvoiceEmailData, kind: "invoice" | "renewal" | "upgrade" = "invoice"): EmailMessage {
  const subject =
    kind === "renewal" ? `Renew your plan: invoice ${d.number} (${formatMoney(d.total, d.currency)})`
    : kind === "upgrade" ? `Your upgrade invoice ${d.number} (${formatMoney(d.total, d.currency)})`
    : `Invoice ${d.number} from ${d.issuerName} (${formatMoney(d.total, d.currency)})`;
  const heading = kind === "renewal" ? "Time to renew your plan" : kind === "upgrade" ? "Your upgrade is ready to pay" : "You have a new invoice";
  const dueLine = d.dueDate ? ` It is due on ${day(d.dueDate)}.` : "";
  const intro = `Hi ${esc(d.recipientName)}, here is the invoice for ${esc(d.orgName)}.${dueLine} Open it to see how to pay, then upload a screenshot of your payment and we will confirm it.`;
  const introText = `Hi ${d.recipientName}, here is the invoice for ${d.orgName}.${dueLine} Open it to see how to pay, then upload a screenshot of your payment and we will confirm it.`;
  const after = `<p style="font-size:13px;color:#555">Only pay to the account details shown on the invoice page. We never ask for payment by message.</p>`;
  const { html, text } = shell(d, heading, intro, introText, "View and pay the invoice", after, "Only pay to the account details shown on the invoice page. We never ask for payment by message.");
  return { to: d.to, subject, html, text };
}

// Payment confirmed: the receipt.
export function invoicePaidEmail(d: InvoiceEmailData & { paidAt: Date; method: string | null; reference: string | null; planText: string | null }): EmailMessage {
  const subject = `Payment received: invoice ${d.number}`;
  const bits = [`Paid on ${day(d.paidAt)}`, d.method ? `via ${d.method}` : null, d.reference ? `reference ${d.reference}` : null].filter(Boolean).join(" ");
  const intro = `Hi ${esc(d.recipientName)}, thank you. We have received your payment (${esc(bits)}).${d.planText ? ` ${esc(d.planText)}` : ""}`;
  const introText = `Hi ${d.recipientName}, thank you. We have received your payment (${bits}).${d.planText ? ` ${d.planText}` : ""}`;
  const { html, text } = shell(d, "Payment received", intro, introText, "View or print your receipt", "", "");
  return { to: d.to, subject, html, text };
}

export function invoiceProofRejectedEmail(d: InvoiceEmailData & { reason: string }): EmailMessage {
  const subject = `Your payment proof for invoice ${d.number} was not accepted`;
  const intro = `Hi ${esc(d.recipientName)}, we could not confirm your payment for this invoice. Reason: <strong>${esc(d.reason)}</strong>. Please check the details and upload a new proof.`;
  const introText = `Hi ${d.recipientName}, we could not confirm your payment for this invoice. Reason: ${d.reason}. Please check the details and upload a new proof.`;
  const { html, text } = shell(d, "We couldn't confirm your payment", intro, introText, "Open the invoice", "", "");
  return { to: d.to, subject, html, text };
}
