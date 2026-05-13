# Migrating off Azure (contingency plan)

How to move **Job Offer Compare** from Azure to fully-free third-party services
if you ever lose access to your Azure subscription (credit expires, account
locked, employer reclaims it, etc.). Target: **₹0/month operating cost**, same
features.

This is a planning doc, not a runbook for today. Read it once, keep the env
vars listed at the bottom backed up somewhere safe (password manager), and
you'll be able to execute the migration in 2-3 hours when you actually need to.

---

## What we're running on Azure today

| Layer | Azure service | Replaced by |
|---|---|---|
| Web hosting | Azure Static Web Apps (Free) **or** App Service B1 | **Vercel Hobby** (recommended) |
| Database | Azure PostgreSQL Flexible Server B1ms (~₹1500/mo, in credit) | **Neon Free** (recommended) |
| AI — verdicts / what-if | Azure OpenAI `gpt-4.1-mini` | **GitHub Models** (same `gpt-4o-mini` family, free) |
| AI — ratings refresh | Gemini `gemini-2.5-flash-lite` (already direct, not Azure) | No change — keep Gemini direct |
| Cron (daily ratings) | GitHub Actions scheduled workflow | No change — keep GitHub Actions |
| Auth | NextAuth v5 + Google OAuth | No change — Google OAuth is free, just update redirect URIs |
| DNS / domain | Domain at registrar (e.g. Porkbun), CNAME → Azure | Same domain, CNAME → Vercel |

Nothing in this app holds blob/file storage, queues, or anything Azure-specific
beyond Postgres + the OpenAI deployment. The migration surface is small.

---

## Recommended replacement stack (all free, no card required for any of them)

### 1. Hosting → **Vercel Hobby**

- Built by the team behind Next.js. Zero-config deploy for `next 14`.
- Free tier: 100 GB bandwidth/mo, unlimited deploys, free SSL, custom domains.
- API routes, server actions, middleware all work as-is.
- Built-in cron (Vercel Cron) — you can move the daily refresh here too if you
  want to drop GitHub Actions, but no need.

**Caveat**: Free tier blocks "commercial use." For a personal portfolio /
demo this is fine. If it ever becomes a real business, plan B is below.

**Plan B if Vercel doesn't fit:**

| Provider | Free tier | Trade-off |
|---|---|---|
| **Cloudflare Pages + Workers** | Generous, no commercial-use restriction | Next.js support requires `@cloudflare/next-on-pages` adapter; some Node APIs unavailable |
| **Netlify** | 100 GB/mo, similar to Vercel | Next.js works, but server actions slightly less smooth |
| **Render** | Free web service | Sleeps after 15 min idle (cold start ~30s) — bad UX |
| **Railway** | $5 trial credit, then paid | Not truly free long-term |
| **Fly.io** | 3 shared-cpu-1x VMs, 3GB volume | Requires Dockerfile, more setup |

Pick **Vercel** unless you have a specific reason not to.

### 2. Database → **Neon Free**

- Serverless Postgres, fully managed, by the ex-Postgres core team.
- Free tier: **0.5 GB storage, 191 compute hours/mo**, branching, point-in-time
  restore (24 hr).
- Works with Prisma out of the box — just swap `DATABASE_URL`.
- Auto-suspend when idle (saves compute hours). First request after suspend
  has ~500ms cold start — acceptable.

This app's DB is tiny (a few hundred companies, your offers, ratings). 0.5 GB
will last you years.

**Plan B for the DB:**

| Provider | Free tier | Trade-off |
|---|---|---|
| **Supabase** | 500 MB Postgres, 2 GB bandwidth | Bundles auth/storage you don't need; pauses inactive projects after 1 week |
| **Aiven** | 1 month trial only | Not really free |
| **Turso** (libSQL/SQLite) | 9 GB, 500M row reads/mo | Need to switch Prisma provider from `postgresql` → `sqlite` flavor; some queries differ |
| **Cloudflare D1** (SQLite) | 5 GB, 5M reads/day | Same SQLite caveat; only works well from Cloudflare Workers |

Pick **Neon**. It's the lowest-friction switch (still Postgres, no schema
changes).

### 3. AI for verdicts / what-if → **GitHub Models**

- GitHub gives every personal account free access to a catalog of models
  (`gpt-4o-mini`, `gpt-4o`, `Phi-3`, etc.) via an OpenAI-compatible endpoint.
- The `provider.ts` file already has a `GitHubModelsProvider` class wired up —
  you just need to set `AI_PROVIDER=github-models` and provide a
  `GITHUB_TOKEN` (fine-grained PAT with `models:read` scope).
- Rate limits are modest (a few hundred calls/day) but enough for personal
  usage.

