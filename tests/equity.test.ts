import { describe, it, expect } from 'vitest';
import {
  buildPerYearVestingPercentages,
  valueEquity,
  computeHistoricalCagr,
} from '../src/lib/engine/equity';

describe('buildPerYearVestingPercentages', () => {
  it('4-year quarterly with 12-month cliff: equal slices', () => {
    const r = buildPerYearVestingPercentages({ years: 4, cliffMonths: 12, cadence: 'quarterly' });
    expect(r).toEqual([25, 25, 25, 25]);
  });

  it('Amazon-style backloaded 4-year: 5/15/40/40', () => {
    const r = buildPerYearVestingPercentages({
      years: 4,
      cliffMonths: 12,
      cadence: 'annual',
      backloaded: true,
    });
    expect(r).toEqual([5, 15, 40, 40]);
  });

  it('honors customSchedule when provided', () => {
    const r = buildPerYearVestingPercentages({
      years: 4,
      cliffMonths: 12,
      cadence: 'annual',
      customSchedule: [10, 20, 30, 40],
    });
    expect(r).toEqual([10, 20, 30, 40]);
  });

  it('cliff > 1 year delays vesting', () => {
    const r = buildPerYearVestingPercentages({ years: 4, cliffMonths: 24, cadence: 'annual' });
    expect(r[0]).toBe(0);
    expect(r[1]).toBe(0);
    // Remaining 100% spread over years 3 and 4 -> 50 each.
    expect(r[2]).toBe(50);
    expect(r[3]).toBe(50);
  });
});

describe('valueEquity', () => {
  it('returns 0 for zero or negative input', () => {
    expect(valueEquity(0)).toBe(0);
    expect(valueEquity(-100)).toBe(0);
  });

  it('returns the per-year amount unchanged (identity)', () => {
    // The new model: user enters $50K of equity vesting per year directly.
    expect(valueEquity(50_000)).toBe(50_000);
    expect(valueEquity(123_456.78)).toBe(123_456.78);
  });
});

describe('computeHistoricalCagr', () => {
  it('returns null for empty or single-point series', () => {
    expect(computeHistoricalCagr([], 5)).toBeNull();
    expect(computeHistoricalCagr([{ date: '2024-01-01', closeUsd: 100 }], 5)).toBeNull();
  });

  it('$100 -> $200 over 5 years ≈ 14.87% CAGR', () => {
    const start = new Date('2020-01-01').toISOString();
    const end = new Date('2025-01-01').toISOString();
    const cagr = computeHistoricalCagr(
      [
        { date: start, closeUsd: 100 },
        { date: end, closeUsd: 200 },
      ],
      5,
    );
    expect(cagr).not.toBeNull();
    expect(cagr!).toBeCloseTo(14.87, 1);
  });

  it('returns null when elapsed history is < 0.5 years', () => {
    const cagr = computeHistoricalCagr(
      [
        { date: '2024-01-01', closeUsd: 100 },
        { date: '2024-02-01', closeUsd: 110 },
      ],
      5,
    );
    expect(cagr).toBeNull();
  });

  it('handles unsorted input', () => {
    const cagr = computeHistoricalCagr(
      [
        { date: '2025-01-01', closeUsd: 200 },
        { date: '2020-01-01', closeUsd: 100 },
      ],
      5,
    );
    expect(cagr).toBeCloseTo(14.87, 1);
  });
});
