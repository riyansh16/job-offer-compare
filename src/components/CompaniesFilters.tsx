'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

export interface CompaniesFilterOptions {
  industries: string[];
  sizes: string[];
}

export type SortKey = 'name' | 'rating' | 'size';

/**
 * Server-driven filters for the companies index. Each control updates the URL
 * query string, which the server component re-reads and uses to query the
 * database. No client-side data store — single source of truth is the URL.
 */
export function CompaniesFilters({
  options,
  current,
}: {
  options: CompaniesFilterOptions;
  current: {
    q: string;
    industry: string;
    size: string;
    sort: SortKey;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(current.q);

  // Debounce free-text search.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (q === current.q) return;
      updateParam('q', q);
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Keep local state in sync if the URL changes externally (e.g. user clicks "clear").
  useEffect(() => {
    setQ(current.q);
  }, [current.q]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasFilters = current.q || current.industry || current.size || current.sort !== 'name';

  return (
    <div className="card space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <label className="relative">
          <span className="sr-only">Search companies</span>
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted-foreground))]"
          />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…"
            className="input pl-8"
            autoComplete="off"
          />
        </label>

        <select
          aria-label="Filter by industry"
          value={current.industry}
          onChange={(e) => updateParam('industry', e.target.value)}
          className="input sm:w-44"
        >
          <option value="">All industries</option>
          {options.industries.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by size"
          value={current.size}
          onChange={(e) => updateParam('size', e.target.value)}
          className="input sm:w-36"
        >
          <option value="">All sizes</option>
          {options.sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort by"
          value={current.sort}
          onChange={(e) => updateParam('sort', e.target.value)}
          className="input sm:w-44"
        >
          <option value="name">Sort: Name (A→Z)</option>
          <option value="rating">Sort: Top Indeed rating</option>
          <option value="size">Sort: Size</option>
        </select>
      </div>

      {hasFilters && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => router.replace(pathname)}
            className="btn-ghost text-xs"
          >
            <X size={12} aria-hidden />
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
