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

export type InvoiceStatusValue = "unpaid" | "proof_submitted" | "paid" | "cancelled" | "waived";
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
  waived: "Waived",
  overdue: "Overdue",
};

// "2026-11-15" (from a date input) -> that day at 00:00 UTC. Anything else -> null.
export function parseDueDate(input: unknown): Date | null | "invalid" {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return "invalid";
  const d = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input ? "invalid" : d;
}

// ---- discounts ----

export type DiscountType = "amount" | "percent";

// A discount is taken off the plan fee only (never the refundable security fee) and can't wipe
// it out: to forgive an invoice completely, use "Waive". Returns the money to subtract.
export function computeDiscount(
  planAmount: number,
  type: DiscountType,
  value: number,
  currency: string
): { ok: true; amount: number; label: string } | { ok: false; message: string } {
  if (!Number.isFinite(value) || value <= 0) return { ok: false, message: "Enter a discount greater than zero." };
  let amount: number;
  let label: string;
  if (type === "percent") {
    if (value >= 100) return { ok: false, message: "A discount must be less than 100%. To forgive the whole invoice, use Waive." };
    amount = roundMoney((planAmount * value) / 100, currency);
    label = `Discount (${value}%)`;
  } else {
    amount = roundMoney(value, currency);
    label = "Discount";
  }
  if (amount <= 0) return { ok: false, message: "That discount rounds to nothing." };
  if (amount >= planAmount) return { ok: false, message: "A discount must be less than the plan fee. To forgive the whole invoice, use Waive." };
  return { ok: true, amount, label };
}

// ---- waiving parts of an invoice ----

export type WaivableLine = { kind: "plan" | "security_deposit" | "discount" | "other"; amount: number; originalAmount: number; refundable: boolean; waived: boolean };

// Waive the plan fee and/or the security fee. A waived line drops to 0 (its original figure is
// kept). Waiving the plan fee also drops any discount, since there is nothing left to discount.
// Nothing is waived by default: the caller ticks each part.
export function applyWaiver(lines: WaivableLine[], waive: { plan: boolean; fee: boolean }): WaivableLine[] {
  return lines
    .filter((l) => !(waive.plan && l.kind === "discount"))
    .map((l) => {
      const hit = (waive.plan && l.kind === "plan") || (waive.fee && l.kind === "security_deposit");
      return hit && !l.waived ? { ...l, amount: 0, waived: true } : l;
    });
}
