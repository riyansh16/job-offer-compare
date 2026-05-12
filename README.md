# Job Offer Compare

A private, India-focused web app for comparing competing job offers — base, bonus, equity (with real historical stock performance), benefits, work mode, and company reviews — with AI-generated verdicts you can actually trust.

> **Built on a simple promise:** every number you see is either entered by you or fetched live from a named, citable source. Nothing is fabricated. Where data isn't available, the app says so.

📖 **For a layman-friendly walkthrough of how the math works** (suitable for sharing with non-technical readers), see [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).

---

## The problem this solves

You have 2-4 active offers. You're trying to answer:

- *"Is the higher TC really higher once I factor in equity vesting and stock growth?"*
- *"Is Company A's 4.2★ on Indeed actually better than Company B's 3.9★ when one has 50× more reviews?"*
- *"What does the market — Reddit, HN — actually say about working at Razorpay vs Stripe right now?"*
- *"If I push back on this offer, what should I ask for and what's a realistic ceiling?"*

Spreadsheets get the math kind-of right but can't answer the qualitative half. Levels.fyi tells you comp but not culture. Indeed tells you culture but not your specific offer's value. This portal stitches both halves together with weighted scoring + AI commentary, and shows its work.

---

## How we earn your trust

The core design tension in any "compare offers" tool is **fabricated authority** — confident-looking numbers that are guesses. We avoid this with five concrete rules:

1. **Source-or-null.** Every external rating (Indeed) is stored alongside the source URL it came from. If we couldn't fetch a real source, the number is `null` and the UI shows "no rating available" rather than a guess.

2. **Bayesian shrinkage on small samples.** A 4.8★ score from 6 reviews is worth less than a 4.2★ score from 80,000. The engine pulls thin-sample scores toward the global mean (3.7★) so a tiny startup's cherry-picked reviews can't dominate.

3. **Live, source-cited refresh.** Indeed ratings are fetched via Gemini-grounded web search and stored with their citation URL. Refreshes happen on a daily rotating schedule so every company is updated within ~30 days.

4. **Stock CAGR from real prices.** Equity isn't a hypothetical — we pull actual closing prices from Yahoo Finance, compute trailing 5y and 1y CAGR, and let you pick which to apply. Cached 6h, no API key needed.

5. **AI that quotes the data.** Verdicts are generated from the same JSON snapshot you see in the table. Prompts are constrained ("never invent numbers — only cite values present"), and the snapshot is shown next to the AI output so you can verify.

If a rule was violated in this codebase before today (and many were — see git history), we treat it as a bug, not a feature.

---

## What's in the score

Each offer gets normalized 0–100 across these metrics, then weighted by you in the comparison wizard:

| Category | Metric | Source |
|---|---|---|
| **Compensation** | Base salary | You enter |
|  | Annual bonus | You enter (target %) |
|  | Equity (annualized, growth-adjusted) | You enter grant + vesting; stock CAGR from Yahoo Finance |
|  | Sign-on bonus (counts fully in year 1) | You enter |
|  | Benefits value | You enter |
| **Lifestyle** | Work mode (Remote / Hybrid / Onsite) | You enter |
|  | Career growth / fit | You rate 0–100 |
| **Reviews** | Comp & Benefits | Indeed (live), blended with Reddit/HN sentiment |
|  | Work-Life Balance | Same |
|  | Culture | Same |
|  | Management | Same |

Layoffs (when known) are shown on the company page **as informational context only** — they're not reliable predictors of your specific offer's outcome, so they don't dock the score.

---

## What's *not* in the score (and why)

These are deliberately excluded:

