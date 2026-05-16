import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CompanyRefreshPanel } from '@/components/CompanyRefreshPanel';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';

export default async function CompanyDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect('/auth/signin');
  const company = await prisma.company.findUnique({
    where: { slug },
    include: { sentiments: true },
  });
  if (!company) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Companies', href: '/companies' },
          { label: company.name },
        ]}
      />
      <header>
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          {[company.industry, company.hqLocation, company.tickerSymbol].filter(Boolean).join(' · ')}
        </p>
        {company.website && (
          <a
            href={company.website}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs text-[rgb(var(--primary))] underline"
          >
            {company.website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </header>

      <section className="card grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
        <Stat label="Industry" value={company.industry ?? '—'} />
        <Stat label="HQ" value={company.hqLocation ?? '—'} />
        <Stat label="Size" value={company.size ?? '—'} />
        <Stat label="Status" value={company.isPublic ? `Public · ${company.tickerSymbol ?? ''}` : 'Private'} />
        <Stat label="Indeed" value={company.indeedRating ? `${company.indeedRating.toFixed(1)} ★` : '—'} />
      </section>

      {hasIndeedBreakdown(company) && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Indeed breakdown</h2>
            {company.indeedReviewCount != null && (
              <span className="text-xs text-[rgb(var(--muted-foreground))]">
                {company.indeedReviewCount.toLocaleString()} reviews
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
            <Stat label="Comp & Benefits" value={fmtRating(company.indeedCompBenefits)} />
            <Stat label="Work-Life Balance" value={fmtRating(company.indeedWLB)} />
            <Stat label="Job Security" value={fmtRating(company.indeedJobSecurity)} />
            <Stat label="Management" value={fmtRating(company.indeedMgmt)} />
            <Stat label="Culture" value={fmtRating(company.indeedCulture)} />
          </div>
        </section>
      )}

      {company.layoffsLast12mPct != null && company.layoffsLast12mPct > 0 && (
        <section className="card border-l-4 border-l-[rgb(var(--danger))] space-y-1">
          <h2 className="font-semibold text-[rgb(var(--danger))]">Layoffs (last 12 months)</h2>
          <p className="text-sm">
            <span className="font-mono text-lg">{company.layoffsLast12mPct.toFixed(1)}%</span>{' '}
            of headcount cut
            {company.layoffsAsOf && ` as of ${new Date(company.layoffsAsOf).toLocaleDateString()}`}.
          </p>
          {company.layoffsSourceUrl && (
            <p className="text-xs">
              Source:{' '}
              <a
                href={company.layoffsSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[rgb(var(--primary))] underline"
              >
                {new URL(company.layoffsSourceUrl).hostname}
              </a>
              {' '}· aggregated via{' '}
              <a
                href="https://layoffs.fyi/"
                target="_blank"
                rel="noreferrer"
                className="text-[rgb(var(--primary))] underline"
              >
                layoffs.fyi
              </a>
            </p>
          )}
        </section>
      )}

      <CompanyRefreshPanel
        companyId={company.id}
        ticker={company.tickerSymbol ?? null}
        isPublic={company.isPublic}
        sentiments={company.sentiments.map((s) => ({
          source: s.source,
          score: s.score,
          sampleSize: s.sampleSize,
          summary: s.summary,
          fetchedAt: s.fetchedAt.toISOString(),
        }))}
        initialCurrentPrice={company.stockCurrentPriceUsd}
        initialCagr5y={company.stockCagr5yPct}
        initialCagr1y={company.stockCagr1yPct}
        initialUpdatedAt={company.stockUpdatedAt?.toISOString() ?? null}
      />
    </div>
  );
}

function fmtRating(v: number | null | undefined): string {
  return v == null ? '—' : `${v.toFixed(1)} ★`;
}

function hasIndeedBreakdown(c: {
  indeedCompBenefits: number | null;
  indeedWLB: number | null;
  indeedJobSecurity: number | null;
  indeedMgmt: number | null;
  indeedCulture: number | null;
}): boolean {
  return [c.indeedCompBenefits, c.indeedWLB, c.indeedJobSecurity, c.indeedMgmt, c.indeedCulture].some(
    (v) => v != null,
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
