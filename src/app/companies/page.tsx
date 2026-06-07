import Link from 'next/link';
import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { Building2 } from 'lucide-react';
import { CompaniesFilters, type SortKey } from '@/components/CompaniesFilters';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = {
  title: 'Companies',
  description:
    'Browse the OfferLens company catalog — Indeed reviews, layoff signals, and stock CAGR for companies you might get an offer from.',
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
    const sizes = Array.from(
      new Set(rows.map((c) => c.size).filter((v): v is string => !!v)),
    ).sort();
    return { industries, sizes, totalCompanies: rows.length };
  },
  ['companies-filter-options'],
  { revalidate: 3600, tags: ['companies'] },
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

  // Filter option lists need to come from the full catalog so they stay
  // stable as the user narrows results. Cached separately (see top of file)
  // so only the filtered query actually hits the DB per request.
  const [companies, filterOptions] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy:
        sort === 'rating'
          ? [{ indeedRating: 'desc' }, { name: 'asc' }]
          : sort === 'size'
            ? [{ size: 'asc' }, { name: 'asc' }]
            : { name: 'asc' },
    }),
    getFilterOptions(),
  ]);

  const { industries, sizes, totalCompanies } = filterOptions;

  const hasFilters = !!(q || industry || size || sort !== 'name');

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
