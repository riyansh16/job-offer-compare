import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getAdminEmail } from '@/lib/admin';

/**
 * Private admin stats page. Returns 404 to anyone whose email isn't in
 * ADMIN_EMAIL — the page may as well not exist for non-admins.
 *
 * Design rule: every metric here is derived from rows that already exist
 * (User, JobOffer, Comparison, AiInsight, Company). We deliberately do NOT
 * write per-event telemetry rows — that would balloon DB size on a hobby
 * Postgres tier. If a metric isn't computable from existing rows, it's
 * either skipped or replaced with a counter on the existing row.
 *
 * Metrics:
 *  - Funnel: signups, sign-ins, offers, comparisons, AI insights
 *    (today / 7d / all-time) — all from the *.createdAt / generatedAt fields
 *    that already exist on each model.
 *  - Adoption: % of users with ≥1 comparison, ≥2 offers (the multi-offer
 *    threshold is the strongest near-term monetization signal — if users
 *    don't add a 2nd offer, gating "2nd offer" behind a paywall won't work).
 *  - Engagement depth: avg offers per comparison, repeat-comparison users.
 *  - Top-N tables: most-active users, most-offered companies.
 *  - Data freshness: companies with stale ratings/stock, so silent provider
 *    failures show up here instead of being noticed by a user first.
 *
 * Caveat: lastSignInAt only stores the LATEST login per user, so "users
 * active in last 24h" is exact (each unique user counted once) but a single
 * user logging in 5 times still shows as 1 active. That's a feature, not a
 * bug — we want distinct-users, not session counts.
 */
