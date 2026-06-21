import Link from 'next/link';
import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { Building2 } from 'lucide-react';
import { CompaniesFilters, type SortKey } from '@/components/CompaniesFilters';
import { EmptyState } from '@/components/ui/EmptyState';
import { siteUrl } from '@/lib/site';

// Exactly the columns the catalog cards + sort logic need. Shared by the
// cached default-list query and the live filtered query so both return an
// identical row shape. `satisfies` keeps the literal type (so Prisma
// narrows the result) while type-checking the field names.
const COMPANY_CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  industry: true,
  size: true,
  hqLocation: true,
  indeedRating: true,
  tickerSymbol: true,
  layoffsLast12mPct: true,
} satisfies Prisma.CompanySelect;

export const metadata: Metadata = {
  title: 'Companies',
  description:
    'Browse the OfferLens company catalog — Indeed reviews, layoff signals, and stock CAGR for companies you might get an offer from.',
  alternates: { canonical: `${siteUrl}/companies` },
};

// Filter-dropdown options (distinct industries + sizes across the whole
// catalog) change at most when a company is added/edited -- which only
// happens via cron or admin tooling, not user traffic. Cache for 1 hour
// so the filter UI stops triggering a full-catalog scan on every render.
const getFilterOptions = unstable_cache(
  async () => {
    const rows = await prisma.company.findMany({
      select: { industry: true, size: true },
    });
    const industries = Array.from(
      new Set(rows.map((c) => c.industry).filter((v): v is string => !!v)),
    ).sort();
    // Sort by leading integer (e.g. "100+", "1000+", "10000+") so the
    // dropdown reads 100 -> 200 -> 1000 -> ... instead of lexicographically
    // ("100+", "1000+", "10500+", "1100+"). Fall back to localeCompare for
    // anything without a number prefix (e.g. "1001-5000" ranges sort by the
    // first number too).
    const sizeRank = (s: string): number => {
      const m = s.match(/\d+/);
      return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
    };
    const sizes = Array.from(
      new Set(rows.map((c) => c.size).filter((v): v is string => !!v)),
    ).sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
    return { industries, sizes, totalCompanies: rows.length };
  },
  ['companies-filter-options'],
  { revalidate: 3600, tags: ['companies'] },
);

// Default catalog view: no filters, name-sorted. This is ~all of /companies
// traffic (the most-visited page per App Insights), so caching it for 6h
// turns the common path into zero DB round-trips. Everything shown on a card
// (Indeed rating, layoffs %, ticker) refreshes at most once a day via cron
// (see .github/workflows/cron-refresh-*.yml), so up to 6h of staleness is
// imperceptible. Tag 'companies' lets a future revalidateTag() bust it on
// demand; today it's purely time-based.
const getDefaultCompanies = unstable_cache(
  async () =>
    prisma.company.findMany({
      orderBy: { name: 'asc' },
      select: COMPANY_CARD_SELECT,
    }),
  ['companies-default-list'],
  { revalidate: 21600, tags: ['companies'] },
);

type SearchParams = { [key: string]: string | string[] | undefined };

function pickString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

const VALID_SORTS: ReadonlySet<SortKey> = new Set(['name', 'rating', 'size']);

export default async function CompaniesIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = pickString(sp.q).trim();
  const industry = pickString(sp.industry);
  const size = pickString(sp.size);
  const sortRaw = pickString(sp.sort) as SortKey;
  const sort: SortKey = VALID_SORTS.has(sortRaw) ? sortRaw : 'name';

  // Build the Prisma where clause from query params.
  const where: {
    name?: { contains: string; mode: 'insensitive' };
    industry?: string;
    size?: string;
  } = {};
  if (q) where.name = { contains: q, mode: 'insensitive' };
  if (industry) where.industry = industry;
  if (size) where.size = size;

  const hasFilters = !!(q || industry || size || sort !== 'name');

  // The default view (no filters, name sort) is ~all of /companies traffic
  // and is served from the 6h cache with zero DB round-trips. Filtered or
  // sorted views are rare and run a live query so their ordering -- including
  // Postgres null handling on indeedRating/size -- stays identical to before.
  const companiesPromise = hasFilters
    ? prisma.company.findMany({
        where,
        orderBy:
          sort === 'rating'
            ? [{ indeedRating: 'desc' }, { name: 'asc' }]
            : sort === 'size'
              ? [{ size: 'asc' }, { name: 'asc' }]
              : { name: 'asc' },
        select: COMPANY_CARD_SELECT,
      })
    : getDefaultCompanies();

  // Filter option lists come from the full catalog (cached separately) so
  // they stay stable as the user narrows results.
  const [companies, filterOptions] = await Promise.all([
    companiesPromise,
    getFilterOptions(),
  ]);

  const { industries, sizes, totalCompanies } = filterOptions;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Companies</h1>
        <p className="text-xs text-[rgb(var(--muted-foreground))]">
          Showing {companies.length} of {totalCompanies}
        </p>
      </header>

      <CompaniesFilters
        options={{ industries, sizes }}
        current={{ q, industry, size, sort }}
      />

      {companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={hasFilters ? 'No companies match those filters' : 'No companies yet'}
          description={
            hasFilters
              ? 'Try clearing some filters or adjusting your search.'
              : 'The catalog is empty.'
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/companies/${c.slug}`}
              className="card block transition-shadow hover:shadow-md"
            >
              <div className="font-semibold">{c.name}</div>
              <div className="text-xs text-[rgb(var(--muted-foreground))]">
                {[c.industry, c.size, c.hqLocation].filter(Boolean).join(' · ') || '—'}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {c.indeedRating != null && (
                  <span className="badge">Indeed {c.indeedRating.toFixed(1)} ★</span>
                )}
                {c.tickerSymbol && <span className="badge">{c.tickerSymbol}</span>}
                {c.layoffsLast12mPct != null && c.layoffsLast12mPct > 0 && (
                  <span className="badge bg-[rgb(var(--danger))]/10 text-[rgb(var(--danger))]">
                    Layoffs {c.layoffsLast12mPct.toFixed(1)}%
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
