import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { EmptyState } from '@/components/ui/EmptyState';
import { OffersList, type OfferRow } from '@/components/OffersList';

/**
 * Dedicated index of every offer the signed-in user has saved (excluding the
 * current role, which has its own page at `/current`). Mirrors the structure
 * of `/comparisons` so the nav stays consistent.
 */
export default async function OffersIndexPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect('/auth/signin');

  const offers = await prisma.jobOffer.findMany({
    where: { userId, isCurrent: false },
    include: { company: true, compensation: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Offers' }]}
      />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Offers</h1>
          <p className="text-sm text-[rgb(var(--muted-foreground))]">
            {offers.length} offer{offers.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link href="/offers/new" className="btn-primary">
          New offer
        </Link>
      </header>

      {offers.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No offers yet"
          description="Add an offer to start comparing it against your current role and other offers."
          action={
            <Link href="/offers/new" className="btn-primary">
              Add an offer
            </Link>
          }
        />
      ) : (
        <OffersList
          items={offers.map<OfferRow>((o) => ({
            id: o.id,
            companyName: o.company.name,
            title: o.title,
            level: o.level,
            location: o.location,
            baseSalary: o.compensation?.baseSalary ?? null,
            equityTotal: o.compensation?.equityTotal ?? null,
            signOnBonus: o.compensation?.signOnBonus ?? null,
          }))}
        />
      )}
    </div>
  );
}
