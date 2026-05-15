import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * App Router 404 page. Rendered for any unmatched route, and also when a
 * Server Component calls `notFound()` (e.g. comparison/offer not owned by
 * the signed-in user). Style matches the rest of the marketing pages so
 * users don't feel "kicked out" of the app.
 */

export const metadata: Metadata = {
  title: 'Page not found — Job Offer Compare',
};

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div className="card space-y-4">
        <p className="text-5xl font-semibold tracking-tight text-[rgb(var(--muted-foreground))]">
          404
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          We couldn&apos;t find that page
        </h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          The link may be broken, or the page may have moved. If you reached
          this from inside the app, the comparison or offer might have been
          deleted (or it belongs to a different account).
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Link href="/" className="btn-primary">
            Go home
          </Link>
          <Link href="/dashboard" className="btn-outline">
            Open dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
