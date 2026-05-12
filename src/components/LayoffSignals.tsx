/**
 * Heads-up banner shown above the comparison verdict, summarizing recent
 * layoffs for each company in the comparison. Layoffs are *not* in the score
 * (backward-looking, noisy) — this surfaces the signal so the user can factor
 * it in themselves.
 */
type LayoffCompany = {
  id: string;
  name: string;
  layoffsLast12mPct: number | null;
  layoffsAsOf: Date | null;
  layoffsSourceUrl: string | null;
};

export function LayoffSignals({ companies }: { companies: LayoffCompany[] }) {
  if (companies.length === 0) return null;
  const anyWithData = companies.some(
    (c) => c.layoffsLast12mPct != null && c.layoffsLast12mPct > 0,
  );

  return (
    <section
      className={`card space-y-2 border-l-4 ${
        anyWithData ? 'border-l-[rgb(var(--danger))]' : 'border-l-[rgb(var(--muted-foreground))]'
      }`}
    >
      <h2 className="font-semibold">Layoff signal (last 12 months)</h2>
      <ul className="space-y-1 text-sm">
        {companies.map((c) => {
          if (c.layoffsLast12mPct != null && c.layoffsLast12mPct > 0) {
            const host = c.layoffsSourceUrl ? safeHost(c.layoffsSourceUrl) : null;
            return (
              <li key={c.id} className="flex flex-wrap items-baseline gap-1">
                <span className="font-medium">{c.name}:</span>
                <span className="font-mono text-[rgb(var(--danger))]">
                  {c.layoffsLast12mPct.toFixed(1)}%
                </span>
                <span className="text-[rgb(var(--muted-foreground))]">
                  headcount cut
                  {c.layoffsAsOf && ` (as of ${new Date(c.layoffsAsOf).toLocaleDateString()})`}.
                </span>
                {c.layoffsSourceUrl && host && (
                  <span className="text-xs">
                    Source:{' '}
                    <a
                      href={c.layoffsSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[rgb(var(--primary))] underline"
                    >
                      {host}
                    </a>
                  </span>
                )}
              </li>
            );
          }
          return (
            <li key={c.id} className="flex flex-wrap gap-1">
              <span className="font-medium">{c.name}:</span>
              <span className="text-[rgb(var(--muted-foreground))]">
                No layoffs reported on{' '}
                <a
                  href="https://layoffs.fyi/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[rgb(var(--primary))] underline"
                >
                  layoffs.fyi
                </a>{' '}
                in the last 12 months.
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-[rgb(var(--muted-foreground))]">
        Data sourced from{' '}
        <a
          href="https://layoffs.fyi/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          layoffs.fyi
        </a>
        , refreshed monthly.
      </p>
    </section>
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
