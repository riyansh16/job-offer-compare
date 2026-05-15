import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAiProvider } from '@/lib/ai/provider';
import { buildPrompt } from '@/lib/ai/prompts';
import type { AiInsightKind, ComparisonResult } from '@/lib/engine/types';

const VALID_KINDS: AiInsightKind[] = ['Verdict', 'Tradeoffs', 'Negotiation', 'Questions'];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { kind?: string; force?: boolean };
  const kind = body.kind as AiInsightKind | undefined;
  if (!kind || !VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }

  const comparison = await prisma.comparison.findFirst({ where: { id, userId } });
  if (!comparison) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Cached?
  if (!body.force) {
    const cached = await prisma.aiInsight.findFirst({
      where: { comparisonId: id, kind },
      orderBy: { generatedAt: 'desc' },
    });
    if (cached) {
      return new Response(cached.content, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Cached': 'true' },
      });
    }
  }

  const provider = getAiProvider();
  if (!provider) {
    return NextResponse.json(
      {
        error:
          'AI is not configured. Add GEMINI_API_KEY (free) to .env.local — get a key at https://aistudio.google.com/apikey',
      },
      { status: 503 },
    );
  }

  let snapshot: ComparisonResult;
  try {
    snapshot = JSON.parse(comparison.snapshotJson) as ComparisonResult;
  } catch {
    return NextResponse.json({ error: 'Corrupt comparison snapshot' }, { status: 500 });
  }

  const spec = buildPrompt(kind, { comparison: snapshot });

  const encoder = new TextEncoder();
  let full = '';
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of provider.generate({
          system: spec.system,
          user: spec.user,
          maxTokens: spec.maxTokens,
        })) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        // Persist the completed result. Upsert by (comparisonId, kind) so
        // regenerating an insight replaces the previous one instead of
        // accumulating duplicates. The unique constraint backing this lives
        // in `prisma/schema.prisma` on the AiInsight model.
        await prisma.aiInsight.upsert({
          where: { comparisonId_kind: { comparisonId: id, kind } },
          create: { comparisonId: id, kind, content: full, model: provider.model },
          update: { content: full, model: provider.model, generatedAt: new Date() },
        });
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encoder.encode(`\n\n[AI error: ${msg}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Model': provider.model,
    },
  });
}
