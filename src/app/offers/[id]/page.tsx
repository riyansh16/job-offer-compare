import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { OfferForm } from '@/components/OfferForm';
import { DeleteOfferButton, SetAsCurrentButton } from '@/components/DeleteOfferButton';
import { OfferEditToggle } from '@/components/OfferEditToggle';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { formatMoney } from '@/lib/utils';

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect('/auth/signin');

  const offer = await prisma.jobOffer.findFirst({
    where: { id, userId },
    include: { compensation: true, company: true },
  });
  if (!offer || !offer.compensation) notFound();

  // Find comparisons that included this offer (offerIdsCsv stores comma-separated ids).
  const allComparisons = await prisma.comparison.findMany({
    where: { userId },
    select: { id: true, name: true, createdAt: true, offerIdsCsv: true },
    orderBy: { createdAt: 'desc' },
  });
  const usedIn = allComparisons.filter((c) =>
    c.offerIdsCsv.split(',').includes(offer.id),
  );

  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
  const c = offer.compensation;
  let vest;
  try {
    vest = JSON.parse(c.equityVestSchedule);
  } catch {
    vest = { years: 4, cliffMonths: 12, cadence: 'quarterly' };
  }

  const summaryView = (
    <section className="card grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      <Stat label="Base" value={formatMoney(c.baseSalary, 'INR')} />
      <Stat label="Bonus %" value={`${c.targetBonusPct}%`} />
      <Stat label="Sign-on" value={formatMoney(c.signOnBonus, 'INR')} />
      <Stat label="Equity / yr" value={formatMoney(c.equityTotal, 'INR')} />
      <Stat label="Benefits" value={formatMoney(c.benefitsValueAnnual, 'INR')} />
      <Stat label="Mode" value={c.workMode} />
      <Stat label="Growth/fit" value={`${c.qualitativeScore}/100`} />
    </section>
  );

  const editForm = (
    <section className="card">
      <h2 className="mb-3 font-semibold">Edit offer</h2>
      <OfferForm
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        initial={{
          id: offer.id,
          companyId: offer.companyId,
          title: offer.title,
          level: offer.level ?? '',
          location: offer.location,
          isCurrent: offer.isCurrent,
          baseSalary: c.baseSalary,
          targetBonusPct: c.targetBonusPct,
          signOnBonus: c.signOnBonus,
          equityTotal: c.equityTotal,
          benefitsValueAnnual: c.benefitsValueAnnual,
          ptoDays: c.ptoDays,
          workMode: c.workMode,
          commuteCostMonthly: c.commuteCostMonthly,
          qualitativeScore: c.qualitativeScore,
          vestYears: vest.years,
          vestCliffMonths: vest.cliffMonths,
          vestCadence: vest.cadence,
          vestBackloaded: vest.backloaded,
        }}
      />
    </section>
  );

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Offers', href: '/dashboard' },
          { label: offer.company.name },
        ]}
      />
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{offer.company.name}</h1>
          <p className="text-sm text-[rgb(var(--muted-foreground))]">
            {offer.title}
            {offer.level ? ` · ${offer.level}` : ''} · {offer.location} ·{' '}
            <Link href={`/companies/${offer.company.slug}`} className="underline">
              View company
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SetAsCurrentButton offerId={offer.id} isCurrent={offer.isCurrent} />
          <DeleteOfferButton offerId={offer.id} />
        </div>
      </header>

      <OfferEditToggle summary={summaryView} edit={editForm} />

      {usedIn.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">
            Used in {usedIn.length} comparison{usedIn.length === 1 ? '' : 's'}
          </h2>
          <ul className="divide-y">
            {usedIn.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/compare/${u.id}`} className="hover:underline">
                  {u.name}
                </Link>
                <span className="text-xs text-[rgb(var(--muted-foreground))]">
                  {new Date(u.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-[rgb(var(--muted-foreground))]">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
