/**
 * Escalation pass for companies stuck in the "tried, no data" bucket.
 *
 * Background: `gemini-2.5-flash-lite` (the default for the bulk refresh) has
 * roughly ~22% URL-extraction success on Indeed company pages. The pro model
 * (`gemini-2.5-pro`) gets ~85% — but it has a much smaller daily quota
 * (~50 RPD per key vs ~20 for lite), so it's wasteful on the bulk pass.
 *
 * This script targets ONLY the rows that are stuck:
 *   indeedRating IS NULL AND ratingsLastFetchAttemptAt IS NOT NULL
 *
 * It forces `GEMINI_RATINGS_MODEL=gemini-2.5-pro` before importing the
 * provider (the model id is captured at module load time), then runs the
 * same batch processor with conservative pro-model throttling.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/escalateMissingRatings.ts
 *   npx tsx --env-file=.env.local scripts/escalateMissingRatings.ts --dry-run
 *
 * Pro 5 RPM free-tier cap means ~25s between calls (5 calls/min, ~4.8 RPM).
 * With 4 keys * ~50 RPD ~= 200 RPD headroom. 56 stuck rows fit comfortably
 * in one run.
 */

// IMPORTANT: must set the model env var BEFORE importing llmRatings.
// The MODEL_ID const in src/lib/providers/llmRatings.ts is evaluated at
// module-load time, so a later assignment would be ignored.
//
// Allow CLI override via --model=<id>. Defaults to gemini-2.5-pro because
// it has the best URL-extraction accuracy. Common alternates:
//   --model=gemini-2.5-flash       (10 RPM, 250 RPD per key — good middle ground)
//   --model=gemini-2.5-flash-lite  (15 RPM, 1000 RPD — same as bulk pass)
const modelArg = process.argv.find((a) => a.startsWith('--model='));
const overrideModel = modelArg ? modelArg.split('=')[1] : null;
process.env.GEMINI_RATINGS_MODEL = overrideModel ?? process.env.GEMINI_RATINGS_MODEL ?? 'gemini-2.5-pro';

import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { refreshRatingsBatch } from '../src/lib/jobs/refreshRatingsBatch';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const intervalArg = process.argv.find((a) => a.startsWith('--interval-ms='));
  // Default throttle depends on model: pro is 5 RPM (~12s minimum) so we use
  // 25s to leave headroom across 4 keys without thrash; flash is 10 RPM and
  // copes fine at 14s. Override with --interval-ms=N.
  const isPro = process.env.GEMINI_RATINGS_MODEL?.includes('pro') ?? false;
  const defaultInterval = isPro ? 25_000 : 14_000;
  const intervalMs = intervalArg
    ? Math.max(0, parseInt(intervalArg.split('=')[1], 10) || defaultInterval)
    : defaultInterval;

  // CLI flag: --since-hours=N restricts candidates to companies created within
  // the last N hours. Useful when escalating a freshly-seeded batch and you
  // don't want to spend quota retrying the long-tail "known unrecoverable"
  // legacy rows that were already escalated and still came back empty.
  const sinceArg = process.argv.find((a) => a.startsWith('--since-hours='));
  const sinceHours = sinceArg ? parseInt(sinceArg.split('=')[1], 10) || 0 : 0;
  const createdAtFilter = sinceHours > 0
    ? { gt: new Date(Date.now() - sinceHours * 3600 * 1000) }
    : undefined;

  // Find candidates: rows that flash-lite tried exactly once and failed.
  // ratingsFailureCount = 1 is the sweet spot:
  //   * 0 = never failed (don't touch — bulk slice owns these)
  //   * 1 = yesterday's bulk failure (the rows we exist to rescue)
  //   * >=2 = already given up on (don't keep burning pro quota)
  // Order by ratingsLastFetchAttemptAt ASC so the OLDEST failed-once row gets
  // pro attention first; that way a row stuck in failureCount=1 limbo because
  // an earlier escalation slice already had a full --max queue doesn't lose
  // its turn forever.
  //
  // --include-stuck overrides this to also pull in failureCount>=2 rows for
  // manual recovery runs (e.g. after rotating a Gemini key that was misbehaving).
  const includeStuck = process.argv.includes('--include-stuck');
  const allCandidates = await prisma.company.findMany({
    where: {
      indeedRating: null,
      ratingsLastFetchAttemptAt: { not: null },
      ratingsFailureCount: includeStuck ? { gte: 1 } : { equals: 1 },
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    },
    orderBy: [{ ratingsLastFetchAttemptAt: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });

  // CLI flag: --max=N caps how many stuck rows this run will touch. Critical
  // for the daily cron — pro has only 50 RPD per key (~450/day across 9 keys)
  // AND those keys are shared with user PDF extraction on flash. Daily cron
  // uses --max=5 so the 47-deep stuck pool cycles in ~10 days while leaving
  // pro quota free for ad-hoc manual escalations.
  const maxArg = process.argv.find((a) => a.startsWith('--max='));
  const maxCap = maxArg ? Math.max(1, parseInt(maxArg.split('=')[1], 10) || 0) : null;
  const candidates = maxCap != null ? allCandidates.slice(0, maxCap) : allCandidates;

  console.log(
    `Found ${allCandidates.length} 'tried, no data' companies eligible for escalation` +
      (sinceHours > 0 ? ` (created within last ${sinceHours}h)` : '') +
      (maxCap != null ? `; processing ${candidates.length} this run [--max=${maxCap}]` : '') +
      '.\n',
  );

  if (candidates.length === 0) {
    console.log('Nothing to escalate. Exiting.');
    return;
  }

  console.log(`Model: ${process.env.GEMINI_RATINGS_MODEL}`);
  console.log(`Throttle: ${intervalMs}ms between calls (~${(60_000 / intervalMs).toFixed(1)} RPM)`);
  console.log(`Estimated duration: ${((candidates.length * intervalMs) / 60_000).toFixed(1)} min`);

  if (dryRun) {
    console.log('\n--- candidates ---');
    for (const c of candidates) console.log(`  - ${c.name}`);
    console.log('\nDry run. Re-run without --dry-run to escalate.');
    return;
  }

  // Snapshot 'with data' count before so we can report rescues.
  const beforeWithData = await prisma.company.count({ where: { indeedRating: { not: null } } });

  const result = await refreshRatingsBatch({
    batchSize: candidates.length,
    onlyMissing: true,
    targetIds: candidates.map((c) => c.id),
    intervalMs,
    concurrency: 1,
    onProgress: (i, n, name, status) => {
      const pad = String(i).padStart(String(n).length);
      const icon = status === 'ok' ? '✓' : status === 'no-data' ? '~' : '✗';
      console.log(`  [${pad}/${n}] ${icon} ${name}`);
    },
  });

  const afterWithData = await prisma.company.count({ where: { indeedRating: { not: null } } });
  const rescued = afterWithData - beforeWithData;

  console.log('\nDone:');
  console.log(`  Attempted:    ${result.attempted}`);
  console.log(`  Newly rescued: ${rescued} (false negatives now have ratings)`);
  console.log(`  Still no data: ${result.noData} (likely real Indeed gaps)`);
  console.log(`  Failed:       ${result.failed}`);
  console.log(`  Duration:     ${(result.durationMs / 1000).toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
