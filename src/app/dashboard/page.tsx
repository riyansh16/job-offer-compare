import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import { Briefcase, FileText, Scale, UserCog } from 'lucide-react';
import { ensurePresetWeightProfiles } from '@/lib/actions';
import { formatMoney } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';

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
                <Stat label={`Base (${current.compensation.currency})`} value={formatMoney(current.compensation.baseSalary, current.compensation.currency, { compact: true })} />
                <Stat label="Bonus %" value={`${current.compensation.targetBonusPct}%`} />
                <Stat label="Equity" value={formatMoney(current.compensation.equityTotal, current.compensation.currency, { compact: true })} />
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
        <h2 className="text-lg font-semibold">Offers</h2>
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
            {otherOffers.map((o) => (
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
                    <Stat label={`Base (${o.compensation.currency})`} value={formatMoney(o.compensation.baseSalary, o.compensation.currency, { compact: true })} />
                    <Stat label="Equity" value={formatMoney(o.compensation.equityTotal, o.compensation.currency, { compact: true })} />
                    <Stat label="Sign-on" value={formatMoney(o.compensation.signOnBonus, o.compensation.currency, { compact: true })} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Saved comparisons</h2>
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
            {comparisons.map((c) => (
              <li key={c.id} className="flex items-center justify-between p-4">
                <div>
                  <Link href={`/compare/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-xs text-[rgb(var(--muted-foreground))]">
                    {c.offerIdsCsv.split(',').length} offers · {new Date(c.createdAt).toLocaleString()}
                  </div>
                </div>
                <Link href={`/compare/${c.id}`} className="btn-ghost">
                  Open
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
