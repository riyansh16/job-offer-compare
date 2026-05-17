/**
 * Refresh Yahoo Finance stock data for every catalog company that has a
 * ticker symbol. Mirrors the on-read cache logic in
 * `src/lib/providers/stockPrice.ts` (6h staleness window) but walks the
 * catalog proactively so the per-company page and comparison runner never
 * have to wait for a Yahoo round-trip during a user request.
 *
 * Usage:
 *   npm run db:refresh-stocks                 # stalest first; respects 6h cache
 *   npm run db:refresh-stocks -- --force      # invalidate cache before fetching
 *   npm run db:refresh-stocks -- --interval-ms=500
 *
 * Cadence: every 6h via GitHub Actions (see .github/workflows/cron-refresh-stocks.yml).
 * Yahoo Finance has no published per-IP rate limit but is hostile to bursts;
 * 500ms between calls keeps us polite (~120/min, completes 50 tickers in ~25s).
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { getStockCagr } from '../src/lib/providers/stockPrice';

function getFlag(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const n = parseInt(arg.split('=')[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function main() {
  const force = process.argv.includes('--force');
  const intervalMs = getFlag('interval-ms', 500);

  const companies = await prisma.company.findMany({
    where: { tickerSymbol: { not: null } },
    select: { id: true, name: true, tickerSymbol: true, stockUpdatedAt: true },
    orderBy: [{ stockUpdatedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
  });

  console.log(
    `Refreshing stock prices for ${companies.length} tickered companies${force ? ' (--force)' : ''}.`,
  );

  if (force) {
    // Null the cache marker so getStockCagr's staleness check trips for every row.
    await prisma.company.updateMany({
      where: { tickerSymbol: { not: null } },
      data: { stockUpdatedAt: null },
    });
  }

  let ok = 0;
  let stale = 0;
  let failed = 0;
  const n = companies.length;
  const pad = String(n).length;

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    const idx = i + 1;
    try {
      const before = c.stockUpdatedAt?.getTime() ?? 0;
      const result = await getStockCagr(c.id, c.tickerSymbol as string);
      if (!result) {
        failed++;
        console.log(`  [${String(idx).padStart(pad)}/${n}] ✗ ${c.name} (${c.tickerSymbol}) — no data`);
      } else {
        const after = result.updatedAt?.getTime() ?? 0;
        if (after > before) {
          ok++;
          console.log(
            `  [${String(idx).padStart(pad)}/${n}] ✓ ${c.name} (${c.tickerSymbol}) — $${result.currentPrice?.toFixed(2) ?? '?'} | 5y ${result.cagrPct?.toFixed(1) ?? '?'}% | 1y ${result.cagr1yPct?.toFixed(1) ?? '?'}%`,
          );
        } else {
          stale++;
          console.log(`  [${String(idx).padStart(pad)}/${n}] ~ ${c.name} (${c.tickerSymbol}) — cache still fresh`);
        }
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  [${String(idx).padStart(pad)}/${n}] ✗ ${c.name} (${c.tickerSymbol}) — ${msg}`);
    }

    if (intervalMs > 0 && i < companies.length - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  console.log(`\nDone: ${ok} refreshed, ${stale} cached, ${failed} failed.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
