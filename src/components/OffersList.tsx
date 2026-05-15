'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Trash } from 'lucide-react';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { formatMoney } from '@/lib/utils';

export interface OfferRow {
  id: string;
  companyName: string;
  title: string;
  level: string | null;
  location: string;
  baseSalary: number | null;
  equityTotal: number | null;
  signOnBonus: number | null;
}

/**
 * Offers index grid with multi-select + bulk delete. Each card stays a `Link`
 * for fast open; the checkbox sits in the top-right corner inside its own
 * `<label>` overlay so toggling selection doesn't navigate.
 *
 * Selection is local state only \u2014 it shouldn't survive a refresh.
 */
export function OffersList({ items }: { items: OfferRow[] }) {
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
      const { deleteOffers } = await import('@/lib/actions');
      const { deleted } = await deleteOffers(ids);
      toast.success(`${deleted} offer${deleted === 1 ? '' : 's'} deleted`);
      setSelected(new Set());
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
      throw e;
    }
  }

  return (
    <div className="space-y-3">
      {/* Sticky selection toolbar — same pattern as the comparisons list. */}
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
              if (el) el.indeterminate = someSelected;
            }}
            onChange={(e) => toggleAll(e.target.checked)}
            aria-label="Select all offers"
          />
          <span className="text-[rgb(var(--muted-foreground))]">
            {selected.size === 0
              ? `Select offers to delete (${items.length} total)`
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
              title={`Delete ${selected.size} offer${selected.size === 1 ? '' : 's'}?`}
              description="The offers and their compensation details will be removed permanently. Saved comparisons that referenced them keep their snapshot, but those offers will no longer be openable from the comparison."
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

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((o) => {
          const isSelected = selected.has(o.id);
          return (
            <div
              key={o.id}
              className={`relative card transition-shadow hover:shadow-md ${
                isSelected ? 'ring-2 ring-[rgb(var(--primary))] bg-[rgb(var(--primary))]/5' : ''
              }`}
            >
              {/* Checkbox sits above the card in z-order so its click doesn't
                  bubble into the underlying Link. */}
              <label
                className="absolute right-3 top-3 z-10 flex cursor-pointer items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => toggleOne(o.id, e.target.checked)}
                  aria-label={`Select ${o.companyName} offer`}
                />
              </label>

              <Link href={`/offers/${o.id}`} className="block pr-8">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold">{o.companyName}</div>
                    <div className="text-sm text-[rgb(var(--muted-foreground))]">
                      {o.title} {o.level ? `· ${o.level}` : ''} · {o.location}
                    </div>
                  </div>
                </div>
                {(o.baseSalary != null || o.equityTotal != null || o.signOnBonus != null) && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Stat
                      label="Base"
                      value={formatMoney(o.baseSalary ?? 0, 'INR', { compact: true })}
                    />
                    <Stat
                      label="Equity"
                      value={formatMoney(o.equityTotal ?? 0, 'INR', { compact: true })}
                    />
                    <Stat
                      label="Sign-on"
                      value={formatMoney(o.signOnBonus ?? 0, 'INR', { compact: true })}
                    />
                  </div>
                )}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[rgb(var(--muted-foreground))]">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
