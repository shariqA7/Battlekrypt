// NOWPayments (crypto) building blocks with no database: configuration, the request we send, how
// a notification's signature is checked, and what each status means for an invoice.
//
// Flow: the organization starts a checkout -> we create a NOWPayments invoice (a hosted page where
// they pick a coin) -> they pay there -> NOWPayments sends us a signed notification (IPN) -> only a
// verified "finished" payment for the right amount marks the invoice paid.
import { createHmac, timingSafeEqual } from "node:crypto";

export const NOWPAYMENTS_METHOD_NAME = "NOWPayments (crypto)";

// The gateway prices in these invoice currencies. USD is the international currency; PKR invoices
// are paid through your bank, wallet or crypto-address methods. Add a currency here only once
// NOWPayments is confirmed to price in it.
export const GATEWAY_PRICE_CURRENCIES = ["USD"] as const;
export const gatewaySupportsCurrency = (currency: string) => (GATEWAY_PRICE_CURRENCIES as readonly string[]).includes(currency.toUpperCase());

export interface NowPaymentsConfig {
  configured: boolean; // an API key is set
  hasIpnSecret: boolean;
  apiUrl: string;
  sandbox: boolean;
  apiKey: string;
  ipnSecret: string;
}

export function getNowPaymentsConfig(env: Record<string, string | undefined> = process.env): NowPaymentsConfig {
  const apiUrl = (env.NOWPAYMENTS_API_URL || "https://api.nowpayments.io/v1").replace(/\/$/, "");
  return {
    configured: !!env.NOWPAYMENTS_API_KEY,
    hasIpnSecret: !!env.NOWPAYMENTS_IPN_SECRET,
    apiUrl,
    sandbox: apiUrl.includes("sandbox"),
    apiKey: env.NOWPAYMENTS_API_KEY ?? "",
    ipnSecret: env.NOWPAYMENTS_IPN_SECRET ?? "",
  };
}

// ---- the request ----

export function buildInvoiceRequest(i: {
  priceAmount: number;
  priceCurrency: string;
  orderId: string;
  description: string;
  siteUrl: string;
  invoiceId: string;
}) {
  return {
    price_amount: i.priceAmount,
    price_currency: i.priceCurrency.toLowerCase(),
    order_id: i.orderId,
    order_description: i.description.slice(0, 200),
    ipn_callback_url: `${i.siteUrl}/api/webhooks/nowpayments`,
    success_url: `${i.siteUrl}/invoices/${i.invoiceId}?paid=1`,
    cancel_url: `${i.siteUrl}/invoices/${i.invoiceId}`,
    // The customer pays NOWPayments' fee on top, at a rate locked for the checkout, so the
    // invoice amount is what reaches us.
    is_fixed_rate: true,
    is_fee_paid_by_user: true,
  };
}

// ---- the signature ----

// NOWPayments signs the notification body with its keys sorted (at every level) and the result
// serialised as compact JSON.
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return value;
}

export function signPayload(body: unknown, secret: string): string {
  return createHmac("sha512", secret).update(JSON.stringify(sortKeysDeep(body))).digest("hex");
}

