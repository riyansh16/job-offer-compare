import Link from 'next/link';

/**
 * Site-wide footer. Lives below `<main>` in the root layout. Keep links
 * minimal — privacy + terms are required by Google OAuth and India DPDPA.
 * Copyright year is hardcoded on each new year (intentionally — JS Date
 * inside RSCs would re-render at build time and could lag on long-running
 * deploys; one-line manual bump per year is fine).
 */
export function Footer() {
  const linkCls =
    'rounded-sm hover:text-[rgb(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--background))]';
  return (
    <footer className="mt-16 border-t bg-[rgb(var(--card))]/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-[rgb(var(--muted-foreground))] sm:flex-row">
        <p>
          © 2026 Job Offer Compare. Created by{' '}
          <a
            href="https://www.linkedin.com/in/riyansh16"
            target="_blank"
            rel="noopener noreferrer"
            className={`font-medium text-[rgb(var(--foreground))] hover:opacity-80 ${linkCls}`}
          >
            Riyansh Pal
          </a>
          .
        </p>
        <nav className="flex items-center gap-4" aria-label="Footer">
          <Link href="/privacy" className={linkCls}>
            Privacy
          </Link>
          <Link href="/terms" className={linkCls}>
            Terms
          </Link>
          <a href="mailto:riyansh2502@gmail.com" className={linkCls}>
            Email
          </a>
          <a
            href="https://www.linkedin.com/in/riyansh16"
            target="_blank"
            rel="noopener noreferrer"
            className={linkCls}
          >
            LinkedIn
          </a>
        </nav>
      </div>
    </footer>
  );
}
