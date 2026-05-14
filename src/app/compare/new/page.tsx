import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Scale } from 'lucide-react';
import { prisma } from '@/lib/db';
import { ensurePresetWeightProfiles } from '@/lib/actions';
import { CompareWizard } from '@/components/CompareWizard';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { EmptyState } from '@/components/ui/EmptyState';

export default async function NewComparePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect('/auth/signin');
  await ensurePresetWeightProfiles(userId);

  const [offers, profiles] = await Promise.all([
    prisma.jobOffer.findMany({
      where: { userId },
      include: { company: { select: { id: true, name: true, tickerSymbol: true } } },
      orderBy: [{ isCurrent: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.weightProfile.findMany({
      where: { OR: [{ userId }, { isPreset: true }] },
      orderBy: [{ isPreset: 'desc' }, { name: 'asc' }],
    }),
  ]);

  if (offers.length < 2) {
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'New comparison' },
          ]}
        />
        <EmptyState
          icon={Scale}
          title="You need at least 2 offers to run a comparison"
          description={`You currently have ${offers.length} offer${offers.length === 1 ? '' : 's'}. Add another to start comparing.`}
          action={
            <Link href="/offers/new" className="btn-primary">
              Add an offer
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'New comparison' },
        ]}
      />
      <h1 className="text-2xl font-semibold">New comparison</h1>
      <CompareWizard
        offers={offers.map((o) => ({
          id: o.id,
          companyName: o.company.name,
          title: o.title,
          location: o.location,
          isCurrent: o.isCurrent,
          ticker: o.company.tickerSymbol,
          companyId: o.company.id,
        }))}
        profiles={profiles.map((p) => ({
          id: p.id,
          name: p.name,
          isPreset: p.isPreset,
          weights: p.weights,
        }))}
      />
    </div>
  );
}
