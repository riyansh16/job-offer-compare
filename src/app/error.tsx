'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * App Router error boundary. Rendered when any Server or Client Component
 * inside <main> throws. MUST be a Client Component — Next.js needs
 * `reset()` on the client to retry the segment without a full reload.
 *
 * Sentry/Application Insights wiring will replace the `console.error`
 * once the error-monitoring TODO ships (see TODO.md → Operational).
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to dev console + future error monitor.
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div className="card space-y-4">
        <p className="text-5xl font-semibold tracking-tight text-[rgb(var(--danger))]">
          500
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong on our end
        </h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          The error has been logged. Try again in a moment, or head back to
          your dashboard. If this keeps happening, email{' '}
          <a className="link" href="mailto:riyansh2502@gmail.com">
            riyansh2502@gmail.com
          </a>{' '}
          with what you were doing.
        </p>
        {error.digest && (
          <p className="text-xs text-[rgb(var(--muted-foreground))]">
            Reference: <code>{error.digest}</code>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/dashboard" className="btn-outline">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
