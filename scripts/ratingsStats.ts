/**
 * One-off DB stats reporter for the rating refresh.
 * Usage: npx tsx scripts/ratingsStats.ts
 */
import { prisma } from '../src/lib/db';

async function main() {
  const total = await prisma.company.count();
  const withIndeed = await prisma.company.count({
    where: { indeedRating: { not: null } },
  });
  const withIndeedUrl = await prisma.company.count({
    where: { indeedUrl: { not: null } },
  });
  const everUpdated = await prisma.company.count({
    where: { ratingsUpdatedAt: { not: null } },
  });
  const everAttempted = await prisma.company.count({
    where: { ratingsLastFetchAttemptAt: { not: null } },
  });
  const fresh24h = await prisma.company.count({
    where: { ratingsUpdatedAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
  });
  const neverAttempted = total - everAttempted;
  // Legacy: has rating but no source URL (would indicate corruption — should be 0).
  const legacy = await prisma.company.count({
    where: { AND: [{ indeedRating: { not: null } }, { indeedUrl: null }] },
  });

  console.log(`Total companies:           ${total}`);
  console.log(`Updated in last 24h:       ${fresh24h}  <- real fetches today`);
  console.log(`Got Indeed + URL:          ${withIndeedUrl}`);
  console.log(`Has rating, no URL:        ${legacy}  <- should be 0 (anti-hallucination guard)`);
  console.log(`Got data ever:             ${everUpdated}`);
  console.log(`Attempted ever:            ${everAttempted}`);
  console.log(`Never attempted:           ${neverAttempted}`);
  console.log(`(raw) indeedRating:        ${withIndeed}`);
}

main().finally(() => prisma.$disconnect());
