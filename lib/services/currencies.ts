import { prisma } from "@/lib/prisma";
import { LAUNCH_CURRENCIES, SUPPORTED_CURRENCIES, isSupportedCurrency, type CurrencyCode } from "@/lib/money";

// Currencies organizers may choose right now. Falls back to the launch five if
// the table is empty (fresh/unseeded database) so nothing ever has zero choices.
export async function getEnabledCurrencies(): Promise<CurrencyCode[]> {
  const rows = await prisma.currencySetting.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  const codes = rows.map((r) => r.code).filter(isSupportedCurrency);
  return codes.length ? codes : [...LAUNCH_CURRENCIES];
}

// For tournament money fields: a currency can be a valid catalog entry yet
// switched off. Returns an error message for the first one that isn't allowed.
export async function currenciesNotEnabled(codes: (string | undefined)[]): Promise<string | null> {
  const wanted = [...new Set(codes.filter((c): c is string => !!c))];
  if (wanted.length === 0) return null;
  const enabled = new Set<string>(await getEnabledCurrencies());
  const bad = wanted.find((c) => !enabled.has(c));
  return bad ? `${bad} isn't available for tournaments right now.` : null;
}

export async function listCurrencySettings() {
  const rows = await prisma.currencySetting.findMany();
  const byCode = new Map(rows.map((r) => [r.code, r]));
  // Show every catalog currency, even ones with no row yet (off by default).
  return SUPPORTED_CURRENCIES.map((code, i) => ({
    code,
    enabled: byCode.get(code)?.enabled ?? false,
    sortOrder: byCode.get(code)?.sortOrder ?? i,
  }));
}

export async function setCurrencyEnabled(code: string, enabled: boolean) {
  if (!isSupportedCurrency(code)) return { error: "unknown_currency" as const };
  // USD is the base every tier floor is measured in; it can't be switched off.
  if (code === "USD" && !enabled) return { error: "usd_required" as const };
  const sortOrder = SUPPORTED_CURRENCIES.indexOf(code);
  await prisma.currencySetting.upsert({
    where: { code },
    update: { enabled },
    create: { code, enabled, sortOrder },
  });
  return { data: { code, enabled } };
}
