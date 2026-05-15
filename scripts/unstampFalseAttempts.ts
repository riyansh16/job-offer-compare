/**
 * One-off recovery script for the May 13 partial refresh.
 *
 * Background: the original refresh batch wrote `ratingsLastFetchAttemptAt = now`
 * even when fetchLlmRatings returned null because all Gemini API keys were
 * exhausted. That falsely marked 14+ companies as "tried, no Indeed data"
 * when in reality no Gemini call was ever made for them.
 *
 * This script clears `ratingsLastFetchAttemptAt` for a known list of company names,
 * so the next refresh run picks them up as "never attempted" again.
 *
 * Safe to run multiple times. Default = dry-run; pass --apply to commit.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';

// Names taken directly from the partial-run log (refresh-ratings.log).
// Companies 71 (transient 503), 84 (transient 429), 85-98 (quota exhausted).
const FALSELY_ATTEMPTED = [
  'Instacart', // #71 — Gemini 503 high-demand, not a real "no data"
  'McKinsey', // #84 — 429 with short retry, quota wall hit mid-retry
  'Meesho',
  'Mercury',
  'Meta',
  'Microsoft',
  'Mindtree',
  'Mistral AI',
  'Modal',
  'MongoDB',
  'Monster',
  'Monzo',
  'Naukri (Info Edge)',
  'Naver',
  'Netflix',
  'Notion',
];

async function main() {
  const apply = process.argv.includes('--apply');

  const matches = await prisma.company.findMany({
    where: { name: { in: FALSELY_ATTEMPTED } },
    select: {
      id: true,
      name: true,
      indeedRating: true,
      indeedUrl: true,
      ratingsLastFetchAttemptAt: true,
    },
  });

  console.log(`Found ${matches.length} of ${FALSELY_ATTEMPTED.length} candidate companies.\n`);

  const toReset = matches.filter(
    (c) => c.indeedRating == null && c.indeedUrl == null && c.ratingsLastFetchAttemptAt != null,
  );
  const skipped = matches.filter(
    (c) => c.indeedRating != null || c.indeedUrl != null || c.ratingsLastFetchAttemptAt == null,
  );

  if (skipped.length > 0) {
    console.log('Skipping (already has data or already null):');
    for (const c of skipped) {
      console.log(
        `  - ${c.name} (rating=${c.indeedRating}, url=${c.indeedUrl ? 'yes' : 'no'}, attempted=${c.ratingsLastFetchAttemptAt ?? 'null'})`,
      );
    }
    console.log();
  }

  if (toReset.length === 0) {
    console.log('Nothing to reset.');
    return;
  }

  console.log(`Will clear ratingsLastFetchAttemptAt on ${toReset.length} companies:`);
  for (const c of toReset) {
    console.log(`  - ${c.name}`);
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to commit.');
    return;
  }

  const result = await prisma.company.updateMany({
    where: { id: { in: toReset.map((c) => c.id) } },
    data: { ratingsLastFetchAttemptAt: null },
  });
  console.log(`\nUpdated ${result.count} rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
