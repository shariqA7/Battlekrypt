// Money helpers (spec §6). Single source of truth for supported currencies,
// display formatting, and server-side validation.
//
// Rules from the spec this implements:
//  - Money is always {amount, currency}, never a bare number.
//  - Display respects each currency's conventions (symbol, grouping, decimals).
//  - FULL precision in transactional contexts (an exact entry fee, the exact
//    prize pool a player is about to pay/win) -> formatMoney.
//  - COMPACT notation for summary/aggregate stats (dashboards, "Total
//    Distributed") -> formatMoneyCompact.
//  - Aggregates spanning several currencies are shown per currency, never
//    converted into one blended number -> formatMoneyBreakdown.
//
// Formatting is hand-rolled instead of Intl.NumberFormat on purpose: the
// same string must come out on the server and in the browser (Intl output
// varies slightly between ICU versions, which shows up as hydration
// mismatches), and the lakh/crore style has to be explicit anyway.

// Every currency the platform knows how to format and validate. WHICH of
// them organizers may actually pick is an admin setting (CurrencySetting, see
// lib/services/currencies.ts) — adding a currency to the platform is one line
// here plus switching it on in /admin/currencies. Launch currencies come
// first: they keep their order in breakdowns like "Rs 6L + $2K".
interface CurrencyStyle {
  symbol: string;
  // Alphabetic symbols ("Rs", "SAR") get a space before the number; glyphs
  // ("$", "₹") don't.
  space: boolean;
  // Indian digit grouping (12,34,567) and lakh/crore compact units.
  indian: boolean;
  name: string;
}

const CATALOG = {
  // launch currencies (spec §6)
  PKR: { symbol: "Rs", space: true, indian: true, name: "Pakistani Rupee" },
  USD: { symbol: "$", space: false, indian: false, name: "US Dollar" },
  INR: { symbol: "₹", space: false, indian: true, name: "Indian Rupee" },
  SAR: { symbol: "SAR", space: true, indian: false, name: "Saudi Riyal" },
  AED: { symbol: "AED", space: true, indian: false, name: "UAE Dirham" },
  // South Asia
  BDT: { symbol: "৳", space: false, indian: true, name: "Bangladeshi Taka" },
  LKR: { symbol: "LKR", space: true, indian: true, name: "Sri Lankan Rupee" },
  NPR: { symbol: "NPR", space: true, indian: true, name: "Nepalese Rupee" },
  // Middle East & North Africa
  QAR: { symbol: "QAR", space: true, indian: false, name: "Qatari Riyal" },
  KWD: { symbol: "KWD", space: true, indian: false, name: "Kuwaiti Dinar" },
  BHD: { symbol: "BHD", space: true, indian: false, name: "Bahraini Dinar" },
  OMR: { symbol: "OMR", space: true, indian: false, name: "Omani Rial" },
  EGP: { symbol: "EGP", space: true, indian: false, name: "Egyptian Pound" },
  TRY: { symbol: "₺", space: false, indian: false, name: "Turkish Lira" },
  // Southeast Asia
  MYR: { symbol: "RM", space: true, indian: false, name: "Malaysian Ringgit" },
  IDR: { symbol: "Rp", space: true, indian: false, name: "Indonesian Rupiah" },
  PHP: { symbol: "₱", space: false, indian: false, name: "Philippine Peso" },
  THB: { symbol: "฿", space: false, indian: false, name: "Thai Baht" },
  VND: { symbol: "₫", space: false, indian: false, name: "Vietnamese Dong" },
  SGD: { symbol: "S$", space: false, indian: false, name: "Singapore Dollar" },
  // West
  EUR: { symbol: "€", space: false, indian: false, name: "Euro" },
  GBP: { symbol: "£", space: false, indian: false, name: "British Pound" },
  CAD: { symbol: "CA$", space: false, indian: false, name: "Canadian Dollar" },
  AUD: { symbol: "A$", space: false, indian: false, name: "Australian Dollar" },
  // Africa
  ZAR: { symbol: "R", space: true, indian: false, name: "South African Rand" },
  NGN: { symbol: "₦", space: false, indian: false, name: "Nigerian Naira" },
} as const satisfies Record<string, CurrencyStyle>;

