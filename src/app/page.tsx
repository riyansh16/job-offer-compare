import Link from 'next/link';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  return (
    <div className="space-y-16 py-12">
      {/* Hero */}
      <section className="space-y-4 text-center">
        <h1 className="text-balance text-5xl font-semibold tracking-tight">
          Compare your job offers, side by side.
        </h1>
        <p className="mx-auto max-w-2xl text-balance text-lg text-[rgb(var(--muted-foreground))]">
          A private portal that ranks competing offers across compensation, equity, work-life,
          and company reviews — with AI verdicts that cite the data instead of making it up.
        </p>
        <div className="flex justify-center gap-3 pt-4">
          <Link href="/auth/signup" className="btn-primary">Get started</Link>
          <Link href="/auth/signin" className="btn-outline">Sign in</Link>
        </div>
      </section>

      {/* What you get */}
      <section className="grid gap-6 md:grid-cols-3">
        {[
          {
            title: 'Beyond base salary',
            body:
              'Equity is annualized over its vesting schedule and adjusted by the company\u2019s real 5y or 1y stock CAGR from Yahoo Finance \u2014 not a guess.',
          },
          {
            title: 'Reviews that won\u2019t mislead',
            body:
              'Glassdoor + Indeed ratings fetched live with source URLs, blended with Reddit & HN sentiment. Bayesian shrinkage so 6 cherry-picked reviews can\u2019t outscore 80,000 honest ones.',
          },
          {
            title: 'AI that cites the numbers',
            body:
              'Verdicts, trade-offs, and negotiation talking points generated from the same JSON snapshot you can see. The model is told to never invent figures.',
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
            <strong className="text-[rgb(var(--foreground))]">Live data, cached sensibly.</strong>{' '}
            Stock prices refresh every 6h. Reddit/HN sentiment every 7 days.
            Ratings rotated through the catalog every ~30 days.
          </li>
          <li>
            <strong className="text-[rgb(var(--foreground))]">India-first, INR by default.</strong>{' '}
            Built for Indian job seekers comparing TCS / Razorpay / Microsoft India type
            offers. International (FX) is supported as a v2 fallback.
          </li>
          <li>
            <strong className="text-[rgb(var(--foreground))]">Your data stays yours.</strong>{' '}
            Self-hosted; offers, comparisons, and notes never leave your database.
          </li>
        </ul>
      </section>

      {/* What\u2019s in the score */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What goes into the score</h2>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="card">
            <div className="mb-1 text-xs font-semibold uppercase text-[rgb(var(--muted-foreground))]">
              Compensation
            </div>
            <ul className="space-y-1">
              <li>Base salary</li>
              <li>Annual bonus (target %)</li>
              <li>Equity (annualized + growth)</li>
              <li>Sign-on (4y amortized)</li>
              <li>Benefits value</li>
            </ul>
          </div>
          <div className="card">
            <div className="mb-1 text-xs font-semibold uppercase text-[rgb(var(--muted-foreground))]">
              Lifestyle
            </div>
            <ul className="space-y-1">
              <li>Work mode</li>
              <li>Career growth / fit (0\u2013100)</li>
            </ul>
          </div>
          <div className="card">
            <div className="mb-1 text-xs font-semibold uppercase text-[rgb(var(--muted-foreground))]">
              Reviews (live, cited)
            </div>
            <ul className="space-y-1">
              <li>Comp &amp; Benefits</li>
              <li>Work-Life Balance</li>
              <li>Career Opportunities</li>
              <li>Culture</li>
              <li>Management</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-[rgb(var(--muted-foreground))]">
          Layoff history is shown on each company page as informational context only \u2014
          it doesn\u2019t affect comparison scores.
        </p>
      </section>

      {/* CTA */}
      <section className="card text-center">
        <h2 className="mb-2 text-xl font-semibold">Ready to rank your offers?</h2>
        <p className="mb-4 text-sm text-[rgb(var(--muted-foreground))]">
          Add your current role + competing offers in 5 minutes. The math runs in your browser.
        </p>
        <Link href="/auth/signup" className="btn-primary">
          Create your account
        </Link>
      </section>
    </div>
  );
}
