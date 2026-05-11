/**
 * Batched rating-refresh job.
 *
 * Picks the N "stalest" companies (oldest lastFetchAttemptAt, nulls first),
 * fetches Glassdoor + Indeed via Gemini, persists results.
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
  /** Pause between calls to avoid Gemini RPM throttle (default 4500ms = 13 RPM, safely under 15 RPM free tier). */
  intervalMs?: number;
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

  // Pick stalest companies first. Companies that have never been attempted
  // (lastFetchAttemptAt = null) come first because nulls sort low in SQLite ASC.
  const targets = await prisma.company.findMany({
    where: opts.refreshAll ? {} : undefined,
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

  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    let status: 'ok' | 'no-data' | 'fail' = 'fail';
    try {
      const r = await fetchLlmRatings(c.name, {
        ticker: c.tickerSymbol,
        hqLocation: c.hqLocation,
      });

      if (r == null) {
        // Provider-level failure (no API key, network, parse). Don't mark
        // ratingsUpdatedAt; only bump the attempt timestamp.
        failed++;
        await prisma.company.update({
          where: { id: c.id },
          data: { lastFetchAttemptAt: new Date() },
        });
      } else {
        // Build a partial-update payload — only overwrite fields we got back.
        // Crucially: when Gemini returns null we keep whatever was in the DB
        // before, so a single bad day doesn't wipe good data.
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
          status = 'ok';
        } else {
          noData++;
          status = 'no-data';
        }
        await prisma.company.update({ where: { id: c.id }, data });
      }
    } catch (err) {
      failed++;
      console.warn(`[refreshRatingsBatch] ${c.name} failed:`, err);
      await prisma.company
        .update({
          where: { id: c.id },
          data: { lastFetchAttemptAt: new Date() },
        })
        .catch(() => null);
    }

    opts.onProgress?.(i + 1, targets.length, c.name, status);

    // Throttle so we stay under the 15 RPM free-tier limit.
    if (i < targets.length - 1) {
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
