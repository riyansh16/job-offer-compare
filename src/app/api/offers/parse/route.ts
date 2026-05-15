import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { extractOfferFromFile, type ExtractedOffer } from '@/lib/ai/extract';
import { getFxRate } from '@/lib/providers/fxRate';

// We need Node runtime for Buffer + the @google/genai SDK.
export const runtime = 'nodejs';
// Parsing one upload at a time is fine; never cache.
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Accepts multipart/form-data with field "file" — a PDF or image of an offer
 * letter. Returns the extracted fields plus, when possible, the matched
 * company id from our catalog so the form can pre-select it.
 *
 * Money values are returned in their detected currency. The form is INR-only,
 * so the client decides whether to apply them (when currency is INR / unknown)
 * or only show them as a hint.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return NextResponse.json(
      { error: 'Expected multipart/form-data with a "file" field.' },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Could not parse upload.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB).` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractOfferFromFile(buffer, file.type || 'application/octet-stream');

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  const matchedCompanyId = result.data.companyName
    ? await matchCompanyId(result.data.companyName)
    : null;

  // Convert any foreign-currency money fields to INR so the form can prefill
  // them. We attach a `conversion` block explaining each conversion so the
  // UI can show an audit trail (e.g. "Converted from $18,750 at ₹85.20/USD").
  const { data, conversions } = await convertMoneyFieldsToInr(result.data);

  return NextResponse.json({
    ok: true,
    data,
    matchedCompanyId,
    conversions,
  } satisfies ParseResponse);
}

export interface ConversionRecord {
  field: 'baseSalary' | 'signOnBonus' | 'equityTotal' | 'benefitsValueAnnual';
  fromCurrency: string;
  fromValue: number;
  toValue: number;
  rate: number;
}

export interface ParseResponse {
  ok: true;
  data: ExtractedOffer;
  matchedCompanyId: string | null;
  conversions: ConversionRecord[];
}

const MONEY_FIELDS = [
  'baseSalary',
  'signOnBonus',
  'benefitsValueAnnual',
] as const satisfies ReadonlyArray<ConversionRecord['field']>;

/**
 * Convert any money fields whose detected currency is not INR into INR using
 * Yahoo Finance spot rates. Money fields that share `currency` (base salary,
 * sign-on, benefits) are converted with the base FX rate; `equityTotal` uses
 * `equityCurrency` when present (RSUs commonly USD on an INR base offer).
 *
 * If a conversion fails (unknown currency / network error), the field is
 * dropped so the user has to enter it manually — better than silently writing
 * a wrong number.
 */
async function convertMoneyFieldsToInr(
  raw: ExtractedOffer,
): Promise<{ data: ExtractedOffer; conversions: ConversionRecord[] }> {
  const data: ExtractedOffer = { ...raw };
  const conversions: ConversionRecord[] = [];

  const baseCurrency = data.currency?.toUpperCase();
  if (baseCurrency && baseCurrency !== 'INR') {
    const quote = await getFxRate(baseCurrency, 'INR');
    if (!quote) {
      // Drop money fields we can't convert; let the user fill manually.
      for (const k of MONEY_FIELDS) delete data[k];
    } else {
      for (const k of MONEY_FIELDS) {
        const v = data[k];
        if (typeof v === 'number') {
          const converted = Math.round(v * quote.rate);
          conversions.push({
            field: k,
            fromCurrency: baseCurrency,
            fromValue: v,
            toValue: converted,
            rate: quote.rate,
          });
          data[k] = converted;
        }
      }
      // Base salary etc. are now in INR; reflect that in `currency`.
      data.currency = 'INR';
    }
  }

  // Equity currency is independent (RSUs are often USD even when base is INR).
  const equityCurrency =
    data.equityCurrency?.toUpperCase() ??
    // Fall back to base currency only if it was originally non-INR — once we've
    // already converted base above, data.currency === 'INR' and equity is implicit-INR.
    (raw.currency?.toUpperCase() && !raw.equityCurrency ? raw.currency.toUpperCase() : undefined);
  if (
    typeof data.equityTotal === 'number' &&
    equityCurrency &&
    equityCurrency !== 'INR'
  ) {
    const quote = await getFxRate(equityCurrency, 'INR');
    if (!quote) {
      delete data.equityTotal;
    } else {
      const converted = Math.round(data.equityTotal * quote.rate);
      conversions.push({
        field: 'equityTotal',
        fromCurrency: equityCurrency,
        fromValue: data.equityTotal,
        toValue: converted,
        rate: quote.rate,
      });
      data.equityTotal = converted;
      delete data.equityCurrency;
    }
  }

  return { data, conversions };
}

/**
 * Best-effort case-insensitive match against the Company catalog.
 *
 * Real-world offer letters use legal-entity names like
 * "Microsoft India (R&D) Pvt. Ltd." or "Google India Private Limited"
 * that won't match the short catalog name ("Microsoft", "Google").
 *
 * Strategy (try each in order, return the first hit):
 *   1. Exact case-insensitive match on the raw name.
 *   2. Strip parenthesized parts and corporate suffixes, retry exact.
 *   3. Try the leading N tokens (longest first) — handles "Microsoft India" and
 *      "Microsoft" both mapping to "Microsoft".
 *   4. As a last resort, startsWith on the cleaned name.
 */
async function matchCompanyId(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const findExact = (q: string) =>
    prisma.company.findFirst({
      where: { name: { equals: q, mode: 'insensitive' } },
      select: { id: true },
    });

  // 1. Exact match on the raw extracted name.
  const exact = await findExact(trimmed);
  if (exact) return exact.id;

  // 2. Strip parens content + trailing legal-entity suffixes.
  const SUFFIX_RE =
    /\s+(LLC|Inc\.?|Ltd\.?|Pvt\.?|Private|Limited|Corp\.?|Corporation|Co\.?|Company|GmbH|AG|SA|BV|NV|PLC|LP|LLP|SARL|S\.?A\.?S\.?)$/i;
  let cleaned = trimmed.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  // Strip suffix repeatedly to handle "Pvt. Ltd." (two suffixes).
  for (let i = 0; i < 3; i++) {
    const stripped = cleaned.replace(SUFFIX_RE, '').trim();
    if (stripped === cleaned) break;
    cleaned = stripped;
  }

  if (cleaned && cleaned !== trimmed) {
    const cleanedMatch = await findExact(cleaned);
    if (cleanedMatch) return cleanedMatch.id;
  }

  // 3. Try leading-token prefixes longest-first. "Microsoft India" → "Microsoft".
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  for (let take = tokens.length - 1; take >= 1; take--) {
    const prefix = tokens.slice(0, take).join(' ');
    const m = await findExact(prefix);
    if (m) return m.id;
  }

  // 4. StartsWith fallback against the cleaned name.
  if (cleaned) {
    const starts = await prisma.company.findFirst({
      where: { name: { startsWith: cleaned, mode: 'insensitive' } },
      select: { id: true },
    });
    if (starts) return starts.id;
  }

  return null;
}
