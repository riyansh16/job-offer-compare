import { Loader } from 'lucide-react';

/**
 * Small inline spinner. Uses lucide's Loader icon with CSS animation.
 * Decorative by default; pass `label` for screen-reader-only announcement.
 */
export function Spinner({
  size = 16,
  label,
  className = '',
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center ${className}`} role={label ? 'status' : undefined}>
      <Loader size={size} className="animate-spin" aria-hidden />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
