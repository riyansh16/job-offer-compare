import { describe, it, expect } from 'vitest';
import {
  annualizeBonus,
  amortizeSignOn,
  commuteCostAnnual,
  totalAnnualValue,
  compareOffers,
  normalizeWeights,
  PRESET_WEIGHTS,
} from '../src/lib/engine';
import type { CompensationInput, OfferInput, Weights } from '../src/lib/engine';

const baseSchedule = { years: 4, cliffMonths: 12, cadence: 'quarterly' as const };

const makeComp = (over: Partial<CompensationInput> = {}): CompensationInput => ({
  baseSalary: 150_000,
  currency: 'USD',
  targetBonusPct: 15,
  signOnBonus: 20_000,
  equityTotal: 200_000,
  equityVestSchedule: baseSchedule,
  benefitsValueAnnual: 12_000,
  ptoDays: 20,
  workMode: 'Hybrid',
  commuteCostMonthly: 300,
  qualitativeScore: 70,
  ...over,
});

const makeOffer = (id: string, over: Partial<OfferInput> = {}): OfferInput => ({
  id,
  companyName: id.toUpperCase(),
  title: 'Senior Engineer',
  location: 'New York, NY',
  compensation: makeComp(),
  reviewAspects: { compBenefits: 4, wlb: 4, culture: 4, mgmt: 4 },
  ...over,
});

describe('annualizeBonus', () => {
  it('multiplies base by target percentage', () => {
    expect(annualizeBonus(100_000, 15)).toBe(15_000);
  });
  it('returns 0 for zero base or zero pct', () => {
    expect(annualizeBonus(0, 10)).toBe(0);
    expect(annualizeBonus(100_000, 0)).toBe(0);
  });
});

describe('amortizeSignOn', () => {
  it('counts the full sign-on amount in year 1', () => {
    expect(amortizeSignOn(40_000, 4)).toBe(40_000);
  });
  it('returns 0 for zero or negative amounts', () => {
    expect(amortizeSignOn(0, 4)).toBe(0);
    expect(amortizeSignOn(-100, 4)).toBe(0);
  });
});

describe('commuteCostAnnual', () => {
  it('returns 0 for remote', () => {
    expect(commuteCostAnnual(500, 'Remote')).toBe(0);
  });
  it('halves for hybrid', () => {
    expect(commuteCostAnnual(500, 'Hybrid')).toBe(500 * 12 * 0.5);
  });
  it('full for onsite', () => {
    expect(commuteCostAnnual(500, 'Onsite')).toBe(500 * 12);
  });
});

describe('totalAnnualValue', () => {
  it('combines base, bonus, equity, signOn, benefits minus commute', () => {
    const c = makeComp({
      baseSalary: 100_000,
      targetBonusPct: 10,
      signOnBonus: 0,
      equityTotal: 0,
      benefitsValueAnnual: 5_000,
      commuteCostMonthly: 0,
    });
    const v = totalAnnualValue(c, { equityGrowthPct: 0 });
    expect(v).toBeCloseTo(115_000, 0); // 100k + 10k bonus + 5k benefits
  });
});

describe('normalizeWeights', () => {
  it('rescales any importance ratings into a 100-point share', () => {
    // Presets are now 0-10 importance ratings; engine normalizes by total.
    const w = PRESET_WEIGHTS.Balanced;
    const norm = normalizeWeights(w);
    const sum = Object.values(norm).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it('rescales weights that sum to something other than 100', () => {
    const w: Weights = {
      salary: 50,
      bonus: 0,
      equity: 50,
      signOn: 0,
      benefits: 0,
      workMode: 0,
      growth: 100,
      reviewCompBenefits: 0,
      reviewWLB: 0,
      reviewCulture: 0,
      reviewMgmt: 0,
    };
    const norm = normalizeWeights(w);
    const sum = Object.values(norm).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it('uniform fallback when all weights are zero', () => {
    const w: Weights = {
      salary: 0, bonus: 0, equity: 0, signOn: 0, benefits: 0,
      workMode: 0, growth: 0,
      reviewCompBenefits: 0, reviewWLB: 0, reviewCulture: 0, reviewMgmt: 0,
    };
    const norm = normalizeWeights(w);
    // 11 metrics now -> uniform fallback is 100/11 ≈ 9.09
    expect(norm.salary).toBeCloseTo(100 / 11, 5);
  });
});

describe('compareOffers', () => {
  it('returns empty results for empty input', () => {
    const r = compareOffers([], PRESET_WEIGHTS.Balanced);
    expect(r.results).toEqual([]);
  });

  it('single offer scores 100 across the board (no normalization range)', () => {
    const r = compareOffers([makeOffer('a')], PRESET_WEIGHTS.Balanced);
    expect(r.results[0].rank).toBe(1);
    expect(r.results[0].totalScore).toBeCloseTo(100, 5);
  });

  it('higher base salary wins under Money-focused with equal everything else', () => {
    const a = makeOffer('a', {
      compensation: makeComp({ baseSalary: 200_000 }),
    });
    const b = makeOffer('b', {
      compensation: makeComp({ baseSalary: 150_000 }),
    });
    const r = compareOffers([a, b], PRESET_WEIGHTS['Money-focused']);
    const winner = r.results.find((x) => x.rank === 1)!;
    expect(winner.offerId).toBe('a');
  });

  it('more PTO and remote wins under Work-life balance', () => {
    const a = makeOffer('a', {
      compensation: makeComp({
        baseSalary: 150_000,
        ptoDays: 30,
        workMode: 'Remote',
        commuteCostMonthly: 0,
      }),
    });
    const b = makeOffer('b', {
      compensation: makeComp({
        baseSalary: 160_000,
        ptoDays: 12,
        workMode: 'Onsite',
        commuteCostMonthly: 400,
      }),
    });
    const r = compareOffers([a, b], PRESET_WEIGHTS['Work-life balance']);
    const winner = r.results.find((x) => x.rank === 1)!;
    expect(winner.offerId).toBe('a');
  });

  it('rationale mentions winner and runner-up', () => {
    const a = makeOffer('a', { compensation: makeComp({ baseSalary: 200_000 }) });
    const b = makeOffer('b', { compensation: makeComp({ baseSalary: 150_000 }) });
    const r = compareOffers([a, b], PRESET_WEIGHTS['Money-focused']);
    expect(r.rationale[0]).toContain('A');
    expect(r.rationale[0]).toContain('B');
  });
});
