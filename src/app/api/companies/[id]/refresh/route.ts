import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { refreshCompanySentiment } from '@/lib/providers/review';
import { getStockCagr } from '@/lib/providers/stockPrice';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { kind?: 'sentiment' | 'stock'; force?: boolean };
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body.kind === 'stock') {
    if (!company.tickerSymbol) {
      return NextResponse.json({ error: 'No ticker symbol set for this company.' }, { status: 400 });
    }
    const result = await getStockCagr(company.id, company.tickerSymbol);
    return NextResponse.json({ ok: true, result });
  }

  // Default: sentiment.
  const result = await refreshCompanySentiment(company.id, body.force);
  return NextResponse.json({ ok: true, result });
}
