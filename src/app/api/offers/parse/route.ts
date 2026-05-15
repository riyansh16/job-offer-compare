import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { extractOfferFromFile, type ExtractedOffer } from '@/lib/ai/extract';

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

  return NextResponse.json({
    ok: true,
    data: result.data,
    matchedCompanyId,
  } satisfies ParseResponse);
}

export interface ParseResponse {
  ok: true;
  data: ExtractedOffer;
  matchedCompanyId: string | null;
}

/**
 * Best-effort case-insensitive match against the Company catalog.
 * Tries exact match first, then a "starts with" match to catch variants like
 * "Google LLC" → "Google".
 */
async function matchCompanyId(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const exact = await prisma.company.findFirst({
    where: { name: { equals: trimmed, mode: 'insensitive' } },
    select: { id: true },
  });
  if (exact) return exact.id;

  // Try the head word(s) — e.g. extract "Google" from "Google LLC".
  const head = trimmed.replace(/\s+(LLC|Inc\.?|Ltd\.?|Pvt\.?|Private|Limited|Corp\.?|Corporation|GmbH|AG|SA|BV)$/i, '').trim();
  if (head && head !== trimmed) {
    const headMatch = await prisma.company.findFirst({
      where: { name: { equals: head, mode: 'insensitive' } },
      select: { id: true },
    });
    if (headMatch) return headMatch.id;
  }

  const starts = await prisma.company.findFirst({
    where: { name: { startsWith: trimmed, mode: 'insensitive' } },
    select: { id: true },
  });
  return starts?.id ?? null;
}
