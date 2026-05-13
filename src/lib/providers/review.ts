import { prisma } from '../db';
import { fetchHackerNewsSentiment } from './hackerNews';
import { fetchRedditSentiment } from './reddit';

// Sentiment refreshes monthly, matching the Indeed ratings cadence. Reddit /
// HN posts age slowly relative to comp signals, and the runner triggers this
// during real comparisons — a 30-day cache keeps API hammering low while
// still catching big shifts (layoffs, controversies) within a month.
const STALE_DAYS = 30;

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
 * Defaults: globalMean = 3.7 (typical Indeed average), priorStrength = 100.
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
  indeedRating?: number | null;
  indeedCompBenefits?: number | null;
  indeedWLB?: number | null;
  indeedJobSecurity?: number | null;
  indeedMgmt?: number | null;
  indeedCulture?: number | null;
  indeedReviewCount?: number | null;
  sentiments?: { score: number; sampleSize?: number }[];
}

/**
 * Aspect weights inside the Reviews score. Together with profile-aligned blends
 * in `presets.ts`, this lets the Reviews metric be dimension-aware: a Work-life
 * profile up-weights the WLB sub-rating, etc.
 *
 * Each aspect is a 0..5 facet pulled from Indeed sub-ratings.
 */
export interface RatingAspects {
  overall: number;
  compBenefits: number;
  wlb: number;
  culture: number;
  mgmt: number;
  jobSecurityAndAdvancement: number;
  recommendPct: number; // mapped to 0..5 from 0..100
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
 * Note: layoff data is surfaced separately (company page + comparison page
 * header) but is NOT factored into scoring — it's backward-looking and noisy.
 *
 * Indeed-only: Glassdoor was deprecated as a source because grounded-search
 * extraction succeeds for ~5% of companies vs ~22% for Indeed, and Indeed has
 * stronger India coverage. No Glassdoor fields are read here.
 */
export function computeRatingAspects(c: CompanyRatings): RatingAspects | null {
  const iCount = c.indeedReviewCount ?? 0;

  const shrink = (r: number | null | undefined, n: number) =>
    r == null ? null : bayesianShrink(r, n);

  // Overall: Indeed is the sole source.
  const overall = shrink(c.indeedRating, iCount);

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
  // Management and Job Security & Advancement are tracked as separate aspects
  // so users can weight them independently (e.g. "I care about good managers
  // but my industry is volatile" vs "I want maximum stability and upward
  // mobility regardless of management style"). The job-security aspect maps
  // directly to Indeed's "Job Security & Advancement" sub-rating.
  const mgmt = shrink(c.indeedMgmt, iCount) ?? baseOverall;
  const jobSecurityAndAdvancement = shrink(c.indeedJobSecurity, iCount) ?? baseOverall;
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
    jobSecurityAndAdvancement: finalize(jobSecurityAndAdvancement),
    recommendPct: finalize(recommendPct),
  };
}
