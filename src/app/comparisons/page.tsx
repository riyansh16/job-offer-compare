import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Scale, FileText } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ComparisonsList, type ComparisonRow } from '@/components/ComparisonsList';

/**
 * Dedicated index of every saved comparison for the signed-in user. The
 * dashboard shows only a short preview; this page is the canonical "all
 * comparisons" view linked from the top-nav and from breadcrumbs on the
 * comparison detail page.
 */
export default async function ComparisonsIndexPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect('/auth/signin');

  // Pull comparisons + the offer count needed only for display. We could
  // include offers via a relation, but the count is encoded in `offerIdsCsv`
  // already — splitting it client-side keeps this query cheap.
  const [comparisons, offerCount] = await Promise.all([
    prisma.comparison.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.jobOffer.count({ where: { userId } }),
  ]);

  const canCompare = offerCount >= 2;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Comparisons' }]}
      />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Comparisons</h1>
          <p className="text-sm text-[rgb(var(--muted-foreground))]">
            {comparisons.length} saved comparison{comparisons.length === 1 ? '' : 's'}
          </p>
        </div>
        {canCompare && (
          <Link href="/compare/new" className="btn-primary">
            New comparison
          </Link>
        )}
      </header>

      {comparisons.length === 0 ? (
        <EmptyState
          icon={canCompare ? Scale : FileText}
          title="No comparisons yet"
          description={
            canCompare
              ? 'Run a side-by-side comparison of any 2 or more offers to see weighted scoring and AI insights.'
              : 'You need at least 2 offers (a current role counts) to run a comparison.'
          }
          action={
            canCompare ? (
              <Link href="/compare/new" className="btn-primary">
                Run your first comparison
              </Link>
            ) : (
              <Link href="/offers/new" className="btn-primary">
                Add another offer
              </Link>
            )
          }
        />
      ) : (
        <ComparisonsList
          items={comparisons.map<ComparisonRow>((c) => ({
            id: c.id,
            name: c.name,
            createdAt: c.createdAt.toISOString(),
            offerCount: c.offerIdsCsv.split(',').filter(Boolean).length,
          }))}
        />
      )}
    </div>
  );
}
