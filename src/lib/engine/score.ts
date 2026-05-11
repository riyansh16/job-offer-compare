import { valueEquity } from './equity';
import type {
  ComparisonResult,
  CompensationInput,
  MetricBreakdown,
  MetricKey,
  OfferInput,
  OfferResult,
  Weights,
  WorkMode,
} from './types';
import { METRIC_KEYS } from './types';

const WORK_MODE_SCORE: Record<WorkMode, number> = {
  Remote: 100,
  Hybrid: 60,
  Onsite: 30,
};

export interface EngineOptions {
  /** Annual share-price growth assumption applied to all offers' equity. */
  equityGrowthPct?: number;
  /** Years to amortize sign-on bonus over. Default 4. */
  signOnAmortYears?: number;
}

/** Annualize bonus = base * targetPct/100. */
export function annualizeBonus(base: number, targetPct: number): number {
  if (base <= 0 || targetPct <= 0) return 0;
  return base * (targetPct / 100);
}

/** Sign-on amortized over `years`. */
export function amortizeSignOn(amount: number, years: number): number {
  if (amount <= 0 || years <= 0) return 0;
  return amount / years;
}

/** Annual commute cost based on work mode (Hybrid = 50% of full). */
export function commuteCostAnnual(monthly: number, mode: WorkMode): number {
  if (monthly <= 0) return 0;
  if (mode === 'Remote') return 0;
  if (mode === 'Hybrid') return monthly * 12 * 0.5;
  return monthly * 12;
}

/**
 * Compute the composite annual value of a compensation package.
 * All amounts are taken at face value in their entered currency (the runner
 * normalizes via FX before calling the engine).
 */
export function totalAnnualValue(
  comp: CompensationInput,
  opts: EngineOptions = {},
): number {
  // equityTotal field is interpreted as "$ vesting per year" (see equity.ts).
  const equity = valueEquity(comp.equityTotal);
  const signOn = amortizeSignOn(comp.signOnBonus, opts.signOnAmortYears ?? 4);
  const bonus = annualizeBonus(comp.baseSalary, comp.targetBonusPct);
  const commute = commuteCostAnnual(comp.commuteCostMonthly, comp.workMode);
  return comp.baseSalary + bonus + equity + signOn + comp.benefitsValueAnnual - commute;
}

interface RawMetricRow {
  offerId: string;
  values: Record<MetricKey, number>;
  totalAnnualValue: number;
}

function rawMetricsFor(offer: OfferInput, opts: EngineOptions): RawMetricRow {
  const c = offer.compensation;
  const bonus = annualizeBonus(c.baseSalary, c.targetBonusPct);
  const equity = valueEquity(c.equityTotal);
  const signOn = amortizeSignOn(c.signOnBonus, opts.signOnAmortYears ?? 4);

  // Round star ratings to 0.1 ★ precision (= 2 points on 0..100) so two
  // companies that *display* the same star rating also *score* the same.
  // Bayesian shrinkage produces tiny sub-decimal differences (e.g. 4.402 vs
  // 4.398) that round to the same display but would otherwise normalize to
  // 100 vs 99.9, surfacing a misleading 0.1 contrib gap.
  const star = (v: number | undefined): number => Math.round(((v ?? 0) * 20) / 2) * 2;

  const values = {
    salary: c.baseSalary,
    bonus,
    equity,
    signOn,
    benefits: c.benefitsValueAnnual,
    workMode: WORK_MODE_SCORE[c.workMode],
    growth: c.qualitativeScore,
    reviewCompBenefits: star(offer.reviewAspects?.compBenefits),
    reviewWLB: star(offer.reviewAspects?.wlb),
    reviewCareerOpps: star(offer.reviewAspects?.careerOpps),
    reviewCulture: star(offer.reviewAspects?.culture),
    reviewMgmt: star(offer.reviewAspects?.mgmt),
  } satisfies Record<MetricKey, number>;

  return {
    offerId: offer.id,
    totalAnnualValue: totalAnnualValue(c, opts),
    values,
  };
}

/**
 * Proportional normalization: each value is scored as `value / max × 100`.
 * Best on this metric scores 100; others get a partial score reflecting how
 * close they are to the leader (e.g. ratings 4.0 vs 4.4 → 91 vs 100, not 0/100).
 *
 * Edge cases:
 *  - All zeros (or all negatives): everyone gets 0.
 *  - Negative max (rare): clamped to 0 to avoid sign flips.
 */
function normalizeMetric(values: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [100];
  const max = Math.max(...values);
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => Math.max(0, Math.min(100, (v / max) * 100)));
}

