import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { siteUrl } from '@/lib/site';

// Build-time prerender can run without DATABASE_URL on SWA. Keep the route
// runtime-dynamic so crawlers get company URLs from the live DB.
export const dynamic = 'force-dynamic';

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
    // DB unreachable. Ship static entries so /sitemap.xml always works.
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
