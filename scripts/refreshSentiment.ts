/**
 * Refresh community sentiment (Reddit + Hacker News) for the entire catalog.
 *
 * The runner normally refreshes sentiment lazily when a company appears in a
 * comparison (see `src/lib/engine/runner.ts`), but that leaves long-tail
 * companies with empty panels until someone happens to compare them. This
 * script walks every company once so the per-company page shows data.
 *
 * Usage:
 *   npm run db:refresh-sentiment                    # stalest first, skip fresh (< 30d)
 *   npm run db:refresh-sentiment -- --force         # re-fetch even fresh rows
 *   npm run db:refresh-sentiment -- --only-missing  # only companies with zero sentiment rows
 *   npm run db:refresh-sentiment -- --interval-ms=1500
 *   npm run db:refresh-sentiment -- --concurrency=3
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { refreshCompanySentiment } from '../src/lib/providers/review';

function getFlag(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const n = parseInt(arg.split('=')[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function main() {
  const force = process.argv.includes('--force');
  const onlyMissing = process.argv.includes('--only-missing');
  const intervalMs = getFlag('interval-ms', 1500);
  const concurrency = Math.max(1, getFlag('concurrency', 1));

  // Pull all companies; if --only-missing, filter to those with zero
  // ReviewSentiment rows. Otherwise process stalest-first so a resumed run
  // picks up where it left off.
  const allCompanies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      sentiments: { select: { fetchedAt: true } },
    },
  });

  const companies = (onlyMissing
    ? allCompanies.filter((c) => c.sentiments.length === 0)
    : allCompanies
  ).sort((a, b) => {
    const oldest = (c: { sentiments: { fetchedAt: Date }[] }) =>
      c.sentiments.length === 0
        ? 0
        : Math.min(...c.sentiments.map((s) => new Date(s.fetchedAt).getTime()));
    return oldest(a) - oldest(b);
  });

  console.log(
    onlyMissing
      ? `Refreshing sentiment for ${companies.length} of ${allCompanies.length} companies (--only-missing)`
      : `Refreshing sentiment for ${companies.length} companies (stalest first)${force ? ' --force' : ''}`,
  );
  if (concurrency > 1) {
    console.log(`Concurrency: ${concurrency} parallel calls per batch.`);
  }

  let ok = 0;
  let empty = 0;
  let failed = 0;
  const n = companies.length;
  const pad = String(n).length;

  for (let i = 0; i < companies.length; i += concurrency) {
    const batch = companies.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (c, j) => {
        const idx = i + j + 1;
        try {
          const rows = await refreshCompanySentiment(c.id, force);
          if (rows.length === 0) {
            empty++;
            console.log(`  [${String(idx).padStart(pad)}/${n}] ~ ${c.name} (no sources returned data)`);
          } else {
            ok++;
            const summary = rows
              .map((r) => `${r.source} ${r.score.toFixed(2)} n=${r.sampleSize}`)
              .join(', ');
            console.log(`  [${String(idx).padStart(pad)}/${n}] ✓ ${c.name} — ${summary}`);
          }
        } catch (e) {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  [${String(idx).padStart(pad)}/${n}] ✗ ${c.name} — ${msg}`);
        }
      }),
    );
    if (i + concurrency < companies.length && intervalMs > 0) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  console.log('\nDone:');
  console.log(`  With data: ${ok}`);
  console.log(`  Empty:     ${empty}`);
  console.log(`  Failed:    ${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
