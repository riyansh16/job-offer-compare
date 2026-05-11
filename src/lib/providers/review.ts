import { prisma } from '../db';
import { fetchHackerNewsSentiment } from './hackerNews';
import { fetchRedditSentiment } from './reddit';

const STALE_DAYS = 7;

/**
 * Refresh review sentiment for a company from all configured free sources.
 * Skips a source if cached data is fresh (< 7 days old) unless force=true.
 */
export async function refreshCompanySentiment(companyId: string, force = false) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error('Company not found');
  const query = company.redditQuery || company.name;

  const existing = await prisma.reviewSentiment.findMany({ where: { companyId } });
  const isStale = (source: string) => {
    if (force) return true;
    const row = existing.find((e) => e.source === source);
    if (!row) return true;
    return Date.now() - new Date(row.fetchedAt).getTime() > STALE_DAYS * 24 * 3600 * 1000;
  };

  const ops: Promise<unknown>[] = [];
  if (isStale('HackerNews')) {
    ops.push(
      fetchHackerNewsSentiment(query).then((r) => {
        if (!r) return null;
        return prisma.reviewSentiment.upsert({
          where: { id: existing.find((e) => e.source === 'HackerNews')?.id ?? 'new-hn' },
          create: {
            companyId,
            source: r.source,
            score: r.score,
            sampleSize: r.sampleSize,
            summary: r.summary,
          },
          update: {
            score: r.score,
            sampleSize: r.sampleSize,
            summary: r.summary,
            fetchedAt: new Date(),
          },
        });
      }),
    );
  }
  if (isStale('Reddit')) {
    ops.push(
      fetchRedditSentiment(query).then((r) => {
        if (!r) return null;
        return prisma.reviewSentiment.upsert({
          where: { id: existing.find((e) => e.source === 'Reddit')?.id ?? 'new-reddit' },
          create: {
            companyId,
            source: r.source,
            score: r.score,
            sampleSize: r.sampleSize,
            summary: r.summary,
          },
          update: {
            score: r.score,
            sampleSize: r.sampleSize,
            summary: r.summary,
            fetchedAt: new Date(),
          },
        });
      }),
    );
  }
  await Promise.all(ops);
  return prisma.reviewSentiment.findMany({ where: { companyId } });
}

/**
 * Bayesian shrinkage for a star rating: pulls the rating toward a global mean
 * with strength inversely proportional to the review count. This solves the
 * "tiny startup with 10 cherry-picked 5-stars" problem.
 *
 * adjusted = (rating * count + globalMean * priorStrength) / (count + priorStrength)
 *
 * Defaults: globalMean = 3.7 (typical Glassdoor average), priorStrength = 100.
 */
export function bayesianShrink(
  rating: number,
  count: number,
  globalMean = 3.7,
  priorStrength = 100,
): number {
  if (!Number.isFinite(rating) || rating <= 0) return rating;
  const c = Math.max(0, Math.floor(count || 0));
  return (rating * c + globalMean * priorStrength) / (c + priorStrength);
}

/**
 * Sub-rating set captured from public sources. All 0..5 (or 0..100 for percentages).
 */
export interface CompanyRatings {
  glassdoorRating?: number | null;
  glassdoorCompBenefits?: number | null;
  glassdoorWLB?: number | null;
  glassdoorCulture?: number | null;
  glassdoorSrMgmt?: number | null;
  glassdoorRecommendPct?: number | null; // 0-100
  glassdoorCeoApprovalPct?: number | null; // 0-100
  glassdoorReviewCount?: number | null;
  indeedRating?: number | null;
  indeedCompBenefits?: number | null;
  indeedWLB?: number | null;
  indeedJobSecurity?: number | null;
  indeedMgmt?: number | null;
  indeedCulture?: number | null;
  indeedReviewCount?: number | null;
  blindRating?: number | null;
  blindReviewCount?: number | null;
  layoffsLast12mPct?: number | null;
  sentiments?: { score: number; sampleSize?: number }[];
}

/**
 * Aspect weights inside the Reviews score. Together with profile-aligned blends
 * in `presets.ts`, this lets the Reviews metric be dimension-aware: a Work-life
 * profile up-weights the WLB sub-rating, etc.
 *
 * Each aspect is a 0..5 facet pulled from Glassdoor + Indeed sub-ratings.
 */
export interface RatingAspects {
  overall: number;
  compBenefits: number;
  wlb: number;
  culture: number;
  mgmt: number;
  recommendPct: number; // mapped to 0..5 from 0..100
}

