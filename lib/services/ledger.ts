// The admin ledger: what the platform earned, the tax it collected, what it spent, and the profit.
//
// Income, by the date the money arrived:
//   - paid invoices (their tax, gateway fee and refundable security fee are split out),
//   - other recorded payments (no tax breakdown; invoice payments and held deposits are left out
//     so nothing is counted twice),
//   - security deposits that were forfeited (they become income when resolved).
// Expenses are entered by an admin and can be voided, never deleted.
// Everything is kept per currency: nothing is converted or blended.
import { prisma } from "@/lib/prisma";
import { isSupportedCurrency } from "@/lib/money";
import { parseDueDate, roundMoney } from "@/lib/invoice-math";
import {
  buildLedger,
  isDepositRef,
  isInvoicePaymentRef,
  type CurrencyLedger,
  type DateRange,
  type ExpenseCategoryValue,
  EXPENSE_CATEGORIES,
} from "@/lib/ledger-math";

const num = (v: { toString(): string } | null | undefined) => Number(v?.toString() ?? 0);
const MAX_ROWS = 300;

export interface IncomeEntry {
  id: string;
  date: string; // ISO
  type: "invoice" | "payment" | "forfeited_deposit";
  reference: string;
  description: string;
  currency: string;
  gross: number;
  tax: number;
  deposit: number;
  net: number;
  invoiceId?: string;
}

export interface ExpenseRow {
  id: string;
  date: string; // YYYY-MM-DD
  category: string;
  title: string;
  vendor: string | null;
  amount: number;
  currency: string;
  note: string | null;
  receiptUrl: string | null;
}

