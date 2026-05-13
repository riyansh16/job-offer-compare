# LeetCode compensation post discovery

A read-only feasibility tool for fetching links to LeetCode compensation
discussion posts that match a `(company, designation, yoe)` triple, scoped
to India and stripped of non-compensation content (interview-experience
write-ups, hiring-process posts, etc.).

- **Script:** [`scripts/probeLeetcodeLive.ts`](../scripts/probeLeetcodeLive.ts)
- **Status:** standalone probe (no DB / API / UI integration yet).
- **Data source:** LeetCode public GraphQL endpoint
  (`https://leetcode.com/graphql/`), op `ugcArticleDiscussionArticles`.

## Usage

```powershell
npx tsx scripts/probeLeetcodeLive.ts <company> [designation] [yoe] [--limit N] [--debug]
```

Examples:

```powershell
npx tsx scripts/probeLeetcodeLive.ts Google
npx tsx scripts/probeLeetcodeLive.ts Google L4
npx tsx scripts/probeLeetcodeLive.ts Google L4 4
npx tsx scripts/probeLeetcodeLive.ts Microsoft "SDE-2" 5 --limit 10
npx tsx scripts/probeLeetcodeLive.ts Microsoft "Software Engineer 2"
```

Positional args are interpreted in order: `company`, then `designation`,
then `yoe`. If slot 2 is purely numeric it's treated as `yoe` for backward
compatibility.

## Approach

### 1. Fetch (single GraphQL op, with pagination)

POST `ugcArticleDiscussionArticles` with:

| variable | value |
|---|---|
| `orderBy` | `MOST_RECENT` (newest first) |
| `keywords` | `[<company>]` (server-side full-text) |
| `tagSlugs` | `['compensation']` (loosely enforced by LC) |
| `first` | `100` per page |
| `skip` | `page * 100` |

The endpoint requires no auth. Each page returns up to 100 nodes with
`uuid`, `topicId`, `title`, `slug`, `createdAt`, `hitCount`.

We paginate until the funnel produces at least **3** matching results, or
we hit a 10-page cap (≈1000 posts), or the server runs out.

### 2. Filter funnel (client-side, in this order)

```text
raw → company → designation → india → comp-only → yoe → shown
```

| Stage | What it does |
|---|---|
| **company** | substring match on lowercased title; multi-token names require all tokens |
| **designation** | matches expanded synonym set (see below) — skipped if not given |
| **india** | three-state location filter (see below) |
| **comp-only** | excludes interview-experience / process / hiring-committee / OA / referral / "chances" / preparation / pass-rate posts |
| **yoe** | if title carries an explicit YoE figure, require ±1y; **posts without an explicit YoE are kept** (level acts as a YoE proxy) — skipped if not given |

#### Designation synonyms

Input is normalized then expanded, so a single search term hits all common
spellings on LeetCode. Word-boundary matching prevents false hits like
`L4` matching `L40`.

| Input | Expansion includes |
|---|---|
| `L4` | `l4`, `level 4` |
| `SDE-2` | `sde-2`, `sde2`, `sde 2`, `sde-ii`, `sde ii`, `sdeii`, plus `software engineer 2/ii`, `software developer 2/ii` |
| `SWE-III` | `swe-iii`, `swe iii`, `sweiii`, `swe-3`, `swe 3`, `swe3`, plus `software engineer 3/iii`, `software developer 3/iii` |
| `Software Engineer 2` | `software engineer 2/ii`, plus `sde-2`, `swe-2`, `sse-2` family |

#### India location filter

Three-state, applied to lowercased title:

1. **Has India token** (cities `bangalore/blr/hyderabad/pune/...`,
   currency `lpa/lakh/crore/₹/inr`, or `india/indian`) → **keep**
2. Else **has foreign token** (`warsaw/seattle/redmond/bay area/london/...`)
   → **drop**
3. Else (no location at all) → **keep** — many India posts omit location.

#### Comp-only exclusions

Single regex matches any of:

```
interview experience | interview process | interview question
interview query | interview round | interview timeline
hiring experience | hiring timeline | hiring committee | pass rate
application timeline | timeline only | oa | online assessment
referral | chances? | asked in | preparation | preparing
coding round
```

#### YoE extraction

Tries four patterns on title:

```text
\byoe\s*[:\-]?\s*(\d{1,2}(\.\d)?)        →  "YOE: 5",  "YOE 5"
(\d{1,2}(\.\d)?)\s*\+?\s*yoe\b            →  "5 YOE",   "5+yoe"
(\d{1,2}(\.\d)?)\s*\+?\s*y(rs?|ears?)\b   →  "5 yrs",   "5+ years"
\bexp(erience)?\s*[:\-]?\s*(\d{1,2}…)     →  "exp 4"
```

Posts where no YoE was found in the title are kept regardless — the
designation/level passed in stage 2 already constrains seniority well.

### 3. URL construction

For each surviving post we build the canonical URL:

```text
https://leetcode.com/discuss/post/<topicId>/<slug>/
```

LeetCode also accepts `/discuss/post/<slug>/` and `/discuss/topic/<topicId>/`,
but the numeric `topicId + slug` form is the most robust.

### 4. Output

Newest-first list of `title + URL + (yoe / hits / date)`, plus a `Funnel:`
diagnostic line showing how many posts survived each stage. Useful for
tuning when a query returns nothing.

## Why this design (and what it deliberately doesn't do)

- **No body fetching.** LeetCode is behind Cloudflare; server-side HTML
  GETs return a "Just a moment…" interstitial. Bodies would need a
  headless browser.
- **No LLM extraction.** Titles are surprisingly information-dense
  (`"Microsoft | SDE2 (L62) | Hyderabad"`). Skipping LLM keeps the script
  free, fast (one HTTP call per page) and deterministic.
- **No comp-number extraction.** We surface *links*; the user reads the
  post for the actual numbers.
- **No DB cache.** Probe-only — wire-up to Prisma + a refresh job /
  UI panel can come later if we decide to ship this.

## Caveats

- **Unauthenticated GraphQL endpoint, undocumented.** Treat as best-effort;
  expect breakage when LeetCode changes their schema.
- **`tagSlugs` is loose.** Some non-comp topics slip through, which is why
  the comp-only stage exists.
- **Cloudflare risk.** Keep request volume low; if we ship this, cache
  results aggressively.
- **Legacy `categoryTopicList` op is frozen** (index ends ~March 2025).
  We deliberately use `ugcArticleDiscussionArticles`, which is live.

## Sample run

```powershell
> npx tsx scripts/probeLeetcodeLive.ts Google L4 4 --limit 20

[live] company="Google" designation="L4" yoe=4 limit=20
[live] fetched 100 / 1149 across 1 page(s)

=== Funnel: raw=100 → company=38 → designation=11 → india=10 → comp-only=7 → yoe=7 → shown=7 ===

- Google | L4 | SWE 3 | India | 3.5 YOE
  https://leetcode.com/discuss/post/7520006/google-l4-swe-3-india-35-yoe-by-anonymou-8pvq/  [yoe=3.5 hits=12186 2026-01-24]
- Google L4 | Offer - Bangalore
  https://leetcode.com/discuss/post/7391662/google-l4-offer-bangalore-by-anonymous_u-nilv/  [yoe=? hits=8588 2025-12-04]
...
```
