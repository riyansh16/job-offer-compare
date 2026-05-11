'use client';

import { useState } from 'react';

interface Sentiment {
  source: string;
  score: number;
  sampleSize: number;
  summary: string;
  fetchedAt: string;
}

export function CompanyRefreshPanel({
  companyId,
  ticker,
  sentiments,
  priceCount,
  firstPriceDate,
  lastPriceDate,
  initialCurrentPrice,
  initialCagr5y,
  initialCagr1y,
}: {
  companyId: string;
  ticker: string | null;
  sentiments: Sentiment[];
  priceCount: number;
  firstPriceDate: string | null;
  lastPriceDate: string | null;
  initialCurrentPrice?: number | null;
  initialCagr5y?: number | null;
  initialCagr1y?: number | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [latest, setLatest] = useState<Sentiment[]>(sentiments);
  const [stockInfo, setStockInfo] = useState<{
    pointCount: number;
    firstDate: string | null;
    lastDate: string | null;
    currentPrice: number | null;
    cagr5y: number | null;
    cagr1y: number | null;
  }>({
    pointCount: priceCount,
    firstDate: firstPriceDate,
    lastDate: lastPriceDate,
    currentPrice: initialCurrentPrice ?? null,
    cagr5y: initialCagr5y ?? null,
    cagr1y: initialCagr1y ?? null,
  });

  async function refresh(kind: 'sentiment' | 'stock') {
    setBusy(kind);
    setMsg(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, force: true }),
      });
      const data = (await res.json()) as { ok?: boolean; result?: unknown; error?: string };
      if (!res.ok || data.error) {
        setMsg(data.error ?? 'Failed');
      } else if (kind === 'sentiment' && Array.isArray(data.result)) {
        setLatest(
          (data.result as { source: string; score: number; sampleSize: number; summary: string; fetchedAt: string }[]).map((r) => ({
            ...r,
            fetchedAt: new Date(r.fetchedAt).toISOString(),
          })),
        );
        setMsg('Sentiment refreshed.');
      } else if (kind === 'stock' && data.result && typeof data.result === 'object') {
        const r = data.result as {
          pointCount: number;
          startDate: string;
          endDate: string;
          cagrPct: number | null;
          cagr1yPct: number | null;
          currentPrice: number;
        };
        setStockInfo({
          pointCount: r.pointCount,
          firstDate: r.startDate,
          lastDate: r.endDate,
          currentPrice: r.currentPrice,
          cagr5y: r.cagrPct,
          cagr1y: r.cagr1yPct,
        });
        setMsg(
          r.cagrPct != null
            ? `Stock refreshed. 5y CAGR ${r.cagrPct.toFixed(2)}%, 1y CAGR ${r.cagr1yPct?.toFixed(2) ?? 'n/a'}%.`
            : 'Stock refreshed but insufficient history for CAGR.',
        );
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">Reviews & stock data</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Community sentiment</h3>
            <button onClick={() => refresh('sentiment')} disabled={busy !== null} className="btn-outline text-xs">
              {busy === 'sentiment' ? 'Fetching…' : 'Refresh'}
            </button>
          </div>
          {latest.length === 0 ? (
            <p className="text-xs text-[rgb(var(--muted-foreground))]">No data yet. Click Refresh.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {latest.map((s) => (
                <li key={s.source} className="rounded border p-2">
                  <div className="flex items-center justify-between font-medium">
                    <span>{s.source}</span>
                    <span className={s.score >= 0.05 ? 'text-[rgb(var(--success))]' : s.score <= -0.05 ? 'text-[rgb(var(--danger))]' : ''}>
                      score {s.score.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[rgb(var(--muted-foreground))]">{s.summary}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Stock history</h3>
            <button
              onClick={() => refresh('stock')}
              disabled={busy !== null || !ticker}
              className="btn-outline text-xs"
              title={ticker ? 'Refresh' : 'Set a ticker symbol to enable.'}
            >
              {busy === 'stock' ? 'Fetching…' : 'Refresh'}
            </button>
          </div>
          {ticker ? (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Stat
                label="Current price"
                value={stockInfo.currentPrice != null ? `$${stockInfo.currentPrice.toFixed(2)}` : '—'}
              />
              <Stat
                label="5y CAGR"
                value={stockInfo.cagr5y != null ? `${stockInfo.cagr5y.toFixed(2)}%` : '—'}
              />
              <Stat
                label="1y CAGR"
                value={stockInfo.cagr1y != null ? `${stockInfo.cagr1y.toFixed(2)}%` : '—'}
              />
            </div>
          ) : (
            <p className="text-xs text-[rgb(var(--muted-foreground))]">
              Set a ticker symbol on this company to enable stock CAGR.
            </p>
          )}
          {ticker && stockInfo.pointCount === 0 && (
            <p className="text-[11px] text-[rgb(var(--muted-foreground))]">
              No price history cached yet. Click Refresh.
            </p>
          )}
        </div>
      </div>
      {msg && <p className="text-xs text-[rgb(var(--muted-foreground))]">{msg}</p>}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[rgb(var(--muted-foreground))]">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
