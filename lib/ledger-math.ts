// The admin ledger's arithmetic, with no database: date ranges, which payments count as income,
// and the per-currency profit calculation. Currencies are never blended into one number.
import { roundMoney } from "@/lib/invoice-math";

export const EXPENSE_CATEGORIES = [
  { value: "service", label: "Services (hosting, tools, domains)" },
  { value: "employee", label: "Employees & contractors" },
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Bills & utilities" },
  { value: "other", label: "Other" },
] as const;
export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number]["value"];
export const categoryLabel = (c: string) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;

// ---- date ranges (UTC; the end is exclusive) ----

export type RangePreset = "this_month" | "last_month" | "this_quarter" | "this_year" | "last_year" | "all" | "custom";
export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "this_year", label: "This year" },
  { key: "last_year", label: "Last year" },
  { key: "all", label: "All time" },
];

export interface DateRange { from: Date; to: Date; preset: RangePreset; label: string }

const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m, d));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function resolveRange(preset: string | undefined, fromStr: string | undefined, toStr: string | undefined, now: Date = new Date()): DateRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (preset === "custom" || (!preset && (fromStr || toStr))) {
    const f = fromStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr) ? new Date(`${fromStr}T00:00:00Z`) : null;
    const t = toStr && /^\d{4}-\d{2}-\d{2}$/.test(toStr) ? new Date(`${toStr}T00:00:00Z`) : null;
    if (f && t && !Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f <= t) {
      return { from: f, to: new Date(t.getTime() + 86_400_000), preset: "custom", label: `${ymd(f)} to ${ymd(t)}` };
    }
  }
  switch (preset) {
    case "last_month": return { from: utc(y, m - 1), to: utc(y, m), preset: "last_month", label: "Last month" };
    case "this_quarter": { const q = Math.floor(m / 3) * 3; return { from: utc(y, q), to: utc(y, q + 3), preset: "this_quarter", label: "This quarter" }; }
    case "this_year": return { from: utc(y, 0), to: utc(y + 1, 0), preset: "this_year", label: "This year" };
    case "last_year": return { from: utc(y - 1, 0), to: utc(y, 0), preset: "last_year", label: "Last year" };
    case "all": return { from: utc(2020, 0), to: utc(y + 1, 0), preset: "all", label: "All time" };
    default: return { from: utc(y, m), to: utc(y, m + 1), preset: "this_month", label: "This month" };
  }
}

// ---- which recorded payments are income ----

// Payments made when an invoice is marked paid carry the invoice number as their reference
// (BK-2026-0001, or BK-2026-0001-deposit). The invoice itself is counted, so those records are
// left out here to avoid counting the same money twice.
export const isInvoicePaymentRef = (ref: string | null | undefined) => !!ref && /^BK-\d{4}-\d+(-deposit)?$/.test(ref);
// A security deposit is held for the organization, not income. (The plan-request flow records it
// as "<requestId>-deposit".)
export const isDepositRef = (ref: string | null | undefined) => !!ref && ref.endsWith("-deposit");

// ---- the calculation ----

export interface InvoiceIncome { currency: string; gross: number; tax: number; gatewayFee: number; deposit: number }
export interface OtherIncome { currency: string; amount: number }
export interface ExpenseItem { currency: string; category: string; amount: number }
export interface Extra { currency: string; amount: number }
export interface TaxPaid { currency: string; type: "collected_tax" | "income_tax"; amount: number }
export interface TaxToDate { currency: string; collected: number; remitted: number }

export const TAX_TYPES = [
  { value: "collected_tax", label: "Tax collected from users (sales tax / GST)" },
  { value: "income_tax", label: "Income tax on profit" },
] as const;
export const taxTypeLabel = (t: string) => TAX_TYPES.find((x) => x.value === t)?.label ?? t;

export interface CurrencyLedger {
  currency: string;
  gross: number; // everything received, deposits held included
  taxCollected: number; // owed to the tax authority, not income
  gatewayFees: number;
  depositsHeld: number; // refundable, not income
  invoiceNet: number;
  otherPayments: number; // recorded payments with no tax breakdown
  forfeitedDeposits: number; // a forfeited deposit becomes income
  netRevenue: number;
  expenses: number;
  expensesByCategory: Record<string, number>;
  profit: number; // net revenue - expenses, the figure tax on profit is based on
  incomeTaxPaid: number; // income tax paid on profit in this period
  profitAfterTax: number; // profit - income tax paid
  collectedTaxRemitted: number; // collected tax handed to the authority in this period
  // All time (not just this period): what is owed on the tax collected from customers.
  taxCollectedToDate: number;
  taxRemittedToDate: number;
  taxStillToPay: number; // collected - remitted; negative = overpaid
  discountsGiven: number; // information only
  waived: number; // information only
  depositsRefunded: number; // information only: returned to organizations
}

