import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { ComparisonResult } from '@/lib/engine/types';
import { ComparisonResults } from '@/components/ComparisonResults';
import { AiInsightsPanel } from '@/components/AiInsightsPanel';
import { DeleteComparisonButton } from '@/components/DeleteOfferButton';
import { LayoffSignals } from '@/components/LayoffSignals';
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

  // Pull layoff signal data per company in the snapshot. Looked up live (not
  // baked into the snapshot) so refreshed layoff data shows up on revisit
  // without re-running the comparison.
  const offerIds = c.offerIdsCsv.split(',').filter(Boolean);
  const offers = await prisma.jobOffer.findMany({
    where: { id: { in: offerIds } },
    select: {
      id: true,
      company: {
        select: {
          id: true,
          name: true,
          layoffsLast12mPct: true,
          layoffsAsOf: true,
          layoffsSourceUrl: true,
        },
      },
    },
  });
  // Preserve the user's original offer order; dedupe companies (same company
  // could appear in two offers in the same comparison).
  const seen = new Set<string>();
  const layoffCompanies: NonNullable<(typeof offers)[number]['company']>[] = [];
  for (const oid of offerIds) {
    const co = offers.find((o) => o.id === oid)?.company;
    if (co && !seen.has(co.id)) {
      seen.add(co.id);
      layoffCompanies.push(co);
    }
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

      <LayoffSignals companies={layoffCompanies} />

      {aiEnabled && <AiInsightsPanel comparisonId={c.id} />}

      <nav className="flex flex-wrap gap-2 border-t pt-4">
        <Link href="/dashboard" className="btn-primary">← Back to dashboard</Link>
        <Link href="/compare/new" className="btn-outline">New comparison</Link>
        <Link href="/offers/new" className="btn-ghost">Add another offer</Link>
      </nav>
    </div>
  );
}
