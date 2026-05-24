/**
 * One-off cleanup for the Gemini-503 / parse-error false positives from
 * the May 18 bulk run.
 *
 * That run hit Gemini's "high demand" / UNAVAILABLE 5xx on 14 large-employer
 * companies plus 2 parse errors, and the OLD code stamped them all as
 * failureCount=1. With the new GeminiServiceUnavailableError path the 5xx
 * case will never happen again, but the already-stamped rows would still
 * be carried through escalation tomorrow and risk hitting failureCount=2
 * ('given up') if pro also blips.
 *
 * This script resets failureCount=0 ONLY for the companies whose names are
 * in the explicit allow-list below. We can't use a time-window heuristic
 * because the same run also had 8 legitimate "model said notFound"
 * outcomes (Liveblocks, PostHog etc.) where failureCount=1 IS correct.
 *
 * Default = dry-run. Pass --apply to actually reset.
 */
import { prisma } from '../src/lib/db';

// Companies whose May 18 bulk attempt was a 503 UNAVAILABLE (15) or
// empty-response parse error (2 — Akuna Capital, Dream11). Both classes
// of failure are NOT the model saying "no data"; the call never produced
// a real response and shouldn't have stamped the row.
const FALSE_POSITIVES = [
  'Akuna Capital',
  'Box',
  'Capcom',
  'Decagon',
  'Dream11',
  'Dropbox',
  'Glean',
  'Groww',
  'Honasa (Mamaearth)',
  'HubSpot',
  'Jump Trading',
  'Kearney',
  'Lam Research',
  'Mastercard',
  'Stability AI',
  'Wiz',
];

async function main() {
  const apply = process.argv.includes('--apply');

  const targets = await prisma.company.findMany({
    where: {
      name: { in: FALSE_POSITIVES },
      indeedRating: null,
      ratingsFailureCount: { gte: 1 },
    },
    select: {
      id: true,
      name: true,
      ratingsFailureCount: true,
      ratingsLastFetchAttemptAt: true,
    },
    orderBy: [{ name: 'asc' }],
  });

  console.log(`Found ${targets.length} of ${FALSE_POSITIVES.length} targets in DB:`);
  for (const t of targets) {
    console.log(
      `  - ${t.name.padEnd(22)} failureCount=${t.ratingsFailureCount} stamped ${t.ratingsLastFetchAttemptAt?.toISOString() ?? '(none)'}`,
    );
  }
  const missing = FALSE_POSITIVES.filter((n) => !targets.find((t) => t.name === n));
  if (missing.length > 0) {
    console.log(`  Not found (already rescued or never had failureCount>=1): ${missing.join(', ')}`);
  }

  if (!apply) {
    console.log(`\nDry-run. Re-run with --apply to reset failureCount=0 on these ${targets.length} rows.`);
    return;
  }

  const result = await prisma.company.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { ratingsFailureCount: 0 },
  });
  console.log(`\n✓ Reset failureCount=0 on ${result.count} rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
