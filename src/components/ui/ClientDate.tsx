'use client';

import { useEffect, useState } from 'react';

// Server components render dates using the host's locale + timezone, which
// is UTC on our host — so users saw all timestamps in GMT. This component
// renders a stable ISO placeholder during SSR and reformats with the
// browser's locale + timezone after mount.
type Mode = 'datetime' | 'date';

export function ClientDate({
  value,
  mode = 'datetime',
  fallback = '—',
}: {
  value: string | number | Date | null | undefined;
  mode?: Mode;
  fallback?: string;
}) {
  const iso = value ? new Date(value).toISOString() : null;
  const [text, setText] = useState<string>(iso ?? fallback);

  useEffect(() => {
    if (!iso) {
      setText(fallback);
      return;
    }
    const d = new Date(iso);
    setText(mode === 'date' ? d.toLocaleDateString() : d.toLocaleString());
  }, [iso, mode, fallback]);

  if (!iso) return <>{fallback}</>;
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
