import { prisma } from '../src/lib/db';

/**
 * Remove tiny startups with no realistic India hiring presence and no usable
 * Indeed page. Cleans up the catalog so the ratings cron stops wasting
 * Gemini quota on them.
 *
 * Default = dry-run. Pass --apply to actually delete.
 *
 * Cleanup order (mirrors the FK graph):
 *   1. Find Comparison rows whose offerIdsCsv references any target offer
 *      (CSV string, NOT a real FK) and either prune the offer ID from the
 *      list or delete the comparison if it would become empty.
 *      AiInsight rows cascade off Comparison.
 *   2. Delete JobOffer rows (Compensation cascades).
 *   3. Delete Company rows (ReviewSentiment cascades).
 */
const NAMES = ['Bun', 'Sierra', 'Harvey', 'Replicate'];

async function main() {
  const apply = process.argv.includes('--apply');

  const companies = await prisma.company.findMany({
    where: { name: { in: NAMES } },
    select: {
      id: true,
      name: true,
      slug: true,
      indeedUrl: true,
      offers: { select: { id: true, title: true, user: { select: { email: true } } } },
      _count: { select: { sentiments: true } },
    },
  });

  console.log(`Found ${companies.length} of ${NAMES.length} target companies:\n`);
  for (const c of companies) {
    console.log(
      `  ${c.name.padEnd(12)} slug=${c.slug.padEnd(20)} offers=${c.offers.length} sentiments=${c._count.sentiments} url=${c.indeedUrl ?? '(none)'}`,
    );
    for (const o of c.offers) {
      console.log(`     • offer ${o.id}  "${o.title}"  (${o.user.email})`);
    }
  }

  const offerIds = companies.flatMap((c) => c.offers.map((o) => o.id));
  const offerIdSet = new Set(offerIds);

  // Find any Comparison rows that reference the target offers.
  const referencingComparisons = offerIds.length > 0
    ? await prisma.comparison.findMany({
        where: {
          OR: offerIds.map((id) => ({ offerIdsCsv: { contains: id } })),
        },
        select: { id: true, offerIdsCsv: true, userId: true },
      })
    : [];

  let toPrune = 0;
  let toDelete = 0;
  for (const cmp of referencingComparisons) {
    const ids = cmp.offerIdsCsv.split(',').filter(Boolean);
    const kept = ids.filter((id) => !offerIdSet.has(id));
    if (kept.length === 0) toDelete++;
    else if (kept.length < ids.length) toPrune++;
  }
  if (referencingComparisons.length > 0) {
    console.log(
      `\nComparison cleanup: ${toDelete} to delete (only target offers), ${toPrune} to prune (other offers remain).`,
    );
  }

  if (!apply) {
    console.log(
      `\nDry-run. Re-run with --apply to delete ${companies.length} companies + ${offerIds.length} offers.`,
    );
    return;
  }

  // === apply ===
  for (const cmp of referencingComparisons) {
    const ids = cmp.offerIdsCsv.split(',').filter(Boolean);
    const kept = ids.filter((id) => !offerIdSet.has(id));
    if (kept.length === 0) {
      await prisma.comparison.delete({ where: { id: cmp.id } });
      console.log(`  ✓ deleted comparison ${cmp.id} (only target offers)`);
    } else if (kept.length < ids.length) {
      await prisma.comparison.update({
        where: { id: cmp.id },
        data: { offerIdsCsv: kept.join(',') },
      });
      console.log(`  ✓ pruned comparison ${cmp.id} → ${kept.join(',')}`);
    }
  }

  if (offerIds.length > 0) {
    const r = await prisma.jobOffer.deleteMany({ where: { id: { in: offerIds } } });
    console.log(`  ✓ deleted ${r.count} JobOffer row(s)`);
  }

  for (const c of companies) {
    await prisma.company.delete({ where: { id: c.id } });
    console.log(`  ✓ deleted company ${c.name}`);
  }
  console.log(`\nDone: ${companies.length} companies, ${offerIds.length} offers removed.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
