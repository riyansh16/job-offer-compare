import { prisma } from '../src/lib/db';

async function main() {
  const missing = await prisma.company.findMany({
    where: { indeedRating: null },
    orderBy: { name: 'asc' },
    select: {
      name: true,
      slug: true,
      tickerSymbol: true,
      hqLocation: true,
      industry: true,
      indeedUrl: true,
      ratingsLastFetchAttemptAt: true,
      ratingsUpdatedAt: true,
    },
  });
  console.log(JSON.stringify(missing, null, 2));
}

main().finally(() => prisma.$disconnect());
