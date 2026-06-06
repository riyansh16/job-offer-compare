# Ads & Monetization Scaffold

> **Status:** Implemented, ads disabled by default. Owner: founder.
> **Last updated:** 2026-06-06

This document explains the ad-network integration that ships in
`feat/ads-scaffold`. It covers what's wired up, how to enable each provider,
the application steps for AdSense / Media.net / Ezoic, and the surface
restrictions enforced in code.

For the broader monetization strategy (paywall, affiliates, B2B), see
[MONETIZATION.md](./MONETIZATION.md). That doc explains *why* ads are gated to
specific surfaces and why we do not ship them on the decision flow.

---

## 1. What's in this scaffold

| File | Purpose |
|---|---|
| `src/components/ads/AdSlot.tsx` | Single component that renders the right network's ad tag based on env. No-ops when ads are off or per-placement IDs are missing. |
| `src/components/ads/AdProviderScripts.tsx` | Injects the network's main JS loader into `<head>`. Renders nothing when provider is `none`. |
| `src/components/CookieConsent.tsx` | First-visit bottom banner. Required for DPDP / GDPR consent recording. Persisted in `localStorage` under `joc-cookie-consent`. |
| `public/ads.txt` | Authorized-Digital-Sellers file. Placeholder entries; fill real IDs after each network approves. |
| `src/middleware.ts` | `/companies/*` is now public (added to `PUBLIC_PREFIXES`) so ad-network crawlers can index. |
| `src/app/privacy/page.tsx` | Cookies section rewritten + new Advertising section listing the three partners and their privacy policies. |
| `src/app/terms/page.tsx` | New Advertising section. |
| `.env.example` | Full provider config block with comments. |

Ads are placed on exactly two surfaces today:

- `/companies` — directory listing, bottom of page.
- `/companies/[slug]` — individual company page, bottom of page.

**No ads on `/compare/*`, `/offers/*`, `/dashboard`, `/auth/*`, `/current`,
or any signed-in surface.** This is the rule in MONETIZATION.md §5.6 and is
enforced by only placing `<AdSlot/>` in the two files above. If you add a
new ad placement, add a row to the table in this doc.

---

## 2. Provider switch

A single env var controls which network is active:

```bash
# none | adsense | medianet | ezoic
NEXT_PUBLIC_AD_PROVIDER="none"
```

- `none` (default) → no scripts loaded, no ad slots rendered, zero network calls.
- `adsense` → loads Google's `adsbygoogle.js`, renders `<ins class="adsbygoogle">` per slot.
- `medianet` → loads `dmedianet.js`, renders Media.net div per slot.
- `ezoic` → loads `ezojs.com/ezoic/sa.min.js`, renders Ezoic placeholder divs.

**AdSense + Media.net can coexist.** Ezoic replaces both — it bids AdSense
and Media.net (and others) under its own auction. Do **not** enable Ezoic
*alongside* the other two; pick one stack.

### Per-placement IDs

Each provider needs a slot/crid/placeholder ID per placement, in env:

```bash
# AdSense
NEXT_PUBLIC_ADSENSE_CLIENT_ID="ca-pub-XXXXXXXXXXXXXXXX"
NEXT_PUBLIC_ADSENSE_SLOT_COMPANIES_LIST="1234567890"
NEXT_PUBLIC_ADSENSE_SLOT_COMPANY_DETAIL="0987654321"

# Media.net
NEXT_PUBLIC_MEDIANET_CID="12345678"
NEXT_PUBLIC_MEDIANET_CRID_COMPANIES_LIST="123456789"
NEXT_PUBLIC_MEDIANET_CRID_COMPANY_DETAIL="987654321"

# Ezoic
NEXT_PUBLIC_EZOIC_ID_COMPANIES_LIST="101"
NEXT_PUBLIC_EZOIC_ID_COMPANY_DETAIL="102"
```

If a placement's ID is missing, that specific `<AdSlot/>` renders nothing —
the rest of the page is unaffected.

---

## 3. Why we did *not* launch with ads on

From MONETIZATION.md §5.6 — "When AdSense becomes acceptable to test":

> Not before all of the following are true:
> - Month ≥ 9 since launch (AdSense approval window + product maturity).
> - MAU ≥ 30K (enough for the experiment to be statistically meaningful in 4 weeks).
> - All 4 non-ad levers in §5.5 have been tried and at least 2 are underperforming.
> - The 7 guardrails above are implemented and reviewed.

Practical reality on top of that:

1. **AdSense will reject a brand-new domain.** They need ~2 weeks to 6 months
   of crawled content + organic traffic before review.
2. **Day-1 RPM is near zero on any network.** Ezoic's auction takes weeks to
   tune. Ad networks pay almost nothing until they have data on what
   converts for your audience.
