import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import { Briefcase, FileText, Scale, UserCog } from 'lucide-react';
import { ensurePresetWeightProfiles } from '@/lib/actions';
import { formatMoney } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClientDate } from '@/components/ui/ClientDate';

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect('/auth/signin');

  await ensurePresetWeightProfiles(userId);

  const [offers, comparisons] = await Promise.all([
    prisma.jobOffer.findMany({
      where: { userId },
      include: { company: true, compensation: true },
      orderBy: [{ isCurrent: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.comparison.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const current = offers.find((o) => o.isCurrent) ?? null;
  const otherOffers = offers.filter((o) => !o.isCurrent);
  const canCompare = offers.length >= 2;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-[rgb(var(--muted-foreground))]">
            {current ? '1 current role · ' : 'No current role set · '}
            {otherOffers.length} offer{otherOffers.length === 1 ? '' : 's'} ·{' '}
            {comparisons.length} comparison{comparisons.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/current" className="btn-outline">
            {current ? 'Edit current role' : 'Set current role'}
          </Link>
          <Link href="/offers/new" className="btn-primary">
            New offer
          </Link>
          <Link
            href="/compare/new"
            className={canCompare ? 'btn-outline' : 'btn-outline opacity-50 pointer-events-none'}
            aria-disabled={!canCompare}
          >
            New comparison
          </Link>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Current role</h2>
        {current ? (
          <Link
            href={`/offers/${current.id}`}
            className="card block border-l-4 border-l-[rgb(var(--primary))] transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-semibold">{current.company.name}</div>
                <div className="text-sm text-[rgb(var(--muted-foreground))]">
                  {current.title} {current.level ? `· ${current.level}` : ''} · {current.location}
                </div>
              </div>
              <span className="badge bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]">Current</span>
            </div>
            {current.compensation && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                <Stat label="Base" value={formatMoney(current.compensation.baseSalary, 'INR', { compact: true })} />
                <Stat label="Bonus %" value={`${current.compensation.targetBonusPct}%`} />
                <Stat label="Equity" value={formatMoney(current.compensation.equityTotal, 'INR', { compact: true })} />
                <Stat label="Mode" value={current.compensation.workMode} />
              </div>
            )}
          </Link>
        ) : (
          <EmptyState
            icon={UserCog}
            title="No current role set yet"
            description="Set up your current job once. It becomes the baseline shown by default in every comparison."
            action={
              <Link href="/current" className="btn-primary">
                Set current role
              </Link>
            }
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent offers</h2>
          {otherOffers.length > 0 && (
            <Link href="/offers" className="btn-ghost text-xs">
              View all ({otherOffers.length}) →
            </Link>
          )}
        </div>
        {otherOffers.length === 0 ? (
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
            {otherOffers.slice(0, 4).map((o) => (
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
                    <Stat label="Base" value={formatMoney(o.compensation.baseSalary, 'INR', { compact: true })} />
                    <Stat label="Equity" value={formatMoney(o.compensation.equityTotal, 'INR', { compact: true })} />
                    <Stat label="Sign-on" value={formatMoney(o.compensation.signOnBonus, 'INR', { compact: true })} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent comparisons</h2>
          {comparisons.length > 0 && (
            <Link href="/comparisons" className="btn-ghost text-xs">
              View all ({comparisons.length}) →
            </Link>
          )}
        </div>
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
          <ul className="divide-y rounded-lg border bg-[rgb(var(--card))]">
            {comparisons.slice(0, 3).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/compare/${c.id}`}
                  className="group flex items-center justify-between gap-3 p-4 transition-colors hover:bg-[rgb(var(--muted))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
                >
                  <div className="min-w-0">
                    <div className="font-medium group-hover:underline">{c.name}</div>
                    <div className="text-xs text-[rgb(var(--muted-foreground))]">
                      {c.offerIdsCsv.split(',').length} offers ·{' '}
                      <ClientDate value={c.createdAt} />
                    </div>
                  </div>
                  <span
                    aria-hidden
                    className="text-[rgb(var(--muted-foreground))] transition-transform group-hover:translate-x-0.5 group-hover:text-[rgb(var(--foreground))]"
                  >
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
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
