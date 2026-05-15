/**
 * Domain types shared across the engine, providers, and UI.
 * These mirror the Prisma models but are plain TS for engine code that
 * shouldn't depend on the Prisma client (so the engine stays unit-testable
 * without a database).
 */

export type WorkMode = 'Remote' | 'Hybrid' | 'Onsite';
export type OfferStatus = 'Active' | 'Archived' | 'Accepted' | 'Rejected';
export type AiInsightKind = 'Verdict' | 'Tradeoffs' | 'Negotiation' | 'Questions';

export type VestingCadence = 'monthly' | 'quarterly' | 'annual';

export interface VestSchedule {
  years: number;
  cliffMonths: number;
  cadence: VestingCadence;
  /** If true, uses 5/15/40/40 instead of equal per-year. */
  backloaded?: boolean;
  /** Optional explicit per-year percentages (must sum to 100). Overrides backloaded. */
  customSchedule?: number[];
}

export interface CompensationInput {
  baseSalary: number;
  targetBonusPct: number;
  signOnBonus: number;
  equityTotal: number;
  equityVestSchedule: VestSchedule;
  benefitsValueAnnual: number;
  ptoDays: number;
  workMode: WorkMode;
  commuteCostMonthly: number;
  qualitativeScore: number; // 0..100
}

export interface OfferInput {
  id: string;
  companyName: string;
  title: string;
  level?: string;
  location: string;
  isCurrent?: boolean;
  compensation: CompensationInput;
  /**
   * Per-aspect review scores (0..5, same scale as star ratings). Each is
   * Bayesian-shrunk from the Indeed sub-ratings stored on the company record.
   * Missing aspects gracefully fall back to the company's overall rating.
   */
  reviewAspects?: {
    compBenefits?: number;
    wlb?: number;
    culture?: number;
    mgmt?: number;
    jobSecurityAndAdvancement?: number;
  };
}

/** All weights are 0..100 and must sum to 100 (engine auto-normalizes if not). */
export interface Weights {
  salary: number;
  bonus: number;
  equity: number;
  signOn: number;
  benefits: number;
  workMode: number;
  growth: number;
  // Review sub-aspects (driven by Indeed sub-ratings).
  reviewCompBenefits: number;
  reviewWLB: number;
  reviewCulture: number;
  reviewMgmt: number;
  reviewJobSecurityAndAdvancement: number;
}

export type MetricKey = keyof Weights;

export const METRIC_KEYS: MetricKey[] = [
  'salary',
  'bonus',
  'equity',
  'signOn',
  'benefits',
  'workMode',
  'growth',
  'reviewCompBenefits',
  'reviewWLB',
  'reviewCulture',
  'reviewMgmt',
  'reviewJobSecurityAndAdvancement',
];

export const METRIC_LABELS: Record<MetricKey, string> = {
  salary: 'Base salary',
  bonus: 'Annual bonus',
  equity: 'Equity (annualized)',
  signOn: 'Sign-on (year 1)',
  benefits: 'Benefits value',
  workMode: 'Work mode',
  growth: 'Career growth / fit',
  reviewCompBenefits: 'Reviews · Comp & Benefits',
  reviewWLB: 'Reviews · Work-Life Balance',
  reviewCulture: 'Reviews · Culture',
  reviewMgmt: 'Reviews · Management',
  reviewJobSecurityAndAdvancement: 'Reviews · Job Security & Advancement',
};

export interface MetricBreakdown {
  /** Raw INR value used for both display and scoring. */
  raw: number;
  normalized: number; // 0..100
  weight: number; // 0..100
  weighted: number; // normalized * weight / 100
}

export interface OfferResult {
  offerId: string;
  companyName: string;
  title: string;
  totalAnnualValue: number;
  totalScore: number; // 0..100
  rank: number;
  metrics: Record<MetricKey, MetricBreakdown>;
  /** Applied stock-growth assumption used to scale equity (e.g. 10.94 means +10.94%/yr).
   *  Comes from the user override if set, else cached trailing 5y CAGR, else 0. */
  equityGrowthAppliedPct?: number;
  /** Source of the growth value: 'override' (user), 'cagr' (cached trailing CAGR), or 'none'. */
  equityGrowthSource?: 'override' | 'cagr' | 'none';
}

export interface ComparisonResult {
  results: OfferResult[];
  weights: Weights;
  equityGrowthPct: number;
  /** Plain-text rationale strings (not AI-generated). */
  rationale: string[];
}
