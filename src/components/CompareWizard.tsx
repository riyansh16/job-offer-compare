'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createComparison } from '@/lib/actions';
import { METRIC_KEYS, METRIC_LABELS, type Weights } from '@/lib/engine';
import { Spinner } from './ui/Spinner';

interface OfferOption {
  id: string;
  companyName: string;
  title: string;
  location: string;
  isCurrent: boolean;
  ticker: string | null;
  companyId: string;
}

interface ProfileOption {
  id: string;
  name: string;
  isPreset: boolean;
  /** JSON-serialized Weights */
  weights: string;
}

const DEFAULT_NAME = () => `Comparison ${new Date().toLocaleDateString()}`;

export function CompareWizard({
  offers,
  profiles,
}: {
  offers: OfferOption[];
  profiles: ProfileOption[];
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(offers.slice(0, Math.min(2, offers.length)).map((o) => o.id)),
  );
  const [profileId, setProfileId] = useState<string>(profiles[0]?.id ?? '');
  const [weights, setWeights] = useState<Weights>(() => {
    try {
      return JSON.parse(profiles[0]?.weights ?? '{}') as Weights;
    } catch {
      return null as unknown as Weights;
    }
  });
  const [equityGrowthPct] = useState<number>(0);
  const [name, setName] = useState<string>(DEFAULT_NAME());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [fetchingCagr, setFetchingCagr] = useState<string | 'all' | null>(null);

  // Per-company stock-growth assumption (% per year). null = "use the cached CAGR
  // automatically". A user-entered number overrides it.
  const [growthByCompany, setGrowthByCompany] = useState<Record<string, number | null>>({});

  // Whether "Use CAGR" / "Refresh all" should fetch trailing 5y or 1y growth.
  const [cagrWindow, setCagrWindow] = useState<'5y' | '1y'>('5y');

  // Distinct selected offers (1 row per company in the growth panel).
  const selectedOffersList = useMemo(
    () => offers.filter((o) => selected.has(o.id)),
    [offers, selected],
  );

  function setWeight(k: keyof Weights, v: number) {
    setWeights((w) => ({ ...w, [k]: v }));
  }

  function applyProfile(id: string) {
    setProfileId(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    try {
      setWeights(JSON.parse(p.weights) as Weights);
    } catch {
      // ignore
    }
  }

  async function refreshAllStocks() {
    // Warm the stock-history cache for every selected public company so the
    // engine has fresh CAGR data when it runs the comparison.
    const targets = selectedOffersList.filter((o) => o.ticker && o.companyId);
    if (targets.length === 0) return;
    setFetchingCagr('all');
    try {
      await Promise.all(
        targets.map((o) =>
          fetch(`/api/companies/${o.companyId}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'stock', force: false }),
          }),
        ),
      );
    } finally {
      setFetchingCagr(null);
    }
  }

  /** Fetch this one company's trailing CAGR (5y or 1y) and put it in the override map. */
  async function autofillCompanyCagr(companyId: string, ticker: string | null) {
    if (!ticker) return;
    setFetchingCagr(companyId);
    try {
      const res = await fetch(`/api/companies/${companyId}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'stock', force: false }),
      });
      const data = (await res.json()) as { result?: { cagrPct: number | null; cagr1yPct: number | null } };
      const pick = cagrWindow === '1y' ? data.result?.cagr1yPct : data.result?.cagrPct;
      if (pick != null) {
        setGrowthByCompany((g) => ({ ...g, [companyId]: Number(pick.toFixed(2)) }));
      }
    } finally {
      setFetchingCagr(null);
    }
  }

  function onSubmit() {
    setError(null);
    const ids = Array.from(selected);
    if (ids.length < 2) {
      setError('Pick at least 2 offers.');
      return;
    }
    startTransition(async () => {
      try {
        // Build per-company growth overrides map (only entries the user explicitly set).
        const growthOverrides: Record<string, number> = {};
        for (const o of selectedOffersList) {
          const v = growthByCompany[o.companyId];
          if (v != null && Number.isFinite(v)) growthOverrides[o.companyId] = v;
        }
        await createComparison({
          name,
          offerIds: ids,
          weights,
          equityGrowthPct,
          profileId: profileId || null,
          growthOverridesByCompany: growthOverrides,
        });
      } catch (e) {
        if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) return;
        const msg = e instanceof Error ? e.message : 'Failed';
        setError(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 1 && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Pick offers to compare</h2>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[rgb(var(--muted-foreground))]">
                {selected.size} selected
              </span>
              <button
                type="button"
                onClick={() => setSelected(new Set(offers.map((o) => o.id)))}
                disabled={selected.size === offers.length}
                className="btn-ghost text-xs"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                disabled={selected.size === 0}
                className="btn-ghost text-xs"
              >
                Deselect all
              </button>
            </div>
          </div>
          <ul className="divide-y rounded border">
            {offers.map((o) => (
              <li key={o.id} className="flex items-center justify-between p-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(o.id);
                      else next.delete(o.id);
                      setSelected(next);
                    }}
                  />
                  <div>
                    <div className="font-medium">
                      {o.companyName}{' '}
                      {o.isCurrent && (
                        <span className="badge bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]">Current</span>
                      )}
                    </div>
                    <div className="text-xs text-[rgb(var(--muted-foreground))]">
                      {o.title} · {o.location}
                    </div>
                  </div>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button onClick={() => setStep(2)} disabled={selected.size < 2} className="btn-primary">
              Next: weights →
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Choose weighting profile</h2>
            <select value={profileId} onChange={(e) => applyProfile(e.target.value)} className="input max-w-xs">
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.isPreset ? '★ ' : ''}{p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-[rgb(var(--muted-foreground))]">
              Rate each metric&apos;s importance from 0 to 10. 0 = ignore, 10 = max. The engine
              normalizes ratings into a 100-point share for scoring, so what matters is the
              relative magnitude.
            </p>
            {METRIC_KEYS.map((k) => {
              const v = Math.round(weights?.[k] ?? 0);
              return (
                <div key={k} className="grid grid-cols-12 items-center gap-2 text-sm">
                  <label htmlFor={`weight-${k}`} className="col-span-5">
                    {METRIC_LABELS[k]}
                  </label>
                  <input
                    id={`weight-${k}`}
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={weights?.[k] ?? 0}
                    onChange={(e) => setWeight(k, Number(e.target.value))}
                    className="col-span-5"
                    aria-valuetext={`${v} (${weightLabel(v)})`}
                  />
                  <span className="col-span-2 text-right text-[11px]">
                    <span className="font-mono">{v}</span>{' '}
                    <span className="text-[rgb(var(--muted-foreground))]">{weightLabel(v)}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn-ghost">← Back</button>
            <button onClick={() => setStep(3)} className="btn-primary">Next: assumptions →</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card space-y-4">
          <h2 className="font-semibold">Final assumptions & save</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Comparison name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="label !mb-0">Stock-growth assumption per company (% / yr)</label>
                <div className="flex items-center gap-2">
                  <div className="inline-flex overflow-hidden rounded-md border text-xs" role="group" aria-label="CAGR window">
                    <button
                      type="button"
                      onClick={() => setCagrWindow('5y')}
                      aria-pressed={cagrWindow === '5y'}
                      className={`px-2 py-1 transition-colors ${cagrWindow === '5y' ? 'bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]' : 'hover:bg-[rgb(var(--muted))]'}`}
                    >
                      5y CAGR
                    </button>
                    <button
                      type="button"
                      onClick={() => setCagrWindow('1y')}
                      aria-pressed={cagrWindow === '1y'}
                      className={`px-2 py-1 transition-colors ${cagrWindow === '1y' ? 'bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]' : 'hover:bg-[rgb(var(--muted))]'}`}
                    >
                      1y CAGR
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={refreshAllStocks}
                    disabled={fetchingCagr !== null}
                    className="btn-outline text-xs"
                  >
                    {fetchingCagr === 'all' && <Spinner size={12} label="Refreshing" />}
                    {fetchingCagr === 'all' ? 'Fetching…' : 'Refresh all'}
                  </button>
                </div>
              </div>
              <ul className="divide-y rounded-lg border">
                {selectedOffersList.map((o) => {
                  const v = growthByCompany[o.companyId];
                  const isFetching = fetchingCagr === o.companyId;
                  return (
                    <li key={o.companyId} className="flex items-center gap-3 p-2 text-sm">
                      <div className="flex-1">
                        <div className="font-medium">{o.companyName}</div>
                        <div className="text-[11px] text-[rgb(var(--muted-foreground))]">
                          {o.ticker ?? 'private — no ticker, defaults to 0%'}
                        </div>
                      </div>
                      <input
                        type="number"
                        step={0.1}
                        value={v ?? ''}
                        placeholder="auto"
                        onChange={(e) => {
                          const txt = e.target.value;
                          setGrowthByCompany((g) => ({
                            ...g,
                            [o.companyId]: txt === '' ? null : Number(txt),
                          }));
                        }}
                        className="input w-24 text-right"
                      />
                      <button
                        type="button"
                        onClick={() => autofillCompanyCagr(o.companyId, o.ticker)}
                        disabled={!o.ticker || isFetching}
                        className="btn-outline text-xs whitespace-nowrap"
                        title={o.ticker ? `Use trailing ${cagrWindow} CAGR` : 'No ticker available'}
                      >
                        {isFetching ? '…' : `Use ${cagrWindow}`}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          {error && <p className="text-sm text-[rgb(var(--danger))]" role="alert">{error}</p>}
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="btn-ghost">← Back</button>
            <button onClick={onSubmit} disabled={isPending} className="btn-primary">
              {isPending && <Spinner size={14} label="Computing" />}
              {isPending ? 'Computing…' : 'Run comparison'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** Map a 0-10 weight to a short qualitative descriptor. */
function weightLabel(v: number): string {
  if (v <= 0) return 'Ignore';
  if (v <= 2) return 'Minor';
  if (v <= 5) return 'Balanced';
  if (v <= 8) return 'Important';
  return 'Critical';
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: 'Offers' },
    { n: 2, label: 'Weights' },
    { n: 3, label: 'Assumptions' },
  ];
  return (
    <ol className="flex items-center gap-3 text-sm" aria-label="Wizard progress">
      {items.map((it, i) => {
        const done = step > it.n;
        const active = step === it.n;
        return (
          <li key={it.n} className="flex items-center gap-3">
            <span
              aria-current={active ? 'step' : undefined}
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                done
                  ? 'bg-[rgb(var(--success))] text-white border-transparent'
                  : active
                    ? 'bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))] border-transparent'
                    : 'text-[rgb(var(--muted-foreground))]'
              }`}
            >
              {done ? '✓' : it.n}
            </span>
            <span
              className={
                active
                  ? 'font-semibold'
                  : done
                    ? 'text-[rgb(var(--foreground))]'
                    : 'text-[rgb(var(--muted-foreground))]'
              }
            >
              {it.label}
            </span>
            {i < items.length - 1 && (
              <span className={`hidden w-6 border-t sm:inline-block ${done ? 'border-[rgb(var(--success))]' : ''}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
