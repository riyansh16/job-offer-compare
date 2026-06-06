import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy', '/terms', '/companies'],
        disallow: [
          '/api/',
          '/admin/',
          '/auth/',
          '/dashboard',
          '/current',
          '/offers',
          '/comparisons',
          '/compare',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
