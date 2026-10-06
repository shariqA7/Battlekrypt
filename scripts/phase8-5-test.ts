// Needs a Postgres with all migrations applied. See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { formatMoney, formatMoneyCompact, formatMoneyBreakdown, isSupportedCurrency, SUPPORTED_CURRENCIES, LAUNCH_CURRENCIES } from "../lib/money";
import { toUsd, tryToUsd, clearFxCache } from "../lib/currency-fx";
import { getEnabledCurrencies, currenciesNotEnabled, setCurrencyEnabled, listCurrencySettings } from "../lib/services/currencies";
import { countryFromText, countriesInRegion, countryName, isCountryCode, isRegionKey, suggestedCurrency, COUNTRIES } from "../lib/geo-data";
import { listTournaments } from "../lib/services/tournaments";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };

type FetchFn = typeof fetch;
function mockFetch(handler: (url: string) => { status: number; body: unknown } | "throw") {
  const calls: string[] = [];
  (globalThis as { fetch: FetchFn }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const r = handler(url);
    if (r === "throw") throw new Error("network down");
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as FetchFn;
  return calls;
}

async function main() {
  // ---- formatting for the expanded catalog
  ok("catalog has the 5 launch currencies first", SUPPORTED_CURRENCIES.slice(0, 5).join() === LAUNCH_CURRENCIES.join());
  ok("PKR/USD formatting unchanged", formatMoney(150000, "PKR") === "Rs 1,50,000" && formatMoney(2000, "USD") === "$2,000");
  ok("BDT uses lakh grouping + glyph", formatMoney(1234567, "BDT") === "৳12,34,567");
  ok("EUR / GBP", formatMoney(1500, "EUR") === "€1,500" && formatMoney(19.99, "GBP") === "£19.99");
  ok("LKR keeps its code (not confused with PKR's 'Rs')", formatMoney(5000, "LKR") === "LKR 5,000");
  ok("MYR / ZAR", formatMoney(250, "MYR") === "RM 250" && formatMoney(1000, "ZAR") === "R 1,000");
  ok("compact for BDT uses lakh", formatMoneyCompact(600000, "BDT") === "৳6L");
  ok("compact for EUR uses K/M", formatMoneyCompact(1250000, "EUR") === "€1.2M");
  ok("breakdown keeps launch order, new ones after", formatMoneyBreakdown([{ amount: 2000, currency: "EUR" }, { amount: 600000, currency: "PKR" }, { amount: 2000, currency: "USD" }]) === "Rs 6L + $2K + €2K");
  ok("unknown legacy code still renders", formatMoney(100, "XYZ") === "XYZ 100");
  ok("isSupportedCurrency", isSupportedCurrency("QAR") && !isSupportedCurrency("XYZ") && !isSupportedCurrency("toString"));

  // ---- FX (mocked Frankfurter v2)
  const rates: Record<string, number> = { PKR: 0.0036, EUR: 1.08, QAR: 0.2747 };
  let calls = mockFetch((url) => {
    const m = url.match(/\/v2\/rate\/([A-Z]+)\/USD$/);
    if (!m || !(m[1] in rates)) return { status: 422, body: { message: "invalid currency" } };
    return { status: 200, body: { date: "2026-10-02", base: m[1], quote: "USD", rate: rates[m[1]] } };
  });
  clearFxCache();
  ok("PKR converts via the v2 endpoint", Math.abs((await toUsd(100000, "PKR")) - 360) < 1e-6 && calls[0] === "https://api.frankfurter.dev/v2/rate/PKR/USD");
  await toUsd(5, "PKR");
  ok("second call is served from cache", calls.length === 1);
  ok("USD needs no lookup", (await toUsd(50, "USD")) === 50 && calls.length === 1);
  ok("new catalog currency converts", Math.abs((await toUsd(100, "EUR")) - 108) < 1e-6);
  ok("unsupported currency rejected", "error" in (await tryToUsd(10, "XYZ")));

  clearFxCache();
  mockFetch(() => "throw");
  ok("pegged SAR still converts when the API is down", Math.abs((await toUsd(375, "SAR")) - 100) < 1e-6);
  ok("pegged AED still converts when the API is down", Math.abs((await toUsd(367.25, "AED")) - 100) < 1e-6);
  ok("non-pegged currency fails open (no guessing)", "error" in (await tryToUsd(100, "PKR")));
  clearFxCache();
  mockFetch(() => ({ status: 200, body: { rate: "nope" } }));
  ok("garbage rate rejected", "error" in (await tryToUsd(100, "PKR")));
  clearFxCache();
  mockFetch(() => ({ status: 500, body: {} }));
  ok("HTTP error fails open", "error" in (await tryToUsd(100, "EUR")));
  clearFxCache();
  mockFetch(() => "throw");
  await toUsd(1, "SAR"); // falls back to the peg
  mockFetch(() => ({ status: 200, body: { rate: 0.5 } }));
  ok("peg fallback is not cached: next call uses the live rate", (await toUsd(1, "SAR")) === 0.5);

  // ---- geo helpers
  ok("country names/regions", countryName("PK") === "Pakistan" && countryName("zz") === null && isCountryCode("AE") && !isCountryCode("XX") && isRegionKey("south-asia") && !isRegionKey("mars"));
  ok("countryFromText: names, aliases, codes", countryFromText("Pakistan") === "PK" && countryFromText(" uae ") === "AE" && countryFromText("pk") === "PK" && countryFromText("United Kingdom") === "GB" && countryFromText("Atlantis") === null && countryFromText(null) === null);
  ok("region membership", countriesInRegion("south-asia").includes("PK") && countriesInRegion("middle-east").includes("AE") && !countriesInRegion("south-asia").includes("AE"));
  ok("suggested currency", suggestedCurrency("PK") === "PKR" && suggestedCurrency("DE") === "EUR" && suggestedCurrency("KE") === null);
  ok("every suggested currency is in the catalog", Object.values(COUNTRIES).every((c) => !c.currency || isSupportedCurrency(c.currency)));

  // ---- admin currency settings (DB migrated + seeded)
  const settings = await listCurrencySettings();
  ok("migration seeded every catalog currency", settings.length === SUPPORTED_CURRENCIES.length && (await prisma.currencySetting.count()) === SUPPORTED_CURRENCIES.length);
  ok("only the launch five start enabled", (await getEnabledCurrencies()).join() === LAUNCH_CURRENCIES.join());
  ok("disabled currency is refused", (await currenciesNotEnabled(["QAR"]))?.includes("QAR") === true);
  ok("enabled and empty pass", (await currenciesNotEnabled(["PKR", undefined])) === null && (await currenciesNotEnabled([])) === null);
  ok("enable QAR", "data" in (await setCurrencyEnabled("QAR", true)) && (await currenciesNotEnabled(["QAR"])) === null);
  ok("QAR now offered", (await getEnabledCurrencies()).includes("QAR"));
  ok("disable it again", "data" in (await setCurrencyEnabled("QAR", false)) && (await currenciesNotEnabled(["QAR"])) !== null);
  ok("USD cannot be switched off", "error" in (await setCurrencyEnabled("USD", false)));
  ok("unknown currency rejected", "error" in (await setCurrencyEnabled("XYZ", true)));

  // ---- country / region filters
  await prisma.user.create({ data: { id: "org", email: "o@x.com", displayName: "O" } });
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "OrgCo" } });
  const game = await prisma.game.create({ data: { name: "G" } });
  const base = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 8, format: "single_elimination", entryType: "free", status: "published" } as const;
  const mk = (slug: string, country: string | null) => prisma.tournament.create({ data: { ...base, slug, name: slug, country } });
  await mk("pk", "PK"); await mk("in", "IN"); await mk("ae", "AE"); await mk("us", "US"); await mk("world", null);
  const names = async (f: Parameters<typeof listTournaments>[0]) => (await listTournaments(f)).data.map((t) => t.slug).sort().join();
  ok("no filter: everything", (await listTournaments({})).total === 5);
  ok("country filter: that country + worldwide", (await names({ country: "PK" })) === "pk,world");
  ok("region filter: its countries + worldwide", (await names({ region: "south-asia" })) === "in,pk,world");
  ok("middle-east region", (await names({ region: "middle-east" })) === "ae,world");
  ok("country wins when both are given", (await names({ country: "US", region: "south-asia" })) === "us,world");
  await prisma.tournament.create({ data: { ...base, slug: "pk-lan", name: "pk-lan", country: "PK", venueType: "lan", venueName: "A", venueAddress: "B", venueCity: "C", checkInCode: "ABC234" } });
  ok("filter combines with other filters", (await names({ country: "PK", venueType: "lan" })) === "pk-lan");
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
