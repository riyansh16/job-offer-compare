import { describe, it, expect } from 'vitest';
import {
  valueEquity,
  computeHistoricalCagr,
} from '../src/lib/engine/equity';

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
