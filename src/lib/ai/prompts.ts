import type { AiInsightKind } from '../engine/types';
import type { ComparisonResult } from '../engine/types';

const SYSTEM = `You are a concise career advisor helping a candidate compare job offers.
You receive a structured JSON snapshot of one comparison and produce short, plain-English insights.
Rules:
- Never invent numbers — only cite values present in the JSON.
- Be specific: name companies and dollar deltas.
- Use markdown bullets. Keep under 200 words unless asked otherwise.
- No moralizing, no disclaimers, no emoji.`;

interface PromptInput {
  comparison: ComparisonResult;
}

function snapshot(input: PromptInput): string {
  const { comparison } = input;
  const slim = {
    weights: comparison.weights,
    equityGrowthPct: comparison.equityGrowthPct,
    offers: comparison.results
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({
        company: r.companyName,
        title: r.title,
        rank: r.rank,
        totalScore: Number(r.totalScore.toFixed(1)),
        annualValueUsd: Math.round(r.totalAnnualValue),
        metrics: Object.fromEntries(
          Object.entries(r.metrics).map(([k, v]) => [
            k,
            { raw: Math.round(v.raw), score: Number(v.normalized.toFixed(0)) },
          ]),
        ),
      })),
  };
  return JSON.stringify(slim, null, 2);
}

export interface PromptSpec {
  system: string;
  user: string;
  maxTokens: number;
}

export function buildPrompt(kind: AiInsightKind, input: PromptInput): PromptSpec {
  const data = snapshot(input);
  const base = `Comparison snapshot:\n\n${data}\n\n`;
  switch (kind) {
    case 'Verdict':
      return {
        system: SYSTEM,
        user:
          base +
          'Write a 5-7 sentence "Verdict" explaining which offer ranks #1 and the top 2-3 metrics ' +
          'driving its lead, citing specific dollar deltas and score deltas vs the runner-up.',
        maxTokens: 500,
      };
    case 'Tradeoffs':
      return {
        system: SYSTEM,
        user:
          base +
          'List 3-5 concrete trade-offs of picking the #1-ranked offer compared to the others ' +
          '(metrics where it scores lower). Use bullet format.',
        maxTokens: 400,
      };
    case 'Negotiation':
      return {
        system: SYSTEM,
        user:
          base +
          'Suggest 4-6 negotiation talking points for the lower-ranked offers based on ' +
          'specific gaps vs the leader (e.g. "Ask Offer X to match Offer Y on base salary"). ' +
          'Use bullet format with concrete asks.',
        maxTokens: 500,
      };
    case 'Questions':
      return {
        system: SYSTEM,
        user:
          base +
          'Generate 5-7 smart questions the candidate should ask each recruiter to fill in ' +
          'missing or uncertain data (e.g. cliff length, refresh grants, bonus history, ' +
          'on-call expectations). Group by company.',
        maxTokens: 500,
      };
  }
}
