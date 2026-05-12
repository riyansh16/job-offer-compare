/**
 * Refresh layoffs.fyi data for the entire catalog in a single pass.
 *
 * Strategy:
 *  1. Fetch the full layoffs.fyi Airtable dataset once (~2.6 MB, ~4400 rows).
 *  2. Index it by normalized company name.
 *  3. For each catalog company, look up matching events in the last 12 months
 *     and write `layoffsLast12mPct`, `layoffsAsOf`, `layoffsSourceUrl`, and
 *     `layoffsUpdatedAt`. Companies with no match get those fields nulled so
 *     stale data from a prior month doesn't linger.
 *
 * Usage:
 *   npm run db:refresh-layoffs           # refresh all companies
 *   npm run db:refresh-layoffs -- --dry  # don't write, just print the matches
 *
 * Cadence: monthly is plenty. Run via cron or GitHub Actions schedule (see
 * docs/DEPLOYMENT.md).
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import {
  fetchAllLayoffs,
  indexEventsByCompany,
  normalizeCompanyName,
  summarizeCompanyLayoffs,
} from '../src/lib/providers/layoffs';

async function main() {
  const dryRun = process.argv.includes('--dry');

  console.log('Fetching layoffs.fyi dataset...');
  const events = await fetchAllLayoffs();
  console.log(`  Got ${events.length} events.`);

  if (events.length === 0) {
    console.error('No events parsed — aborting before we wipe the column.');
    process.exit(1);
  }

  const idx = indexEventsByCompany(events);
  console.log(`  Indexed under ${idx.size} unique company keys.`);

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, slug: true },
  });
  console.log(`Matching against ${companies.length} catalog companies...\n`);

  const now = new Date();
  let matched = 0;
  let cleared = 0;
  const matchSamples: string[] = [];

  for (const c of companies) {
    const key = normalizeCompanyName(c.name);
    const evs = idx.get(key) ?? [];
    const summary = summarizeCompanyLayoffs(evs, 365);

    if (summary && summary.totalPctLast12m != null) {
      matched++;
      if (matchSamples.length < 8) {
        matchSamples.push(
          `  ✓ ${c.name.padEnd(28)} ${summary.totalPctLast12m.toFixed(1)}%  ${
            summary.mostRecentDate?.toISOString().slice(0, 10) ?? '?'
          }`,
        );
      }
      if (!dryRun) {
        await prisma.company.update({
          where: { id: c.id },
          data: {
            layoffsLast12mPct: summary.totalPctLast12m,
            layoffsAsOf: summary.mostRecentDate ?? null,
            layoffsSourceUrl: summary.mostRecentSourceUrl ?? null,
            layoffsUpdatedAt: now,
          },
        });
      }
    } else {
      // No layoffs in the last 12 months → clear any stale data from a
      // previous run, but still bump the freshness marker so we know we
      // *checked* this company on this run.
      cleared++;
      if (!dryRun) {
        await prisma.company.update({
          where: { id: c.id },
          data: {
            layoffsLast12mPct: null,
            layoffsAsOf: null,
            layoffsSourceUrl: null,
            layoffsUpdatedAt: now,
          },
        });
      }
    }
  }

  console.log('Sample matches:');
  for (const line of matchSamples) console.log(line);

  console.log('');
  console.log(`Companies with layoffs in last 12m: ${matched}`);
  console.log(`Companies with no recent layoffs:   ${cleared}`);
  console.log(dryRun ? '(dry run — DB not updated)' : '(DB updated)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
