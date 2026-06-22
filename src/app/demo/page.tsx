import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { ComparisonResults } from '@/components/ComparisonResults';
import { getSampleComparison } from '@/lib/demo/sampleComparison';
import { siteUrl } from '@/lib/site';

// Fully static, public, no auth/DB. The sample comparison is computed at
// build time from fixed data (src/lib/demo/sampleComparison.ts) and rendered
// through the *real* ComparisonResults component, so anonymous visitors see
// exactly the payoff they'd get after signing up and entering their offers.
// force-static keeps it on the CDN edge and fails the build loudly if a
// dynamic API is ever introduced here. /demo is allow-listed in middleware.ts.
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Sample Job Offer Comparison',
  description:
    'See how OfferLens scores competing job offers side by side — base, equity, work-life, and company reviews — with a live example. No signup required.',
  alternates: { canonical: `${siteUrl}/demo` },
};

export default function DemoPage() {
  const snapshot = getSampleComparison();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--primary))]/10 px-3 py-1 text-xs font-medium text-[rgb(var(--primary))]">
          <Sparkles size={13} aria-hidden />
          Sample comparison · example data
        </div>
        <h1 className="text-2xl font-semibold">How OfferLens ranks three offers</h1>
        <p className="max-w-2xl text-sm text-[rgb(var(--muted-foreground))]">
          This is a live example using three fictional companies, scored with the{' '}
          <strong>Balanced</strong> weighting preset. The numbers are illustrative — but the
          scoring, radar chart, and breakdown below are exactly what you get with your own
          offers. Nothing here is signed in, and no data is saved.
        </p>
      </header>

      {/* Top CTA — capture intent before they even scroll. */}
      <div className="card flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-[rgb(var(--primary))] bg-[rgb(var(--primary))]/5">
        <p className="text-sm">
          <strong>Want this for your real offers?</strong> Add yours in ~5 minutes and get a
          grounded AI verdict on top.
        </p>
        <div className="flex gap-2">
          <Link href="/auth/signup" className="btn-primary">
            Create your comparison
          </Link>
          <Link href="/companies" className="btn-outline">
            Browse companies
          </Link>
        </div>
      </div>

      <ComparisonResults snapshot={snapshot} />

      {/* Bottom CTA — they've seen the payoff; ask for the signup now. */}
      <section className="card space-y-3 text-center">
        <h2 className="text-xl font-semibold">Ready to rank your own offers?</h2>
        <p className="mx-auto max-w-xl text-sm text-[rgb(var(--muted-foreground))]">
          Enter your real numbers, adjust the weighting to match what matters to you, and walk
          into the negotiation already knowing the answer. Live Indeed reviews, real stock CAGR,
          and an AI verdict that cites the data.
        </p>
        <div className="flex justify-center gap-2">
          <Link href="/auth/signup" className="btn-primary">
            Get started — it&apos;s free
          </Link>
          <Link href="/" className="btn-ghost">
            Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}
