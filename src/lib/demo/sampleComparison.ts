import { compareOffers, PRESET_WEIGHTS, type ComparisonResult, type OfferInput } from '@/lib/engine';

export type DemoLeetcodePost = {
  companyName: string;
  title: string;
  yoe: number;
  postedOn: string;
  url: string;
};

export const SAMPLE_LEETCODE_POSTS: DemoLeetcodePost[] = [
  {
    companyName: 'Atlas Cloud',
    title: 'SWE-3 Bangalore: 41L base + 17% bonus + 1.9Cr RSU over 4y',
    yoe: 6,
    postedOn: '2026-05-03',
    url: 'https://leetcode.com/discuss/compensation/',
  },
  {
    companyName: 'Nimbus AI',
    title: 'Senior IC offer: lower cash, high equity upside, onsite only',
    yoe: 5,
    postedOn: '2026-04-18',
    url: 'https://leetcode.com/discuss/compensation/',
  },
  {
    companyName: 'Meridian Systems',
    title: 'Remote Grade-7 package with strong WLB and stable bonus',
    yoe: 7,
    postedOn: '2026-03-29',
    url: 'https://leetcode.com/discuss/compensation/',
  },
];

export const SAMPLE_AI_INSIGHTS = {
  verdict:
    'Atlas Cloud wins on total weighted score because it balances top-tier cash comp with strong review sub-scores. Meridian is safer on work-life and stability, while Nimbus wins equity upside but gives up near-term certainty.',
  tradeoffs:
    'Picking Atlas means accepting lower benefits and less flexibility than Meridian. Picking Nimbus means taking higher volatility: stronger upside, but weaker current cash and work-life signals.',
  negotiation:
    'Ask Atlas to improve benefits or add a retention grant. Ask Meridian to close the equity gap. Ask Nimbus for a downside-protection clause or a stronger year-1 cash floor.',
};

/**
 * Static sample data for the public /demo page. Fictional companies on
 * purpose -- the comp figures are illustrative, so attaching them to real
 * employers would be misleading. Numbers are realistic for a Senior SWE in
 * the Indian market (2026) and chosen so the three offers each "win" on a
 * different axis, which makes the radar chart and trade-offs interesting:
 *   - Atlas Cloud   -> balanced money + strong reviews (public big-tech)
 *   - Nimbus AI     -> highest equity + growth + culture (Series-C startup)
 *   - Meridian Sys. -> best work-life balance + remote (established MNC)
 *
 * Money fields are INR/year except where the engine documents otherwise.
 * Review aspects are 0-5 (same scale as Indeed stars).
 */
const SAMPLE_OFFERS: OfferInput[] = [
  {
    id: 'demo-atlas',
    companyName: 'Atlas Cloud',
    title: 'Senior Software Engineer',
    level: 'L5',
    location: 'Bengaluru, IN',
    compensation: {
      baseSalary: 4_200_000,
      targetBonusPct: 15,
      signOnBonus: 800_000,
      equityTotal: 2_000_000, // vesting value per year
      benefitsValueAnnual: 250_000,
      ptoDays: 20,
      workMode: 'Hybrid',
      commuteCostMonthly: 4_000,
      qualitativeScore: 82,
    },
    reviewAspects: { compBenefits: 4.3, wlb: 3.9, culture: 4.1, mgmt: 3.8, jobSecurityAndAdvancement: 4.0 },
  },
  {
    id: 'demo-nimbus',
    companyName: 'Nimbus AI',
    title: 'Senior Software Engineer',
    level: 'IC3',
    location: 'Bengaluru, IN',
    compensation: {
      baseSalary: 3_600_000,
      targetBonusPct: 10,
      signOnBonus: 500_000,
      equityTotal: 3_200_000, // bigger paper upside, less liquid
      benefitsValueAnnual: 150_000,
      ptoDays: 18,
      workMode: 'Onsite',
      commuteCostMonthly: 6_000,
      qualitativeScore: 88,
    },
    reviewAspects: { compBenefits: 3.8, wlb: 3.4, culture: 4.4, mgmt: 3.9, jobSecurityAndAdvancement: 3.3 },
  },
  {
    id: 'demo-meridian',
    companyName: 'Meridian Systems',
    title: 'Senior Software Engineer',
    level: 'Grade 7',
    location: 'Remote, IN',
    compensation: {
      baseSalary: 3_900_000,
      targetBonusPct: 12,
      signOnBonus: 300_000,
      equityTotal: 900_000,
      benefitsValueAnnual: 300_000,
      ptoDays: 24,
      workMode: 'Remote',
      commuteCostMonthly: 0,
      qualitativeScore: 75,
    },
    reviewAspects: { compBenefits: 4.0, wlb: 4.4, culture: 3.9, mgmt: 4.0, jobSecurityAndAdvancement: 4.3 },
  },
];

/**
 * Runs the sample offers through the real scoring engine with the Balanced
 * preset. Pure + deterministic, so the /demo page that calls this can be
 * statically prerendered (no DB, no auth, no request-time work).
 */
export function getSampleComparison(): ComparisonResult {
  const snapshot = compareOffers(SAMPLE_OFFERS, PRESET_WEIGHTS.Balanced);

  // Mirror production behavior so the UI surfaces equity-growth assumptions
  // in both the verdict banner and the per-metric equity row.
  for (const r of snapshot.results) {
    if (r.companyName === 'Atlas Cloud') {
      r.equityGrowthAppliedPct = 12.4;
      r.equityGrowthSource = 'cagr';
    } else if (r.companyName === 'Nimbus AI') {
      r.equityGrowthAppliedPct = 18.0;
      r.equityGrowthSource = 'override';
    } else {
      r.equityGrowthAppliedPct = 0;
      r.equityGrowthSource = 'none';
    }
  }

  return snapshot;
}
