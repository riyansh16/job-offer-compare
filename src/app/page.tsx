import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/auth';

export default async function Home() {
  const session = await auth();
  const isSignedIn = Boolean(session?.user);

  return (
    <div className="space-y-16 py-12">
      {/* Hero */}
      <section className="space-y-4 text-center">
        <h1 className="text-balance text-5xl font-semibold tracking-tight">
          Compare your job offers, side by side.
        </h1>
        <p className="mx-auto max-w-2xl text-balance text-lg text-[rgb(var(--muted-foreground))]">
          Rank competing offers across pay, equity, work-life, and company reviews.
          Pulls in related LeetCode comp reports for your designation and years of
          experience. AI verdicts cite the data instead of making it up.
        </p>
        <div className="flex justify-center gap-3 pt-4">
          {isSignedIn ? (
            <>
              <Link href="/dashboard" className="btn-primary">Go to dashboard</Link>
              <Link href="/compare/new" className="btn-outline">New comparison</Link>
            </>
          ) : (
            <>
              <Link href="/auth/signup" className="btn-primary">Get started</Link>
              <Link href="/auth/signin" className="btn-outline">Sign in</Link>
            </>
          )}
        </div>
      </section>

      {/* What you get */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'Beyond base salary',
            body:
              'Equity is annualized over its vesting schedule and adjusted by the company\u2019s real 5y or 1y stock CAGR from Yahoo Finance \u2014 not a guess.',
          },
          {
            title: 'Reviews that won\u2019t mislead',
            body:
              'Indeed ratings fetched live with source URLs, blended with Reddit & HN sentiment. Bayesian shrinkage so 6 cherry-picked reviews can’t outscore 80,000 honest ones.',
          },
          {
            title: 'Real comp from real people',
            body:
              'Each comparison surfaces recent LeetCode comp reports for the same company, level, and years of experience — so you can sanity-check the offer against what others actually got.',
          },
          {
            title: 'AI that grounds its verdicts',
            body:
              'Verdicts, trade-offs, and negotiation talking points generated from the exact numbers in your comparison — not made-up figures.',
          },
        ].map((c) => (
          <div key={c.title} className="card">
            <h3 className="mb-2 text-base font-semibold">{c.title}</h3>
            <p className="text-sm text-[rgb(var(--muted-foreground))]">{c.body}</p>
          </div>
        ))}
      </section>

      {/* Trust ribbon */}
      <section className="card border-l-4 border-l-[rgb(var(--primary))] bg-[rgb(var(--primary))]/5">
        <h2 className="mb-2 text-base font-semibold">How we earn your trust</h2>
        <ul className="space-y-1 text-sm text-[rgb(var(--muted-foreground))]">
          <li>
            <strong className="text-[rgb(var(--foreground))]">Source-or-null.</strong>{' '}
            Every external rating is stored with the URL it came from. No source =
            no number; the UI shows &quot;not available&quot; instead of guessing.
          </li>
          <li>
            <strong className="text-[rgb(var(--foreground))]">Always-fresh data.</strong>{' '}
            Stock prices, company sentiment, and ratings refresh automatically so
            your comparison reflects today, not last year.
          </li>
          <li>
            <strong className="text-[rgb(var(--foreground))]">Your data stays yours.</strong>{' '}
            We never sell or share it. AI insights use a privacy-respecting
            provider — see <Link href="/privacy" className="link">Privacy</Link>{' '}
            for the full data flow.
          </li>
        </ul>
      </section>

      {/* What\u2019s in the score */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What goes into the score</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="card">
            <div className="mb-2 text-sm font-semibold">
              Compensation
            </div>
            <ul className="space-y-1">
              <li>Base salary</li>
              <li>Annual bonus (target %)</li>
              <li>Equity (annualized + growth)</li>
              <li>Sign-on (year 1)</li>
              <li>Benefits value</li>
            </ul>
          </div>
          <div className="card">
            <div className="mb-2 text-sm font-semibold">
              Lifestyle
            </div>
            <ul className="space-y-1">
              <li>Work mode</li>
              <li>Career growth / fit (0–100)</li>
            </ul>
          </div>
          <div className="card">
            <div className="mb-2 text-sm font-semibold">
              Reviews (live, cited)
            </div>
            <ul className="space-y-1">
              <li>Comp &amp; Benefits</li>
              <li>Work-Life Balance</li>
              <li>Culture</li>
              <li>Management</li>
              <li>Job Security &amp; Advancement</li>
            </ul>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-l-4 border-l-[rgb(var(--danger))] bg-[rgb(var(--danger))]/5 p-3 text-sm">
          <AlertTriangle
            size={16}
            aria-hidden
            className="mt-0.5 shrink-0 text-[rgb(var(--danger))]"
          />
          <p>
            <strong>Layoff history is shown as context</strong> on each company page —
            it does <em>not</em> affect comparison scores. Sourced from{' '}
            <a
              href="https://layoffs.fyi/"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              layoffs.fyi
            </a>
            .
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="card text-center">
        <h2 className="mb-2 text-xl font-semibold">Ready to rank your offers?</h2>
        <p className="mb-4 text-sm text-[rgb(var(--muted-foreground))]">
          Add your offers in 5 minutes. Walk into the negotiation already knowing the answer.
        </p>
        {isSignedIn ? (
          <Link href="/offers/new" className="btn-primary">
            Add an offer
          </Link>
        ) : (
          <Link href="/auth/signup" className="btn-primary">
            Create your account
          </Link>
        )}
      </section>

      {/* Data sources */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Where the data comes from</h2>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          Every number you see is sourced from a public provider. No invented stats.
        </p>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            { data: 'Stock prices & CAGR', source: 'Yahoo Finance' },
            { data: 'Ratings', source: 'Indeed' },
            { data: 'Community sentiment', source: 'Reddit + Hacker News' },
            { data: 'Layoff history', source: 'layoffs.fyi' },
            { data: 'Compensation reports', source: 'LeetCode' },
            { data: 'AI verdicts', source: 'Azure OpenAI' },
          ].map(({ data, source }) => (
            <div key={data} className="card">
              <div className="text-xs text-[rgb(var(--muted-foreground))]">
                Data
              </div>
              <div className="font-semibold">{data}</div>
              <div className="mt-2 text-xs text-[rgb(var(--muted-foreground))]">
                Source
              </div>
              <div className="text-sm">{source}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