export type CurrencyCode = keyof typeof CATALOG;
export const SUPPORTED_CURRENCIES = Object.keys(CATALOG) as CurrencyCode[];

// What's switched on until an admin changes it (and what a fresh database is
// seeded with): the five launch currencies.
export const LAUNCH_CURRENCIES: CurrencyCode[] = ["PKR", "USD", "INR", "SAR", "AED"];

export function isSupportedCurrency(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CATALOG, value);
}

export function currencyName(code: string): string {
  return isSupportedCurrency(code) ? CATALOG[code].name : code;
}

const STYLES: Record<CurrencyCode, CurrencyStyle> = CATALOG;

// Prisma returns Decimal columns as Decimal objects; forms hand us numbers.
export type AmountLike = number | string | { toString(): string };

export function toNumber(amount: AmountLike): number {
  return typeof amount === "number" ? amount : Number(amount.toString());
}

function styleFor(currency: string): CurrencyStyle {
  // An unsupported code (e.g. legacy data) still renders sensibly: "XYZ 100".
  return isSupportedCurrency(currency)
    ? STYLES[currency]
    : { symbol: currency, space: true, indian: false, name: currency };
}

function withSymbol(style: CurrencyStyle, body: string, negative: boolean): string {
  const sign = negative ? "-" : "";
  return `${sign}${style.symbol}${style.space ? " " : ""}${body}`;
}

function group(integerDigits: string, indian: boolean): string {
  if (integerDigits.length <= 3) return integerDigits;
  if (!indian) return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // Indian grouping: last three digits, then pairs.
  const last3 = integerDigits.slice(-3);
  const rest = integerDigits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

// Full precision: "Rs 1,50,000", "$2,000", "$19.99". Whole amounts drop the
// ".00"; fractional amounts always show two decimals.
export function formatMoney(amount: AmountLike, currency: string): string {
  const n = toNumber(amount);
  if (!Number.isFinite(n)) return "—";
  const style = styleFor(currency);

  const cents = Math.round(Math.abs(n) * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;

  const body =
    group(String(whole), style.indian) + (frac ? `.${String(frac).padStart(2, "0")}` : "");
  return withSymbol(style, body, n < 0 && cents > 0);
}

interface Unit {
  size: number;
  label: string;
}

const WESTERN_UNITS: Unit[] = [
  { size: 1e9, label: "B" },
  { size: 1e6, label: "M" },
  { size: 1e3, label: "K" },
];
const INDIAN_UNITS: Unit[] = [
  { size: 1e7, label: "Cr" },
  { size: 1e5, label: "L" },
  { size: 1e3, label: "K" },
];

// Compact: "Rs 6L", "Rs 45K", "$2K", "$1.2M". PKR/INR use lakh/crore (the
// spec's own example is "Rs 6L"); the others use K/M/B.
//
// Values are TRUNCATED to one decimal, never rounded up: these figures back
// credibility claims like "Total Prize Pool Distributed", so 199,999 must
// read "1.9L", not "2L". Truncating also means a unit can never roll over
// ("1000K") at a boundary.
export function formatMoneyCompact(amount: AmountLike, currency: string): string {
  const n = toNumber(amount);
  if (!Number.isFinite(n)) return "—";
  const style = styleFor(currency);

  const abs = Math.abs(n);
  const negative = n < 0 && abs >= 1;
  const units = style.indian ? INDIAN_UNITS : WESTERN_UNITS;
  const unit = units.find((u) => abs >= u.size);

  if (!unit) return formatMoney(n, currency); // under 1,000: show exactly

  const tenths = Math.floor((abs / unit.size) * 10 + 1e-9);
  const value = tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
  return withSymbol(style, `${value}${unit.label}`, negative);
}

export interface MoneyLike {
  amount: AmountLike;
  currency: string;
}

// Adds amounts up per currency. Never mixes currencies.
export function sumByCurrency(items: MoneyLike[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const n = toNumber(item.amount);
    if (!Number.isFinite(n)) continue;
    // Work in whole cents so repeated additions don't drift.
    totals[item.currency] = (totals[item.currency] ?? 0) + Math.round(n * 100);
  }
  for (const c of Object.keys(totals)) totals[c] = totals[c] / 100;
  return totals;
}

// "Rs 6L + $2K" for an aggregate spanning currencies. Order is stable
// (supported currencies in launch order, then any others alphabetically) and
// zero totals are left out. Returns "—" when there is nothing to show.
export function formatMoneyBreakdown(items: MoneyLike[]): string {
  const totals = sumByCurrency(items);
  const order = (c: string) => {
    const i = (SUPPORTED_CURRENCIES as readonly string[]).indexOf(c);
    return i === -1 ? SUPPORTED_CURRENCIES.length : i;
  };
  const parts = Object.keys(totals)
    .filter((c) => totals[c] > 0)
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .map((c) => formatMoneyCompact(totals[c], c));
  return parts.length ? parts.join(" + ") : "—";
}

// ---------------------------------------------------------------------------
// Validation (server side — the forms only offer supported currencies, but
// the API is public and the DB column accepts any string).
// ---------------------------------------------------------------------------

// Matches the Decimal(14, 2) columns: at most 12 integer digits.
export const MAX_AMOUNT = 999_999_999_999.99;

export type MoneyParseResult =
  | { ok: true; value: { amount: number; currency: CurrencyCode } }
  | { ok: false; message: string };

export function parseMoney(input: unknown, label: string): MoneyParseResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, message: `${label} must be an object with amount and currency.` };
  }
  const { amount, currency } = input as { amount?: unknown; currency?: unknown };

  if (!isSupportedCurrency(currency)) {
    return {
      ok: false,
      message: `${label} currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}.`,
    };
  }
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return { ok: false, message: `${label} amount must be a number.` };
  }
  if (amount < 0) {
    return { ok: false, message: `${label} amount can't be negative.` };
  }
  if (amount > MAX_AMOUNT) {
    return { ok: false, message: `${label} amount is too large.` };
  }
  // Refuse more than two decimals instead of letting the database round it.
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    return { ok: false, message: `${label} amount can have at most 2 decimal places.` };
  }

  return { ok: true, value: { amount, currency } };
}

