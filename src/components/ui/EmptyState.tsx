import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Uniform empty-state block. Renders centered inside a `.card` container.
 *
 * `action` is intentionally a free-form ReactNode rather than a label/href
 * pair, so callers can pass a `<Link className="btn-primary">…</Link>` or a
 * client button when toasts/state are needed.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center">
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--muted))] text-[rgb(var(--muted-foreground))]">
          <Icon size={22} aria-hidden />
        </div>
      )}
      <div className="space-y-1">
        <h3 className="font-medium">{title}</h3>
        {description && (
          <p className="text-sm text-[rgb(var(--muted-foreground))]">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