export function verifySignature(body: unknown, signature: string | null | undefined, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = Buffer.from(signPayload(body, secret), "utf8");
  const got = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

// ---- statuses ----

export type GatewayStatus = "waiting" | "confirming" | "confirmed" | "sending" | "partially_paid" | "finished" | "failed" | "refunded" | "expired";

export type StatusClass = "in_progress" | "settled" | "partial" | "failed" | "refunded" | "unknown";

// Only "finished" (the funds reached our wallet) pays an invoice. "confirmed" is the blockchain
// agreeing, but we wait for "finished" so we never act on money that hasn't arrived.
export function classifyStatus(status: string): StatusClass {
  switch (status) {
    case "waiting":
    case "confirming":
    case "confirmed":
    case "sending":
      return "in_progress";
    case "finished":
      return "settled";
    case "partially_paid":
      return "partial";
    case "failed":
    case "expired":
      return "failed";
    case "refunded":
      return "refunded";
    default:
      return "unknown";
  }
}

export const STATUS_TEXT: Record<string, string> = {
  created: "Checkout opened",
  waiting: "Waiting for your payment",
  confirming: "Payment seen, confirming on the blockchain",
  confirmed: "Confirmed on the blockchain",
  sending: "Payment confirmed, completing",
  partially_paid: "Less than the full amount was sent",
  finished: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
  expired: "Checkout expired",
};

// The money is only accepted if the notification is for the amount and currency we asked for,
// and that is still what the invoice costs.
export function checkSettlement(i: {
  attemptPrice: number;
  attemptCurrency: string;
  invoiceTotal: number;
  invoiceCurrency: string;
  ipnPrice: number;
  ipnCurrency: string;
}): { ok: true } | { ok: false; reason: string } {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  if (i.ipnCurrency.toUpperCase() !== i.attemptCurrency.toUpperCase()) return { ok: false, reason: `The payment was priced in ${i.ipnCurrency.toUpperCase()}, not ${i.attemptCurrency.toUpperCase()}.` };
  if (!near(i.ipnPrice, i.attemptPrice)) return { ok: false, reason: `The payment was for ${i.ipnPrice}, but the checkout was for ${i.attemptPrice}.` };
  if (i.invoiceCurrency.toUpperCase() !== i.attemptCurrency.toUpperCase() || !near(i.invoiceTotal, i.attemptPrice)) {
    return { ok: false, reason: "The invoice amount changed after the checkout was opened." };
  }
  return { ok: true };
}

// A checkout can be reused for a while if nothing has been paid on it.
export const CHECKOUT_REUSE_MS = 60 * 60 * 1000;
export const IN_FLIGHT = ["confirming", "confirmed", "sending", "partially_paid"];

// ---- are we being charged the fee? ----

// Dollar-pegged coins (and USD itself), so an amount in them can be compared with a USD invoice
// without a price lookup. NOWPayments names them like "usdtbsc", "usdc", "busd", "dai".
export function isUsdPegged(currency: string | null | undefined): boolean {
  const c = (currency ?? "").toLowerCase();
  return c === "usd" || /^(usdt|usdc|busd|tusd|usdp|fdusd|pyusd|dai)/.test(c);
}

// How much less than the invoice we may receive before it is flagged: a little rounding is normal.
export const SHORTFALL_TOLERANCE_MIN = 0.5;
export const SHORTFALL_TOLERANCE_PCT = 0.005;

export type ReceivedCheck =
  | { status: "ok" }
  | { status: "skipped"; reason: string }
  | { status: "short"; shortfall: number; note: string };

// The customer pays NOWPayments' fee on top, so what reaches us should equal the invoice. If the
// gateway reports noticeably less, the fee (or part of it) is coming out of our side, so an admin
// should look. Only done when the amount can be compared directly (a USD invoice, a dollar coin).
export function checkReceived(i: {
  invoiceTotal: number;
  invoiceCurrency: string;
  outcomeAmount: number | null;
  outcomeCurrency: string | null;
}): ReceivedCheck {
  if (i.outcomeAmount === null || !Number.isFinite(i.outcomeAmount) || i.outcomeAmount <= 0) return { status: "skipped", reason: "The gateway didn't report the amount we receive." };
  if (i.invoiceCurrency.toUpperCase() !== "USD" || !isUsdPegged(i.outcomeCurrency)) return { status: "skipped", reason: "The amount we receive is in a coin that can't be compared with the invoice directly." };
  const shortfall = Math.round((i.invoiceTotal - i.outcomeAmount) * 100) / 100;
  const tolerance = Math.max(SHORTFALL_TOLERANCE_MIN, i.invoiceTotal * SHORTFALL_TOLERANCE_PCT);
  if (shortfall <= tolerance) return { status: "ok" };
  return {
    status: "short",
    shortfall,
    note: `The invoice was ${i.invoiceTotal.toFixed(2)} USD but NOWPayments reports we receive ${i.outcomeAmount} ${String(i.outcomeCurrency).toUpperCase()}, about ${shortfall.toFixed(2)} less. Some fees may be coming out of your side. Check this payment in your NOWPayments dashboard.`,
  };
}
