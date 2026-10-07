// Live currency conversion (spec §6/§9: "checked in USD-equivalent,
// converted live via a currency exchange API at time of input — USD floors
// are the stored source of truth, not hardcoded local-currency figures").
//
// Uses Frankfurter v2 (api.frankfurter.dev) — free, no API key, blends rates
// from 50+ central banks, so it carries PKR, SAR, AED and the rest of the
// platform's catalog. (The old api.frankfurter.app was ECB-only: no PKR/SAR/
// AED, so floor checks for those currencies could never succeed.) Good enough
// for gating a prize-pool floor; not meant for anything transactional.
import { isSupportedCurrency } from "@/lib/money";

const FX_BASE_URL = "https://api.frankfurter.dev/v2";

// SAR and AED are hard-pegged to the dollar. If the live lookup is down, the
// peg is an accurate answer, so those two still work during an outage. Every
// other currency fails open to "try again shortly" rather than guessing.
const USD_PEGS: Record<string, number> = {
  SAR: 1 / 3.75,
  AED: 1 / 3.6725,
};

// Short in-memory cache — called whenever an organizer picks a tier, and
// rates don't move meaningfully minute to minute. Process-local only.
const cache = new Map<string, { rate: number; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Exposed so tests can start from a clean slate.
export function clearFxCache() {
  cache.clear();
}

async function fetchUsdRate(currency: string): Promise<number> {
  // "1 <currency> = X USD" => base=currency, quote=USD.
  const res = await fetch(`${FX_BASE_URL}/rate/${currency}/USD`, {
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`FX lookup failed for ${currency}: ${res.status}`);
  const data = await res.json();
  const rate = data?.rate;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`FX response missing a usable USD rate for ${currency}`);
  }
  return rate;
}

async function getUsdRate(currency: string): Promise<number> {
  if (currency === "USD") return 1;

  const cached = cache.get(currency);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  let rate: number;
  try {
    rate = await fetchUsdRate(currency);
  } catch (e) {
    const peg = USD_PEGS[currency];
    if (peg === undefined) throw e;
    // Don't cache a fallback: the next call should try the live rate again.
    return peg;
  }
  cache.set(currency, { rate, expiresAt: Date.now() + CACHE_TTL_MS });
  return rate;
}

export async function toUsd(amount: number, currency: string): Promise<number> {
  if (!isSupportedCurrency(currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return amount * (await getUsdRate(currency));
}

// Used by the tier-floor UI so a fetch failure degrades to "can't verify
// right now" instead of silently treating the floor as met.
export async function tryToUsd(
  amount: number,
  currency: string
): Promise<{ usd: number } | { error: string }> {
  try {
    return { usd: await toUsd(amount, currency) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "FX lookup failed" };
  }
}
