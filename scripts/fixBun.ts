/**
 * One-off fix for the "Bun" row: the bulk run matched it to a sandwich shop
 * (`indeed.com/cmp/Bun-Mee`). Call the fetcher with a disambiguated name
 * so Gemini grounds the JS runtime instead.
 *
 * Usage: npx tsx --env-file=.env.local scripts/fixBun.ts
 */
process.env.GEMINI_RATINGS_MODEL ??= 'gemini-2.5-flash';
process.env.LLM_RATINGS_DEBUG ??= '1';

import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { fetchLlmRatings } from '../src/lib/providers/llmRatings';

async function main() {
  const company = await prisma.company.findFirst({ where: { slug: 'oven' } });
  if (!company) {
    console.error('No company with slug=oven found.');
    process.exit(1);
  }
  console.log(`Re-fetching ratings for "${company.name}" (slug=${company.slug})...`);
  console.log(`Current URL: ${company.indeedUrl ?? '—'}`);

  // Disambiguated name so the model doesn't latch onto unrelated "Bun" pages.
  const disambiguated = 'Bun (open-source JavaScript runtime by Oven)';
  const r = await fetchLlmRatings(disambiguated, {
    hqLocation: company.hqLocation,
  });

  if (!r) {
    console.error('Fetcher returned null. Nothing changed.');
    return;
  }
  console.log('\nResult:');
  console.log(JSON.stringify(r, null, 2));

  if (r.indeedRating == null) {
    console.log('\n⚠️ Still no rating — Bun likely has no usable Indeed page.');
    console.log('   Clearing stored wrong URL so future runs do not display it.');
    await prisma.company.update({
      where: { id: company.id },
      data: {
        indeedUrl: null,
        ratingsLastFetchAttemptAt: new Date(),
      },
    });
    return;
  }

  await prisma.company.update({
    where: { id: company.id },
    data: {
      indeedRating: r.indeedRating,
      indeedReviewCount: r.indeedReviewCount,
      indeedCompBenefits: r.indeedCompBenefits,
      indeedWLB: r.indeedWLB,
      indeedJobSecurity: r.indeedJobSecurity,
      indeedMgmt: r.indeedMgmt,
      indeedCulture: r.indeedCulture,
      indeedUrl: r.indeedUrl,
      ratingsUpdatedAt: new Date(),
      ratingsLastFetchAttemptAt: new Date(),
    },
  });
  console.log(`\n✓ Saved Bun rating: ${r.indeedRating} (URL: ${r.indeedUrl})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