export async function getLedger(range: DateRange, opts: { all?: boolean } = {}) {
  const inRange = { gte: range.from, lt: range.to };
  const take = opts.all ? undefined : MAX_ROWS;

  const [invoices, payments, forfeitedDeps, resolvedDeps, waivedInvoices, expenses, heldNow] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: "paid", paidAt: inRange },
      include: { lines: true, organizer: { select: { orgName: true } } },
      orderBy: { paidAt: "desc" },
    }),
    prisma.paymentRecord.findMany({
      where: { createdAt: inRange },
      include: { user: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.securityDeposit.findMany({
      where: { status: "forfeited", resolvedAt: inRange },
      include: { organizer: { select: { orgName: true } } },
      orderBy: { resolvedAt: "desc" },
    }),
    prisma.securityDeposit.findMany({ where: { status: { in: ["refunded", "forfeited"] }, resolvedAt: inRange, refundedAmount: { not: null } } }),
    prisma.invoice.findMany({ where: { status: "waived", waivedAt: inRange }, include: { lines: true } }),
    prisma.expense.findMany({ where: { voidedAt: null, date: inRange }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    prisma.securityDeposit.groupBy({ by: ["currency"], where: { status: { in: ["held", "refund_requested"] } }, _sum: { amount: true } }),
  ]);

  const others = payments.filter((p) => !isInvoicePaymentRef(p.reference) && !isDepositRef(p.reference));

  const summaries: CurrencyLedger[] = buildLedger({
    invoices: invoices.map((i) => ({
      currency: i.currency,
      gross: num(i.total),
      tax: num(i.taxAmount),
      gatewayFee: num(i.gatewayFee),
      deposit: i.lines.filter((l) => l.refundable && !l.waived).reduce((s, l) => s + num(l.amount), 0),
    })),
    others: others.map((p) => ({ currency: p.currency, amount: num(p.amount) })),
    forfeited: forfeitedDeps.map((d) => ({ currency: d.currency, amount: num(d.forfeitedAmount) })),
    refunded: resolvedDeps.map((d) => ({ currency: d.currency, amount: num(d.refundedAmount) })),
    discounts: invoices.flatMap((i) => i.lines.filter((l) => l.kind === "discount").map((l) => ({ currency: i.currency, amount: -num(l.amount) }))),
    waived: waivedInvoices.map((i) => ({ currency: i.currency, amount: i.lines.filter((l) => l.kind !== "discount").reduce((s, l) => s + num(l.unitAmount), 0) })),
    expenses: expenses.map((e) => ({ currency: e.currency, category: e.category, amount: num(e.amount) })),
  });
  // A currency that only has held deposits still shows up.
  for (const h of heldNow) {
    if (!summaries.some((s) => s.currency === h.currency)) summaries.push(...buildLedger({ invoices: [], others: [], forfeited: [], refunded: [], discounts: [], waived: [], expenses: [{ currency: h.currency, category: "other", amount: 0 }] }));
  }
  summaries.sort((a, b) => a.currency.localeCompare(b.currency));

  const entries: IncomeEntry[] = [
    ...invoices.map((i): IncomeEntry => {
      const deposit = i.lines.filter((l) => l.refundable && !l.waived).reduce((s, l) => s + num(l.amount), 0);
      return {
        id: i.id,
        date: (i.paidAt ?? i.issuedAt).toISOString(),
        type: "invoice",
        reference: i.number,
        description: i.organizer.orgName,
        currency: i.currency,
        gross: num(i.total),
        tax: num(i.taxAmount),
        deposit,
        net: roundMoney(num(i.total) - num(i.taxAmount) - num(i.gatewayFee) - deposit, i.currency),
        invoiceId: i.id,
      };
    }),
    ...others.map((p): IncomeEntry => ({
      id: p.id,
      date: p.createdAt.toISOString(),
      type: "payment",
      reference: p.reference ?? "—",
      description: `${p.user.displayName} · ${p.method}${p.note ? ` · ${p.note}` : ""}`,
      currency: p.currency,
      gross: num(p.amount),
      tax: 0,
      deposit: 0,
      net: num(p.amount),
    })),
    ...forfeitedDeps.map((d): IncomeEntry => ({
      id: d.id,
      date: (d.resolvedAt ?? d.heldAt).toISOString(),
      type: "forfeited_deposit",
      reference: "—",
      description: `${d.organizer.orgName} · forfeited security deposit`,
      currency: d.currency,
      gross: 0,
      tax: 0,
      deposit: 0,
      net: num(d.forfeitedAmount),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const expenseRows: ExpenseRow[] = expenses.map((e) => ({
    id: e.id,
    date: e.date.toISOString().slice(0, 10),
    category: e.category,
    title: e.title,
    vendor: e.vendor,
    amount: num(e.amount),
    currency: e.currency,
    note: e.note,
    receiptUrl: e.receiptUrl,
  }));

  return {
    summaries,
    heldNow: heldNow.map((h) => ({ currency: h.currency, amount: num(h._sum.amount) })),
    entries: take ? entries.slice(0, take) : entries,
    entriesTotal: entries.length,
    expenses: take ? expenseRows.slice(0, take) : expenseRows,
    expensesTotal: expenseRows.length,
  };
}

// ---- CSV ----

// A cell that starts with = + - @ can run as a formula when opened in a spreadsheet, so it is
// prefixed with an apostrophe.
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ledgerToCsv(l: Awaited<ReturnType<typeof getLedger>>): string {
  const rows: (string | number)[][] = [["type", "date", "currency", "reference", "description", "gross_received", "tax_collected", "security_fee_held", "net_income", "expense_category", "expense_amount"]];
  for (const e of l.entries) rows.push([e.type, e.date.slice(0, 10), e.currency, e.reference, e.description, e.gross, e.tax, e.deposit, e.net, "", ""]);
  for (const x of l.expenses) rows.push(["expense", x.date, x.currency, x.vendor ?? "", x.title, "", "", "", "", x.category, x.amount]);
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

// ---- expenses ----

type Fail = { error: "validation_error" | "not_found"; message: string };
const fail = (error: Fail["error"], message: string): Fail => ({ error, message });

function parseExpense(input: Record<string, unknown>) {
  const date = parseDueDate(input.date);
  if (!(date instanceof Date)) return fail("validation_error", "Enter the date it was paid.");
  const category = EXPENSE_CATEGORIES.find((c) => c.value === input.category)?.value as ExpenseCategoryValue | undefined;
  if (!category) return fail("validation_error", "Choose a category.");
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 100) : "";
  if (title.length < 2) return fail("validation_error", "Describe the expense (e.g. Supabase Pro, May salary, office rent).");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999_999_999) return fail("validation_error", "Enter an amount greater than zero.");
  const currency = typeof input.currency === "string" ? input.currency.toUpperCase() : "";
  if (!isSupportedCurrency(currency)) return fail("validation_error", "Choose a supported currency.");
  const receiptUrl = typeof input.receiptUrl === "string" && input.receiptUrl.startsWith("http") ? input.receiptUrl : null;
  return {
    data: {
      date,
      category,
      title,
      vendor: typeof input.vendor === "string" && input.vendor.trim() ? input.vendor.trim().slice(0, 100) : null,
      amount: roundMoney(amount, currency),
      currency,
      note: typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 500) : null,
      receiptUrl,
    },
  };
}

export async function createExpense(adminId: string, input: Record<string, unknown>) {
  const p = parseExpense(input);
  if ("error" in p) return p;
  const e = await prisma.expense.create({ data: { ...p.data, createdById: adminId } });
  await prisma.adminActionLog.create({
    data: { adminId, action: "added_expense", targetType: "Expense", targetId: e.id, notes: `${e.category}: ${e.title} · ${e.amount} ${e.currency}` },
  });
  return { data: e };
}

export async function updateExpense(adminId: string, id: string, input: Record<string, unknown>) {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return fail("not_found", "That expense doesn't exist.");
  if (existing.voidedAt) return fail("validation_error", "A voided expense can't be edited.");
  const p = parseExpense(input);
  if ("error" in p) return p;
  // The receipt stays unless a new one is sent.
  const data = { ...p.data, receiptUrl: p.data.receiptUrl ?? existing.receiptUrl };
  const e = await prisma.expense.update({ where: { id }, data });
  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "edited_expense",
      targetType: "Expense",
      targetId: id,
      notes: `was ${existing.category}: ${existing.title} · ${existing.amount} ${existing.currency}; now ${e.category}: ${e.title} · ${e.amount} ${e.currency}`,
    },
  });
  return { data: e };
}

export async function voidExpense(adminId: string, id: string, note: unknown) {
  const why = typeof note === "string" ? note.trim().slice(0, 300) : "";
  if (!why) return fail("validation_error", "Add a short reason for voiding it.");
  const claimed = await prisma.expense.updateMany({ where: { id, voidedAt: null }, data: { voidedAt: new Date(), voidNote: why, voidedById: adminId } });
  if (claimed.count !== 1) return fail("not_found", "That expense doesn't exist or is already voided.");
  await prisma.adminActionLog.create({ data: { adminId, action: "voided_expense", targetType: "Expense", targetId: id, notes: why } });
  return { data: { ok: true as const } };
}
