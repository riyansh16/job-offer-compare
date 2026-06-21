import type { Metadata } from 'next';
import { SessionProvider } from 'next-auth/react';
import './globals.css';
import { TopNav } from '@/components/TopNav';
import { Footer } from '@/components/Footer';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AppToaster } from '@/components/AppToaster';
import { AppInsightsInit } from '@/components/AppInsightsInit';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'OfferLens — Compare Job Offers',
    template: '%s — OfferLens',
  },
  description:
    'OfferLens scores competing job offers side by side — base, equity (with real stock CAGR), benefits, and live company reviews. AI verdicts cite the data instead of making it up.',
  applicationName: 'OfferLens',
  alternates: { canonical: siteUrl },
  openGraph: {
    title: 'OfferLens — Compare Job Offers',
    description:
      'Side-by-side, weighted comparison of your job offers — base, equity, reviews, with grounded AI insights.',
    siteName: 'OfferLens',
    url: siteUrl,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OfferLens — Compare Job Offers',
    description:
      'Side-by-side, weighted comparison of your job offers — with grounded AI insights.',
  },
};

// Inline pre-hydration script: read stored theme (or fall back to OS preference)
// and apply the `.dark` class on <html> *before* React renders. Prevents the
// flash-of-wrong-theme on first paint.
const themeInitScript = `
(function() {
  try {
    var k = 'joc-theme';
    var stored = localStorage.getItem(k);
    var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var t = (stored === 'light' || stored === 'dark') ? stored : sys;
    var root = document.documentElement;
    if (t === 'dark') root.classList.add('dark');
    root.style.colorScheme = t;
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Page-view tracking moved to client-side Application Insights
  // (see src/components/AppInsightsInit.tsx). The previous server-side
  // upsert ran on every render and was the primary cause of slow nav
  // under cold-start + B1ms Postgres credit pressure.

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'OfferLens',
    alternateName: 'Job Offer Compare',
    url: siteUrl,
    description:
      'Side-by-side, weighted comparison of competing job offers — base, equity, benefits, and live company reviews — with grounded AI insights.',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    creator: { '@type': 'Person', name: 'Riyansh Pal', url: 'https://www.linkedin.com/in/riyansh16' },
  };

  // Organization entity — feeds Google's Knowledge Graph so brand-name
  // searches ("offerlens") resolve to this domain instead of similarly
  // named sites. sameAs links transfer entity authority from LinkedIn / X.
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'OfferLens',
    url: siteUrl,
    logo: `${siteUrl}/icon.svg`,
    description:
      'OfferLens helps job seekers compare and evaluate competing job offers using a transparent, weighted score.',
    founder: { '@type': 'Person', name: 'Riyansh Pal' },
    foundingDate: '2026',
    sameAs: [
      'https://www.linkedin.com/in/riyansh16',
        'https://www.linkedin.com/company/offerlens-app/',
      // TODO: add ProductHunt launch URL once live
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <ThemeProvider>
          {/* SessionProvider resolves auth client-side so the shared navbar
              stays correct on static, CDN-cached pages (e.g. the homepage)
              without forcing those pages back into dynamic rendering. */}
          <SessionProvider>
            <a href="#main" className="skip-link">
              Skip to content
            </a>
            <TopNav />
            <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
              {children}
            </main>
            <Footer />
          </SessionProvider>
          <AppToaster />
          <AppInsightsInit />
        </ThemeProvider>
      </body>
    </html>
  );
}
