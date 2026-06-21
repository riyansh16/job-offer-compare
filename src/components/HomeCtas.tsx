'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';

/**
 * Auth-aware CTAs for the homepage, resolved client-side.
 *
 * The homepage (src/app/page.tsx) is otherwise a fully static, CDN-cached
 * marketing page. Reading the session on the server (the previous
 * `await auth()` call) opted the whole route into dynamic rendering, which
 * on Azure SWA means a serverless cold-start on every visit (~4s observed
 * in App Insights "Slow pages"). Moving the only auth-dependent bits — these
 * CTA buttons — to the client lets the page ship as static HTML and serve
 * from the edge, while the buttons fill in once the browser's session check
 * (/api/auth/session) returns. For anonymous visitors that's ~100-400ms,
 * bridged by a skeleton placeholder so there's no layout shift.
 *
 * Session context comes from the single SessionProvider in src/app/layout.tsx.
 */

// Button-shaped shimmer placeholders. Heights/rounding match the `.btn`
// class (px-4 py-2 text-sm, rounded-md) so swapping to real buttons doesn't
// shift layout. `inline-block` centers correctly inside the bottom CTA's
// text-center card and lays out fine as a flex item in the hero row.
function CtaSkeleton({ widths }: { widths: string[] }) {
  return (
    <span role="status" aria-label="Loading" className="contents">
      {widths.map((w, i) => (
        <span
          key={i}
          aria-hidden
          className={`inline-block h-[38px] animate-pulse rounded-md bg-[rgb(var(--muted))] ${w}`}
        />
      ))}
    </span>
  );
}

function HeroButtons() {
  const { status } = useSession();

  if (status === 'loading') {
    return <CtaSkeleton widths={['w-32', 'w-44', 'w-20']} />;
  }

  if (status === 'authenticated') {
    return (
      <>
        <Link href="/dashboard" className="btn-primary">
          Go to dashboard
        </Link>
        <Link href="/compare/new" className="btn-outline">
          New comparison
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/auth/signup" className="btn-primary">
        Get started
      </Link>
      <Link href="/companies" className="btn-outline">
        Browse companies
      </Link>
      <Link href="/auth/signin" className="btn-ghost">
        Sign in
      </Link>
    </>
  );
}

function BottomButton() {
  const { status } = useSession();

  if (status === 'loading') {
    return <CtaSkeleton widths={['w-44']} />;
  }

  if (status === 'authenticated') {
    return (
      <Link href="/offers/new" className="btn-primary">
        Add an offer
      </Link>
    );
  }

  return (
    <Link href="/auth/signup" className="btn-primary">
      Create your account
    </Link>
  );
}

export function HeroCtas() {
  return <HeroButtons />;
}

export function BottomCta() {
  return <BottomButton />;
}
