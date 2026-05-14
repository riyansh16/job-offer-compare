import type { AiInsightKind } from '../engine/types';
import type { ComparisonResult } from '../engine/types';

const SYSTEM = `You are a concise career advisor helping a candidate compare job offers.
You receive a structured JSON snapshot of one comparison and produce short, plain-English insights.
Rules:
- Never invent numbers — only cite values present in the JSON.
- Be specific: name companies and money deltas.
- All monetary values in the JSON are in INR (Indian Rupees). Always cite numbers
  in INR using the ₹ symbol with the Indian Lakh / Crore convention:
    1,00,000      = ₹1L
    10,00,000     = ₹10L
    1,00,00,000   = ₹1Cr
  Round to one decimal (e.g. ₹54.8L, ₹1.2Cr). Do NOT convert to USD or any other currency.
- Money metrics are: salary, bonus, equity, signOn, benefits, annualValueInr.
  All other metric "raw" values are 0–100 scores or stars (NOT money). Never
  prefix non-money metrics with ₹.
- Use markdown bullets. Keep under 200 words unless asked otherwise.
- No moralizing, no disclaimers, no emoji.`;

interface PromptInput {
  comparison: ComparisonResult;
}

// Metric keys whose `raw` value is in INR. Everything else (workMode, growth,
// reviewWLB, etc.) is a 0..100 score or a star value, NOT money.
const MONEY_METRICS = new Set(['salary', 'bonus', 'equity', 'signOn', 'benefits']);

function snapshot(input: PromptInput): string {
  const { comparison } = input;
  const slim = {
    weights: comparison.weights,
    equityGrowthAssumption: `${comparison.equityGrowthPct.toFixed(1)}%/yr`,
    currency: 'INR',
    offers: comparison.results
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({
        company: r.companyName,
        title: r.title,
        rank: r.rank,
        totalScore: Number(r.totalScore.toFixed(1)),
        // Engine-internal currency is INR; the UI converts to nativeCurrency
        // for display, but the AI is told to think in INR throughout.
        annualValueInr: Math.round(r.totalAnnualValue),
        // Original currency the user entered (FYI for the model — citations
        // should still be in INR per the system rules above).
        nativeCurrency: r.nativeCurrency ?? 'INR',
        metrics: Object.fromEntries(
          Object.entries(r.metrics).map(([k, v]) => {
            const isMoney = MONEY_METRICS.has(k);
            return [
              k,
              {
                // Money raw stays a number (engine INR). Non-money raw is
                // string-suffixed so the model can't accidentally cite it as ₹.
                raw: isMoney
                  ? Math.round(v.raw)
                  : k.startsWith('review')
                    ? `${(v.raw / 20).toFixed(1)}★`
                    : `${Math.round(v.raw)}/100`,
                score: Number(v.normalized.toFixed(0)),
              },
            ];
          }),
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
  const base = `Comparison snapshot (all monetary fields are in INR):\n\n${data}\n\n`;
  switch (kind) {
    case 'Verdict':
      return {
        system: SYSTEM,
        user:
          base +
          'Write a "Verdict" with this structure:\n' +
          '- One opening sentence naming the #1 offer and its total score.\n' +
          '- A bullet list of 3-5 concrete reasons it leads, each citing a specific INR delta ' +
          '(using ₹L / ₹Cr) or score delta vs the runner-up.\n' +
          '- One closing sentence on the main caveat (if any).',
        maxTokens: 500,
      };
    case 'Tradeoffs':
      return {
        system: SYSTEM,
        user:
          base +
          'List 3-5 concrete trade-offs of picking the #1-ranked offer compared to the others ' +
          '(metrics where it scores lower). Cite money gaps in INR (₹L / ₹Cr). Use bullet format.',
        maxTokens: 400,
      };
    case 'Negotiation':
      return {
        system: SYSTEM,
        user:
          base +
          'Suggest 4-6 negotiation talking points for the lower-ranked offers based on ' +
          'specific gaps vs the leader (e.g. "Ask Offer X to match Offer Y on base salary — ₹4L gap"). ' +
          'All money in INR (₹L / ₹Cr). Use bullet format with concrete asks.',
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