See [src/lib/ai/provider.ts](src/lib/ai/provider.ts) — the code path already
exists; this is a config switch, not a code change.

**Plan B for AI verdicts:**

| Provider | Free tier | Notes |
|---|---|---|
| **Groq** | Generous free tier, very fast | OpenAI-compatible API, models include Llama 3.3, Kimi, etc. Quality slightly below `gpt-4o-mini` for nuanced verdicts but acceptable |
| **OpenRouter** | A few "free" models (`:free` suffix) | OpenAI-compatible; quality varies; rate-limited |
| **Cloudflare Workers AI** | 10K neurons/day free | Only works well from Workers/Pages; not a great fit unless you've also moved hosting to Cloudflare |
| **Gemini direct** (`gemini-2.5-flash`) | Already used for ratings; could reuse for verdicts | Would need a small `GeminiProvider` class wired into the same `AiProvider` interface |

### 4. AI for ratings refresh → **no change**

`src/lib/providers/llmRatings.ts` already calls Gemini directly via
`@google/genai` and `GEMINI_API_KEY`. Gemini's free tier (~1500 requests/day on
flash-lite) is plenty for the daily 10-company refresh. **No migration needed.**

### 5. Cron → **no change**

`.github/workflows/refresh-ratings.yml` (per [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)) runs
on GitHub-hosted runners and just curls a public endpoint. It doesn't care
where the app is hosted — only the URL changes.

After migration, update the `curl` URL in that workflow from
`https://<old-azure-host>/api/cron/refresh-ratings` →
`https://<new-vercel-host>/api/cron/refresh-ratings`.

### 6. Auth → **no change** (just update redirect URIs)

Google OAuth credentials live in Google Cloud Console, not Azure. The only
thing to change is the **Authorized redirect URI** in the Google Cloud Console
OAuth client:

- Remove: `https://<old-azure-host>/api/auth/callback/google`
- Add: `https://<new-host>/api/auth/callback/google`

`AUTH_SECRET` and `AUTH_URL` are env vars — set them on Vercel.

---

## Migration runbook (when you actually need to do this)

Estimated time end-to-end: **~2-3 hours** if nothing goes wrong.

### Step 0 — Before you lose Azure access (do this NOW, preventatively)

1. **Back up the production database.** This is the only piece of state that
    matters. Run from any machine with the `DATABASE_URL` to the Azure DB:
    ```pwsh
    pg_dump --no-owner --no-acl `
      "postgresql://jocadmin:...@joc-db-prod.postgres.database.azure.com:5432/postgres?sslmode=require" `
      > joc-prod-backup-$(Get-Date -Format yyyyMMdd).sql
    ```
    Store the dump somewhere off-Azure (OneDrive, Google Drive, local SSD).
    Consider scheduling this monthly via a GitHub Action.

