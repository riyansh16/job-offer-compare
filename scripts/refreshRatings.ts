/**
 * One-time / on-demand bootstrap script.
 *
 * Refreshes Indeed ratings for ALL companies in the catalog using
 * Gemini-grounded search. Run this once after deleting the fake seed data.
 *
 * Usage:
 *   GEMINI_API_KEY=... npm run db:refresh-ratings
 *
 * For ~80 companies this takes ~6 minutes (4.5s throttle per call to stay
 * under Gemini 2.5 Flash's 15 RPM free-tier limit).
 */
import 'dotenv/config';
import { refreshRatingsBatch } from '../src/lib/jobs/refreshRatingsBatch';
import { prisma } from '../src/lib/db';

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY env var is required.');
    console.error('Get a free key at https://aistudio.google.com/apikey and add to .env.local');
    process.exit(1);
  }

  // CLI flag: --all to force-refresh every company; default = stalest first.
  // Useful for resuming a bootstrap that hit a quota mid-run: just re-run the
  // command and it picks up the never-attempted + oldest-attempted rows.
  const refreshAll = process.argv.includes('--all');

  // CLI flag: --only-missing to skip companies that already have an Indeed
  // rating. Best choice when resuming after a quota stop: don't waste calls
  // on successes, only retry the empties.
  const onlyMissing = process.argv.includes('--only-missing');

  // CLI flag: --never-attempted strictly targets companies that have never
  // been called against Gemini (ratingsLastFetchAttemptAt = null). Skips both
  // successes AND known-stuck rows that returned no data last run. Best right
  // after seeding a fresh batch of companies — don't burn quota retrying the
  // long-tail startups Gemini can't find Indeed pages for.
  const onlyNeverAttempted = process.argv.includes('--never-attempted');

  // CLI flag: --concurrency=N to fan out N parallel calls per batch.
  // Default 1 = sequential. 5 is a safe value within Gemini's 30 RPM cap.
  const concurrencyArg = process.argv.find((a) => a.startsWith('--concurrency='));
  const concurrency = concurrencyArg
    ? Math.max(1, parseInt(concurrencyArg.split('=')[1], 10) || 1)
    : 1;

  // CLI flag: --interval-ms=N to override pause between chunks. Tune per model:
  //   flash-lite: 14000ms (~8.5 RPM, under 10 RPM free cap)
  //   flash:      14000ms (same cap)
  //   pro:        25000ms (~4.8 RPM, under 5 RPM free cap)
  const intervalArg = process.argv.find((a) => a.startsWith('--interval-ms='));
  const intervalMs = intervalArg
    ? Math.max(0, parseInt(intervalArg.split('=')[1], 10) || 14000)
    : 14000;

  // CLI flag: --batch-size=N caps how many companies this run will touch.
  // The daily cron uses --batch-size=30 so the catalog cycles in ~10 days.
  // Gemini is now dedicated to ratings (user offer extraction moved to Azure
  // OpenAI), so the only ceiling is the free flash pool (~250 RPD/key × 9 ≈
  // 2250 RPD); 30/day is well within a single key's quota. Default (no flag)
  // keeps the historical 'do everything' behavior for manual bootstrap /
  // resume runs.
  const batchSizeArg = process.argv.find((a) => a.startsWith('--batch-size='));
  const batchSizeCap = batchSizeArg
    ? Math.max(1, parseInt(batchSizeArg.split('=')[1], 10) || 0)
    : null;

  const total = await prisma.company.count();
  const eligibleCount = onlyNeverAttempted
    ? await prisma.company.count({ where: { ratingsLastFetchAttemptAt: null } })
    : onlyMissing
      ? await prisma.company.count({ where: { indeedRating: null } })
      : total;
  const targetCount = batchSizeCap != null
    ? Math.min(batchSizeCap, eligibleCount)
    : eligibleCount;
  console.log(
    onlyNeverAttempted
      ? `Refreshing ${targetCount} of ${eligibleCount} virgin rows (of ${total} total)${batchSizeCap != null ? ` [--batch-size=${batchSizeCap}]` : ''}...`
      : onlyMissing
        ? `Refreshing ${targetCount} of ${eligibleCount} companies without ratings (of ${total} total)${batchSizeCap != null ? ` [--batch-size=${batchSizeCap}]` : ''}...`
        : refreshAll
          ? `Refreshing ALL ${total} companies (--all flag set)...`
          : `Refreshing ${targetCount} of ${total} companies, stalest first${batchSizeCap != null ? ` [--batch-size=${batchSizeCap}]` : ''}...`,
  );
  if (concurrency > 1) {
    console.log(`Concurrency: ${concurrency} parallel calls per batch.`);
  }

  const result = await refreshRatingsBatch({
    batchSize: targetCount,
    refreshAll,
    onlyMissing,
    onlyNeverAttempted,
    intervalMs,
    concurrency,
    onProgress: (i, n, name, status) => {
      const pad = String(i).padStart(String(n).length);
      const icon = status === 'ok' ? '✓' : status === 'no-data' ? '~' : '✗';
      console.log(`  [${pad}/${n}] ${icon} ${name}`);
    },
  });

  console.log('\nDone:');
  console.log(`  Attempted: ${result.attempted}`);
  console.log(`  With data: ${result.withData}`);
  console.log(`  No data:   ${result.noData}`);
  console.log(`  Failed:    ${result.failed}`);
  console.log(`  Duration:  ${(result.durationMs / 1000).toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
