/**
 * Free FX rates via Frankfurter (https://www.frankfurter.dev/) — ECB reference rates.
 * No API key required. We cache rates per-base-currency for 24h in-process.
 *
 * Used to convert offer compensation to a single common currency before scoring,
 * so cross-currency comparisons (e.g. INR vs USD vs GBP) are apples-to-apples.
 */

export const SUPPORTED_CURRENCIES = [
  'INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'CHF', 'JPY', 'SEK',
  'NOK', 'DKK', 'NZD', 'HKD', 'BRL', 'MXN', 'ZAR', 'AED', 'CNY', 'KRW',
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

interface CachedRates {
  base: string;
  fetchedAt: number;
  rates: Record<string, number>;
}

const STALE_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CachedRates>();

/** Fetch the latest rates with a given base. Returns null on network failure. */
async function fetchRates(base: string): Promise<CachedRates | null> {
  const cached = cache.get(base);
  if (cached && Date.now() - cached.fetchedAt < STALE_MS) return cached;
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`, {
      headers: { Accept: 'application/json' },
      // Server-side fetch; cache result via Next.js data cache for 24h.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return cached ?? null;
    const data = (await res.json()) as { base: string; rates: Record<string, number> };
    const entry: CachedRates = { base: data.base, fetchedAt: Date.now(), rates: data.rates };
    // The base currency itself is implicitly 1.0 and not included in `rates`.
    entry.rates[data.base] = 1;
    cache.set(base, entry);
    return entry;
  } catch {
    return cached ?? null;
  }
}

/** Returns the FX rate from `from` to `to`, or null if unavailable. */
export async function getRate(from: string, to: string): Promise<number | null> {
  const f = (from || 'USD').toUpperCase();
  const t = (to || 'USD').toUpperCase();
  if (f === t) return 1;
  const rates = await fetchRates(f);
  if (!rates) return null;
  return rates.rates[t] ?? null;
}
