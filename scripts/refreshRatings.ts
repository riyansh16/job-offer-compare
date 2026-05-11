/**
 * One-time / on-demand bootstrap script.
 *
 * Refreshes Glassdoor + Indeed ratings for ALL companies in the catalog using
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

  const total = await prisma.company.count();
  console.log(
    refreshAll
      ? `Refreshing ALL ${total} companies (--all flag set)...`
      : `Refreshing ${total} companies (stalest first; resumes from prior run)...`,
  );

  const result = await refreshRatingsBatch({
    batchSize: total,
    refreshAll,
    intervalMs: 2200, // ~27 RPM, under the 30 RPM free-tier limit for flash-lite
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
