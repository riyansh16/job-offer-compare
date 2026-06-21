'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RefreshCw } from 'lucide-react';
import type { AiInsightKind } from '@/lib/engine';
import { Spinner } from './ui/Spinner';
import { SkeletonLines } from './ui/Skeleton';

const KINDS: { kind: AiInsightKind; label: string; description: string }[] = [
  { kind: 'Verdict', label: 'Verdict', description: 'Why offer #1 wins.' },
  { kind: 'Tradeoffs', label: 'Trade-offs', description: 'What you give up.' },
  { kind: 'Negotiation', label: 'Negotiation talking points', description: 'Concrete asks.' },
  { kind: 'Questions', label: 'Recruiter questions', description: 'Smart questions per company.' },
];

// Minimum gap between user-initiated regenerates of the same insight.
const REGEN_COOLDOWN_MS = 10_000;

export function AiInsightsPanel({ comparisonId }: { comparisonId: string }) {
  const [open, setOpen] = useState<Record<AiInsightKind, boolean>>({
    Verdict: true,
    Tradeoffs: false,
    Negotiation: false,
    Questions: false,
  });
  const [content, setContent] = useState<Record<AiInsightKind, string>>({
    Verdict: '',
    Tradeoffs: '',
    Negotiation: '',
    Questions: '',
  });
  const [errors, setErrors] = useState<Record<AiInsightKind, string | null>>({
    Verdict: null,
    Tradeoffs: null,
    Negotiation: null,
    Questions: null,
  });
  const [loading, setLoading] = useState<Record<AiInsightKind, boolean>>({
    Verdict: false,
    Tradeoffs: false,
    Negotiation: false,
    Questions: false,
  });
  // Epoch-ms per kind until which regenerate is disabled (0 = no cooldown).
  // Each regenerate is a real LLM call, so we throttle re-rolls to once per
  // REGEN_COOLDOWN_MS to blunt accidental double-clicks / hammering without a
  // full server-side rate limiter (deferred to v2).
  const [cooldownUntil, setCooldownUntil] = useState<Record<AiInsightKind, number>>({
    Verdict: 0,
    Tradeoffs: 0,
    Negotiation: 0,
    Questions: 0,
  });
  // Ticks while any cooldown is active so the countdown label updates, then
  // self-terminates (the effect re-runs on `now` and bails when none remain).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Object.values(cooldownUntil).some((t) => t > now)) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [cooldownUntil, now]);

  // Auto-load Verdict on mount.
  useEffect(() => {
    void fetchInsight('Verdict', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchInsight(kind: AiInsightKind, force: boolean) {
    setLoading((l) => ({ ...l, [kind]: true }));
    setErrors((e) => ({ ...e, [kind]: null }));
    // Keep prior content visible while regenerating; only clear if this is a
    // fresh fetch (no content yet).
    if (!content[kind]) setContent((c) => ({ ...c, [kind]: '' }));
    let buf = '';
    try {
      const res = await fetch(`/api/comparisons/${comparisonId}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, force }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        setErrors((e) => ({ ...e, [kind]: String(err?.error ?? res.statusText) }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let firstChunk = true;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // On first chunk, replace any prior content with the new stream.
        if (firstChunk) {
          firstChunk = false;
          setContent((c) => ({ ...c, [kind]: buf }));
        } else {
          setContent((c) => ({ ...c, [kind]: buf }));
        }
      }
    } catch {
      setErrors((er) => ({
        ...er,
        [kind]: 'Could not reach the AI service. Please try again.',
      }));
    } finally {
      setLoading((l) => ({ ...l, [kind]: false }));
      // Start the cooldown only for user-initiated re-rolls (force), never the
      // initial auto-load, so the first view is instant.
      if (force) {
        setCooldownUntil((c) => ({ ...c, [kind]: Date.now() + REGEN_COOLDOWN_MS }));
      }
    }
  }

  function toggle(kind: AiInsightKind) {
    const wasOpen = open[kind];
    setOpen((o) => ({ ...o, [kind]: !wasOpen }));
    if (!wasOpen && !content[kind] && !loading[kind]) {
      void fetchInsight(kind, false);
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">AI insights</h2>
      </div>

      <div className="space-y-3">
        {KINDS.map(({ kind, label, description }) => {
          const isLoading = loading[kind];
          const errorMsg = errors[kind];
          const hasContent = !!content[kind];
          const showSkeleton = isLoading && !hasContent;
          const cdRemaining = Math.max(0, Math.ceil((cooldownUntil[kind] - now) / 1000));
          const onCooldown = cdRemaining > 0;
          return (
            <div key={kind} className="rounded-lg border">
              <button
                onClick={() => toggle(kind)}
                className="flex w-full items-center justify-between p-3 text-left"
                aria-expanded={open[kind]}
              >
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-[rgb(var(--muted-foreground))]">{description}</div>
                </div>
                <div className="flex items-center gap-2">
                  {isLoading && (
                    <span className="flex items-center gap-1 text-xs text-[rgb(var(--muted-foreground))]">
                      <Spinner size={12} label="Streaming" /> streaming…
                    </span>
                  )}
                  <span className="text-lg" aria-hidden>
                    {open[kind] ? '−' : '+'}
                  </span>
                </div>
              </button>
              {open[kind] && (
                <div className="border-t p-3">
                  {showSkeleton ? (
                    <SkeletonLines count={4} />
                  ) : hasContent ? (
                    <>
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content[kind]}</ReactMarkdown>
                      </div>
                      <button
                        onClick={() => fetchInsight(kind, true)}
                        disabled={isLoading || onCooldown}
                        className="btn-outline mt-3 text-xs"
                        title="Generate a fresh take on this insight"
                      >
                        <RefreshCw size={12} aria-hidden />
                        {onCooldown ? `Regenerate (${cdRemaining}s)` : 'Regenerate'}
                      </button>
                    </>
                  ) : !errorMsg ? (
                    <p className="text-sm text-[rgb(var(--muted-foreground))]">
                      Loading…
                    </p>
                  ) : null}

                  {errorMsg && (
                    <div className="mt-2 rounded-md border border-[rgb(var(--danger))]/40 bg-[rgb(var(--danger))]/5 p-2 text-xs">
                      <p className="text-[rgb(var(--danger))]">AI error: {errorMsg}</p>
                      <button
                        onClick={() => fetchInsight(kind, true)}
                        disabled={isLoading || onCooldown}
                        className="btn-outline mt-2 text-xs"
                      >
                        <RefreshCw size={12} aria-hidden />
                        {onCooldown ? `Retry (${cdRemaining}s)` : 'Retry'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
