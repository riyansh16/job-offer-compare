import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatMoney } from '@/lib/utils';

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
        <div className="grid gap-3 sm:grid-cols-2">
          {offers.map((o) => (
            <Link
              key={o.id}
              href={`/offers/${o.id}`}
              className="card block transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold">{o.company.name}</div>
                  <div className="text-sm text-[rgb(var(--muted-foreground))]">
                    {o.title} {o.level ? `· ${o.level}` : ''} · {o.location}
                  </div>
                </div>
              </div>
              {o.compensation && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Stat
                    label="Base"
                    value={formatMoney(o.compensation.baseSalary, 'INR', { compact: true })}
                  />
                  <Stat
                    label="Equity"
                    value={formatMoney(o.compensation.equityTotal, 'INR', { compact: true })}
                  />
                  <Stat
                    label="Sign-on"
                    value={formatMoney(o.compensation.signOnBonus, 'INR', { compact: true })}
                  />
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[rgb(var(--muted-foreground))]">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
