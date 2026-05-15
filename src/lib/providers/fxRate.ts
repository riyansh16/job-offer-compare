import YahooFinance from 'yahoo-finance2';

/**
 * Tiny in-memory FX cache. Foreign-currency offer-letter parsing is the only
 * caller, and rates only need to be fresh within minutes — no DB persistence.
 *
 * Yahoo Finance exposes FX as ticker symbols like "USDINR=X" or "EURINR=X".
 * The shape we need is: 1 unit of `from` = `rate` units of `to`.
 */

const yahooFinance = new YahooFinance({
  validation: { logErrors: false, logOptionsErrors: false },
});
const suppress = (yahooFinance as unknown as { suppressNotices?: (n: string[]) => void })
  .suppressNotices;
suppress?.(['yahooSurvey', 'ripHistorical']);

interface CacheEntry {
  rate: number;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000; // 30 min — FX moves slowly enough for this use case.

export interface FxQuote {
  from: string;
  to: string;
  /** 1 unit of `from` = `rate` units of `to`. */
  rate: number;
  fetchedAt: Date;
}

/**
 * Get the spot FX rate from `from` → `to`, both ISO 4217. Returns null if
 * the pair is unknown to Yahoo or the API call fails.
 *
 * Examples:
 *   getFxRate('USD', 'INR') → ~85
 *   getFxRate('INR', 'INR') → 1 (short-circuit)
 */
export async function getFxRate(
  from: string,
  to: string,
): Promise<FxQuote | null> {
  const fromU = from.trim().toUpperCase();
  const toU = to.trim().toUpperCase();
  if (!fromU || !toU) return null;
  if (fromU === toU) {
    return { from: fromU, to: toU, rate: 1, fetchedAt: new Date() };
  }

  const key = `${fromU}/${toU}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { from: fromU, to: toU, rate: cached.rate, fetchedAt: new Date(cached.fetchedAt) };
  }

  const symbol = `${fromU}${toU}=X`;
  try {
    const quote = await yahooFinance.quote(symbol);
    // Prefer `regularMarketPrice`; fall back to bid/ask midpoint if missing.
    const price =
      (quote && typeof (quote as { regularMarketPrice?: number }).regularMarketPrice === 'number'
        ? (quote as { regularMarketPrice: number }).regularMarketPrice
        : undefined) ??
      avg(
        (quote as { bid?: number; ask?: number }).bid,
        (quote as { bid?: number; ask?: number }).ask,
      );
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      return null;
    }
    cache.set(key, { rate: price, fetchedAt: Date.now() });
    return { from: fromU, to: toU, rate: price, fetchedAt: new Date() };
  } catch (err) {
    console.warn(`[fxRate] failed to fetch ${symbol}:`, err);
    return null;
  }
}

function avg(a?: number, b?: number): number | undefined {
  if (typeof a === 'number' && typeof b === 'number' && a > 0 && b > 0) return (a + b) / 2;
  if (typeof a === 'number' && a > 0) return a;
  if (typeof b === 'number' && b > 0) return b;
  return undefined;
}
