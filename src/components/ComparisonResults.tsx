'use client';

import type { ReactNode } from 'react';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { METRIC_KEYS, METRIC_LABELS, type ComparisonResult } from '@/lib/engine';
import { formatMoney, formatPct } from '@/lib/utils';

const COLORS = ['#4f46e5', '#10b981', '#ef4444', '#f59e0b', '#06b6d4', '#a855f7'];

export function ComparisonResults({
  snapshot,
  afterVerdict,
}: {
  snapshot: ComparisonResult;
  /** Optional content rendered immediately below the Verdict card (e.g. the
   *  equity-growth assumptions banner) so the verdict stays the hero. */
  afterVerdict?: ReactNode;
}) {
  const ranked = [...snapshot.results].sort((a, b) => a.rank - b.rank);

  // Detect snapshots saved before a metric-set change (e.g. PTO removed,
  // 'reviews' split into 5 aspects). Filter to metrics every offer has data
  // for; surface a banner so the user knows the data is incomplete.
  const availableMetricKeys = METRIC_KEYS.filter((k) =>
    ranked.every((r) => r.metrics?.[k] != null),
  );
  const isLegacySnapshot = availableMetricKeys.length < METRIC_KEYS.length;

  // Radar data: rows = metrics, one series per offer.
  const radarData = availableMetricKeys.map((k) => {
    const row: Record<string, string | number> = { metric: METRIC_LABELS[k] };
    for (const r of ranked) {
      const m = r.metrics[k];
      row[r.companyName] = m ? Number(m.normalized.toFixed(0)) : 0;
    }
    return row;
  });

  return (
    <div className="space-y-6">
      {isLegacySnapshot && (
        <div className="card border-l-4 border-l-[rgb(var(--primary))] bg-[rgb(var(--primary))]/5">
          <p className="text-sm">
            <strong>Saved before a metric-set update.</strong> This comparison was created with an
            older set of metrics (some are missing or have since been split). Showing what we can
            from the snapshot — for an up-to-date scoring, re-run a new comparison with the same
            offers.
          </p>
        </div>
      )}      <section className="card space-y-3">
        <h2 className="font-semibold">Verdict</h2>
        <ul className="space-y-1 text-sm">
          {snapshot.rationale.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ranked.map((r, i) => (
            <li
              key={r.offerId}
              className={`rounded-lg border p-3 ${i === 0 ? 'border-[rgb(var(--primary))]' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  #{r.rank} {r.companyName}
                </span>
                <span className="text-sm">{r.totalScore.toFixed(1)}/100</span>
              </div>
              <div className="text-xs text-[rgb(var(--muted-foreground))]">
                {r.title} ·{' '}
                {formatMoney(r.totalAnnualValue, 'INR', { compact: true })}{' '}
                effective annual
              </div>
            </li>
          ))}
        </ol>
      </section>

      {afterVerdict}

      <section className="card">
        <h2 className="mb-3 font-semibold">Per-metric profile</h2>
        <div className="h-72 w-full sm:h-96">
          <ResponsiveContainer>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} />
              {ranked.map((r, i) => (
                <Radar
                  key={r.offerId}
                  name={r.companyName}
                  dataKey={r.companyName}
                  stroke={COLORS[i % COLORS.length]}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.25}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Detailed breakdown</h2>
        <p className="mb-3 text-xs text-[rgb(var(--muted-foreground))]">
          Money values shown in INR (₹). Each metric is normalized 0–100 across offers,
          then weighted to produce the total score. Swipe horizontally on small screens to
          compare more offers.
        </p>
        {/*
          Mobile-friendly horizontal scroller:
          - `-mx-6 px-6` lets the scroll area bleed to card edges so swipes
            from the screen edge work, while content stays visually inset.
          - `scroll-smooth + snap-x snap-mandatory` makes swipes settle on
            whole offer columns instead of stopping mid-cell.
          - `before:` pseudo-element creates a subtle right-edge fade so
            users see "there's more to scroll" without an explicit chevron.
            (`pointer-events-none` so it doesn't eat taps.)
        */}
        <div className="relative -mx-6 overflow-x-auto px-6 scroll-smooth snap-x snap-mandatory before:pointer-events-none before:absolute before:inset-y-0 before:right-0 before:z-20 before:w-8 before:bg-gradient-to-l before:from-[rgb(var(--card))] before:to-transparent">
          <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3">Metric</th>
              {ranked.map((r) => (
                <th key={r.offerId} className="snap-start py-2 px-3 text-right">
                  <div className="whitespace-nowrap">{r.companyName}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {availableMetricKeys.map((k) => (
              <tr key={k} className="border-b last:border-0">
                <td className="py-2 pr-3 align-top">
                  <div>{METRIC_LABELS[k]}</div>
                  {/*
                    Weight moves into the metric label as a small badge.
                    It's the same value across offers (it weights the metric,
                    not the offer), so showing it once per row instead of
                    once per cell saves a column without losing information.
                  */}
                  <div className="text-[10px] text-[rgb(var(--muted-foreground))]">
                    {formatPct(snapshot.weights[k] ?? 0, 0)} weight
                  </div>
                </td>
                {ranked.map((r) => {
                  const m = r.metrics[k];
                  const isMoney = ['salary', 'bonus', 'equity', 'signOn', 'benefits'].includes(k);
                  const isReview = k.startsWith('review');
                  let display: string;
                  let growthHint: string | null = null;
                  if (isMoney) {
                    display = formatMoney(m.raw, 'INR', { compact: true });
                    // For equity, surface the growth factor that was applied.
                    if (k === 'equity' && r.equityGrowthAppliedPct != null && r.equityGrowthAppliedPct !== 0) {
                      const sign = r.equityGrowthAppliedPct > 0 ? '+' : '';
                      const sourceLabel =
                        r.equityGrowthSource === 'override' ? 'manual'
                        : r.equityGrowthSource === 'cagr' ? '5y CAGR'
                        : '';
                      growthHint = `× ${sign}${r.equityGrowthAppliedPct.toFixed(1)}% growth${sourceLabel ? ` (${sourceLabel})` : ''}`;
                    }
                  } else if (isReview) {
                    // raw is 0..100 scale; show the underlying 0..5 star rating.
                    display = `${(m.raw / 20).toFixed(1)} ★`;
                  } else {
                    display = m.raw.toFixed(0);
                  }
                  return (
                    <td key={r.offerId} className="snap-start py-2 px-3 text-right align-top">
                      <div className="whitespace-nowrap">{display}</div>
                      {growthHint && (
                        <div className="text-[10px] text-[rgb(var(--primary))]">{growthHint}</div>
                      )}
                      <div className="whitespace-nowrap text-[10px] text-[rgb(var(--muted-foreground))]">
                        score {m.normalized.toFixed(0)} · contrib {m.weighted.toFixed(1)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-3">Total score</td>
              {ranked.map((r) => (
                <td key={r.offerId} className="snap-start py-2 px-3 text-right">{r.totalScore.toFixed(1)}</td>
              ))}
            </tr>
          </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
