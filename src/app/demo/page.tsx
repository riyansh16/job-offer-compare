import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { ComparisonResults } from '@/components/ComparisonResults';
import {
  getSampleComparison,
  SAMPLE_AI_INSIGHTS,
  SAMPLE_LEETCODE_POSTS,
} from '@/lib/demo/sampleComparison';
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
  const growthSummary = snapshot.results
    .map((r) => {
      const pct = r.equityGrowthAppliedPct ?? 0;
      const src = r.equityGrowthSource ?? 'none';
      if (src === 'none' || pct === 0) {
        return `${r.companyName}: 0% (default)`;
      }
      const sign = pct > 0 ? '+' : '';
      const label = src === 'cagr' ? 'CAGR' : 'manual';
      return `${r.companyName}: ${sign}${pct.toFixed(1)}% (${label})`;
    })
    .join(' · ');
  const anyGrowthApplied = snapshot.results.some(
    (r) => (r.equityGrowthAppliedPct ?? 0) !== 0 && r.equityGrowthSource !== 'none',
  );

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

      <ComparisonResults
        snapshot={snapshot}
        afterVerdict={
          <div
            className={`card text-sm ${
              anyGrowthApplied
                ? 'border-l-4 border-l-[rgb(var(--primary))] bg-[rgb(var(--primary))]/5'
                : ''
            }`}
          >
            <div className="font-medium">Equity-growth assumptions applied</div>
            <div className="mt-1 text-[rgb(var(--muted-foreground))]">{growthSummary}</div>
          </div>
        }
      />

      <section className="card space-y-3">
        <h2 className="font-semibold">Recent comp reports from LeetCode</h2>
        <p className="text-xs text-[rgb(var(--muted-foreground))]">
          Demo preview of the kind of community compensation posts OfferLens surfaces for each
          company/level match.
        </p>
        <ul className="space-y-2 text-sm">
          {SAMPLE_LEETCODE_POSTS.map((post) => (
            <li key={`${post.companyName}-${post.postedOn}`} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{post.companyName}</span>
                <span className="text-xs text-[rgb(var(--muted-foreground))]">
                  {post.yoe}y · {post.postedOn}
                </span>
              </div>
              <a
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-[rgb(var(--primary))] underline hover:no-underline"
              >
                {post.title}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">AI insights</h2>
        <p className="text-xs text-[rgb(var(--muted-foreground))]">
          In real comparisons, these are generated from your exact offer data and can be
          regenerated for alternate takes.
        </p>
        <div className="space-y-2 text-sm">
          <div className="rounded-lg border p-3">
            <div className="font-medium">Verdict</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[rgb(var(--muted-foreground))]">
              {SAMPLE_AI_INSIGHTS.verdict.map((line, idx) => (
                <li key={`verdict-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border p-3">
            <div className="font-medium">Trade-offs</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[rgb(var(--muted-foreground))]">
              {SAMPLE_AI_INSIGHTS.tradeoffs.map((line, idx) => (
                <li key={`tradeoffs-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border p-3">
            <div className="font-medium">Negotiation talking points</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[rgb(var(--muted-foreground))]">
              {SAMPLE_AI_INSIGHTS.negotiation.map((line, idx) => (
                <li key={`negotiation-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border p-3">
            <div className="font-medium">Recruiter questions</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[rgb(var(--muted-foreground))]">
              {SAMPLE_AI_INSIGHTS.questions.map((line, idx) => (
                <li key={`questions-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

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
