// NOWPayments rules that need no database or network. Run alone with: npx tsx scripts/nowpayments-test.ts
import { createHmac } from "node:crypto";
import {
  buildInvoiceRequest,
  checkSettlement,
  classifyStatus,
  getNowPaymentsConfig,
  gatewaySupportsCurrency,
  signPayload,
  sortKeysDeep,
  verifySignature,
} from "../lib/nowpayments";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };

// ---- signature ----
const secret = "test-ipn-secret";
const ipn = { payment_id: 5077125051, payment_status: "finished", price_amount: 100, price_currency: "usd", order_id: "abc", nested: { z: 1, a: [{ y: 2, b: 3 }] } };
const reordered = { nested: { a: [{ b: 3, y: 2 }], z: 1 }, order_id: "abc", price_currency: "usd", price_amount: 100, payment_status: "finished", payment_id: 5077125051 };
const independent = createHmac("sha512", secret).update('{"nested":{"a":[{"b":3,"y":2}],"z":1},"order_id":"abc","payment_id":5077125051,"payment_status":"finished","price_amount":100,"price_currency":"usd"}').digest("hex");
ok("keys are sorted at every level", JSON.stringify(sortKeysDeep(ipn)) === '{"nested":{"a":[{"b":3,"y":2}],"z":1},"order_id":"abc","payment_id":5077125051,"payment_status":"finished","price_amount":100,"price_currency":"usd"}');
ok("the signature is HMAC-SHA512 over the sorted JSON", signPayload(ipn, secret) === independent);
ok("key order in the payload doesn't change the signature", signPayload(reordered, secret) === signPayload(ipn, secret));
ok("a correct signature is accepted", verifySignature(ipn, signPayload(ipn, secret), secret));
ok("an upper-case copy of it is accepted too", verifySignature(ipn, signPayload(ipn, secret).toUpperCase(), secret));
ok("a tampered amount is rejected", !verifySignature({ ...ipn, price_amount: 1 }, signPayload(ipn, secret), secret));
ok("a wrong secret is rejected", !verifySignature(ipn, signPayload(ipn, "other"), secret));
ok("a missing signature is rejected", !verifySignature(ipn, null, secret) && !verifySignature(ipn, "", secret));
ok("no secret configured means nothing is accepted", !verifySignature(ipn, signPayload(ipn, ""), ""));
ok("a signature of the wrong length is rejected without error", !verifySignature(ipn, "abc", secret));

// ---- statuses ----
ok("only finished settles", classifyStatus("finished") === "settled" && classifyStatus("confirmed") === "in_progress");
ok("in-progress statuses", ["waiting", "confirming", "confirmed", "sending"].every((s) => classifyStatus(s) === "in_progress"));
ok("part payment, failure and refund are told apart", classifyStatus("partially_paid") === "partial" && classifyStatus("expired") === "failed" && classifyStatus("failed") === "failed" && classifyStatus("refunded") === "refunded");
ok("an unknown status is not treated as paid", classifyStatus("something_new") === "unknown");

// ---- settlement check ----
const good = { attemptPrice: 120, attemptCurrency: "USD", invoiceTotal: 120, invoiceCurrency: "USD", ipnPrice: 120, ipnCurrency: "usd" };
ok("matching amount and currency is accepted", checkSettlement(good).ok);
ok("a different amount is refused", !checkSettlement({ ...good, ipnPrice: 12 }).ok);
ok("a different currency is refused", !checkSettlement({ ...good, ipnCurrency: "eur" }).ok);
ok("an invoice that changed after checkout is refused", !checkSettlement({ ...good, invoiceTotal: 95 }).ok);

// ---- the request ----
const req = buildInvoiceRequest({ priceAmount: 120, priceCurrency: "USD", orderId: "row-1", description: "Invoice BK-2026-0001", siteUrl: "https://bk.example", invoiceId: "inv-1" });
ok("the request prices in lower-case currency with our order id", req.price_currency === "usd" && req.order_id === "row-1" && req.price_amount === 120);
ok("the customer pays the gateway fee at a locked rate", req.is_fee_paid_by_user === true && req.is_fixed_rate === true);
ok("callback and return addresses point at our site", req.ipn_callback_url === "https://bk.example/api/webhooks/nowpayments" && req.success_url === "https://bk.example/invoices/inv-1?paid=1" && req.cancel_url === "https://bk.example/invoices/inv-1");

// ---- config and currency ----
const cfg = getNowPaymentsConfig({ NOWPAYMENTS_API_KEY: "k", NOWPAYMENTS_IPN_SECRET: "s", NOWPAYMENTS_API_URL: "https://api-sandbox.nowpayments.io/v1/" });
ok("sandbox is detected and the trailing slash dropped", cfg.sandbox && cfg.apiUrl === "https://api-sandbox.nowpayments.io/v1" && cfg.configured && cfg.hasIpnSecret);
ok("production is the default", getNowPaymentsConfig({ NOWPAYMENTS_API_KEY: "k" }).apiUrl === "https://api.nowpayments.io/v1" && !getNowPaymentsConfig({}).configured);
ok("only USD invoices are offered the gateway", gatewaySupportsCurrency("USD") && gatewaySupportsCurrency("usd") && !gatewaySupportsCurrency("PKR"));

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("all passed");
