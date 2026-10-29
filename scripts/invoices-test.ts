// Invoice rules that need no database: totals, tax base, numbering, due dates, payment-method
// validation. Run alone with: npx tsx scripts/invoices-test.ts
import { computeInvoiceTotals, displayStatus, formatInvoiceNumber, parseDueDate, roundMoney } from "../lib/invoice-math";
import { checkCryptoAddress, validatePaymentMethod } from "../lib/payment-method-rules";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };

// ---- totals ----
const t = computeInvoiceTotals({ currency: "PKR", taxRate: 10, lines: [{ amount: 5000 }, { amount: 2000, refundable: true }] });
ok("subtotal includes the refundable fee", t.subtotal === 7000);
ok("income excludes the refundable fee", t.incomeSubtotal === 5000 && t.refundableTotal === 2000);
ok("tax is charged on the plan fee only", t.taxAmount === 500);
ok("total = subtotal + tax", t.total === 7500);
const depositOnly = computeInvoiceTotals({ currency: "USD", taxRate: 15, lines: [{ amount: 50, refundable: true }] });
ok("a deposit-only invoice has no tax", depositOnly.taxAmount === 0 && depositOnly.total === 50);
const fee = computeInvoiceTotals({ currency: "USD", taxRate: 0, gatewayFee: 1.5, lines: [{ amount: 100 }] });
ok("gateway fee is added to the total", fee.total === 101.5);
ok("rounds to cents", computeInvoiceTotals({ currency: "USD", taxRate: 7.5, lines: [{ amount: 19.99 }] }).taxAmount === 1.5);
ok("yen has no cents", roundMoney(1234.6, "JPY") === 1235);

// ---- numbering ----
ok("invoice number format", formatInvoiceNumber(2026, 1) === "BK-2026-0001" && formatInvoiceNumber(2026, 12345) === "BK-2026-12345");

// ---- due dates ----
const due = new Date("2026-11-10T00:00:00Z");
ok("not overdue on the due day", displayStatus("unpaid", due, new Date("2026-11-10T23:00:00Z")) === "unpaid");
ok("overdue the day after", displayStatus("unpaid", due, new Date("2026-11-11T00:00:01Z")) === "overdue");
ok("an invoice with proof submitted can still be overdue", displayStatus("proof_submitted", due, new Date("2026-12-01T00:00:00Z")) === "overdue");
ok("paid is never overdue", displayStatus("paid", due, new Date("2027-01-01T00:00:00Z")) === "paid");
ok("no due date is never overdue", displayStatus("unpaid", null, new Date("2030-01-01T00:00:00Z")) === "unpaid");
ok("due date parsing", parseDueDate("2026-11-10") instanceof Date && parseDueDate("") === null && parseDueDate("10/11/2026") === "invalid" && parseDueDate("2026-02-31") === "invalid");

// ---- payment methods ----
const bank = validatePaymentMethod({ type: "bank", name: "Meezan Bank", currencies: ["PKR"], accountTitle: "BattleKrypt", accountNumber: "0123456789" });
ok("a bank method needs a title and a number or IBAN", bank.ok && !validatePaymentMethod({ type: "bank", name: "X Bank", accountTitle: "A" }).ok);
ok("bad IBAN rejected", !validatePaymentMethod({ type: "bank", name: "X Bank", accountTitle: "A", iban: "12" }).ok);
ok("wallet needs a number", validatePaymentMethod({ type: "wallet", name: "JazzCash", accountTitle: "Ali", walletNumber: "0300-1234567" }).ok && !validatePaymentMethod({ type: "wallet", name: "JazzCash", accountTitle: "Ali" }).ok);
const evm = "0x" + "a".repeat(40);
ok("BEP20 address accepted", checkCryptoAddress("BNB Smart Chain (BEP20)", evm) === null);
ok("a Tron address on BEP20 is rejected", checkCryptoAddress("BEP20", "T" + "a".repeat(33)) !== null);
ok("TRC20 address accepted", checkCryptoAddress("TRON (TRC20)", "TQ" + "a".repeat(32)) === null);
ok("address with a space rejected", checkCryptoAddress("BEP20", evm + " ") !== null);
const crypto = validatePaymentMethod({ type: "crypto", name: "USDT BNB", currencies: ["USD"], cryptoAsset: "usdt", cryptoNetwork: "BEP20", cryptoAddress: evm });
ok("crypto method is valid, coin upper-cased, default warning added", crypto.ok && crypto.value.cryptoAsset === "USDT" && /wrong network|another network/i.test(crypto.value.instructions ?? ""));
ok("crypto needs a network", !validatePaymentMethod({ type: "crypto", name: "USDT", cryptoAsset: "USDT", cryptoAddress: evm }).ok);
ok("'other' needs instructions", !validatePaymentMethod({ type: "other", name: "Cash" }).ok);
ok("unknown currency rejected", !validatePaymentMethod({ type: "other", name: "Cash", instructions: "x", currencies: ["XXX"] }).ok);

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("all passed");