const blank = (currency: string): CurrencyLedger => ({
  currency, gross: 0, taxCollected: 0, gatewayFees: 0, depositsHeld: 0, invoiceNet: 0, otherPayments: 0, forfeitedDeposits: 0,
  netRevenue: 0, expenses: 0, expensesByCategory: {}, profit: 0, discountsGiven: 0, waived: 0, depositsRefunded: 0,
  incomeTaxPaid: 0, profitAfterTax: 0, collectedTaxRemitted: 0, taxCollectedToDate: 0, taxRemittedToDate: 0, taxStillToPay: 0,
});

export function buildLedger(input: {
  invoices: InvoiceIncome[];
  others: OtherIncome[];
  forfeited: Extra[];
  refunded: Extra[];
  discounts: Extra[];
  waived: Extra[];
  expenses: ExpenseItem[];
  taxPaid?: TaxPaid[];
  taxToDate?: TaxToDate[];
}): CurrencyLedger[] {
  const by = new Map<string, CurrencyLedger>();
  const get = (c: string) => { let l = by.get(c); if (!l) { l = blank(c); by.set(c, l); } return l; };

  for (const i of input.invoices) {
    const l = get(i.currency);
    l.gross += i.gross; l.taxCollected += i.tax; l.gatewayFees += i.gatewayFee; l.depositsHeld += i.deposit;
  }
  for (const o of input.others) { const l = get(o.currency); l.gross += o.amount; l.otherPayments += o.amount; }
  for (const f of input.forfeited) get(f.currency).forfeitedDeposits += f.amount;
  for (const r of input.refunded) get(r.currency).depositsRefunded += r.amount;
  for (const d of input.discounts) get(d.currency).discountsGiven += d.amount;
  for (const w of input.waived) get(w.currency).waived += w.amount;
  for (const e of input.expenses) {
    const l = get(e.currency);
    l.expenses += e.amount;
    l.expensesByCategory[e.category] = (l.expensesByCategory[e.category] ?? 0) + e.amount;
  }

  for (const t of input.taxPaid ?? []) {
    const l = get(t.currency);
    if (t.type === "income_tax") l.incomeTaxPaid += t.amount;
    else l.collectedTaxRemitted += t.amount;
  }
  for (const t of input.taxToDate ?? []) {
    const l = get(t.currency);
    l.taxCollectedToDate += t.collected;
    l.taxRemittedToDate += t.remitted;
  }

  return [...by.values()]
    .map((l) => {
      const r = (n: number) => roundMoney(n, l.currency);
      const invoiceNet = r(l.gross - l.otherPayments - l.taxCollected - l.gatewayFees - l.depositsHeld);
      const netRevenue = r(invoiceNet + l.otherPayments + l.forfeitedDeposits);
      const expenses = r(l.expenses);
      return {
        ...l,
        gross: r(l.gross), taxCollected: r(l.taxCollected), gatewayFees: r(l.gatewayFees), depositsHeld: r(l.depositsHeld),
        otherPayments: r(l.otherPayments), forfeitedDeposits: r(l.forfeitedDeposits), depositsRefunded: r(l.depositsRefunded),
        discountsGiven: r(l.discountsGiven), waived: r(l.waived),
        expensesByCategory: Object.fromEntries(Object.entries(l.expensesByCategory).map(([k, v]) => [k, r(v)])),
        invoiceNet, netRevenue, expenses, profit: r(netRevenue - expenses),
        incomeTaxPaid: r(l.incomeTaxPaid),
        profitAfterTax: r(netRevenue - expenses - l.incomeTaxPaid),
        collectedTaxRemitted: r(l.collectedTaxRemitted),
        taxCollectedToDate: r(l.taxCollectedToDate),
        taxRemittedToDate: r(l.taxRemittedToDate),
        taxStillToPay: r(l.taxCollectedToDate - l.taxRemittedToDate),
      };
    })
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
