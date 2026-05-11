import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ensurePresetWeightProfiles } from '@/lib/actions';
import { CompareWizard } from '@/components/CompareWizard';

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
      <div className="card text-center text-sm">
        You need at least 2 offers to run a comparison.{' '}
        <a href="/offers/new" className="text-[rgb(var(--primary))] underline">
          Add another offer
        </a>
        .
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
