/**
 * Animated shimmer block used while async content is loading. Mark decorative
 * — wrap a labelled region with `aria-busy` if the loading state matters.
 */
export function Skeleton({
  className = '',
  height,
  width,
}: {
  className?: string;
  height?: number | string;
  width?: number | string;
}) {
  return (
    <span
      aria-hidden
      className={`block rounded-md shimmer ${className}`}
      style={{ height, width }}
    />
  );
}

/** Convenience: a stack of skeleton lines for paragraph-like content. */
export function SkeletonLines({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === count - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}
