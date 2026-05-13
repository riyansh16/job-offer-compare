import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { OfferForm } from '@/components/OfferForm';
import { DeleteOfferButton } from '@/components/DeleteOfferButton';
import { formatMoney } from '@/lib/utils';

export default async function CurrentRolePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect('/auth/signin');

  const [current, companies, user] = await Promise.all([
    prisma.jobOffer.findFirst({
      where: { userId, isCurrent: true },
      include: { company: true, compensation: true },
    }),
    prisma.company.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { yearsExperience: true },
    }),
  ]);

  if (companies.length === 0) {
    return (
      <div className="card space-y-3">
        <h1 className="text-xl font-semibold">Catalog is empty</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          The company catalog hasn&apos;t been seeded yet. Run <code>npm run db:seed</code> in the
          project root.
        </p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">Your current role</h1>
          <p className="text-sm text-[rgb(var(--muted-foreground))]">
            Set up your current job once. It becomes the baseline you compare offers against —
            shown by default in every comparison and tagged{' '}
            <span className="badge bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]">Current</span>.
          </p>
        </header>
        <OfferForm
          mode="current"
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          initial={{ yearsExperience: user?.yearsExperience ?? undefined }}
        />
      </div>
    );
  }

  const c = current.compensation!;
  let vest;
  try {
    vest = JSON.parse(c.equityVestSchedule);
  } catch {
    vest = { years: 4, cliffMonths: 12, cadence: 'quarterly' };
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Your current role</h1>
          <p className="text-sm text-[rgb(var(--muted-foreground))]">
            <span className="badge bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]">Current</span>{' '}
            {current.company.name} · {current.title}
            {current.level ? ` · ${current.level}` : ''} · {current.location}
          </p>
        </div>
        <DeleteOfferButton offerId={current.id} />
      </header>

      <section className="card grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`Base (${c.currency})`} value={formatMoney(c.baseSalary, c.currency)} />
        <Stat label="Bonus %" value={`${c.targetBonusPct}%`} />
        <Stat label="Equity (total)" value={formatMoney(c.equityTotal, c.currency)} />
        <Stat label="Benefits" value={formatMoney(c.benefitsValueAnnual, c.currency)} />
        <Stat label="Mode" value={c.workMode} />
        <Stat label="Growth/fit" value={`${c.qualitativeScore}/100`} />
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Edit current role</h2>
        <OfferForm
          mode="current"
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          initial={{
            id: current.id,
            companyId: current.companyId,
            title: current.title,
            level: current.level ?? '',
            location: current.location,
            isCurrent: true,
            status: current.status,
            notes: current.notes ?? '',
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
            yearsExperience: user?.yearsExperience ?? undefined,
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
