import { prisma } from './db';

// Aggregate page-view tracking. Lives on top of the PageViewDay model
// (one row per UTC date × route pattern -- see prisma/schema.prisma) so
// we get traffic totals and per-page breakdowns without writing a row per
// request. Fed by the root layout (src/app/layout.tsx) on every server
// render; powers the traffic + per-company tables on /admin/stats, which
// are the rate-card data for native sponsorships on company pages
// (docs/MONETIZATION.md §3 / §5).

// Self-identifying crawlers. We're not trying to catch every bot --
// just enough so the "total views" number we'd quote to a sponsor isn't
// inflated by GoogleBot etc. Anything stealthy will still leak through;
// that's fine for an order-of-magnitude marketing stat.
const BOT_UA_RE =
  /bot|spider|crawl|slurp|bingpreview|headless|lighthouse|monitor|pingdom|uptime|fetch|curl|wget|python-requests|axios|node-fetch|preview/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true; // missing UA is almost always a crawler / health check
  return BOT_UA_RE.test(ua);
}

// Map a literal request path to a stable route pattern so we don't
// explode the row count (one row per company slug would defeat the
// daily-aggregate design). Anything we don't recognise gets bucketed
// under "/other" -- if that bucket grows, add a case here.
export function normalizeRoute(pathname: string): string {
  if (!pathname || !pathname.startsWith('/')) return '/other';

  // Strip query / hash defensively (layout shouldn't see them, but...).
  const clean = pathname.split('?')[0].split('#')[0];

  if (clean === '/') return '/';
  if (clean === '/companies') return '/companies';
  if (clean.startsWith('/companies/')) return '/companies/[slug]';
  if (clean === '/compare/new') return '/compare/new';
  if (clean.startsWith('/compare/')) return '/compare/[id]';
  if (clean === '/comparisons') return '/comparisons';
  if (clean === '/offers') return '/offers';
  if (clean === '/offers/new') return '/offers/new';
  if (clean.startsWith('/offers/')) return '/offers/[id]';
  if (clean === '/dashboard') return '/dashboard';
  if (clean === '/current') return '/current';
  if (clean === '/privacy') return '/privacy';
  if (clean === '/terms') return '/terms';
  if (clean.startsWith('/auth/')) return '/auth/*';
  // Admin pages are excluded from the count entirely in recordPageView,
  // but list them here for safety in case that filter is bypassed.
  if (clean.startsWith('/admin')) return '/admin/*';

  return '/other';
}

// "YYYY-MM-DD" in UTC -- matches what we'd send as the PageViewDay.date
// row key. Using UTC (not local time) so cron-driven scripts and the live
// site agree on which bucket a request belongs to.
export function utcDateKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function companySlugFromPath(pathname: string): string | null {
  if (!pathname.startsWith('/companies/')) return null;
  const slug = pathname.slice('/companies/'.length).split('/')[0].split('?')[0];
  if (!slug) return null;
  return slug;
}

// Best-effort: never throws, never blocks the response on a DB error.
// Returns void; callers should not await for a "did it work" reason.
export async function recordPageView(input: {
  pathname: string | null | undefined;
  userAgent: string | null | undefined;
}): Promise<void> {
  try {
    const pathname = input.pathname;
    if (!pathname || !pathname.startsWith('/')) return;
    // Skip admin & API surfaces -- admin views would pollute the funnel
    // numbers (it's the same handful of internal users), and /api isn't
    // a page anyway.
    if (pathname.startsWith('/admin') || pathname.startsWith('/api')) return;
    if (isBotUserAgent(input.userAgent)) return;

    const route = normalizeRoute(pathname);
    const date = utcDateKey();

    // Atomic upsert. Prisma's upsert isn't atomic against concurrent writers
    // for non-existing rows (it does find-then-insert), but the PageViewDay
    // PK is (date, route) so the worst case is one of the racing inserts
    // P2002s and we lose a single increment -- acceptable for a marketing
    // counter. The increment-on-update branch IS atomic at the DB level.
    await prisma.pageViewDay.upsert({
      where: { date_route: { date, route } },
      create: { date, route, count: 1 },
      update: { count: { increment: 1 } },
    });

    // Bump the per-company lifetime counter so the admin "top companies by
    // traffic" table is a single indexed query instead of a join over the
    // full PageViewDay history. updateMany so an unknown slug is a no-op
    // instead of throwing.
    const slug = companySlugFromPath(pathname);
    if (slug) {
      await prisma.company.updateMany({
        where: { slug },
        data: { viewsLifetime: { increment: 1 } },
      });
    }
  } catch (err) {
    // Page-view recording must never break a page render. Log at warn so
    // a sustained outage is visible in Vercel logs without spamming error
    // pages.
    console.warn('[pageviews.recordPageView] swallow:', err);
  }
}

export interface PageViewStats {
  todayTotal: number;
  last7dTotal: number;
  last30dTotal: number;
  allTimeTotal: number;
  // Per-route 30d totals, sorted desc. Top advertiser-relevant routes
  // typically rank: /, /companies, /companies/[slug].
  byRoute30d: Array<{ route: string; count: number }>;
}

// Sum the day rows. Cheap because we're scanning at most ~30 × routes
// rows; if that ever stops being cheap, denormalize a `total` column.
export async function getPageViewStats(): Promise<PageViewStats> {
  const today = utcDateKey();
  const now = new Date();
  const ms = 24 * 60 * 60 * 1000;
  const day7 = utcDateKey(new Date(now.getTime() - 6 * ms)); // inclusive 7-day window
  const day30 = utcDateKey(new Date(now.getTime() - 29 * ms));

  const [todayRows, last7Rows, last30Rows, allRows] = await Promise.all([
    prisma.pageViewDay.aggregate({ _sum: { count: true }, where: { date: today } }),
    prisma.pageViewDay.aggregate({ _sum: { count: true }, where: { date: { gte: day7 } } }),
    prisma.pageViewDay.aggregate({ _sum: { count: true }, where: { date: { gte: day30 } } }),
    prisma.pageViewDay.aggregate({ _sum: { count: true } }),
  ]);

  const byRouteGrouped = await prisma.pageViewDay.groupBy({
    by: ['route'],
    where: { date: { gte: day30 } },
    _sum: { count: true },
  });
  const byRoute30d = byRouteGrouped
    .map((r) => ({ route: r.route, count: r._sum.count ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return {
    todayTotal: todayRows._sum.count ?? 0,
    last7dTotal: last7Rows._sum.count ?? 0,
    last30dTotal: last30Rows._sum.count ?? 0,
    allTimeTotal: allRows._sum.count ?? 0,
    byRoute30d,
  };
}

// Top company pages by lifetime views. Used on /admin/stats as the
// concrete "what would a sponsor on the Acme page reach" number.
export async function getTopCompanyPageViews(limit = 10) {
  return prisma.company.findMany({
    where: { viewsLifetime: { gt: 0 } },
    orderBy: { viewsLifetime: 'desc' },
    take: limit,
    select: { id: true, name: true, slug: true, viewsLifetime: true },
  });
}
