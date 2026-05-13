import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStockCagr } from '@/lib/providers/stockPrice';

/**
 * Manual refresh endpoint exposed on the company page.
 *
 * Only the cheap, free, public Yahoo-Finance stock fetch is exposed here.
 * Sentiment (Reddit + HackerNews) auto-refreshes when stale during a real
 * comparison run (see `src/lib/engine/runner.ts`), so we don't need a manual
 * button — and exposing one to every signed-in user invites scraping abuse.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { kind?: 'stock' };

  if (body.kind !== 'stock') {
    return NextResponse.json({ error: 'Unsupported refresh kind.' }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!company.tickerSymbol) {
    return NextResponse.json({ error: 'No ticker symbol set for this company.' }, { status: 400 });
  }

  const result = await getStockCagr(company.id, company.tickerSymbol);
  return NextResponse.json({ ok: true, result });
}