/** Average a set of values, ignoring nulls. Returns null if all values are null. */
function avgOrNull(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Build the aspect breakdown from a company's stored ratings.
 *
 * Pipeline per aspect:
 *  1. Bayesian-shrink each Indeed sub-rating by Indeed's review count.
 *  2. Fall back to the overall rating when an aspect isn't available.
 *  3. Blend in Reddit/HN sentiment with weight 0.15 (capped influence so a
 *     spike in trolling doesn't dominate established review data).
 *
 * Note: layoffs are surfaced on the company page as informational signal but
 * are NOT factored into the score — they're noisy and backward-looking.
 *
 * Indeed-only: Glassdoor data was deprecated as a primary source because
 * grounded-search extraction succeeds for ~5% of companies vs ~22% for Indeed,
 * and Indeed has stronger India coverage. Glassdoor fields remain in the
 * schema for backward compatibility but are no longer read here.
 */
export function computeRatingAspects(c: CompanyRatings): RatingAspects | null {
  const iCount = c.indeedReviewCount ?? 0;
  const bCount = c.blindReviewCount ?? 0;

  const shrink = (r: number | null | undefined, n: number) =>
    r == null ? null : bayesianShrink(r, n);

  // Overall: Indeed primary, Blind as a secondary signal when present.
  const overall = avgOrNull([
    shrink(c.indeedRating, iCount),
    shrink(c.blindRating, bCount),
  ]);

  // Sentiment: -1..1 mapped to 1..5 stars. Average across active sources.
  const sentimentScores = (c.sentiments ?? [])
    .filter((s) => s.score !== 0)
    .map((s) => Math.max(1, Math.min(5, 3 + s.score * 2)));
  const sentAvg = sentimentScores.length
    ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
    : null;

  // If we have neither stars nor sentiment, no aspect data available.
  if (overall == null && sentAvg == null) return null;

  // When stars are missing but sentiment is present, sentiment becomes the seed.
  const baseOverall = overall ?? sentAvg ?? 3;

  // Aspect blends: Indeed sub-ratings (each shrunk), fall back to overall.
  const compBenefits = shrink(c.indeedCompBenefits, iCount) ?? baseOverall;
  const wlb = shrink(c.indeedWLB, iCount) ?? baseOverall;
  const culture = shrink(c.indeedCulture, iCount) ?? baseOverall;
  // Management blends Indeed Management + Job Security (proxy signals).
  const mgmt = avgOrNull([
    shrink(c.indeedMgmt, iCount),
    shrink(c.indeedJobSecurity, iCount),
  ]) ?? baseOverall;
  const recommendPct = baseOverall;

  // Blend sentiment in with weight 0.15 across all aspects (small but non-zero).
  const SENTIMENT_WEIGHT = 0.15;
  const blendSent = (v: number) =>
    sentAvg == null ? v : v * (1 - SENTIMENT_WEIGHT) + sentAvg * SENTIMENT_WEIGHT;
  const finalize = (v: number) => Math.max(0, Math.min(5, blendSent(v)));

  return {
    overall: finalize(baseOverall),
    compBenefits: finalize(compBenefits),
    wlb: finalize(wlb),
    culture: finalize(culture),
    mgmt: finalize(mgmt),
    recommendPct: finalize(recommendPct),
  };
}

/** Per-aspect weights inside the Reviews score, summing to 1.0. */
export type RatingAspectWeights = Partial<Record<keyof RatingAspects, number>>;

/** Default mix when no profile-aligned weights are provided. */
export const DEFAULT_ASPECT_WEIGHTS: RatingAspectWeights = {
  overall: 0.4,
  recommendPct: 0.2,
  wlb: 0.15,
  compBenefits: 0.15,
  culture: 0.05,
  mgmt: 0.05,
};

/** Apply a layoff penalty to a 0..5 rating: 1% of headcount = -0.025 stars. */
function applyLayoffPenalty(rating: number, layoffsPct: number | null | undefined): number {
  if (!layoffsPct || layoffsPct <= 0) return rating;
  const penalty = Math.min(1.5, layoffsPct * 0.025);
  return Math.max(0, rating - penalty);
}

/**
 * Compute a 0..5 composite review score using:
 *  - Sub-rating breakdown (Glassdoor + Indeed facets)
 *  - Bayesian shrinkage by review count (built into `computeRatingAspects`)
 *  - Profile-aligned aspect weights (caller picks the right mix per profile)
 *  - Layoff penalty (-0.025 stars per 1% headcount cut in last 12 months)
 *  - Sentiment blend (0.7 facets / 0.3 sentiment if both exist)
 *
 * `aspectWeights` defaults to a balanced mix; pass profile-specific weights
 * (see `PROFILE_RATING_WEIGHTS` in `presets.ts`) for dimension-aware scoring.
 */
export function blendedReviewScore(
  input: CompanyRatings,
  aspectWeights: RatingAspectWeights = DEFAULT_ASPECT_WEIGHTS,
): number | null {
  const aspects = computeRatingAspects(input);
  const sentimentScores = (input.sentiments ?? [])
    .filter((s) => s.score !== 0)
    .map((s) => 3 + s.score * 2); // -1..1 -> 1..5
  const sentAvg = sentimentScores.length
    ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
    : null;

  let aspectBlend: number | null = null;
  if (aspects) {
    let totalWeight = 0;
    let weightedSum = 0;
    for (const [key, weight] of Object.entries(aspectWeights) as [keyof RatingAspects, number][]) {
      if (!weight || weight <= 0) continue;
      const v = aspects[key];
      if (v == null || !Number.isFinite(v)) continue;
      weightedSum += v * weight;
      totalWeight += weight;
    }
    if (totalWeight > 0) aspectBlend = weightedSum / totalWeight;
  }

  if (aspectBlend == null && sentAvg == null) return null;

  let blended: number;
  if (aspectBlend != null && sentAvg != null) blended = aspectBlend * 0.7 + sentAvg * 0.3;
  else blended = (aspectBlend ?? sentAvg) as number;

  // Apply layoff penalty after blending so it affects every component fairly.
  blended = applyLayoffPenalty(blended, input.layoffsLast12mPct);

  return Number(blended.toFixed(2));
}
