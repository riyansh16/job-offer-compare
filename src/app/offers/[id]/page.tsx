import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { OfferForm } from '@/components/OfferForm';
import { DeleteOfferButton, SetAsCurrentButton } from '@/components/DeleteOfferButton';
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

  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
  const c = offer.compensation;
  let vest;
  try {
    vest = JSON.parse(c.equityVestSchedule);
  } catch {
    vest = { years: 4, cliffMonths: 12, cadence: 'quarterly' };
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{offer.company.name}</h1>
          <p className="text-sm text-[rgb(var(--muted-foreground))]">
            {offer.title} · {offer.location} ·{' '}
            <Link href={`/companies/${offer.company.slug}`} className="underline">
              View company
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SetAsCurrentButton offerId={offer.id} isCurrent={offer.isCurrent} />
          <DeleteOfferButton offerId={offer.id} />
        </div>
      </header>

      <section className="card grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`Base (${c.currency})`} value={formatMoney(c.baseSalary, c.currency)} />
        <Stat label="Bonus %" value={`${c.targetBonusPct}%`} />
        <Stat label="Sign-on" value={formatMoney(c.signOnBonus, c.currency)} />
        <Stat label="Equity" value={formatMoney(c.equityTotal, c.currency)} />
        <Stat label="Benefits" value={formatMoney(c.benefitsValueAnnual, c.currency)} />
        <Stat label="Mode" value={c.workMode} />
        <Stat label="Growth/fit" value={`${c.qualitativeScore}/100`} />
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Edit</h2>
        <OfferForm
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          initial={{
            id: offer.id,
            companyId: offer.companyId,
            title: offer.title,
            level: offer.level ?? '',
            location: offer.location,
            isCurrent: offer.isCurrent,
            status: offer.status,
            notes: offer.notes ?? '',
            baseSalary: c.baseSalary,
            currency: c.currency,
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[rgb(var(--muted-foreground))]">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
