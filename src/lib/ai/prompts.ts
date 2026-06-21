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
- Do NOT compute monetary differences yourself. For any INR gap between an offer
  and the #1 offer, cite only the precomputed "gapToLeaderInr" values. A "match X"
  target must equal that offer's raw value from the JSON, and any increase you
  propose must equal the corresponding gap. Never cite two different ₹ gap figures
  for the same metric.
- Use markdown bullets. Keep under 200 words unless asked otherwise.
- No moralizing, no disclaimers, no emoji.`;

interface PromptInput {
  comparison: ComparisonResult;
}

// Metric keys whose `raw` value is in INR. Everything else (workMode, growth,
// reviewWLB, etc.) is a 0..100 score or a star value, NOT money.
const MONEY_METRIC_KEYS = ['salary', 'bonus', 'equity', 'signOn', 'benefits'] as const;
const MONEY_METRICS = new Set<string>(MONEY_METRIC_KEYS);

function snapshot(input: PromptInput): string {
  const { comparison } = input;
  const sorted = comparison.results.slice().sort((a, b) => a.rank - b.rank);
  // The #1 offer is the reference every money gap is measured against.
  const leader = sorted[0];
  const slim = {
    weights: comparison.weights,
    equityGrowthAssumption: `${comparison.equityGrowthPct.toFixed(1)}%/yr`,
    currency: 'INR',
    leader: leader?.companyName ?? null,
    offers: sorted.map((r) => {
      const isLeader = r.offerId === leader?.offerId;
      // Precompute every money gap vs the #1 offer so the model never does its
      // own arithmetic (which produced self-contradictory deltas like "increase
      // base by ₹10L, narrowing the ₹1L gap"). Positive = this offer trails the
      // leader by that many INR; add it to match the leader. Null for the leader.
      const gapToLeaderInr =
        leader && !isLeader
          ? {
              annualValueInr: Math.round(leader.totalAnnualValue - r.totalAnnualValue),
              ...Object.fromEntries(
                MONEY_METRIC_KEYS.map((k) => [
                  k,
                  Math.round(leader.metrics[k].raw - r.metrics[k].raw),
                ]),
              ),
            }
          : null;
      return {
        company: r.companyName,
        title: r.title,
        rank: r.rank,
        totalScore: Number(r.totalScore.toFixed(1)),
        // All monetary values are in INR.
        annualValueInr: Math.round(r.totalAnnualValue),
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
        // Money deltas vs the #1 offer (null for the leader itself).
        gapToLeaderInr,
      };
    }),
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
          'Suggest 4-6 negotiation talking points for the lower-ranked offers. For each, pick the ' +
          'metrics where that offer has the largest positive "gapToLeaderInr" and frame a concrete ' +
          "ask to close exactly that amount — e.g. \"Ask {offer} to raise base by ₹4L to match " +
          "{leader}'s ₹37L\". The increase you cite MUST equal that metric's gapToLeaderInr and the " +
          '"to match" figure MUST equal the leader\'s raw value for that metric. Do not invent, ' +
          'recompute, or append any other gap number. All money in INR (₹L / ₹Cr). Bullet format.',
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