export default async function AdminStatsPage() {
  // Defence in depth: even if someone discovers the URL, gate at the page.
  const adminEmail = await getAdminEmail();
  if (!adminEmail) notFound();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    signupsToday,
    signups7d,
    activeToday,
    active7d,
    totalComparisons,
    comparisonsToday,
    comparisons7d,
    totalOffers,
    offersToday,
    offers7d,
    totalInsights,
    insightsToday,
    insights7d,
    offerCountsByUser,
    comparisonCountsByUser,
    offerCountsByCompany,
    totalCompanies,
    staleRatings,
    givenUpRatings,
    staleStock,
    topActive,
    lifetimeAgg,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { lastSignInAt: { gte: startOfToday } } }),
    prisma.user.count({ where: { lastSignInAt: { gte: sevenDaysAgo } } }),
    prisma.comparison.count(),
    prisma.comparison.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.comparison.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.jobOffer.count(),
    prisma.jobOffer.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.jobOffer.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.aiInsight.count(),
    prisma.aiInsight.count({ where: { generatedAt: { gte: startOfToday } } }),
    prisma.aiInsight.count({ where: { generatedAt: { gte: sevenDaysAgo } } }),
    // groupBy lets us bucket users by offer/comparison count without N queries.
    prisma.jobOffer.groupBy({ by: ['userId'], _count: { _all: true } }),
    prisma.comparison.groupBy({ by: ['userId'], _count: { _all: true } }),
    // Top companies by total offers across all users — early signal for
    // which company pages would be worth sponsoring (the only ad surface
    // allowed by docs/MONETIZATION.md §5.5).
    prisma.jobOffer.groupBy({
      by: ['companyId'],
      _count: { _all: true },
      orderBy: { _count: { companyId: 'desc' } },
      take: 10,
    }),
    prisma.company.count(),
    // Stale-data signals. Thresholds match the refresh cadences in
    // docs/HOW-IT-WORKS.md (ratings monthly, stock every 6h).
    prisma.company.count({
      where: {
        OR: [
          { ratingsUpdatedAt: null },
          { ratingsUpdatedAt: { lt: thirtyDaysAgo } },
        ],
      },
    }),
    // Given-up rows: bulk slice tried, escalation slice tried, both failed.
    // After the daily cron stabilises this should hover at a small constant
    // (companies that genuinely have no Indeed page). A growing number here
    // means the prompt or the model changed and ratings are silently regressing.
    prisma.company.count({ where: { ratingsFailureCount: { gte: 2 } } }),
    prisma.company.count({
      where: {
        AND: [
          { isPublic: true },
          {
            OR: [
              { stockUpdatedAt: null },
              { stockUpdatedAt: { lt: sevenDaysAgo } },
            ],
          },
        ],
      },
    }),
    prisma.user.findMany({
      orderBy: [{ signInCount: 'desc' }, { lastSignInAt: 'desc' }],
      take: 10,
      select: { email: true, name: true, signInCount: true, lastSignInAt: true, createdAt: true },
    }),
    // Lifetime sums across all users. These counters are bumped on create
    // and never on delete (see User.lifetime* doc-comments in
    // prisma/schema.prisma), so they stay accurate even when users tidy up
    // old offers/comparisons. The delta between lifetime and current row
    // counts is the delete rate — an early signal for which features are
    // ephemeral vs. retained, and where to gate paid features.
    prisma.user.aggregate({
      _sum: {
        lifetimeOffers: true,
        lifetimeComparisons: true,
        lifetimeAiInsights: true,
      },
    }),
  ]);

  const lifetimeOffers = lifetimeAgg._sum.lifetimeOffers ?? 0;
  const lifetimeComparisons = lifetimeAgg._sum.lifetimeComparisons ?? 0;
  const lifetimeAiInsights = lifetimeAgg._sum.lifetimeAiInsights ?? 0;

  // Derived adoption metrics — pure JS over the groupBy results so we don't
  // round-trip extra queries.
  const usersWith1Offer = offerCountsByUser.length;
  const usersWith2PlusOffers = offerCountsByUser.filter((r) => r._count._all >= 2).length;
  const usersWith2PlusComparisons = comparisonCountsByUser.filter((r) => r._count._all >= 2).length;
  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));
  // Delete rate = (lifetime - current) / lifetime. 0 when nothing was ever
  // created. Returns a string with the % suffix because that's how it's
  // displayed everywhere it's used.
  const deletePct = (current: number, lifetime: number) =>
    lifetime === 0 ? '0%' : `${Math.round(((lifetime - current) / lifetime) * 100)}%`;

  // Avg offers per comparison: pull the CSV column only and count items.
  // Cheap because Comparison rows are small and few; if this ever gets
  // expensive, denormalize to an `offerCount` int on Comparison.
  const allComparisonCsvs = await prisma.comparison.findMany({
    select: { offerIdsCsv: true },
  });
  const totalOffersInComparisons = allComparisonCsvs.reduce(
    (sum, c) => sum + c.offerIdsCsv.split(',').filter(Boolean).length,
    0,
  );
  const avgOffersPerComparison =
    allComparisonCsvs.length === 0
      ? 0
      : Math.round((totalOffersInComparisons / allComparisonCsvs.length) * 10) / 10;

  // Resolve company names for the top-companies table in one round-trip.
  const topCompanyIds = offerCountsByCompany.map((r) => r.companyId);
  const topCompanies = topCompanyIds.length
    ? await prisma.company.findMany({
        where: { id: { in: topCompanyIds } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const companyById = new Map(topCompanies.map((c) => [c.id, c]));

  // Top users by comparisons run — straight from the groupBy above, no
  // extra query. These are the candidates for "Pro / Recruiter" tier
  // (per docs/MONETIZATION.md §3.1) since high comparison counts suggest
  // career coaches or recruiters, not one-time job switchers.
  const topComparisonUsers = comparisonCountsByUser
    .slice()
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 10);

  const userIdsToResolve = topComparisonUsers.map((u) => u.userId);
  const userLookup = userIdsToResolve.length
    ? await prisma.user.findMany({
        where: { id: { in: userIdsToResolve } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userById = new Map(userLookup.map((u) => [u.id, u]));
  const displayName = (id: string) => {
    const u = userById.get(id);
    if (!u) return '(deleted user)';
    return u.name ?? u.email;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Admin · Usage stats</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          Signed in as {adminEmail}. Refresh the page to update.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Card title="Today">
          <Stat label="New signups" value={signupsToday} />
          <Stat label="Distinct users signed in" value={activeToday} />
          <Stat label="Offers created" value={offersToday} />
          <Stat label="Comparisons created" value={comparisonsToday} />
          <Stat label="AI insights generated" value={insightsToday} />
        </Card>
        <Card title="Last 7 days">
          <Stat label="New signups" value={signups7d} />
          <Stat label="Distinct users signed in" value={active7d} />
          <Stat label="Offers created" value={offers7d} />
          <Stat label="Comparisons created" value={comparisons7d} />
          <Stat label="AI insights generated" value={insights7d} />
        </Card>
        <Card title="All-time">
          <Stat label="Total users" value={totalUsers} />
          <Stat label="Companies in catalog" value={totalCompanies} />
          <hr className="border-[rgb(var(--muted-foreground))]/15 my-1" />
          <Stat label="Offers (currently in DB)" value={totalOffers} />
          <Stat label="Offers (lifetime)" value={lifetimeOffers} />
          <Stat label="Offer delete rate" value={deletePct(totalOffers, lifetimeOffers)} />
          <hr className="border-[rgb(var(--muted-foreground))]/15 my-1" />
          <Stat label="Comparisons (currently in DB)" value={totalComparisons} />
          <Stat label="Comparisons (lifetime)" value={lifetimeComparisons} />
          <Stat
            label="Comparison delete rate"
            value={deletePct(totalComparisons, lifetimeComparisons)}
          />
          <hr className="border-[rgb(var(--muted-foreground))]/15 my-1" />
          <Stat label="AI insights (currently in DB)" value={totalInsights} />
          <Stat label="AI insights (lifetime LLM calls)" value={lifetimeAiInsights} />
        </Card>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Traffic</h2>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          Page views, sessions, geo, route timings, and per-company traffic
          now live in <strong>Azure Application Insights</strong>. Open the
          Application Insights resource in the portal &rarr; Usage / Live
          Metrics / Workbooks for live data.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Card title="Adoption funnel">
          <Stat
            label={`Users with ≥1 offer (${pct(usersWith1Offer, totalUsers)}%)`}
            value={usersWith1Offer}
          />
          <Stat
            label={`Users with ≥2 offers (${pct(usersWith2PlusOffers, totalUsers)}%)`}
            value={usersWith2PlusOffers}
          />
          <Stat
            label={`Users with ≥1 comparison (${pct(comparisonCountsByUser.length, totalUsers)}%)`}
            value={comparisonCountsByUser.length}
          />
          <Stat
            label={`Repeat users — ≥2 comparisons (${pct(usersWith2PlusComparisons, totalUsers)}%)`}
            value={usersWith2PlusComparisons}
          />
        </Card>
        <Card title="Engagement">
          <Stat label="Avg offers per comparison" value={avgOffersPerComparison} />
          <Stat
            label="Avg AI insights per comparison"
            value={
              totalComparisons === 0
                ? 0
                : Math.round((totalInsights / totalComparisons) * 10) / 10
            }
          />
        </Card>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Top 10 most-active users</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[rgb(var(--muted-foreground))]">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3 text-right">Sign-ins</th>
                <th className="py-2 pr-3">Last seen</th>
                <th className="py-2 pr-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {topActive.map((u) => (
                <tr key={u.email} className="border-t">
                  <td className="py-2 pr-3">{u.name ?? u.email}</td>
                  <td className="py-2 pr-3 text-right font-mono">{u.signInCount}</td>
                  <td className="py-2 pr-3 text-[rgb(var(--muted-foreground))]">
                    {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : '—'}
                  </td>
                  <td className="py-2 pr-3 text-[rgb(var(--muted-foreground))]">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {topActive.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-[rgb(var(--muted-foreground))]">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Top 10 users by comparisons run</h2>
        <p className="text-xs text-[rgb(var(--muted-foreground))]">
          Power users — candidates for the future Pro / Recruiter tier.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[rgb(var(--muted-foreground))]">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3 text-right">Comparisons</th>
              </tr>
            </thead>
            <tbody>
              {topComparisonUsers.map((row) => (
                <tr key={row.userId} className="border-t">
                  <td className="py-2 pr-3">{displayName(row.userId)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{row._count._all}</td>
                </tr>
              ))}
              {topComparisonUsers.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-3 text-center text-[rgb(var(--muted-foreground))]">
                    No comparisons yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Top 10 companies by offer count</h2>
        <p className="text-xs text-[rgb(var(--muted-foreground))]">
          Demand signal — useful when prioritising company-page polish or
          (later) sponsored-listing placements.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[rgb(var(--muted-foreground))]">
                <th className="py-2 pr-3">Company</th>
                <th className="py-2 pr-3 text-right">Offers</th>
              </tr>
            </thead>
            <tbody>
              {offerCountsByCompany.map((row) => {
                const c = companyById.get(row.companyId);
                return (
                  <tr key={row.companyId} className="border-t">
                    <td className="py-2 pr-3">{c?.name ?? '(unknown)'}</td>
                    <td className="py-2 pr-3 text-right font-mono">{row._count._all}</td>
                  </tr>
                );
              })}
              {offerCountsByCompany.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-3 text-center text-[rgb(var(--muted-foreground))]">
                    No offers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Data freshness</h2>
        <p className="text-xs text-[rgb(var(--muted-foreground))]">
          Surfaces silent provider failures before users see them. Thresholds
          match the refresh cadences in <code>docs/HOW-IT-WORKS.md</code>.
        </p>
        <Stat label="Companies with stale or missing ratings (>30d)" value={staleRatings} />
        <Stat label="Companies the ratings cron gave up on (≥2 failed attempts)" value={givenUpRatings} />
        <Stat label="Public companies with stale or missing stock data (>7d)" value={staleStock} />
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--muted-foreground))]">
        {title}
      </h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm">{label}</span>
      <span className="font-mono text-lg font-semibold">{value}</span>
    </div>
  );
}
