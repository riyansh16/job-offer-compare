/**
 * Print one company's full Indeed rating row for visual sanity-check.
 * Usage: npx tsx scripts/sampleRating.ts [companyName?]
 *   - With name: print that company.
 *   - Without:   print the most-recently-updated one with a rating.
 */
import { prisma } from '../src/lib/db';

async function main() {
  const arg = process.argv.slice(2).join(' ').trim();
  const company = arg
    ? await prisma.company.findFirst({
        where: { name: { contains: arg } },
        orderBy: { ratingsUpdatedAt: 'desc' },
      })
    : await prisma.company.findFirst({
        where: { indeedRating: { not: null } },
        orderBy: { ratingsUpdatedAt: 'desc' },
      });

  if (!company) {
    console.log('No matching company found.');
    return;
  }

  console.log(`\n=== ${company.name} (${company.slug}) ===`);
  console.log(`HQ: ${company.hqLocation ?? '—'}   Industry: ${company.industry ?? '—'}`);
  console.log(`Updated: ${company.ratingsUpdatedAt?.toISOString() ?? 'never'}`);
  console.log(`Last attempt: ${company.lastFetchAttemptAt?.toISOString() ?? 'never'}`);
  console.log('\nIndeed:');
  console.log(`  Overall:        ${company.indeedRating ?? '—'}`);
  console.log(`  Review count:   ${company.indeedReviewCount ?? '—'}`);
  console.log(`  Comp & Benefits:${company.indeedCompBenefits ?? '—'}`);
  console.log(`  Work-Life Bal:  ${company.indeedWLB ?? '—'}`);
  console.log(`  Job Security:   ${company.indeedJobSecurity ?? '—'}`);
  console.log(`  Management:     ${company.indeedMgmt ?? '—'}`);
  console.log(`  Culture:        ${company.indeedCulture ?? '—'}`);
  console.log(`  URL:            ${company.indeedUrl ?? '—'}`);
}

main().finally(() => prisma.$disconnect());
