'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Trash } from 'lucide-react';
import { ConfirmDialog } from './ui/ConfirmDialog';

export interface ComparisonRow {
  id: string;
  name: string;
  /** ISO string — keeps server/client serialization simple. */
  createdAt: string;
  offerCount: number;
}

/**
 * Comparisons index list with multi-select + bulk delete. The whole row stays
 * a `Link` for fast open; the checkbox sits in its own `<label>` and stops
 * propagation so toggling selection doesn't navigate.
 *
 * The selection set is intentionally local state (not URL-backed) — selections
 * are ephemeral and shouldn't survive a page refresh.
 */
export function ComparisonsList({ items }: { items: ComparisonRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allIds = useMemo(() => items.map((i) => i.id), [items]);
  const allSelected = selected.size > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(allIds) : new Set());
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      const { deleteComparisons } = await import('@/lib/actions');
      const { deleted } = await deleteComparisons(ids);
      toast.success(
        `${deleted} comparison${deleted === 1 ? '' : 's'} deleted`,
      );
      setSelected(new Set());
      // Use a transition so the route refresh doesn't block the dialog close.
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
      throw e;
    }
  }

  return (
    <div className="space-y-3">
      {/* Selection toolbar — sticks at the top so it's reachable while scrolling
          a long list. Hidden until the user actually selects something to keep
          the empty state of the page clean. */}
      <div
        className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-[rgb(var(--card))] px-4 py-2 text-sm"
        role="region"
        aria-label="Bulk actions"
      >
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              // Indeterminate state isn't a React-controlled prop.
              if (el) el.indeterminate = someSelected;
            }}
            onChange={(e) => toggleAll(e.target.checked)}
            aria-label="Select all comparisons"
          />
          <span className="text-[rgb(var(--muted-foreground))]">
            {selected.size === 0
              ? `Select comparisons to delete (${items.length} total)`
              : `${selected.size} selected`}
          </span>
        </label>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="btn-ghost text-xs"
              disabled={isPending}
            >
              Clear
            </button>
            <ConfirmDialog
              title={`Delete ${selected.size} comparison${selected.size === 1 ? '' : 's'}?`}
              description="Saved scoring snapshots and any AI insights generated for them will be removed. Your offers and companies are not affected."
              confirmLabel={`Delete ${selected.size}`}
              tone="danger"
              trigger={
                <button type="button" className="btn-danger text-xs" disabled={isPending}>
                  <Trash size={14} aria-hidden /> Delete {selected.size}
                </button>
              }
              onConfirm={bulkDelete}
            />
          </div>
        )}
      </div>

      <ul className="divide-y rounded-lg border bg-[rgb(var(--card))]">
        {items.map((c) => {
          const isSelected = selected.has(c.id);
          return (
            <li
              key={c.id}
              className={`flex items-stretch ${
                isSelected ? 'bg-[rgb(var(--primary))]/5' : ''
              }`}
            >
              <label
                className="flex cursor-pointer items-center pl-4 pr-2"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => toggleOne(c.id, e.target.checked)}
                  aria-label={`Select ${c.name}`}
                />
              </label>
              <Link
                href={`/compare/${c.id}`}
                className="group flex flex-1 items-center justify-between gap-3 py-4 pr-4 transition-colors hover:bg-[rgb(var(--muted))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
              >
                <div className="min-w-0">
                  <div className="font-medium group-hover:underline">{c.name}</div>
                  <div className="text-xs text-[rgb(var(--muted-foreground))]">
                    {c.offerCount} offers · {new Date(c.createdAt).toLocaleString()}
                  </div>
                </div>
                <span
                  aria-hidden
                  className="text-[rgb(var(--muted-foreground))] transition-transform group-hover:translate-x-0.5 group-hover:text-[rgb(var(--foreground))]"
                >
                  ›
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
