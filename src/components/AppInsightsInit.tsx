'use client';

import { useEffect } from 'react';

// Client-side Application Insights bootstrap. Replaces the server-side
// per-render DB upsert in src/lib/pageviews.ts -- App Insights gives us
// page views, sessions, geo, route timings, and slow-route detection in
// the Azure portal for free (5 GB/mo), without burning B1ms CPU credits
// or saturating the Postgres connection pool.
//
// Reads the connection string from NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING
// (set in Azure SWA -> Configuration -> Application settings). When the
// env var is missing (e.g. local dev without an App Insights resource)
// this component silently no-ops.
//
// Auto-tracking enabled via the SDK options:
//  - enableAutoRouteTracking: SPA navigations (Next.js App Router pushes
//    history without a full reload) are recorded as separate page views.
//  - autoTrackPageVisitTime: time-on-page metric per route.
//  - disableCookiesUsage left at default (cookies used for session +
//    user IDs). If you decide to ship strict no-cookies, set true and
//    accept the loss of session/user aggregation.

export function AppInsightsInit() {
  useEffect(() => {
    const connectionString = process.env.NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING;
    if (!connectionString) return;

    // Dynamic import keeps the ~40 KB SDK out of the initial bundle for
    // dev / preview deploys where the env var isn't set.
    let cancelled = false;
    import('@microsoft/applicationinsights-web')
      .then(({ ApplicationInsights }) => {
        if (cancelled) return;
        const appInsights = new ApplicationInsights({
          config: {
            connectionString,
            enableAutoRouteTracking: true,
            autoTrackPageVisitTime: true,
            disableAjaxTracking: false,
            disableFetchTracking: false,
            enableCorsCorrelation: true,
          },
        });
        appInsights.loadAppInsights();
        appInsights.trackPageView();
      })
      .catch(() => {
        // Analytics must never break the app. Swallow init failures.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
