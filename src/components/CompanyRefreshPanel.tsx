'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from './ui/Spinner';

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
  isPublic,
  sentiments,
  initialCurrentPrice,
  initialCagr5y,
  initialCagr1y,
  initialUpdatedAt,
  canRefresh = true,
}: {
  companyId: string;
  ticker: string | null;
  isPublic?: boolean;
  sentiments: Sentiment[];
  initialCurrentPrice?: number | null;
  initialCagr5y?: number | null;
  initialCagr1y?: number | null;
  initialUpdatedAt?: string | null;
  canRefresh?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Sentiment is read-only here — it auto-refreshes when stale during a real
  // comparison run (see `src/lib/engine/runner.ts`). We don't expose a manual
  // refresh button to avoid letting any signed-in user hammer Reddit / HN.
  const latest = sentiments;
  const [stockInfo, setStockInfo] = useState<{
    currentPrice: number | null;
    cagr5y: number | null;
    cagr1y: number | null;
    updatedAt: string | null;
  }>({
    currentPrice: initialCurrentPrice ?? null,
    cagr5y: initialCagr5y ?? null,
    cagr1y: initialCagr1y ?? null,
    updatedAt: initialUpdatedAt ?? null,
  });

  async function refreshStock() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'stock' }),
      });
      const data = (await res.json()) as { ok?: boolean; result?: unknown; error?: string };
      if (!res.ok || data.error) {
        const errMsg = data.error ?? 'Failed';
        setMsg(errMsg);
        toast.error(`Stock refresh failed: ${errMsg}`);
      } else if (data.result && typeof data.result === 'object') {
        const r = data.result as {
          cagrPct: number | null;
          cagr1yPct: number | null;
          currentPrice: number | null;
          updatedAt: string | null;
        };
        setStockInfo({
          currentPrice: r.currentPrice,
          cagr5y: r.cagrPct,
          cagr1y: r.cagr1yPct,
          updatedAt: r.updatedAt,
        });
        const note =
          r.cagrPct != null
            ? `5y CAGR ${r.cagrPct.toFixed(2)}%, 1y CAGR ${r.cagr1yPct?.toFixed(2) ?? 'n/a'}%`
            : 'Insufficient history for CAGR';
        setMsg(`Stock refreshed. ${note}.`);
        toast.success(`Stock refreshed. ${note}.`);
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed';
      setMsg(errMsg);
      toast.error(`Stock refresh failed: ${errMsg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">Reviews & stock data</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Community sentiment</h3>
          {latest.length === 0 ? (
            <p className="text-xs text-[rgb(var(--muted-foreground))]">
              No data yet. Refreshes automatically the next time this company appears in a comparison.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {latest.map((s) => {
                const fetched = new Date(s.fetchedAt);
                return (
                  <li key={s.source} className="rounded border p-2">
                    <div className="flex items-center justify-between font-medium">
                      <span>{s.source}</span>
                      <span className={s.score >= 0.05 ? 'text-[rgb(var(--success))]' : s.score <= -0.05 ? 'text-[rgb(var(--danger))]' : ''}>
                        score {s.score.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[rgb(var(--muted-foreground))]">{s.summary}</div>
                    <div className="mt-1 text-[10px] text-[rgb(var(--muted-foreground))]">
                      Refreshed {fetched.toLocaleDateString()} · n={s.sampleSize}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Stock history</h3>
            {canRefresh && (
              <button
                onClick={refreshStock}
                disabled={busy || !ticker}
                className="btn-outline text-xs"
                title={
                  ticker
                    ? 'Refresh'
                    : isPublic === false
                      ? 'Private company — no public stock.'
                      : 'Set a ticker symbol to enable.'
                }
              >
                {busy && <Spinner size={12} label="Refreshing" />}
                {busy ? 'Fetching…' : 'Refresh'}
              </button>
            )}
          </div>
          {ticker ? (
            <>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
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
              {stockInfo.updatedAt && (
                <p className="text-[11px] text-[rgb(var(--muted-foreground))]">
                  Last refreshed: {new Date(stockInfo.updatedAt).toLocaleString()}
                </p>
              )}
            </>
          ) : isPublic === false ? (
            <p className="text-xs text-[rgb(var(--muted-foreground))]">
              Private company — no public stock data available.
            </p>
          ) : (
            <p className="text-xs text-[rgb(var(--muted-foreground))]">
              Set a ticker symbol on this company to enable stock CAGR.
            </p>
          )}
          {ticker && stockInfo.updatedAt == null && (
            <p className="text-[11px] text-[rgb(var(--muted-foreground))]">
              No stock data cached yet. Click Refresh.
            </p>
          )}
        </div>
      </div>
      {msg && <p className="text-xs text-[rgb(var(--muted-foreground))]" role="status">{msg}</p>}
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
