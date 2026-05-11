/**
 * One-off cleanup: nulls out any rating that has no source URL backing it.
 * Removes fake values inherited from the original seed file before we wired
 * Gemini-grounded fetching.
 *
 * Idempotent — safe to run multiple times.
 */
import { prisma } from '../src/lib/db';

async function main() {
  // Glassdoor: drop rating + all sub-ratings + counts when glassdoorUrl is missing.
  const gdResult = await prisma.company.updateMany({
    where: { glassdoorUrl: null },
    data: {
      glassdoorRating: null,
      glassdoorReviewCount: null,
      glassdoorCompBenefits: null,
      glassdoorWLB: null,
      glassdoorCareerOpps: null,
      glassdoorCulture: null,
      glassdoorSrMgmt: null,
      glassdoorRecommendPct: null,
      glassdoorCeoApprovalPct: null,
    },
  });
  console.log(`Glassdoor: nulled ${gdResult.count} rows missing source URL.`);

  // Indeed-only switch: clear ALL Glassdoor data (we no longer fetch it).
  // Keeps the schema columns for backward compat but stops them affecting scores.
  const gdAllResult = await prisma.company.updateMany({
    where: {},
    data: {
      glassdoorRating: null,
      glassdoorUrl: null,
      glassdoorReviewCount: null,
      glassdoorCompBenefits: null,
      glassdoorWLB: null,
      glassdoorCareerOpps: null,
      glassdoorCulture: null,
      glassdoorSrMgmt: null,
      glassdoorRecommendPct: null,
      glassdoorCeoApprovalPct: null,
    },
  });
  console.log(`Glassdoor: cleared ${gdAllResult.count} rows (Indeed-only mode).`);

  // Indeed: same deal \u2014 only drop when URL missing.
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

  // Layoffs: never had a real source, all hand-typed. Wipe all of them.
  const lyResult = await prisma.company.updateMany({
    where: { layoffsLast12mPct: { not: null } },
    data: { layoffsLast12mPct: null, layoffsAsOf: null },
  });
  console.log(`Layoffs:   nulled ${lyResult.count} fabricated rows.`);

  // Blind: only ever had counts, all fake. Wipe.
  const blResult = await prisma.company.updateMany({
    where: { blindReviewCount: { not: null } },
    data: { blindReviewCount: null },
  });
  console.log(`Blind:     nulled ${blResult.count} fabricated review-count rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
