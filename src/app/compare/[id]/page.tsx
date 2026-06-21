import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { ComparisonResult } from '@/lib/engine/types';
import { ComparisonResults } from '@/components/ComparisonResults';
import { AiInsightsPanel } from '@/components/AiInsightsPanel';
import { DeleteComparisonButton } from '@/components/DeleteOfferButton';
import { LayoffSignals } from '@/components/LayoffSignals';
import { LeetcodeCompLinks } from '@/components/LeetcodeCompLinks';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { ClientDate } from '@/components/ui/ClientDate';
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

  // Fetch the offers + company info + the user's stored years-of-experience
  // in one round-trip. Both LayoffSignals and LeetcodeCompLinks reuse this.
  const offerIds = c.offerIdsCsv.split(',').filter(Boolean);
  const [offers, user] = await Promise.all([
    prisma.jobOffer.findMany({
      where: { id: { in: offerIds } },
      select: {
        id: true,
        title: true,
        level: true,
        isCurrent: true,
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
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { yearsExperience: true },
    }),
  ]);

  // Preserve the user's original offer order; dedupe companies for the
  // layoff banner (same company could appear in two offers in the same
  // comparison), but keep per-offer rows for LeetCode (offer-by-offer view).
  const seen = new Set<string>();
  const layoffCompanies: NonNullable<(typeof offers)[number]['company']>[] = [];
  const compTargets: {
    offerId: string;
    companyName: string;
    title: string;
    level: string | null;
    isCurrent: boolean;
  }[] = [];
  for (const oid of offerIds) {
    const o = offers.find((x) => x.id === oid);
    if (!o) continue;
    if (!seen.has(o.company.id)) {
      seen.add(o.company.id);
      layoffCompanies.push(o.company);
    }
    compTargets.push({
      offerId: o.id,
      companyName: o.company.name,
      title: o.title,
      level: o.level,
      isCurrent: o.isCurrent,
    });
  }

  const aiEnabled = isAiEnabled();

  // Build a one-line summary of which equity-growth assumption was applied
  // per company. With the new default (no auto-CAGR), this makes it explicit
  // when the user left the assumption at 0% vs. when they applied a CAGR.
  const growthSummary = snapshot.results
    .map((r) => {
      const pct = r.equityGrowthAppliedPct ?? 0;
      const src = r.equityGrowthSource ?? 'none';
      if (src === 'none' || pct === 0) {
        return `${r.companyName}: 0% (default)`;
      }
      const sign = pct > 0 ? '+' : '';
      const label = src === 'cagr' ? 'CAGR' : 'manual';
      return `${r.companyName}: ${sign}${pct.toFixed(1)}% (${label})`;
    })
    .join(' · ');
  const anyGrowthApplied = snapshot.results.some(
    (r) => (r.equityGrowthAppliedPct ?? 0) !== 0 && r.equityGrowthSource !== 'none',
  );

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Comparisons', href: '/comparisons' },
          { label: c.name },
        ]}
      />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{c.name}</h1>
          <p className="text-sm text-[rgb(var(--muted-foreground))]">
            Created <ClientDate value={c.createdAt} />
          </p>
        </div>
        <DeleteComparisonButton id={c.id} />
      </header>

      <ComparisonResults
        snapshot={snapshot}
        afterVerdict={
          <div
            className={`card text-sm ${
              anyGrowthApplied
                ? 'border-l-4 border-l-[rgb(var(--primary))] bg-[rgb(var(--primary))]/5'
                : ''
            }`}
          >
            <div className="font-medium">Equity-growth assumptions applied</div>
            <div className="mt-1 text-[rgb(var(--muted-foreground))]">{growthSummary}</div>
            {!anyGrowthApplied && (
              <div className="mt-1 text-[11px] text-[rgb(var(--muted-foreground))]">
                No growth applied — equity values were used as you entered them. Re-run a new
                comparison to model stock-price growth.
              </div>
            )}
          </div>
        }
      />

      <LayoffSignals companies={layoffCompanies} />

      <LeetcodeCompLinks
        companies={compTargets}
        yearsExperience={user?.yearsExperience ?? null}
      />

      {aiEnabled && <AiInsightsPanel comparisonId={c.id} />}

      <nav className="flex flex-wrap gap-2 border-t pt-4">
        <Link href="/dashboard" className="btn-primary">← Back to dashboard</Link>
        <Link href="/compare/new" className="btn-outline">New comparison</Link>
        <Link href="/offers/new" className="btn-ghost">Add another offer</Link>
      </nav>
    </div>
  );
}
