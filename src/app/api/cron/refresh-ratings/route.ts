/**
 * Protected daily-cron endpoint for the rating refresh batch.
 *
 * Auth: HTTP header `Authorization: Bearer ${CRON_SECRET}`.
 * Without auth, anyone could spam this and burn the Gemini quota.
 *
 * Query params:
 *   ?n=5         batch size (default 5, max 200)
 *   ?all=1       refresh every company in catalog regardless of staleness
 *
 * Designed for: Vercel Cron, GitHub Actions, or any HTTP scheduler.
 */
import { NextResponse } from 'next/server';
import { refreshRatingsBatch } from '@/lib/jobs/refreshRatingsBatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min upper bound for serverless platforms

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured on the server' },
      { status: 500 },
    );
  }
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const nRaw = Number(url.searchParams.get('n') ?? '5');
  const n = Number.isFinite(nRaw) && nRaw > 0 ? Math.min(200, Math.floor(nRaw)) : 5;
  const refreshAll = url.searchParams.get('all') === '1';

  const result = await refreshRatingsBatch({
    batchSize: n,
    refreshAll,
  });

  return NextResponse.json(result);
}
