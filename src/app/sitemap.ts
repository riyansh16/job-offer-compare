import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { siteUrl } from '@/lib/site';

// Daily ISR. The previous combo of `revalidate = 86400` + `force-dynamic`
// was self-defeating -- force-dynamic disables the ISR cache, so the
// sitemap was actually re-querying Postgres on every crawler hit (and
// crawlers hit /sitemap.xml a lot). With force-dynamic dropped, the
// try/catch below still handles build-time prerender without DATABASE_URL.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/companies`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${siteUrl}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  let companies: { slug: string }[] = [];
  try {
    companies = await prisma.company.findMany({
      select: { slug: true },
      orderBy: { name: 'asc' },
    });
  } catch {
    // DB unreachable (e.g. build-time prerender without DATABASE_URL). Ship
    // the static entries so the sitemap still exists; the next regeneration
    // after revalidate elapses will pick up the per-company URLs.
    return staticEntries;
  }

  return [
    ...staticEntries.slice(0, 2),
    ...companies.map((c) => ({
      url: `${siteUrl}/companies/${c.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...staticEntries.slice(2),
  ];
}
