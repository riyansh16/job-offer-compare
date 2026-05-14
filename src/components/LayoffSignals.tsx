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
      className={`card space-y-3 border-l-4 ${
        anyWithData ? 'border-l-[rgb(var(--danger))]' : 'border-l-[rgb(var(--muted-foreground))]'
      }`}
    >
      <h2 className="font-semibold">Layoff signal (last 12 months)</h2>
      <ul className="space-y-2 text-sm">
        {companies.map((c) => {
          const pct = c.layoffsLast12mPct;
          if (pct != null && pct > 0) {
            const host = c.layoffsSourceUrl ? safeHost(c.layoffsSourceUrl) : null;
            // Bar: clamp to 50% of width since 50%+ headcount cuts are rare and would dwarf others.
            const barWidth = Math.min(100, (pct / 25) * 100);
            return (
              <li key={c.id} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="font-mono text-[rgb(var(--danger))]">
                    {pct.toFixed(1)}%
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--muted))]"
                  role="img"
                  aria-label={`${pct.toFixed(1)}% headcount cut at ${c.name}`}
                >
                  <div
                    className="h-full bg-[rgb(var(--danger))]"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <div className="text-[11px] text-[rgb(var(--muted-foreground))]">
                  {c.layoffsAsOf && `As of ${new Date(c.layoffsAsOf).toLocaleDateString()}.`}
                  {c.layoffsSourceUrl && host && (
                    <>
                      {' '}Source:{' '}
                      <a
                        href={c.layoffsSourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[rgb(var(--primary))] underline"
                      >
                        {host}
                      </a>
                    </>
                  )}
                </div>
              </li>
            );
          }
          return (
            <li key={c.id} className="flex flex-wrap items-baseline gap-1 text-[rgb(var(--muted-foreground))]">
              <span className="font-medium text-[rgb(var(--foreground))]">{c.name}:</span>
              <span>No layoffs reported in the last 12 months.</span>
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