3. **Page revenue at launch traffic is rounding error.** At 1,000 visits/day
   and ₹300 RPM, that's ~₹750/day — far less than a single Decision Pass sale.
4. **Premium-tool perception breaks on first impression.** Showing ads at
   launch anchors users at "free tool with ads," which kills the paywall.

So the scaffold ships **off**. We turn it on later, on the conditions in
MONETIZATION.md §5.6.

---

## 4. Application checklist (do these in parallel, post-launch)

All three approvals run independently. Apply on launch day so the review
clocks start ticking; flip env vars as each one approves.

### 4.1 Google AdSense

| Step | Notes |
|---|---|
| Site must be live on https + a real domain | not `localhost`, not Azure SWA preview URL |
| Privacy policy with cookies section | ✅ shipped — `/privacy` |
| Terms of service | ✅ shipped — `/terms` |
| About / Contact page with real email | ⚠️ not shipped yet — common rejection reason |
| ~30+ original-content pages indexed by Google | Your `/companies/[slug]` pages count |
| Submit at https://adsense.google.com | Pick India for payment country |
| Wait | **2 weeks to 6 months** |
| On approval: paste pub ID + slot IDs | `NEXT_PUBLIC_ADSENSE_CLIENT_ID` + slot envs |
| Update `public/ads.txt` | Line they give you |

### 4.2 Media.net

| Step | Notes |
|---|---|
| Live site with ≥ 20 pages of English content | ✅ |
| Submit at https://www.media.net | "Sign Up" top-right |
| Approval | **1–3 business days** |
| Get assigned account manager | They actually do this for small sites |
| Ask for one 728×90 and one 300×250 ad unit | |
| Paste `cid` + per-unit `crid` | `NEXT_PUBLIC_MEDIANET_*` envs |
| Update `public/ads.txt` | |

### 4.3 Ezoic

| Step | Notes |
|---|---|
| Live site, any traffic level | No minimum since 2022 |
| Sign up at https://www.ezoic.com | |
| Choose **JavaScript integration** | **Not Cloud/DNS** — that conflicts with Azure SWA |
| Approval | **24–72 hours** typically |
| Create placeholders for each placement | Dashboard → Mediation → Placeholders |
| Connect AdSense + Media.net inside Ezoic | This is how Ezoic out-earns running them manually |
| Paste numeric placeholder IDs | `NEXT_PUBLIC_EZOIC_ID_*` envs |
| Update `public/ads.txt` | They provide the line |

---

## 5. Switching providers in production

```bash
# Production env (Azure SWA → Configuration → Application settings)
NEXT_PUBLIC_AD_PROVIDER=adsense
NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX
NEXT_PUBLIC_ADSENSE_SLOT_COMPANIES_LIST=...
NEXT_PUBLIC_ADSENSE_SLOT_COMPANY_DETAIL=...
```

Redeploy. The provider switch is purely env-driven — no code changes
needed to flip between `adsense`, `medianet`, `ezoic`, or `none`.

To kill all ads instantly (the MONETIZATION.md §5.6 "kill switch"):

```bash
NEXT_PUBLIC_AD_PROVIDER=none
```

Redeploy. All scripts gone, all slots gone.

---

## 6. Guardrails wired into code

From MONETIZATION.md §5.6's 7-point list:

| # | Guardrail | Status in code |
|---|---|---|
| 1 | Surface restriction (not just policy) | ✅ `<AdSlot/>` only present in `companies/page.tsx` + `companies/[slug]/page.tsx` |
| 2 | Category blocklist | ⚠️ Configure in the AdSense / Media.net / Ezoic dashboards on approval — not code |
| 3 | No ads above the fold | ✅ Both placements render after page content |
| 4 | Max 1 ad unit per page | ✅ One `<AdSlot/>` per page |
| 5 | A/B test with conversion tracking | ❌ Not implemented; ship before turning ads on |
| 6 | User survey ad cohort | ❌ Manual process; do before scaling |
| 7 | Kill switch | ✅ `NEXT_PUBLIC_AD_PROVIDER=none` |

Guardrails 5 and 6 are operational, not code. Don't enable ads in
production until you have a plan for them.

---

## 7. When to revisit

Trigger conditions to *enable* ads:

- Site is ≥ 9 months old AND
- MAU ≥ 30K AND
- At least 2 of the 4 non-ad revenue levers (Decision Pass, affiliate, data
  flywheel, sponsored listings) have been tried AND are under-performing AND
- A/B test plan + kill switch are wired up.

Trigger conditions to *disable* ads:

- Paid conversion in the ad cohort drops > 10% relative.
- ≥ N=30 user-survey responses showing negative trust shift.
- Any single off-brand creative gets reported.

Set `NEXT_PUBLIC_AD_PROVIDER=none`, redeploy. Done in 60 seconds.
