/**
 * Batched rating-refresh job.
 *
 * Picks the N "stalest" companies (oldest lastFetchAttemptAt, nulls first),
 * fetches Indeed ratings via Gemini, persists results.
 *
 * Designed for two callers:
 *  1. A daily cron (small N, e.g. 5) — natural rotation across the catalog.
 *  2. A one-time bootstrap run (huge N, e.g. 1000) — first-time fill.
 */
import { prisma } from '../db';
import { fetchLlmRatings } from '../providers/llmRatings';

export interface BatchOptions {
  /** Max companies to refresh in this run. */
  batchSize: number;
  /** If true, ignores lastFetchAttemptAt — refreshes EVERY company. */
  refreshAll?: boolean;
  /** If true, only target companies missing an Indeed rating. Skips companies
   *  that already have data, so we don't waste quota re-fetching successes. */
  onlyMissing?: boolean;
  /** Pause between sequential calls (when concurrency=1). Default 4500ms (~13 RPM). */
  intervalMs?: number;
  /** Number of companies to fetch in parallel. Default 1 (sequential).
   *  Use 5+ for fast bulk runs when daily quota is fresh; the parallel batch
   *  will burst then wait `intervalMs` before the next batch. */
  concurrency?: number;
  /** Optional progress callback. */
  onProgress?: (i: number, total: number, companyName: string, status: 'ok' | 'no-data' | 'fail') => void;
}

export interface BatchResult {
  attempted: number;
  withData: number;
  noData: number;
  failed: number;
  durationMs: number;
}

export async function refreshRatingsBatch(opts: BatchOptions): Promise<BatchResult> {
  const start = Date.now();
  const interval = opts.intervalMs ?? 4500;
  const concurrency = Math.max(1, opts.concurrency ?? 1);

  // Pick stalest companies first. Companies that have never been attempted
  // (lastFetchAttemptAt = null) come first because nulls sort low in SQLite ASC.
  // onlyMissing filter: skip companies that already have an Indeed rating, so
  // a partial bootstrap (e.g. quota cut us off at 50/164) can resume cheaply
  // without re-fetching successes.
  const where = opts.onlyMissing ? { indeedRating: null } : undefined;
  const targets = await prisma.company.findMany({
    where,
    orderBy: [{ lastFetchAttemptAt: 'asc' }, { name: 'asc' }],
    take: opts.batchSize,
    select: {
      id: true,
      name: true,
      tickerSymbol: true,
      hqLocation: true,
    },
  });

  let withData = 0;
  let noData = 0;
  let failed = 0;
  let processed = 0;

  // Process one company end-to-end (fetch + DB write). Returns its outcome
  // status for the progress callback.
  const processOne = async (c: typeof targets[number]): Promise<'ok' | 'no-data' | 'fail'> => {
    try {
      const r = await fetchLlmRatings(c.name, {
        ticker: c.tickerSymbol,
        hqLocation: c.hqLocation,
      });

      if (r == null) {
        failed++;
        await prisma.company.update({
          where: { id: c.id },
          data: { lastFetchAttemptAt: new Date() },
        });
        return 'fail';
      }

      // Build partial-update payload — only overwrite non-null fields.
      const data: Record<string, unknown> = {
        lastFetchAttemptAt: new Date(),
      };
      const setIfNotNull = (key: string, v: unknown) => {
        if (v != null) data[key] = v;
      };
      setIfNotNull('indeedRating', r.indeedRating);
      setIfNotNull('indeedReviewCount', r.indeedReviewCount);
      setIfNotNull('indeedCompBenefits', r.indeedCompBenefits);
      setIfNotNull('indeedWLB', r.indeedWLB);
      setIfNotNull('indeedJobSecurity', r.indeedJobSecurity);
      setIfNotNull('indeedMgmt', r.indeedMgmt);
      setIfNotNull('indeedCulture', r.indeedCulture);
      setIfNotNull('indeedUrl', r.indeedUrl);

      const gotAnyData = r.indeedRating != null;
      if (gotAnyData) {
        data.ratingsUpdatedAt = new Date();
        withData++;
      } else {
        noData++;
      }
      await prisma.company.update({ where: { id: c.id }, data });
      return gotAnyData ? 'ok' : 'no-data';
    } catch (err) {
      failed++;
      console.warn(`[refreshRatingsBatch] ${c.name} failed:`, err);
      await prisma.company
        .update({
          where: { id: c.id },
          data: { lastFetchAttemptAt: new Date() },
        })
        .catch(() => null);
      return 'fail';
    }
  };

  // Process the targets in chunks of `concurrency`. Within each chunk, calls
  // run in parallel; between chunks, we sleep `interval` ms to respect RPM.
  for (let chunkStart = 0; chunkStart < targets.length; chunkStart += concurrency) {
    const chunk = targets.slice(chunkStart, chunkStart + concurrency);
    const results = await Promise.all(chunk.map(processOne));
    for (let j = 0; j < chunk.length; j++) {
      processed++;
      opts.onProgress?.(processed, targets.length, chunk[j].name, results[j]);
    }
    // Throttle between chunks (skip after the last chunk).
    if (chunkStart + concurrency < targets.length) {
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  return {
    attempted: targets.length,
    withData,
    noData,
    failed,
    durationMs: Date.now() - start,
  };
}
