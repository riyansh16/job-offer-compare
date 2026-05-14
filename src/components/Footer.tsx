import Link from 'next/link';

/**
 * Site-wide footer. Lives below `<main>` in the root layout. Keep links
 * minimal — privacy + terms are required by Google OAuth and India DPDPA.
 * Copyright year is hardcoded on each new year (intentionally — JS Date
 * inside RSCs would re-render at build time and could lag on long-running
 * deploys; one-line manual bump per year is fine).
 */
export function Footer() {
  return (
    <footer className="mt-16 border-t bg-[rgb(var(--card))]/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-[rgb(var(--muted-foreground))] sm:flex-row">
        <p>
          © 2026 Job Offer Compare. Created by{' '}
          <a
            href="https://www.linkedin.com/in/riyansh16"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[rgb(var(--foreground))] hover:opacity-80"
          >
            Riyansh Pal
          </a>
          .
        </p>
        <nav className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-[rgb(var(--foreground))]">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[rgb(var(--foreground))]">
            Terms
          </Link>
          <a
            href="mailto:riyansh2502@gmail.com"
            className="hover:text-[rgb(var(--foreground))]"
          >
            Email
          </a>
          <a
            href="https://www.linkedin.com/in/riyansh16"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[rgb(var(--foreground))]"
          >
            LinkedIn
          </a>
        </nav>
      </div>
    </footer>
  );
}
