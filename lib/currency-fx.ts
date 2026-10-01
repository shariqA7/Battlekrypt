// Live currency conversion (spec §6/§9: "checked in USD-equivalent,
// converted live via a currency exchange API at time of input — USD floors
// are the stored source of truth, not hardcoded local-currency figures").
//
// Uses frankfurter.app — free, no API key, backed by the ECB's published
// rates. Good enough for gating a prize-pool floor; not meant for anything
// transactional (nobody's actually being charged in USD).
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/money";

const FX_BASE_URL = "https://api.frankfurter.app";

// Short in-memory cache — this is called on every tournament-creation
// keystroke-ish interaction (organizer picking a tier), and exchange rates
// don't meaningfully move minute to minute. Process-local only: fine for a
// single Vercel instance, and worst case just means an extra fetch after a
// cold start.
const cache = new Map<string, { rate: number; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getUsdRate(currency: CurrencyCode): Promise<number> {
  if (currency === "USD") return 1;

  const cached = cache.get(currency);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  // frankfurter quotes "1 <from> = X <to>" — we want "1 <currency> = X USD",
  // i.e. from=currency, to=USD.
  const res = await fetch(`${FX_BASE_URL}/latest?from=${currency}&to=USD`, {
    // Rates barely move; let Next.js cache this at the fetch layer too.
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`FX lookup failed for ${currency}: ${res.status}`);

  const data = await res.json();
  const rate = data.rates?.USD;
  if (typeof rate !== "number") throw new Error(`FX response missing USD rate for ${currency}`);

  cache.set(currency, { rate, expiresAt: Date.now() + CACHE_TTL_MS });
  return rate;
}

export async function toUsd(amount: number, currency: string): Promise<number> {
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  const rate = await getUsdRate(currency as CurrencyCode);
  return amount * rate;
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
