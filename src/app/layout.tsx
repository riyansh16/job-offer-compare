import type { Metadata } from 'next';
import './globals.css';
import { TopNav } from '@/components/TopNav';
import { Footer } from '@/components/Footer';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AppToaster } from '@/components/AppToaster';
import { CookieConsent } from '@/components/CookieConsent';
import { AdProviderScripts } from '@/components/ads/AdProviderScripts';

export const metadata: Metadata = {
  title: 'Job Offer Compare',
  description: 'Side-by-side, weighted comparison of your job offers - with AI insights.',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <AdProviderScripts />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <ThemeProvider>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <TopNav />
          <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            {children}
          </main>
          <Footer />
          <AppToaster />
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  );
}
