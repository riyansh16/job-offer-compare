import type { Weights } from './types';

/**
 * Each metric is an independent 0-10 importance rating.
 *   0 = ignore this metric entirely
 *  10 = maximum importance
 * The engine normalizes the ratings to a 100-point share at scoring time, so
 * the absolute numbers don't matter — only the relative magnitudes.
 */
export const PRESET_WEIGHTS: Record<string, Weights> = {
  Balanced: {
    salary: 8,
    bonus: 4,
    equity: 7,
    signOn: 2,
    benefits: 5,
    workMode: 4,
    growth: 5,
    reviewCompBenefits: 3,
    reviewWLB: 3,
    reviewCulture: 2,
    reviewMgmt: 2,
    reviewJobSecurityAndAdvancement: 2,
  },
  'Money-focused': {
    salary: 10,
    bonus: 6,
    equity: 9,
    signOn: 4,
    benefits: 3,
    workMode: 2,
    growth: 1,
    reviewCompBenefits: 5,
    reviewWLB: 0,
    reviewCulture: 0,
    reviewMgmt: 1,
    reviewJobSecurityAndAdvancement: 1,
  },
  'Work-life balance': {
    salary: 5,
    bonus: 2,
    equity: 3,
    signOn: 1,
    benefits: 6,
    workMode: 10,
    growth: 3,
    reviewCompBenefits: 1,
    reviewWLB: 10,
    reviewCulture: 5,
    reviewMgmt: 3,
    reviewJobSecurityAndAdvancement: 2,
  },
  'Career growth': {
    salary: 4,
    bonus: 2,
    equity: 6,
    signOn: 1,
    benefits: 2,
    workMode: 2,
    growth: 10,
    reviewCompBenefits: 2,
    reviewWLB: 1,
    reviewCulture: 2,
    reviewMgmt: 6,
    reviewJobSecurityAndAdvancement: 7,
  },
};

export const PRESET_NAMES = Object.keys(PRESET_WEIGHTS);

/**
 * Profile-aligned mix kept for backwards compatibility, but with the metric-level
 * split it's now informational only — the user-facing weights drive the score.
 */
export const PROFILE_RATING_WEIGHTS: Record<
  string,
  Partial<
    Record<
      'overall' | 'compBenefits' | 'wlb' | 'culture' | 'mgmt' | 'recommendPct',
      number
    >
  >
> = {
  Balanced: { overall: 0.4, recommendPct: 0.2, wlb: 0.15, compBenefits: 0.15, culture: 0.05, mgmt: 0.05 },
  'Money-focused': { compBenefits: 0.55, overall: 0.3, recommendPct: 0.15 },
  'Work-life balance': { wlb: 0.5, culture: 0.2, recommendPct: 0.15, mgmt: 0.1, overall: 0.05 },
  'Career growth': { mgmt: 0.4, overall: 0.3, recommendPct: 0.2, culture: 0.1 },
};


