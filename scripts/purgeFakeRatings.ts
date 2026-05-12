/**
 * One-off cleanup: nulls out any rating that has no source URL backing it.
 * Removes fake values inherited from the original seed file before we wired
 * Gemini-grounded fetching.
 *
 * Idempotent — safe to run multiple times.
 */
import { prisma } from '../src/lib/db';

async function main() {
  // Indeed: drop rating + sub-ratings + counts when indeedUrl is missing.
  const inResult = await prisma.company.updateMany({
    where: { indeedUrl: null },
    data: {
      indeedRating: null,
      indeedReviewCount: null,
      indeedCompBenefits: null,
      indeedWLB: null,
      indeedJobSecurity: null,
      indeedMgmt: null,
      indeedCulture: null,
    },
  });
  console.log(`Indeed:    nulled ${inResult.count} rows missing source URL.`);

  // Layoffs: never had a real source URL, all hand-typed. Wipe all of them.
  const lyResult = await prisma.company.updateMany({
    where: { layoffsLast12mPct: { not: null } },
    data: { layoffsLast12mPct: null, layoffsAsOf: null, layoffsSourceUrl: null },
  });
  console.log(`Layoffs:   nulled ${lyResult.count} fabricated rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
