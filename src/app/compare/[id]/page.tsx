import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { ComparisonResult } from '@/lib/engine/types';
import { ComparisonResults } from '@/components/ComparisonResults';
import { AiInsightsPanel } from '@/components/AiInsightsPanel';
import { DeleteComparisonButton } from '@/components/DeleteOfferButton';
import { isAiEnabled } from '@/lib/ai/provider';

export default async function ComparisonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect('/auth/signin');

  const c = await prisma.comparison.findFirst({ where: { id, userId } });
  if (!c) notFound();

  let snapshot: ComparisonResult;
  try {
    snapshot = JSON.parse(c.snapshotJson) as ComparisonResult;
  } catch {
    return <div className="card text-sm text-[rgb(var(--danger))]">Comparison snapshot is corrupt.</div>;
  }

  const aiEnabled = isAiEnabled();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{c.name}</h1>
          <p className="text-sm text-[rgb(var(--muted-foreground))]">
            Created {new Date(c.createdAt).toLocaleString()} ·
            Equity growth assumption {snapshot.equityGrowthPct.toFixed(1)}%
          </p>
        </div>
        <DeleteComparisonButton id={c.id} />
      </header>

      <ComparisonResults snapshot={snapshot} />

      {aiEnabled && <AiInsightsPanel comparisonId={c.id} />}

      <nav className="flex flex-wrap gap-2 border-t pt-4">
        <Link href="/dashboard" className="btn-primary">← Back to dashboard</Link>
        <Link href="/compare/new" className="btn-outline">New comparison</Link>
        <Link href="/offers/new" className="btn-ghost">Add another offer</Link>
      </nav>
    </div>
  );
}
