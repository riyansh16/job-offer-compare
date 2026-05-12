import { prisma } from '../db';
import {
  compareOffers,
  type ComparisonResult,
  type OfferInput,
  type Weights,
} from '../engine';
import { computeHistoricalCagr } from './equity';
import { computeRatingAspects } from '../providers/review';
import { getRate } from '../providers/currency';
import { getStockCagr } from '../providers/stockPrice';
import { refreshCompanySentiment } from '../providers/review';

export interface RunComparisonOptions {
  /** @deprecated kept for snapshot compatibility; per-company CAGR is now used. */
  equityGrowthPct?: number;
  /** Per-company stock-growth % override. Wins over the cached CAGR when set. */
  growthOverridesByCompany?: Record<string, number>;
}

interface VestScheduleJson {
  years: number;
  cliffMonths: number;
  cadence: 'monthly' | 'quarterly' | 'annual';
  backloaded?: boolean;
  customSchedule?: number[];
}

/**
 * Load the given offers from the DB, translate them into engine inputs
 * (including blended review scores), and produce a ranked comparison result.
 *
 * Engine-internal currency is INR. Non-INR offers (v2: international support)
 * are FX-converted before scoring. FX rates come from the free Frankfurter API.
 */
export async function runComparisonForOffers(
  userId: string,
  offerIds: string[],
  weights: Weights,
  opts: RunComparisonOptions = {},
): Promise<ComparisonResult> {
  const offers = await prisma.jobOffer.findMany({
    where: { id: { in: offerIds }, userId },
    include: {
      compensation: true,
      company: { include: { sentiments: true } },
    },
  });

  // Resolve FX rates (currency -> INR) once per distinct currency.
  // INR is the internal scoring currency. The supported-currencies dropdown
  // exists for v2 international support; today every offer is expected to be
  // in INR, so we skip the FX provider entirely when no non-INR offers exist.
  const distinctCurrencies = Array.from(
    new Set(offers.map((o) => (o.compensation?.currency ?? 'INR').toUpperCase())),
  );
  const fxRates: Record<string, number> = { INR: 1 };
  const nonInrCurrencies = distinctCurrencies.filter((c) => c !== 'INR');
  if (nonInrCurrencies.length > 0) {
    await Promise.all(
      nonInrCurrencies.map(async (cur) => {
        const rate = await getRate(cur, 'INR');
        // If the rate is unavailable, fall back to 1 (preserve the raw amount).
        fxRates[cur] = rate ?? 1;
      }),
    );
  }

  // Auto-refresh stock prices + sentiment for every selected company before
  // scoring. Each provider has its own cache (stocks: 6h, sentiment: 7d) so
  // back-to-back comparisons within the cache window are instant; comparisons
  // outside it transparently re-fetch. This guarantees the comparison reflects
  // today's data without the user clicking "Refresh".
  const distinctCompanies = Array.from(
    new Map(offers.map((o) => [o.companyId, { id: o.companyId, ticker: o.company.tickerSymbol }])).values(),
  );
  await Promise.all(
    distinctCompanies.map(async (c) => {
      const tasks: Promise<unknown>[] = [];
      if (c.ticker) tasks.push(getStockCagr(c.id, c.ticker).catch(() => null));
      // Sentiment refresh respects its 7-day cache by default (force=false).
      tasks.push(refreshCompanySentiment(c.id, false).catch(() => null));
      await Promise.all(tasks);
    }),
  );

  // Re-load offers so we pick up freshly-written sentiment rows.
  const refreshedOffers = await prisma.jobOffer.findMany({
    where: { id: { in: offerIds }, userId },
    include: {
      compensation: true,
      company: { include: { sentiments: true } },
    },
  });
  // Preserve caller's offer order.
  const offersWithFreshData = offerIds
    .map((id) => refreshedOffers.find((o) => o.id === id))
    .filter((o): o is (typeof refreshedOffers)[number] => o != null);

  // Resolve per-company stock-growth multiplier from cached price history
  // (now freshly written by the auto-refresh above).
  const distinctCompanyIds = distinctCompanies.map((c) => c.id);
  const cagrByCompany = new Map<string, number>();
  await Promise.all(
    distinctCompanyIds.map(async (cid) => {
      const prices = await prisma.stockPriceHistory.findMany({
        where: { companyId: cid },
        orderBy: { date: 'asc' },
        select: { date: true, closeUsd: true },
      });
      if (prices.length < 2) return;
      const cagr = computeHistoricalCagr(
        prices.map((p) => ({ date: p.date, closeUsd: p.closeUsd })),
        5,
      );
      if (cagr != null && Number.isFinite(cagr)) cagrByCompany.set(cid, cagr);
    }),
  );

  // Track which growth assumption was applied to each offer so the UI can show it.
  const growthByOfferId = new Map<string, { pct: number; source: 'override' | 'cagr' | 'none' }>();

  const inputs: OfferInput[] = offersWithFreshData.map((o) => {
    const c = o.compensation!;
    // Per-aspect review scores (0..5), Bayesian-shrunk by review counts.
    const aspects = computeRatingAspects({
      indeedRating: o.company.indeedRating,
      indeedCompBenefits: o.company.indeedCompBenefits,
      indeedWLB: o.company.indeedWLB,
      indeedJobSecurity: o.company.indeedJobSecurity,
      indeedMgmt: o.company.indeedMgmt,
      indeedCulture: o.company.indeedCulture,
      indeedReviewCount: o.company.indeedReviewCount,
      sentiments: o.company.sentiments,
    });
    let vest: VestScheduleJson;
    try {
      vest = JSON.parse(c.equityVestSchedule) as VestScheduleJson;
    } catch {
      vest = { years: 4, cliffMonths: 12, cadence: 'quarterly' };
    }
    const cur = (c.currency || 'INR').toUpperCase();
    const fx = fxRates[cur] ?? 1;
    // Apply this company's stock-growth assumption to next-year equity:
    // user override wins; otherwise falls back to cached trailing 5y CAGR.
    // Clamped to a sane range so a freak outlier (e.g. -90% or +200%) doesn't dominate.
    const override = opts.growthOverridesByCompany?.[o.companyId];
    const cachedCagr = cagrByCompany.get(o.companyId);
    const cagr = override ?? cachedCagr;
    const growthMultiplier = cagr == null ? 1 : 1 + Math.max(-0.5, Math.min(1, cagr / 100));
    // Distinguish source: if the override matches cached CAGR within 0.05 percentage
    // points, treat it as the autofilled CAGR (user clicked "Use CAGR" button).
    let source: 'override' | 'cagr' | 'none' = 'none';
    if (override != null && cachedCagr != null && Math.abs(override - cachedCagr) < 0.05) {
      source = 'cagr';
    } else if (override != null) {
      source = 'override';
    } else if (cachedCagr != null) {
      source = 'cagr';
    }
    growthByOfferId.set(o.id, { pct: cagr ?? 0, source });
    return {
      id: o.id,
      companyName: o.company.name,
      title: o.title,
      level: o.level ?? undefined,
      location: o.location,
      isCurrent: o.isCurrent,
      reviewAspects: aspects
        ? {
            compBenefits: aspects.compBenefits,
            wlb: aspects.wlb,
            culture: aspects.culture,
            mgmt: aspects.mgmt,
            jobSecurityAndAdvancement: aspects.jobSecurityAndAdvancement,
          }
        : undefined,
      compensation: {
        baseSalary: c.baseSalary * fx,
        currency: 'INR',
        targetBonusPct: c.targetBonusPct,
        signOnBonus: c.signOnBonus * fx,
        equityTotal: c.equityTotal * fx * growthMultiplier,
        equityVestSchedule: vest,
        benefitsValueAnnual: c.benefitsValueAnnual * fx,
        ptoDays: c.ptoDays,
        workMode: c.workMode as OfferInput['compensation']['workMode'],
        commuteCostMonthly: c.commuteCostMonthly * fx,
        qualitativeScore: c.qualitativeScore,
      },
    };
  });

  const result = compareOffers(inputs, weights, opts);
  // Attach per-offer native-currency info so the UI can display raw amounts
  // in the user's chosen currency instead of the engine-internal INR values.
  const fxByOfferId = new Map<string, { currency: string; fxToNative: number }>();
  for (const o of offersWithFreshData) {
    const cur = (o.compensation?.currency || 'INR').toUpperCase();
    const inrToNative = cur === 'INR' ? 1 : 1 / (fxRates[cur] ?? 1);
    fxByOfferId.set(o.id, { currency: cur, fxToNative: inrToNative });
  }
  for (const r of result.results) {
    const fx = fxByOfferId.get(r.offerId);
    if (fx) {
      r.nativeCurrency = fx.currency;
      r.fxToNative = fx.fxToNative;
    }
    const g = growthByOfferId.get(r.offerId);
    if (g) {
      r.equityGrowthAppliedPct = g.pct;
      r.equityGrowthSource = g.source;
    }
  }
  // Annotate the snapshot with which CAGRs were applied (for the UI to surface).
  (result as ComparisonResult & { equityGrowthByCompany?: Record<string, number> }).equityGrowthByCompany =
    Object.fromEntries(cagrByCompany.entries());
  return result;
}
