import { prisma } from '../src/lib/db';

async function main() {
  const since = new Date(Date.now() - 60 * 60 * 1000); // last hour
  const [attempted, succeeded, totalMissing] = await Promise.all([
    prisma.company.count({
      where: { ratingsLastFetchAttemptAt: { gte: since } },
    }),
    prisma.company.count({
      where: { ratingsUpdatedAt: { gte: since }, indeedRating: { not: null } },
    }),
    prisma.company.count({ where: { indeedRating: null } }),
  ]);
  console.log(`Last hour: attempted=${attempted}, succeeded=${succeeded}, missing-now=${totalMissing}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