- **Cost-of-living adjustment between Indian cities.** A rupee in Mumbai and a rupee in Pune buy meaningfully different things, but the indices required to do this honestly (Numbeo etc.) aren't reliable enough to bake into scoring. v2.
- **International COL / FX.** Same reason. The app is INR-only by default; non-INR offers get FX conversion but no purchasing-power adjustment.
- **Glassdoor / AmbitionBox / Blind ratings.** Glassdoor is behind aggressive Cloudflare protection (~5% extraction success); Indeed is our single source of truth. Other platforms add operational complexity without proportional coverage gains.
- **"Career Opportunities" as a separate metric.** Indeed bundles this into "Job security/advancement"; Glassdoor measured it separately but we don't use Glassdoor anymore. Rather than fake a number from the overall rating, we dropped the metric.
- **"Recommend %" and CEO approval %.** Highly correlated with overall rating already — weighting them again is double-counting.

---

## Data sources

| Source | What it provides | How fresh | Free? |
|---|---|---|---|
| **Yahoo Finance** (`yahoo-finance2`) | Daily closing prices, 5y + 1y CAGR | 6h cache | ✅ |
| **Reddit** (OAuth API) | Sentiment from r/cscareerquestions, r/IndianWorkplace, etc. | 7d cache | ✅ |
| **Hacker News** (Algolia) | Sentiment from HN comments | 7d cache | ✅ |
| **Frankfurter** (ECB) | FX rates for non-INR offers | 24h cache | ✅ |
| **Gemini grounded search** | Indeed ratings + URLs | 30d rotating refresh | ✅ (free tier) |
| **Azure OpenAI gpt-4.1-mini** | AI verdicts, trade-offs, negotiation tips | On-demand | Paid (Azure credit) |

---

## AI insights, honestly

The comparison page has a panel with four AI-generated cards:

- **Verdict** — Why offer #1 wins (auto-loaded)
- **Trade-offs** — What you'd give up by picking the winner
- **Negotiation talking points** — Concrete asks based on gaps in your weakest offer
- **Recruiter questions** — Smart questions to ask each company

The model receives a JSON snapshot of the comparison results (numbers, weights, rationale) and is instructed to never invent figures. Each insight is cached per comparison so re-opening the page doesn't re-burn tokens. **Regenerate** is always one click away if you want a fresh take.

---

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Prisma** + SQLite locally (Azure PostgreSQL Flexible Server in prod)
- **NextAuth v5** (email/password + optional Google OAuth)
- **Tailwind** + **Recharts** for the radar visualization
- **Vitest** for the engine unit tests (27 currently passing)
- **Azure OpenAI** for AI insights, **Google Gemini** for grounded ratings refresh

---

## Quick start

```pwsh
git clone <your-repo>
cd job-offer-compare
npm install

Copy-Item .env.example .env
# Edit .env: set DATABASE_URL (defaults to SQLite — fine for local).
# AI is optional. If you want it, add to .env.local:
#   AZURE_OPENAI_ENDPOINT=...
#   AZURE_OPENAI_API_KEY=...
#   AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini
#   AZURE_OPENAI_API_VERSION=2024-04-01-preview
# For ratings refresh, also add:
#   GEMINI_API_KEY=...    (free at https://aistudio.google.com/apikey)

npx prisma db push
npm run db:seed                  # seeds 164 companies (no fake ratings)
npm run db:refresh-ratings       # one-off: fetch real ratings via Gemini
                                  # daily cron handles incremental refreshes after that

npm run dev
```

Open http://localhost:3000.

---

## Deployment

Designed for Azure free / low-tier:
- **Azure Static Web Apps** (Free) for the Next.js host
- **Azure PostgreSQL Flexible Server B1ms** for production DB
- **Azure OpenAI** for AI insights (covered by your Azure credit)
- **GitHub Actions** for the daily ratings refresh cron, hitting `/api/cron/refresh-ratings` with `Authorization: Bearer ${CRON_SECRET}`

---

## Tests

```pwsh
npm test           # 27 tests across the scoring + equity engine
npm run typecheck  # tsc --noEmit
```

The engine is intentionally a pure function with no I/O so tests stay fast and don't need a DB.

---

## Contributing

This is a personal portal, but if you spot a fabricated number, broken source URL, or a metric that's misleading — open an issue. The "show your work" rule applies to code too: if a value can't be traced to a source, it shouldn't be in the database.
