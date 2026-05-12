import type { VestSchedule } from './types';

/**
 * Compute the percentage of the grant that vests each year over the schedule's
 * full duration. Returned array length === years. Values sum to 100 (within
 * floating-point tolerance) when the cliff is honored normally.
 */
export function buildPerYearVestingPercentages(schedule: VestSchedule): number[] {
  const { years, cliffMonths, backloaded, customSchedule } = schedule;
  if (customSchedule && customSchedule.length === years) {
    return [...customSchedule];
  }
  if (backloaded) {
    // Common Amazon-style backload: 5/15/40/40 (only valid for 4y schedules).
    if (years === 4) return [5, 15, 40, 40];
  }
  const cliffYears = cliffMonths / 12;
  const equalSlice = 100 / years;
  if (cliffYears <= 1) {
    return Array(years).fill(equalSlice);
  }
  // Cliff > 1y: nothing vests in years before the cliff, then catch up evenly.
  const result = Array(years).fill(0);
  const fullCliffYearIdx = Math.floor(cliffYears);
  const remainingYears = years - fullCliffYearIdx;
  if (remainingYears <= 0) return result;
  const sliceAfterCliff = 100 / remainingYears;
  for (let i = fullCliffYearIdx; i < years; i++) result[i] = sliceAfterCliff;
  return result;
}

/**
 * Equity contribution per year.
 *
 * Simplified model: the user enters how much equity vests *this year* directly.
 *   - For a new offer: typically `totalGrant ÷ vestingYears` (e.g. $200K / 4y = $50K).
 *     If the offer has a 1-year cliff, this is what you'd get at the cliff.
 *   - For a current role: what actually vests in the next 12 months — which can
 *     be lower than `totalGrant ÷ vestingYears` if the schedule is running out.
 */
export function valueEquity(equityPerYearUsd: number): number {
  if (!Number.isFinite(equityPerYearUsd) || equityPerYearUsd <= 0) return 0;
  return equityPerYearUsd;
}

export interface PricePoint {
  date: Date | string;
  closeUsd: number;
}

/**
 * Compute the trailing-N-year compound annual growth rate (CAGR) from a list
 * of daily close prices. Prices may be in any chronological order.
 *
 * Uses the **calendar-day** convention: 1 year = 365.25 days back from the
 * latest close. The start point is the close NEAREST to that target date
 * (handles weekends/holidays cleanly). Matches how brokerages report "1-year
 * total return" and what users see when they compare an investment "today
 * vs the same date last year".
 *
 * Returns the CAGR as a percentage (e.g. 14.87 means 14.87%/yr), or null when
 * there's insufficient history (< 0.5 years between first and last point).
 */
export function computeHistoricalCagr(prices: PricePoint[], years = 5): number | null {
  if (!prices || prices.length < 2) return null;
  const sorted = [...prices].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const last = sorted[sorted.length - 1];
  const endTime = +new Date(last.date);
  const yearMs = 365.25 * 24 * 3600 * 1000;
  const desiredStart = endTime - years * yearMs;
  // 7-day tolerance handles weekends/holidays around the target date without
  // over-shooting into a different month (which on volatile stocks distorts CAGR).
  const tolerance = 7 * 24 * 3600 * 1000;

  // Pick the close CLOSEST to "exactly N years ago". Excludes the last point
  // itself. If nothing is within tolerance (data doesn't span back that far),
  // fall back to the earliest available point so the CAGR is at least
  // computed over whatever history we have.
  let start = sorted[0];
  let bestDiff = Infinity;
  for (let i = 0; i < sorted.length - 1; i++) {
    const t = +new Date(sorted[i].date);
    const diff = Math.abs(t - desiredStart);
    if (diff <= tolerance && diff < bestDiff) {
      start = sorted[i];
      bestDiff = diff;
    }
  }

  const startPrice = start.closeUsd;
  const endPrice = last.closeUsd;
  if (startPrice <= 0 || endPrice <= 0) return null;
  const elapsedYears = (endTime - +new Date(start.date)) / yearMs;
  if (elapsedYears < 0.5) return null;
  const cagr = Math.pow(endPrice / startPrice, 1 / elapsedYears) - 1;
  return cagr * 100;
}
