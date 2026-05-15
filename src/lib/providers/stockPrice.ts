import YahooFinance from 'yahoo-finance2';
import { prisma } from '../db';
import { computeHistoricalCagr, type PricePoint } from '../engine/equity';

// yahoo-finance2 v3+ requires instantiation. We share one client per process.
const yahooFinance = new YahooFinance({
  // Don't break the request flow when Yahoo flips redirects/cookies.
  validation: { logErrors: false, logOptionsErrors: false },
});

// Suppress the "yahooSurvey" / "ripHistorical" notices that print on first call.
const suppress = (yahooFinance as unknown as { suppressNotices?: (n: string[]) => void })
  .suppressNotices;
suppress?.(['yahooSurvey', 'ripHistorical']);

export interface CagrResult {
  ticker: string;
  /** Trailing 5-year CAGR (% per year). */
  cagrPct: number | null;
  /** Trailing 1-year CAGR (% per year). */
  cagr1yPct: number | null;
  /** Latest close price (USD). null when fetch failed and no cache exists. */
  currentPrice: number | null;
  /** When the cached numbers were last refreshed from Yahoo Finance. */
  updatedAt: Date | null;
}

// Stock prices are intraday-volatile but offer-decision time horizons are days,
// not minutes. 6h is the sweet spot: comparisons stay current within a trading
// session, and we stay well under Yahoo Finance rate limits.
const STALE_HOURS = 6;

/**
 * Return cached CAGR + current price for a public company. Refreshes from
 * Yahoo Finance when the cache is older than STALE_HOURS.
 *
 * Stores the 3 result numbers directly on the Company row (no daily-price
 * history table). The full daily series is computed in-memory during the
 * Yahoo fetch and discarded after CAGR derivation; we only ever needed
 * the 3 numbers and storing thousands of daily rows per company was waste.
 *
 * Returns null only when the ticker is invalid or has insufficient data
 * AND we have no cached values to fall back on.
 */
export async function getStockCagr(
  companyId: string,
  ticker: string,
  years = 5,
): Promise<CagrResult | null> {
  const t = ticker?.trim().toUpperCase();
  if (!t) return null;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      stockCagr5yPct: true,
      stockCagr1yPct: true,
      stockCurrentPriceUsd: true,
      stockUpdatedAt: true,
    },
  });
  if (!company) return null;

  const cacheStale =
    !company.stockUpdatedAt ||
    Date.now() - new Date(company.stockUpdatedAt).getTime() > STALE_HOURS * 3600 * 1000;

  if (!cacheStale) {
    return {
      ticker: t,
      cagrPct: company.stockCagr5yPct,
      cagr1yPct: company.stockCagr1yPct,
      currentPrice: company.stockCurrentPriceUsd,
      updatedAt: company.stockUpdatedAt,
    };
  }

  // Cold path: fetch from Yahoo Finance, compute CAGR in memory, persist
  // only the 3 result numbers.
  const end = new Date();
  const start = new Date(end.getTime() - years * 365.25 * 24 * 3600 * 1000);
  interface ChartQuote { date?: Date | string; close?: number | null }
  interface ChartResult { quotes?: ChartQuote[] }
  let chart: ChartResult | null = null;
  try {
    chart = (await yahooFinance.chart(t, {
      period1: start,
      period2: end,
      interval: '1d',
    })) as ChartResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[stockPrice] Yahoo Finance fetch failed for ${t}:`, msg);
    // Return stale cache rather than null so a transient outage doesn't blank
    // out a comparison. Fully-empty cache still returns null.
    if (company.stockUpdatedAt) {
      return {
        ticker: t,
        cagrPct: company.stockCagr5yPct,
        cagr1yPct: company.stockCagr1yPct,
        currentPrice: company.stockCurrentPriceUsd,
        updatedAt: company.stockUpdatedAt,
      };
    }
    return null;
  }
  const quotes = (chart?.quotes ?? []).filter(
    (q): q is ChartQuote & { close: number; date: Date | string } =>
      q.close != null && q.date != null,
  );
  if (quotes.length < 2) {
    console.warn(`[stockPrice] Insufficient quotes returned for ${t} (got ${quotes.length})`);
    return null;
  }

  const points: PricePoint[] = quotes.map((q) => ({
    date: new Date(q.date),
    closeUsd: q.close,
  }));
  const cagr5y = computeHistoricalCagr(points, 5);
  const cagr1y = computeHistoricalCagr(points, 1);
  const currentPrice = points[points.length - 1].closeUsd;
  const updatedAt = new Date();

  await prisma.company.update({
    where: { id: companyId },
    data: {
      stockCagr5yPct: cagr5y,
      stockCagr1yPct: cagr1y,
      stockCurrentPriceUsd: currentPrice,
      stockUpdatedAt: updatedAt,
    },
  });

  return {
    ticker: t,
    cagrPct: cagr5y,
    cagr1yPct: cagr1y,
    currentPrice,
    updatedAt,
  };
}
