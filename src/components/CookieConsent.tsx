'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'joc-cookie-consent';

type Choice = 'accepted' | 'rejected';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== 'accepted' && stored !== 'rejected') setVisible(true);
    } catch {
      // Storage blocked: show the banner anyway so the user can decide.
      setVisible(true);
    }
  }, []);

  function record(choice: Choice) {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-[rgb(var(--card))]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[rgb(var(--card))]/80"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[rgb(var(--muted-foreground))]">
          We use a session cookie to keep you signed in, and may use cookies from
          advertising partners on a few public pages.{' '}
          <Link href="/privacy" className="link">
            Learn more
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => record('rejected')}
            className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-[rgb(var(--muted))]"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => record('accepted')}
            className="rounded-md bg-[rgb(var(--primary))] px-3 py-1 text-xs font-medium text-[rgb(var(--primary-foreground))] hover:opacity-90"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
