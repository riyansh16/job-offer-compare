/**
 * One-off DB stats reporter for the rating refresh.
 * Usage: npx tsx scripts/ratingsStats.ts
 */
import { prisma } from '../src/lib/db';

async function main() {
  const total = await prisma.company.count();
  const withGlassdoor = await prisma.company.count({
    where: { glassdoorRating: { not: null } },
  });
  const withGlassdoorUrl = await prisma.company.count({
    where: { glassdoorUrl: { not: null } },
  });
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
    where: { lastFetchAttemptAt: { not: null } },
  });
  const fresh24h = await prisma.company.count({
    where: { ratingsUpdatedAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
  });
  const neverAttempted = total - everAttempted;
  // Legacy: has rating from old seed but no source URL.
  const legacy = await prisma.company.count({
    where: { AND: [{ glassdoorRating: { not: null } }, { glassdoorUrl: null }] },
  });

  console.log(`Total companies:           ${total}`);
  console.log(`Updated in last 24h:       ${fresh24h}  <- real fetches today`);
  console.log(`Got Glassdoor + URL:       ${withGlassdoorUrl}`);
  console.log(`Got Indeed + URL:          ${withIndeedUrl}`);
  console.log(`Has rating, no URL:        ${legacy}  <- legacy fake seed values`);
  console.log(`Got data ever:             ${everUpdated}`);
  console.log(`Attempted ever:            ${everAttempted}`);
  console.log(`Never attempted:           ${neverAttempted}`);
  console.log(`(raw) glassdoorRating:     ${withGlassdoor}`);
  console.log(`(raw) indeedRating:        ${withIndeed}`);
}

main().finally(() => prisma.$disconnect());
