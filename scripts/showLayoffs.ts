/**
 * Print layoff data for all companies that have it.
 * Usage: npx tsx scripts/showLayoffs.ts
 */
import { prisma } from '../src/lib/db';

async function main() {
  const rows = await prisma.company.findMany({
    where: { layoffsLast12mPct: { not: null } },
    orderBy: [{ layoffsAsOf: 'desc' }],
    select: {
      name: true,
      slug: true,
      layoffsLast12mPct: true,
      layoffsAsOf: true,
      layoffsSourceUrl: true,
      layoffsUpdatedAt: true,
    },
  });

  console.log(`\n${rows.length} companies with layoff data\n`);
  console.log(
    'Company'.padEnd(22) + ' | ' +
    '%'.padStart(6) + ' | ' +
    'As of'.padEnd(12) + ' | ' +
    'Refreshed'.padEnd(12) + ' | Source',
  );
  console.log('-'.repeat(90));
  for (const r of rows) {
    const pct = r.layoffsLast12mPct?.toFixed(1).padStart(5) + '%';
    const asOf = r.layoffsAsOf?.toISOString().slice(0, 10) ?? '—';
    const upd = r.layoffsUpdatedAt?.toISOString().slice(0, 10) ?? '—';
    const src = r.layoffsSourceUrl ? new URL(r.layoffsSourceUrl).hostname : '—';
    console.log(
      r.name.padEnd(22) + ' | ' +
      pct.padStart(6) + ' | ' +
      asOf.padEnd(12) + ' | ' +
      upd.padEnd(12) + ' | ' + src,
    );
  }
}

main().finally(() => prisma.$disconnect());
