import { fetchLeetcodeComps, type LeetcodeCompPost } from '@/lib/providers/leetcodeComp';

/**
 * Panel shown above AI insights on /compare/[id]. For each offer in the
 * comparison that is NOT the user's current role, surfaces up to 5 recent
 * LeetCode discussion posts that match `(company, level, userYoe)`.
 *
 * Server component — fetches on every page load (the provider has a 24h
 * in-memory cache, so repeat visits are free).
 */
type CompCompany = {
  offerId: string;
  companyName: string;
  title: string;
  level: string | null;
  isCurrent: boolean;
};

export async function LeetcodeCompLinks({
  companies,
  yearsExperience,
}: {
  companies: CompCompany[];
  yearsExperience: number | null;
}) {
  const targets = companies.filter((c) => !c.isCurrent);
  if (targets.length === 0) return null;

  // Fetch in parallel — different (company, level/title) combos hit different
  // cache keys but share underlying LeetCode rate limits, so we accept
  // the burst (≤ ~4 offers in practice).
  const results = await Promise.all(
    targets.map(async (c) => ({
      ...c,
      posts: await fetchLeetcodeComps({
        company: c.companyName,
        // Pass BOTH level and title — LeetCode posts use either spelling
        // ("L5", "Senior SWE", "SDE-2"), so we OR-match across both.
        designation: [c.level, c.title].filter(
          (s): s is string => !!s && s.trim().length > 0,
        ),
        yoe: yearsExperience,
        limit: 5,
      }).catch((): LeetcodeCompPost[] => []),
    })),
  );

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Recent comp reports from LeetCode</h2>

      <ul className="space-y-3 text-sm">
        {results.map((r) => (
          <li key={r.offerId} className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-1">
              <span className="font-medium">{r.companyName}</span>
              {(r.level || r.title) && (
                <span className="text-[rgb(var(--muted-foreground))]">
                  · {[r.title, r.level].filter(Boolean).join(' / ')}
                </span>
              )}
              <span className="ml-auto text-xs text-[rgb(var(--muted-foreground))]">
                {r.posts.length > 0
                  ? `${r.posts.length} recent post${r.posts.length === 1 ? '' : 's'}`
                  : 'No matching posts'}
              </span>
            </div>
            {r.posts.length > 0 ? (
              <ul className="space-y-1 pl-4">
                {r.posts.map((p) => (
                  <li key={p.url} className="text-xs">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[rgb(var(--primary))] underline hover:no-underline"
                    >
                      {p.title}
                    </a>
                    {(p.yoeFromTitle != null || p.createdAt) && (
                      <span className="ml-1 text-[rgb(var(--muted-foreground))]">
                        {p.yoeFromTitle != null ? `· ${p.yoeFromTitle}y` : ''}
                        {p.createdAt ? ` · ${p.createdAt.slice(0, 10)}` : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
