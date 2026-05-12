'use client';

import { useEffect, useState } from 'react';
import type { AiInsightKind } from '@/lib/engine';

const KINDS: { kind: AiInsightKind; label: string; description: string }[] = [
  { kind: 'Verdict', label: 'Verdict', description: 'Why offer #1 wins.' },
  { kind: 'Tradeoffs', label: 'Trade-offs', description: 'What you give up.' },
  { kind: 'Negotiation', label: 'Negotiation talking points', description: 'Concrete asks.' },
  { kind: 'Questions', label: 'Recruiter questions', description: 'Smart questions per company.' },
];

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
  const [loading, setLoading] = useState<Record<AiInsightKind, boolean>>({
    Verdict: false,
    Tradeoffs: false,
    Negotiation: false,
    Questions: false,
  });

  // Auto-load Verdict on mount.
  useEffect(() => {
    void fetchInsight('Verdict', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchInsight(kind: AiInsightKind, force: boolean) {
    setLoading((l) => ({ ...l, [kind]: true }));
    setContent((c) => ({ ...c, [kind]: '' }));
    try {
      const res = await fetch(`/api/comparisons/${comparisonId}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, force }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        setContent((c) => ({ ...c, [kind]: `[AI error: ${err?.error ?? res.statusText}]` }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        setContent((c) => ({ ...c, [kind]: buf }));
      }
    } catch (e) {
      setContent((c) => ({
        ...c,
        [kind]: `[AI error: ${e instanceof Error ? e.message : 'unknown'}]`,
      }));
    } finally {
      setLoading((l) => ({ ...l, [kind]: false }));
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
        {KINDS.map(({ kind, label, description }) => (
          <div key={kind} className="rounded-lg border">
            <button
              onClick={() => toggle(kind)}
              className="flex w-full items-center justify-between p-3 text-left"
            >
              <div>
                <div className="font-medium">{label}</div>
                <div className="text-xs text-[rgb(var(--muted-foreground))]">{description}</div>
              </div>
              <div className="flex items-center gap-2">
                {loading[kind] && <span className="text-xs">streaming…</span>}
                <span className="text-lg">{open[kind] ? '−' : '+'}</span>
              </div>
            </button>
            {open[kind] && (
              <div className="border-t p-3">
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                  {content[kind] || (loading[kind] ? '' : '(click Regenerate to fetch)')}
                </div>
                <div className="mt-2 text-right">
                  <button
                    onClick={() => fetchInsight(kind, true)}
                    disabled={loading[kind]}
                    className="btn-outline text-xs"
                  >
                    {loading[kind] ? 'Working…' : 'Regenerate'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
