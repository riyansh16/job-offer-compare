/**
 * One-off CLI: extracts offer fields from a local file using the same code
 * the /api/offers/parse route uses. Prints the raw extractor result and
 * simulates what the form would actually prefill (after the INR-currency
 * safety filter that drops foreign-currency money fields).
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/probeOfferExtract.ts "C:\path\to\file.pdf"
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractOfferFromFile } from '../src/lib/ai/extract';
import { getFxRate } from '../src/lib/providers/fxRate';

function mimeFromExt(p: string): string {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: tsx scripts/probeOfferExtract.ts <path-to-file>');
    process.exit(1);
  }
  const abs = path.resolve(file);
  const buf = await readFile(abs);
  const mime = mimeFromExt(abs);
  console.log(`\nFile:      ${abs}`);
  console.log(`Mime:      ${mime}`);
  console.log(`Size:      ${(buf.byteLength / 1024).toFixed(1)} KB\n`);

  const result = await extractOfferFromFile(buf, mime);
  if (!result.ok) {
    console.error('Extraction failed:', result);
    process.exit(2);
  }

  console.log('--- Raw extracted JSON ---');
  console.log(JSON.stringify(result.data, null, 2));

  // Mirror the API route's FX conversion so we can show the user-visible result.
  const data = { ...result.data };
  const conversions: Array<{ field: string; from: string; fromVal: number; to: number; rate: number }> = [];
  const moneyKeys = ['baseSalary', 'signOnBonus', 'benefitsValueAnnual'] as const;

  const baseCurrency = data.currency?.toUpperCase();
  if (baseCurrency && baseCurrency !== 'INR') {
    const q = await getFxRate(baseCurrency, 'INR');
    if (q) {
      for (const k of moneyKeys) {
        const v = data[k];
        if (typeof v === 'number') {
          const conv = Math.round(v * q.rate);
          conversions.push({ field: k, from: baseCurrency, fromVal: v, to: conv, rate: q.rate });
          data[k] = conv;
        }
      }
      data.currency = 'INR';
    } else {
      for (const k of moneyKeys) delete data[k];
    }
  }
  const equityCurrency = data.equityCurrency?.toUpperCase();
  if (typeof data.equityTotal === 'number' && equityCurrency && equityCurrency !== 'INR') {
    const q = await getFxRate(equityCurrency, 'INR');
    if (q) {
      const conv = Math.round(data.equityTotal * q.rate);
      conversions.push({
        field: 'equityTotal',
        from: equityCurrency,
        fromVal: data.equityTotal,
        to: conv,
        rate: q.rate,
      });
      data.equityTotal = conv;
      delete data.equityCurrency;
    } else {
      delete data.equityTotal;
    }
  }

  console.log('\n--- What the form would prefill (after FX) ---');
  console.log(JSON.stringify(data, null, 2));
  if (conversions.length) {
    console.log('\n--- Conversions ---');
    for (const c of conversions) {
      console.log(
        `  ${c.field}: ${c.from} ${c.fromVal.toLocaleString('en-US')} → ` +
          `₹${c.to.toLocaleString('en-IN')} (rate ${c.rate.toFixed(2)} ${c.from}/INR)`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
