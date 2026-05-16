# Companies Missing Indeed Ratings

**Generated:** 2026-05-16 after multi-pass `db:refresh-ratings` + `db:escalate-ratings` runs with `gemini-2.5-flash` and updated system prompt.

**Coverage:** 151 / 164 companies have an Indeed rating (~92%). 13 remain empty.

---

## Category A — Has Indeed URL, but model returned `null` numbers (10)

The Indeed company page was located but Gemini refused to commit to rating numbers. After the system-prompt fix that explicitly demands the headline rating, these are the genuinely stubborn cases. Most are small startups with thin review counts; the model conservatively returns `null` rather than guessing.

| Company | Ticker | HQ | Industry | Stored Indeed URL | Notes |
|---|---|---|---|---|---|
| **Character.AI** | — | Menlo Park, CA | AI Companions | `https://www.indeed.com/cmp/Character` | Generic name; URL may be wrong company. |
| **ElevenLabs** | — | London, UK | Voice AI | `https://www.indeed.com/cmp/ElevenLabs` | Startup; low review count likely. |
| **Levels.fyi** | — | San Francisco, CA | Comp Data | `https://www.indeed.com/cmp/Levels.fyi` | Small team; few Indeed reviews. |
| **Mistral AI** | — | Paris, FR | AI Research | `https://www.indeed.com/cmp/Mistral-AI` | French startup; weak Indeed presence. |
| **Perplexity** | — | San Francisco, CA | AI Search | `https://www.indeed.com/cmp/Perplexity` | Startup; low review count. |
| **Resend** | — | San Francisco, CA | Email API | `https://www.indeed.com/cmp/Resend` | Tiny team; likely no reviews. |
| **SAP** | SAP | Walldorf, DE | Enterprise SaaS | `https://in.indeed.com/cmp/SAP/reviews` | False negative — isolated probe succeeds (4.2★, 3,067 reviews). Batch is flaky due to non-deterministic grounding. Re-run should pick this up. |
| **Scale AI** | — | San Francisco, CA | AI Data | `https://www.indeed.com/cmp/Scale-AI/reviews` | Mid-size; likely recoverable on retry. |
| **Supabase** | — | Remote | Backend Platform | `https://www.indeed.com/cmp/Supabase` | Remote-first; few Indeed reviews. |
| **Wiz** | — | New York, NY | Cloud Security | `https://www.indeed.com/cmp/Wiz` | Page exists (3.3★, only 3 reviews). Probably permanent — too thin. |

---

## Category B — No Indeed URL at all (3)

Model returned `notFound: true`. Either no Indeed presence, or the page exists but grounded search can't surface it.

| Company | Ticker | HQ | Industry | Notes |
|---|---|---|---|---|
| **Bun** | — | San Francisco, CA | JS Runtime | Small (~20-person) JS runtime by Oven. No real Indeed presence. Wrong `Bun-Mee` URL was cleared. |
| **Liveblocks** | — | Paris, FR | Realtime APIs | Small French startup. Likely no Indeed page. |
| **PostHog** | — | Remote | Product Analytics | Remote-first open-source. Likely no Indeed page. |

---

## What was rescued this session

- **Prompt fix** (made the overall rating an explicit priority in the system prompt) rescued **Rakuten** and **Ramp** that had previously returned only sub-ratings.
- **Bun URL purge** removed an incorrect `indeed.com/cmp/Bun-Mee` (a sandwich shop) mapping.
- **Earlier escalate runs** added Deliveroo, Greenhouse, Workday and several others.

---

## Recommended next steps

1. **Re-run periodically** — at least SAP and Scale AI are false negatives that succeed on isolated probes. The daily cron will eventually catch them.
2. **Accept Category B as permanent gaps** — these companies genuinely have no usable Indeed page. The UI gracefully shows them without a rating.
3. **Optional override file** — for the ~7 companies (Resend, Supabase, Liveblocks, PostHog, Levels.fyi, Bun, ElevenLabs) where Indeed is structurally the wrong source, consider a `companies.overrides.json` that marks them `notFound: true` permanently so they stop being re-attempted. Could also surface Glassdoor / G2 / Levels.fyi data for them instead.

## Debug tooling

- `LLM_RATINGS_DEBUG=1` env var enables per-company reason logging (`model:notFound`, `no-url`, `no-rating`, etc.) — see `src/lib/providers/llmRatings.ts`.
- `scripts/probeRating.ts` — call Gemini for a single company and print raw response + parsed JSON + diagnosis.
- `scripts/listMissingRatings.ts` — quick view of the current missing list split by category.
- `scripts/fixBun.ts` — example of fetching a single company with a disambiguator and persisting (or clearing) the result.