/** Returns weights normalized so their sum is 100. */
export function normalizeWeights(weights: Weights): Weights {
  const total = METRIC_KEYS.reduce((s, k) => s + (weights[k] || 0), 0);
  if (total === 0) {
    // Avoid divide-by-zero; uniform fallback.
    const each = 100 / METRIC_KEYS.length;
    const out = {} as Weights;
    for (const k of METRIC_KEYS) out[k] = each;
    return out;
  }
  if (Math.abs(total - 100) < 0.001) return weights;
  const scale = 100 / total;
  const out = {} as Weights;
  for (const k of METRIC_KEYS) out[k] = (weights[k] || 0) * scale;
  return out;
}

/**
 * Score and rank a list of offers under a weighting scheme.
 * Pure function — no I/O. Produces a deterministic snapshot.
 */
export function compareOffers(
  offers: OfferInput[],
  weights: Weights,
  opts: EngineOptions = {},
): ComparisonResult {
  if (offers.length === 0) {
    return {
      results: [],
      weights: normalizeWeights(weights),
      equityGrowthPct: opts.equityGrowthPct ?? 0,
      rationale: ['No offers to compare.'],
    };
  }

  const normalizedWeights = normalizeWeights(weights);
  const rawRows = offers.map((o) => rawMetricsFor(o, opts));

  // Per-metric normalization across offers.
  const normalizedByMetric: Record<MetricKey, number[]> = {} as Record<MetricKey, number[]>;
  for (const k of METRIC_KEYS) {
    normalizedByMetric[k] = normalizeMetric(rawRows.map((r) => r.values[k]));
  }

  const results: OfferResult[] = offers.map((offer, idx) => {
    const metrics = {} as Record<MetricKey, MetricBreakdown>;
    let total = 0;
    for (const k of METRIC_KEYS) {
      const raw = rawRows[idx].values[k];
      const normalized = normalizedByMetric[k][idx];
      const weight = normalizedWeights[k];
      const weighted = (normalized * weight) / 100;
      metrics[k] = {
        raw,
        normalized,
        weight,
        weighted,
      };
      total += weighted;
    }
    return {
      offerId: offer.id,
      companyName: offer.companyName,
      title: offer.title,
      totalAnnualValue: rawRows[idx].totalAnnualValue,
      totalScore: total,
      rank: 0, // assigned below
      metrics,
    };
  });

  // Rank: highest score first.
  const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);
  sorted.forEach((r, i) => (r.rank = i + 1));

  // Build short, factual rationale strings (top 2-3 driving factors of the winner).
  const rationale = buildRationale(sorted, normalizedWeights);

  return {
    results,
    weights: normalizedWeights,
    equityGrowthPct: opts.equityGrowthPct ?? 0,
    rationale,
  };
}

function buildRationale(sorted: OfferResult[], weights: Weights): string[] {
  if (sorted.length === 0) return [];
  if (sorted.length === 1) {
    return [`Only one offer (${sorted[0].companyName}) — score ${sorted[0].totalScore.toFixed(1)}.`];
  }
  const winner = sorted[0];
  const runnerUp = sorted[1];
  // Top 3 metrics where the winner most outperforms the runner-up (weighted contribution).
  const deltas = METRIC_KEYS.map((k) => ({
    metric: k,
    delta: winner.metrics[k].weighted - runnerUp.metrics[k].weighted,
    rawDelta: winner.metrics[k].raw - runnerUp.metrics[k].raw,
  }))
    .filter((d) => d.delta > 0.5 && weights[d.metric] > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);

  const out: string[] = [];
  out.push(
    `${winner.companyName} ranks #1 with score ${winner.totalScore.toFixed(1)}, ` +
      `ahead of ${runnerUp.companyName} (${runnerUp.totalScore.toFixed(1)}).`,
  );
  if (deltas.length > 0) {
    const drivers = deltas.map((d) => d.metric).join(', ');
    out.push(`Top driving factors for the winner: ${drivers}.`);
  }
  // Trade-offs: metrics where the winner is worse than the runner-up.
  const tradeoffs = METRIC_KEYS.map((k) => ({
    metric: k,
    delta: runnerUp.metrics[k].raw - winner.metrics[k].raw,
  }))
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 2);
  if (tradeoffs.length > 0) {
    out.push(
      `Trade-offs picking ${winner.companyName}: lower ${tradeoffs.map((t) => t.metric).join(', ')}.`,
    );
  }
  return out;
}
