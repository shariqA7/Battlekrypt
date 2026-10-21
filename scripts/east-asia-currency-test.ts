// Pure checks for the East/Southeast Asia currencies and countries (no database, no network).
// Run: npx tsx scripts/east-asia-currency-test.ts
import { readFileSync } from "node:fs";
import {
  SUPPORTED_CURRENCIES, LAUNCH_CURRENCIES, ZERO_DECIMAL_CURRENCIES, currencyName, formatMoney, formatMoneyBreakdown,
  formatMoneyCompact, isSupportedCurrency, parseMoney, MAX_AMOUNT,
} from "../lib/money";
import { COUNTRIES, countriesInRegion, countryFromText, countryName, suggestedCurrency } from "../lib/geo-data";
import { toUsd, clearFxCache } from "../lib/currency-fx";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const NEW = ["CNY", "JPY", "KRW", "TWD", "THB", "VND"];

// ---- catalog
ok("all six currencies are supported", NEW.every(isSupportedCurrency));
ok("names", currencyName("CNY") === "Chinese Yuan" && currencyName("JPY") === "Japanese Yen" && currencyName("KRW") === "South Korean Won" && currencyName("TWD") === "New Taiwan Dollar");
ok("every earlier currency kept its position (PKR first ... NGN 26th), new ones come after", SUPPORTED_CURRENCIES.slice(0, 5).join() === LAUNCH_CURRENCIES.join() && SUPPORTED_CURRENCIES.indexOf("NGN") === 25 && SUPPORTED_CURRENCIES.slice(26).join() === "CNY,JPY,KRW,TWD");
ok("yen and yuan can't be confused: different symbols", formatMoney(1000, "JPY") !== formatMoney(1000, "CNY"));

// ---- full formatting
ok("CNY", formatMoney(1500, "CNY") === "CN¥1,500" && formatMoney(19.99, "CNY") === "CN¥19.99");
ok("JPY", formatMoney(1500000, "JPY") === "¥1,500,000");
ok("KRW", formatMoney(50000000, "KRW") === "₩50,000,000");
ok("TWD", formatMoney(100000, "TWD") === "NT$100,000");
ok("THB", formatMoney(5000, "THB") === "฿5,000");
ok("VND", formatMoney(100000000, "VND") === "₫100,000,000");
ok("existing currencies still format the same", formatMoney(150000, "PKR") === "Rs 1,50,000" && formatMoney(2000, "USD") === "$2,000" && formatMoney(1234567, "INR") === "₹12,34,567");

// ---- compact and mixed
ok("compact: big amounts use K/M/B, truncated not rounded", formatMoneyCompact(1500000, "JPY") === "¥1.5M" && formatMoneyCompact(50000000, "KRW") === "₩50M" && formatMoneyCompact(2500000000, "VND") === "₫2.5B" && formatMoneyCompact(45000, "CNY") === "CN¥45K" && formatMoneyCompact(1999999, "TWD") === "NT$1.9M");
ok("a mixed total lists launch currencies first, then the others in catalog order, never blended", formatMoneyBreakdown([{ amount: 600000, currency: "PKR" }, { amount: 2000, currency: "USD" }, { amount: 3000000, currency: "JPY" }, { amount: 500000, currency: "THB" }]) === "Rs 6L + $2K + ฿500K + ¥3M");

// ---- validation
ZERO_DECIMAL_CURRENCIES.forEach((c) => {
  const bad = parseMoney({ amount: 1500.5, currency: c }, "Prize pool");
  const good = parseMoney({ amount: 1500, currency: c }, "Prize pool");
  ok(`${c}: whole numbers only`, !bad.ok && "message" in bad && bad.message.includes("whole number") && good.ok);
});
ok("only JPY, KRW and VND are whole-number currencies", [...ZERO_DECIMAL_CURRENCIES].sort().join() === "JPY,KRW,VND");
ok("CNY and TWD keep two decimals", parseMoney({ amount: 19.99, currency: "CNY" }, "x").ok && parseMoney({ amount: 100.5, currency: "TWD" }, "x").ok);
ok("a currency that isn't in the catalog is still refused", !parseMoney({ amount: 10, currency: "XYZ" }, "x").ok);
ok("a 500 billion dong prize fits the database column", parseMoney({ amount: 500000000000, currency: "VND" }, "x").ok && MAX_AMOUNT > 5e11);

// ---- countries
ok("Taiwan exists, in East Asia, with TWD", countryName("TW") === "Taiwan" && COUNTRIES.TW.region === "east-asia" && suggestedCurrency("TW") === "TWD");
ok("suggested currencies for China, Japan, Korea, Thailand, Vietnam", suggestedCurrency("CN") === "CNY" && suggestedCurrency("JP") === "JPY" && suggestedCurrency("KR") === "KRW" && suggestedCurrency("TH") === "THB" && suggestedCurrency("VN") === "VND");
ok("every suggested currency in the country list is one the platform supports", Object.entries(COUNTRIES).every(([, c]) => !c.currency || isSupportedCurrency(c.currency)));
ok("East Asia lists China, Japan, South Korea and Taiwan", ["CN", "JP", "KR", "TW"].every((c) => countriesInRegion("east-asia").includes(c)));
ok("text lookups find Taiwan and South Korea", countryFromText("Taiwan") === "TW" && countryFromText("south korea") === "KR");

// ---- the migration that switches them on
const sql = readFileSync("prisma/migrations/20261021000000_east_asia_currencies/migration.sql", "utf8");
const rows = [...sql.matchAll(/\('([A-Z]{3})', (true|false), (\d+),/g)].map((m) => ({ code: m[1], on: m[2] === "true", order: Number(m[3]) }));
ok("migration switches on exactly the six currencies", rows.length === 6 && rows.every((r) => r.on) && rows.map((r) => r.code).sort().join() === [...NEW].sort().join());
ok("every currency in the migration exists in the catalog", rows.every((r) => isSupportedCurrency(r.code)));
ok("existing sort orders are kept (THB 17, VND 18) and new ones continue after the 26 already there", rows.find((r) => r.code === "THB")!.order === 17 && rows.find((r) => r.code === "VND")!.order === 18 && ["CNY", "JPY", "KRW", "TWD"].map((c) => rows.find((r) => r.code === c)!.order).join() === "26,27,28,29");
ok("migration upserts and never deletes", /ON CONFLICT \("code"\) DO UPDATE SET "enabled" = true/.test(sql) && !/\b(DELETE|DROP|TRUNCATE)\b/i.test(sql) && !/npm notice/i.test(sql));

// ---- tier floors: the live USD conversion is attempted for all six (network faked)
async function main() {
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    const rate = String(url).includes("/JPY/") ? 0.0065 : String(url).includes("/KRW/") ? 0.00072 : 0.03;
    return new Response(JSON.stringify({ rate }), { status: 200 });
  }) as typeof fetch;
  try {
    clearFxCache();
    const usd = await Promise.all(NEW.map((c) => toUsd(1_000_000, c)));
    ok("USD floors can be checked for all six currencies", usd.every((v) => Number.isFinite(v) && v > 0) && calls.length === 6 && NEW.every((c) => calls.some((u) => u.endsWith(`/rate/${c}/USD`))));
    ok("a million yen converts at the live rate", Math.round(usd[NEW.indexOf("JPY")]) === 6500);
  } finally {
    globalThis.fetch = realFetch;
  }
  process.exit(fails ? 1 : 0);
}
main();
