/**
 * Batched rating-refresh job.
 *
 * Picks the N "stalest" companies (oldest ratingsLastFetchAttemptAt, nulls first),
 * fetches Indeed ratings via Gemini, persists results.
 *
 * Designed for two callers:
 *  1. A daily cron (small N, e.g. 5) — natural rotation across the catalog.
 *  2. A one-time bootstrap run (huge N, e.g. 1000) — first-time fill.
 */
import { prisma } from '../db';
import {
  fetchLlmRatings,
  GeminiQuotaExhaustedError,
  GeminiServiceUnavailableError,
} from '../providers/llmRatings';

export interface BatchOptions {
  /** Max companies to refresh in this run. */
  batchSize: number;
  /** If true, ignores ratingsLastFetchAttemptAt — refreshes EVERY company. */
  refreshAll?: boolean;
  /** If true, only target companies missing an Indeed rating. Skips companies
   *  that already have data, so we don't waste quota re-fetching successes. */
  onlyMissing?: boolean;
  /** If true, only target companies that have NEVER been attempted
   *  (ratingsLastFetchAttemptAt = null). Skips both successes AND known-stuck
   *  rows that returned no data last time. Useful right after seeding a batch
   *  of new companies — focus quota on virgin entries, not retries of known
   *  hard-to-extract small startups. */
  onlyNeverAttempted?: boolean;
  /** Pause between sequential calls (when concurrency=1). Default 4500ms (~13 RPM). */
  intervalMs?: number;
  /** Number of companies to fetch in parallel. Default 1 (sequential).
   *  Use 5+ for fast bulk runs when daily quota is fresh; the parallel batch
   *  will burst then wait `intervalMs` before the next batch. */
  concurrency?: number;
  /** Explicit company id allow-list. When provided, only these rows are
   *  considered (intersected with onlyMissing / onlyNeverAttempted filters).
   *  Used by the escalation script to scope a retry to a freshly seeded
   *  subset and skip the long-tail legacy stuck rows. */
  targetIds?: string[];
  /** Optional progress callback. */
  onProgress?: (i: number, total: number, companyName: string, status: 'ok' | 'no-data' | 'fail') => void;
  /** Skip rows whose ratingsFailureCount is >= this number. Default 2 (give-up
   *  threshold = 1 bulk attempt + 1 pro escalation). The daily bulk cron sets
   *  this so we don't waste flash-lite quota retrying rows that are clearly
   *  unrecoverable. Set to a high value for manual reruns where the operator
   *  explicitly wants to give a stuck row another shot. */
  giveUpAtFailures?: number;
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
  const giveUpAt = opts.giveUpAtFailures ?? 2;

  // Pick stalest companies first. Companies that have never been attempted
  // (ratingsLastFetchAttemptAt = null) come first because nulls sort low in SQLite ASC.
  // Filter precedence:
  //   onlyNeverAttempted → strictly virgin rows (best after seeding new companies)
  //   onlyMissing        → any row without a stored Indeed rating (default for resume)
  //   neither            → everything, stalest first
  // The ratingsFailureCount gate is always applied (unless caller bumps
  // giveUpAtFailures very high) so the bulk slice doesn't keep poking rows we
  // already gave up on. targetIds bypasses this when set — explicit retry beats
  // the gate.
  const where = opts.onlyNeverAttempted
    ? { ratingsLastFetchAttemptAt: null }
    : opts.onlyMissing
      ? { indeedRating: null }
      : undefined;
  const idFilter = opts.targetIds && opts.targetIds.length > 0
    ? { id: { in: opts.targetIds } }
    : undefined;
  const failureGate = idFilter
    ? undefined // explicit targetIds override the give-up gate
    : { ratingsFailureCount: { lt: giveUpAt } };
  const targets = await prisma.company.findMany({
    where: { ...(where ?? {}), ...(idFilter ?? {}), ...(failureGate ?? {}) },
    orderBy: [{ ratingsLastFetchAttemptAt: 'asc' }, { name: 'asc' }],
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
  // When every Gemini key has exhausted its daily quota, there's no point
  // iterating the rest of the batch — abort early so we don't burn time and
  // (more importantly) don't falsely mark companies as attempted.
  let allKeysExhausted = false;

  // Process one company end-to-end (fetch + DB write). Returns its outcome
  // status for the progress callback. Returns 'skip-quota' when we couldn't
  // make a real Gemini call due to global key exhaustion — the company is
  // left untouched so the next run picks it up after quota reset.
  const processOne = async (
    c: typeof targets[number],
  ): Promise<'ok' | 'no-data' | 'fail' | 'skip-quota'> => {
    try {
      const r = await fetchLlmRatings(c.name, {
        ticker: c.tickerSymbol,
        hqLocation: c.hqLocation,
      });

      if (r == null) {
        // Real failure (not quota): we did make a call, it just didn't return
        // parseable data. Legit to record as attempted, and bump the failure
        // counter so the next day's bulk slice deprioritizes this row in
        // favour of the pro-tier escalation slice.
        failed++;
        await prisma.company.update({
          where: { id: c.id },
          data: {
            ratingsLastFetchAttemptAt: new Date(),
            ratingsFailureCount: { increment: 1 },
          },
        });
        return 'fail';
      }

      // Build partial-update payload — only overwrite non-null fields.
      const data: Record<string, unknown> = {
        ratingsLastFetchAttemptAt: new Date(),
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
        // Reset the failure streak on success so the next monthly rotation
        // picks this company normally instead of skipping it.
        data.ratingsFailureCount = 0;
        withData++;
      } else {
        // Model returned a JSON envelope but no usable overall rating (notFound
        // or all-null sub-ratings). Treat as a failed attempt for cron-rotation
        // purposes so the escalation slice gets a chance tomorrow.
        data.ratingsFailureCount = { increment: 1 };
        noData++;
      }
      await prisma.company.update({ where: { id: c.id }, data });
      return gotAnyData ? 'ok' : 'no-data';
    } catch (err) {
      if (err instanceof GeminiQuotaExhaustedError) {
        // Global quota exhaustion — we never actually called Gemini for this
        // company. Leave it untouched so it's still in the "never attempted"
        // bucket. Signal the outer loop to stop.
        allKeysExhausted = true;
        return 'skip-quota';
      }
      if (err instanceof GeminiServiceUnavailableError) {
        // Gemini infra blip (5xx UNAVAILABLE / INTERNAL) on every key. Model
        // never evaluated the prompt; this is not the company's fault, so
        // don't stamp anything. Abort the batch — if every key is 5xx'ing,
        // the next 40 calls will be too. Try again later (next scheduled run).
        allKeysExhausted = true;
        return 'skip-quota';
      }
      failed++;
      console.warn(`[refreshRatingsBatch] ${c.name} failed:`, err);
      await prisma.company
        .update({
          where: { id: c.id },
          data: {
            ratingsLastFetchAttemptAt: new Date(),
            ratingsFailureCount: { increment: 1 },
          },
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
      // Map skip-quota → fail for the progress callback's narrower signature.
      const raw = results[j];
      const status: 'ok' | 'no-data' | 'fail' = raw === 'skip-quota' ? 'fail' : raw;
      opts.onProgress?.(processed, targets.length, chunk[j].name, status);
    }
    if (allKeysExhausted) {
      console.warn(
        '[refreshRatingsBatch] All Gemini keys exhausted; aborting batch early. ' +
          'Remaining companies left untouched (still "never attempted"); rerun after quota reset.',
      );
      break;
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
