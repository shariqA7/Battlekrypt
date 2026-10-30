// Ledger rules that need no database. Run alone with: npx tsx scripts/ledger-test.ts
import { buildLedger, isDepositRef, isInvoicePaymentRef, resolveRange } from "../lib/ledger-math";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const empty = { invoices: [], others: [], forfeited: [], refunded: [], discounts: [], waived: [], expenses: [] };

// One PKR invoice: plan 5000, tax 10% = 500, security fee 2000 -> customer paid 7500.
const one = buildLedger({ ...empty, invoices: [{ currency: "PKR", gross: 7500, tax: 500, gatewayFee: 0, deposit: 2000 }] })[0];
ok("gross is everything received", one.gross === 7500);
ok("tax is shown separately, not income", one.taxCollected === 500);
ok("refundable security fee is not income", one.depositsHeld === 2000);
ok("net revenue is the plan fee only", one.netRevenue === 5000);

// Gateway fee passed to the customer is not revenue either.
const withFee = buildLedger({ ...empty, invoices: [{ currency: "USD", gross: 101.5, tax: 0, gatewayFee: 1.5, deposit: 0 }] })[0];
ok("gateway fee is not revenue", withFee.netRevenue === 100 && withFee.gatewayFees === 1.5);

// Profit = net revenue - expenses, and other income is added.
const full = buildLedger({
  ...empty,
  invoices: [{ currency: "PKR", gross: 7500, tax: 500, gatewayFee: 0, deposit: 2000 }],
  others: [{ currency: "PKR", amount: 1000 }],
  forfeited: [{ currency: "PKR", amount: 300 }],
  expenses: [{ currency: "PKR", category: "service", amount: 1200 }, { currency: "PKR", category: "rent", amount: 800 }],
})[0];
ok("other payments and forfeited deposits add to revenue", full.netRevenue === 6300);
ok("expenses are grouped by category", full.expensesByCategory.service === 1200 && full.expensesByCategory.rent === 800 && full.expenses === 2000);
ok("profit = net revenue - expenses", full.profit === 4300);
ok("gross includes other payments", full.gross === 8500);

// A loss is negative, not hidden.
ok("a loss shows as negative", buildLedger({ ...empty, expenses: [{ currency: "PKR", category: "other", amount: 400 }] })[0].profit === -400);

// Currencies are kept apart.
const two = buildLedger({ ...empty, invoices: [{ currency: "PKR", gross: 100, tax: 0, gatewayFee: 0, deposit: 0 }, { currency: "USD", gross: 10, tax: 0, gatewayFee: 0, deposit: 0 }] });
ok("one ledger per currency, never blended", two.length === 2 && two[0].currency === "PKR" && two[1].currency === "USD");

// Not double counting.
ok("invoice payment records are recognised", isInvoicePaymentRef("BK-2026-0001") && isInvoicePaymentRef("BK-2026-0001-deposit") && !isInvoicePaymentRef("INV-1") && !isInvoicePaymentRef(null));
ok("deposit records are recognised", isDepositRef("abc-123-deposit") && !isDepositRef("abc-123") && !isDepositRef(null));

// ---- ranges ----
const now = new Date("2026-11-15T10:00:00Z");
const m = resolveRange("this_month", undefined, undefined, now);
ok("this month", m.from.toISOString() === "2026-11-01T00:00:00.000Z" && m.to.toISOString() === "2026-12-01T00:00:00.000Z");
const lm = resolveRange("last_month", undefined, undefined, new Date("2026-01-10T00:00:00Z"));
ok("last month crosses the year", lm.from.toISOString() === "2025-12-01T00:00:00.000Z" && lm.to.toISOString() === "2026-01-01T00:00:00.000Z");
const q = resolveRange("this_quarter", undefined, undefined, now);
ok("this quarter", q.from.toISOString() === "2026-10-01T00:00:00.000Z" && q.to.toISOString() === "2027-01-01T00:00:00.000Z");
const c = resolveRange("custom", "2026-03-05", "2026-03-10", now);
ok("custom range includes the last day", c.from.toISOString() === "2026-03-05T00:00:00.000Z" && c.to.toISOString() === "2026-03-11T00:00:00.000Z");
ok("a bad custom range falls back to this month", resolveRange("custom", "2026-03-10", "2026-03-05", now).preset === "this_month");

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("all passed");
