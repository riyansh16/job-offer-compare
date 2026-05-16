import { prisma } from '../src/lib/db';

async function main() {
  const missing = await prisma.company.findMany({
    where: { indeedRating: null },
    orderBy: { name: 'asc' },
    select: { name: true, indeedUrl: true, ratingsLastFetchAttemptAt: true },
  });
  console.log(`Total missing: ${missing.length}\n`);
  console.log('Has URL but no rating (Category A — recoverable via pro/retry):');
  for (const c of missing) {
    if (c.indeedUrl) console.log(`  - ${c.name}  (${c.indeedUrl})`);
  }
  console.log('\nNo URL at all (Category B — model said notFound or invalid URL):');
  for (const c of missing) {
    if (!c.indeedUrl) console.log(`  - ${c.name}`);
  }
}

main().finally(() => prisma.$disconnect());
