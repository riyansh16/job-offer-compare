import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Visual breadcrumb trail for detail pages. The last item is rendered as the
 * "current" location and is not a link.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-[rgb(var(--muted-foreground))]">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {c.href && !isLast ? (
                <Link href={c.href} className="hover:text-[rgb(var(--foreground))] hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span
                  className={isLast ? 'text-[rgb(var(--foreground))] font-medium' : ''}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {c.label}
                </span>
              )}
              {!isLast && <ChevronRight size={12} aria-hidden className="opacity-60" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