2. **Save all env vars** to your password manager under one entry (`joc-prod-env`):
    - `DATABASE_URL` (Azure Postgres connection string — needed only until cutover)
    - `AUTH_SECRET`
    - `AUTH_URL`
    - `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` (won't be needed post-migration but keep for reference)
    - `GEMINI_API_KEY`
    - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
    - `CRON_SECRET`

3. **Verify domain ownership / registrar access.** The domain isn't on Azure
    (assuming you bought it from Porkbun/Cloudflare), but double-check you can
    log in to the registrar. If the domain *is* on Azure DNS, transfer it to
    Cloudflare DNS now (free, takes ~10 min, no downtime).

### Step 1 — Stand up Neon and restore the database (~20 min)

1. Sign up at [neon.tech](https://neon.tech) with GitHub.
2. Create a project: name `joc-prod`, region nearest your users (e.g.
    `aws-ap-south-1` for India).
3. Copy the connection string from the Neon dashboard. It looks like:
    ```
    postgresql://user:pass@ep-xxx-xxx.ap-south-1.aws.neon.tech/neondb?sslmode=require
    ```
4. Restore the dump from Step 0:
    ```pwsh
    psql "<neon-connection-string>" < joc-prod-backup-YYYYMMDD.sql
    ```
5. Sanity-check: connect with `psql` and `SELECT count(*) FROM "Company";` — number should match what you had on Azure.

If you don't have a backup (e.g. Azure access is already gone): you can rebuild
from scratch by running `npx prisma db push` then `npm run db:seed` then
`npm run db:refresh-ratings` — you'll lose user accounts and saved offers, but
the company catalog and ratings will repopulate.

### Step 2 — Deploy to Vercel (~20 min)

1. Sign up at [vercel.com](https://vercel.com) with GitHub.
2. **Import Project** → pick the `job-offer-compare` repo.
3. Framework preset: **Next.js** (auto-detected).
4. Root directory: `./` (default).
5. **Environment Variables** — add all of these in the Vercel project settings:
    ```
    DATABASE_URL=<neon connection string from Step 1>
    AUTH_SECRET=<keep the same value as Azure to preserve sessions, OR rotate>
    AUTH_URL=https://<your-domain>           # set in Step 4; placeholder for now
    AI_ENABLED=true
    AI_PROVIDER=github-models
    AI_MODEL=gpt-4o-mini
    GITHUB_TOKEN=<fine-grained PAT with models:read scope>
    GEMINI_API_KEY=<existing key — keep>
    AUTH_GOOGLE_ID=<existing — keep>
    AUTH_GOOGLE_SECRET=<existing — keep>
    CRON_SECRET=<existing — keep, or rotate>
    ```
    Note: do **not** carry over `AZURE_OPENAI_*` vars; the GitHub Models
    provider replaces them.
6. Click **Deploy**. First build takes ~2-3 min.
7. Verify at `joc-<your-username>.vercel.app` — ratings should load, sign-in
    via email/password should work, AI verdict button should stream tokens.

### Step 3 — Issue a GitHub Models PAT (~5 min)

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new.
2. Name: `joc-prod-models`. Expiration: 1 year (set a calendar reminder to rotate).
3. Repository access: **Public Repositories (read-only)** is sufficient — Models access is account-level, not repo-scoped.
4. Permissions: under **Account permissions** find **Models** → **Read-only**.
5. Generate and copy. Paste as `GITHUB_TOKEN` env var in Vercel → redeploy.

### Step 4 — Cut DNS over to Vercel (~15 min + DNS propagation)

1. In Vercel project → **Settings** → **Domains** → **Add** → `joboffercompare.in`.
2. Vercel shows you the records to set:
    - Apex (`@`): `A` record → `76.76.21.21` (Vercel's anycast IP)
    - `www`: `CNAME` → `cname.vercel-dns.com`
3. At your registrar (or Cloudflare DNS):
    - **Delete** the old CNAME pointing to `*.azurestaticapps.net`.
    - **Add** the records Vercel asked for.
    - If using Cloudflare, set the proxy status to **DNS only** (grey cloud) initially — switch back to Proxied after the cert provisions.
4. Wait 5-15 min. Vercel auto-provisions a Let's Encrypt cert.
5. Once `https://joboffercompare.in` loads from Vercel, **update env var `AUTH_URL`** in Vercel to `https://joboffercompare.in` and redeploy. (NextAuth will redirect-loop on sign-in until this matches.)

### Step 5 — Update Google OAuth (~5 min)

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → your OAuth 2.0 Client.
2. **Authorized redirect URIs** — add:
    ```
    https://joboffercompare.in/api/auth/callback/google
    https://joc-<your-username>.vercel.app/api/auth/callback/google
    ```
    Keep the old Azure callback URL for now (in case you need to roll back).
3. **Authorized JavaScript origins** — add `https://joboffercompare.in` if not already there.
4. Save. Test Google sign-in on the new domain.

### Step 6 — Update GitHub Actions cron (~2 min)

Edit `.github/workflows/refresh-ratings.yml`:
```yaml
- name: Hit cron endpoint
  run: |
    curl -X POST "https://joboffercompare.in/api/cron/refresh-ratings?n=10" \
      -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```
Only the URL changes (and only if your domain changed too — if you kept the
same domain, no edit needed).

`CRON_SECRET` GitHub secret stays the same.

### Step 7 — Smoke test, then tear down Azure (~30 min)

Run through the critical flows on the new host:
- [ ] Home page loads
- [ ] `/companies` lists companies with ratings
- [ ] Sign up with email + password
- [ ] Sign in with Google
- [ ] Create a job offer
- [ ] Run a comparison (`/compare/new`)
- [ ] Click "AI Verdict" on a comparison — tokens stream in
- [ ] Trigger the cron manually:
    ```pwsh
    curl -X POST "https://joboffercompare.in/api/cron/refresh-ratings?n=2" `
      -H "Authorization: Bearer <CRON_SECRET>"
    ```
- [ ] Wait 24 hours and confirm the scheduled GitHub Action ran successfully

Once everything's green for 48 hours, **then** delete Azure resources (if you
still have access). Otherwise this step happens automatically when your
subscription lapses.

---

## Code changes required for the migration

Most of this is just env var swaps — but a couple of things need verifying:

### `src/lib/ai/provider.ts`

The factory that picks a provider should already honor `AI_PROVIDER`. Confirm
the branch for `AI_PROVIDER=github-models` exists and uses `GITHUB_TOKEN`. If
not, it's a 5-line addition (the `GitHubModelsProvider` class is already
written — you just need it to be selected). Open the file and search for
`AI_PROVIDER` to confirm.

### `prisma/schema.prisma`

Currently set to `provider = "sqlite"` for local dev (per
[prisma/schema.prisma](prisma/schema.prisma)). Production deployments override this. Vercel + Neon
both speak Postgres, so:

- Either change the schema's datasource to `provider = "postgresql"` (and add
  a separate `schema.dev.prisma` for SQLite local dev),
- OR keep SQLite locally and just ensure your prod build uses Postgres
  (Prisma reads `DATABASE_URL` at runtime, but the **provider** is set at
  build time — so this matters).

Recommended: switch the committed schema to `postgresql` permanently and use
a local Postgres (Docker) or Neon dev branch for local dev. SQLite vs Postgres
divergence has bitten this app before.

### `package.json` build script

Already runs `prisma generate && next build` — no change needed for Vercel.

### `.github/workflows/refresh-ratings.yml`

Update the `curl` URL (Step 6 above).

---

## Cost comparison

| Item | Azure (today) | Vercel + Neon + GitHub Models |
|---|---|---|
| Hosting | ₹0 (SWA Free, in credit) | ₹0 (Vercel Hobby) |
| Postgres | ~₹1500/mo (in credit) | ₹0 (Neon Free) |
| AI verdicts | ~₹150/mo (Azure OpenAI, in credit) | ₹0 (GitHub Models PAT) |
| AI ratings | ₹0 (Gemini free tier) | ₹0 (no change) |
| Cron | ₹0 (GitHub Actions) | ₹0 (no change) |
| Domain | ~₹50/mo amortized | ~₹50/mo amortized (no change) |
| **Total out-of-pocket** | **₹50/mo** (rest in Azure credit) | **₹50/mo** (just the domain) |

The cash cost is identical. The difference is that Azure depends on a credit
that can vanish, and the new stack depends on free tiers that have served
similar projects for years.

---

## Limits you'll hit eventually (and what to do)

| Limit | When you'll hit it | Fix |
|---|---|---|
| Neon: 0.5 GB storage | Far future — schema is small | Upgrade to Launch ($19/mo) or shard ratings/history table |
| Neon: 191 compute hours/mo | If app gets steady traffic and never auto-suspends | Same — upgrade |
| Vercel: 100 GB bandwidth/mo | ~10K MAU at this app's payload size | Upgrade to Pro ($20/mo) or move to Cloudflare Pages |
| GitHub Models: ~daily request cap | Heavy AI-verdict usage | Switch `AI_PROVIDER=groq` (also free, higher limits) |
| Vercel commercial-use clause | If app earns revenue | Move to Cloudflare Pages or pay Vercel Pro |

Each is a single-knob fix, not a re-architecture.

---

## Things that will trip you up

1. **`AUTH_URL` mismatch.** Same trap as the original deploy. If `AUTH_URL`
    on Vercel doesn't exactly equal what users type in the address bar,
    NextAuth callbacks will fail. Set this **after** the custom domain
    resolves on Vercel, not before.

2. **Neon connection pooling.** Neon's free tier closes idle connections
    aggressively. Use the **pooled connection string** (the one labeled
    "Pooled connection" in their UI, with `-pooler` in the host) for
    `DATABASE_URL` in serverless environments like Vercel. The non-pooled
    string is for migrations only.

3. **Prisma + Vercel cold start.** First request after a deploy hits Prisma
    Client initialization (~200-500ms). Don't benchmark cold-start latency.

4. **GitHub Models rate limits are silent.** When you hit the daily cap, the
    API returns a generic 429 — `provider.ts` should surface this clearly to
    the user. Worth a quick check that the error path is reasonable before you
    rely on it in production.

5. **Backup the Neon DB too.** Same as Azure — set up a monthly `pg_dump` via
    GitHub Actions to a private gist or S3-compatible bucket (Cloudflare R2
    has 10 GB free). Don't trust any single provider with your only copy.

6. **OAuth redirect URI gotcha.** Google enforces an exact-match list. If you
    sign in once on `https://joboffercompare.in` and once on
    `https://joc-yourname.vercel.app`, both must be registered. Add the
    Vercel preview URL pattern too if you want PR previews to support
    sign-in (`https://joc-*-yourname.vercel.app` — Google doesn't accept
    wildcards, so you'd need to use email-only auth on previews).

---

## TL;DR

If Azure access disappears tomorrow:
1. Restore last `pg_dump` to **Neon** (free Postgres).
2. `git push` deploys to **Vercel** (free Next.js hosting).
3. Set `AI_PROVIDER=github-models` + a `GITHUB_TOKEN` PAT for verdicts.
4. Update DNS CNAME and the Google OAuth redirect URI.
5. Total cost: **same ₹50/mo for the domain, nothing else.**

Keep a fresh DB dump and the env-var list backed up off-Azure. That's the
only step you need to do *today* to make this plan executable later.
