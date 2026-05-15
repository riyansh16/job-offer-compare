/**
 * One-off backfill for the lifetime counters added in the
 * `add_lifetime_counters` migration. Run this once after the migration so
 * users created before the counters existed have correct totals.
 *
 *   Dry-run (default): npx tsx scripts/backfillLifetimeCounters.ts
 *   Apply:             npx tsx scripts/backfillLifetimeCounters.ts --apply
 *
 * Idempotent: if you run it twice with --apply you get the same result,
 * because each user's counters are SET to the current row counts (not
 * incremented). After the migration this exactly matches what the
 * runtime bumps will accumulate going forward.
 *
 * NOTE: this purposely OVERWRITES whatever values the counters currently
 * hold, so don't run it after the app has been live for a while \u2014 it
 * would erase the "deleted but counted" history we're trying to preserve.
 * Run once, immediately after the migration, then never again.
 */
import { prisma } from '../src/lib/db';

const APPLY = process.argv.includes('--apply');

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  console.log(`Found ${users.length} users.`);

  let touched = 0;
  for (const user of users) {
    const [offerCount, comparisonCount, insightCount] = await Promise.all([
      prisma.jobOffer.count({ where: { userId: user.id } }),
      prisma.comparison.count({ where: { userId: user.id } }),
      // AiInsight has no userId \u2014 join through Comparison.
      prisma.aiInsight.count({ where: { comparison: { userId: user.id } } }),
    ]);

    if (offerCount === 0 && comparisonCount === 0 && insightCount === 0) continue;

    console.log(
      `  ${user.email}: offers=${offerCount}, comparisons=${comparisonCount}, aiInsights=${insightCount}`,
    );

    if (APPLY) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lifetimeOffers: offerCount,
          lifetimeComparisons: comparisonCount,
          lifetimeAiInsights: insightCount,
        },
      });
      touched += 1;
    }
  }

  if (APPLY) {
    console.log(`\nUpdated ${touched} user rows.`);
  } else {
    console.log('\nDry-run only. Re-run with --apply to write the changes.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
