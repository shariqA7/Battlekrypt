// Pure invoice rules (no database): totals, numbering, due-date state. Kept separate so they can
// be tested on their own and so client components can import them.
import { ZERO_DECIMAL_CURRENCIES } from "@/lib/money";

export const DEFAULT_INVOICE_CURRENCY = "PKR";
export const MAX_TAX_RATE = 100;

// Yen, won and dong have no cents; everything else rounds to 2 decimals.
export function roundMoney(n: number, currency: string): number {
  const dp = (ZERO_DECIMAL_CURRENCIES as readonly string[]).includes(currency) ? 0 : 2;
  const f = 10 ** dp;
  // The tiny epsilon stops 1.005 -> 1 style float errors.
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
}

export type TotalsLine = { amount: number; refundable?: boolean };

export interface InvoiceTotals {
  /** Every line added up, refundable ones included. */
  subtotal: number;
  /** Lines that are the platform's income (not refundable). Tax applies to these only. */
  incomeSubtotal: number;
  /** Refundable lines (security deposit): held for the organization, never income. */
  refundableTotal: number;
  taxAmount: number;
  gatewayFee: number;
  total: number;
}

export function computeInvoiceTotals(input: {
  lines: TotalsLine[];
  taxRate: number;
  gatewayFee?: number;
  currency: string;
}): InvoiceTotals {
  const { currency } = input;
  let subtotal = 0;
  let refundableTotal = 0;
  for (const l of input.lines) {
    subtotal += l.amount;
    if (l.refundable) refundableTotal += l.amount;
  }
  subtotal = roundMoney(subtotal, currency);
  refundableTotal = roundMoney(refundableTotal, currency);
  const incomeSubtotal = roundMoney(subtotal - refundableTotal, currency);
  const taxAmount = roundMoney((incomeSubtotal * input.taxRate) / 100, currency);
  const gatewayFee = roundMoney(input.gatewayFee ?? 0, currency);
  const total = roundMoney(subtotal + taxAmount + gatewayFee, currency);
  return { subtotal, incomeSubtotal, refundableTotal, taxAmount, gatewayFee, total };
}

// BK-2026-0001
export function formatInvoiceNumber(year: number, n: number): string {
  return `BK-${year}-${String(n).padStart(4, "0")}`;
}

export type InvoiceStatusValue = "unpaid" | "proof_submitted" | "paid" | "cancelled";
export type DisplayStatus = InvoiceStatusValue | "overdue";

// "Overdue" is never stored: an open invoice whose due date has passed (end of that day, UTC).
// No due date = never overdue.
export function isOverdue(status: InvoiceStatusValue, dueDate: Date | null, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  if (status !== "unpaid" && status !== "proof_submitted") return false;
  const endOfDue = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate() + 1));
  return now.getTime() >= endOfDue.getTime();
}

export function displayStatus(status: InvoiceStatusValue, dueDate: Date | null, now: Date = new Date()): DisplayStatus {
  return isOverdue(status, dueDate, now) ? "overdue" : status;
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  unpaid: "Awaiting payment",
  proof_submitted: "Proof submitted",
  paid: "Paid",
  cancelled: "Cancelled",
  overdue: "Overdue",
};

// "2026-11-15" (from a date input) -> that day at 00:00 UTC. Anything else -> null.
export function parseDueDate(input: unknown): Date | null | "invalid" {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return "invalid";
  const d = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input ? "invalid" : d;
}
