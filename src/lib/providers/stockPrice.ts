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
  /** Latest close price (USD). */
  currentPrice: number;
  startPrice: number;
  endPrice: number;
  startDate: Date;
  endDate: Date;
  pointCount: number;
}

// Stock prices are intraday-volatile but offer-decision time horizons are days,
// not minutes. 6h is the sweet spot: comparisons stay current within a trading
// session, and we stay well under Yahoo Finance rate limits.
const STALE_HOURS = 6;

/**
 * Fetch (or use cached) 5-year daily close history from Yahoo Finance, persist
 * to the StockPriceHistory table, and compute the trailing CAGR.
 *
 * Returns null when the ticker is invalid or has insufficient data.
 */
export async function getStockCagr(companyId: string, ticker: string, years = 5): Promise<CagrResult | null> {
  const t = ticker?.trim().toUpperCase();
  if (!t) return null;

  // Check cache.
  const newestCached = await prisma.stockPriceHistory.findFirst({
    where: { companyId },
    orderBy: { fetchedAt: 'desc' },
  });
  const cacheStale =
    !newestCached ||
    Date.now() - new Date(newestCached.fetchedAt).getTime() > STALE_HOURS * 3600 * 1000;

  if (cacheStale) {
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
      return null;
    }
    const quotes = chart?.quotes ?? [];
    if (quotes.length === 0) {
      console.warn(`[stockPrice] No quotes returned for ${t}`);
      return null;
    }
    await prisma.stockPriceHistory.deleteMany({ where: { companyId } });
    await prisma.stockPriceHistory.createMany({
      data: quotes
        .filter((q): q is ChartQuote & { close: number; date: Date | string } =>
          q.close != null && q.date != null,
        )
        .map((q) => ({
          companyId,
          date: new Date(q.date),
          closeUsd: q.close,
          source: 'YahooFinance',
        })),
    });
  }

  const rows = await prisma.stockPriceHistory.findMany({
    where: { companyId },
    orderBy: { date: 'asc' },
  });
  if (rows.length < 2) return null;

  const points: PricePoint[] = rows.map((r) => ({ date: r.date, closeUsd: r.closeUsd }));
  const cagr5y = computeHistoricalCagr(points, 5);
  const cagr1y = computeHistoricalCagr(points, 1);
  return {
    ticker: t,
    cagrPct: cagr5y,
    cagr1yPct: cagr1y,
    currentPrice: rows[rows.length - 1].closeUsd,
    startPrice: rows[0].closeUsd,
    endPrice: rows[rows.length - 1].closeUsd,
    startDate: rows[0].date,
    endDate: rows[rows.length - 1].date,
    pointCount: rows.length,
  };
}