export type OptionalMoneyParseResult =
  | { ok: true; value: { amount: number; currency: CurrencyCode } | undefined }
  | { ok: false; message: string };

// Like parseMoney, but an absent value (undefined/null) is fine.
export function parseOptionalMoney(input: unknown, label: string): OptionalMoneyParseResult {
  if (input === undefined || input === null) return { ok: true, value: undefined };
  const parsed = parseMoney(input, label);
  return parsed.ok ? { ok: true, value: parsed.value } : parsed;
}

export type MoneyValue = { amount: number; currency: CurrencyCode };

export type CreateMoneyResult =
  | { ok: true; entryFee: MoneyValue | undefined; prizePool: MoneyValue | undefined }
  | { ok: false; message: string };

// The money rules for creating a tournament, in one testable place:
//  - amounts/currencies must be valid (see parseMoney)
//  - a paid tournament needs an entry fee greater than zero
//  - a free tournament carries no entry fee, whatever the client sent
//  - a prize pool of zero means "no prize pool"
export function resolveCreateMoney(input: {
  entryType: unknown;
  entryFee: unknown;
  prizePool: unknown;
}): CreateMoneyResult {
  const fee = parseOptionalMoney(input.entryFee, "Entry fee");
  if (!fee.ok) return fee;
  const prize = parseOptionalMoney(input.prizePool, "Prize pool");
  if (!prize.ok) return prize;

  if (input.entryType === "paid" && (!fee.value || fee.value.amount <= 0)) {
    return { ok: false, message: "A paid tournament needs an entry fee greater than zero." };
  }

  return {
    ok: true,
    entryFee: input.entryType === "paid" ? fee.value : undefined,
    prizePool: prize.value && prize.value.amount > 0 ? prize.value : undefined,
  };
}
