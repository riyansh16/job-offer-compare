# Deployment Plan

How to get **Job Offer Compare** running on the public internet, on your own
domain, for $0/month operating cost (within your Azure ₹12,500 monthly credit).

---

## Goals

- ✅ Reachable at a real URL like `joboffercompare.in` (not `*.azurestaticapps.net`)
- ✅ HTTPS / SSL certificate (free)
- ✅ Persistent Postgres database
- ✅ Daily ratings refresh via cron
- ✅ Stay within Azure's ₹12,500/mo credit
- ✅ Reliable enough that you'd actually share the link

---

## Recommended stack

| Layer | Service | Tier | Why |
|---|---|---|---|
| **Hosting** | Azure Static Web Apps + linked Azure Functions OR Azure App Service B1 | Free / B1 | Native Next.js support, free SSL, easy custom domain |
| **Database** | Azure PostgreSQL Flexible Server | B1ms (Burstable) | Smallest paid tier, ~₹1500/mo (covered by credit) |
| **Object storage** | _(none needed)_ | — | App stores nothing besides DB rows |
| **Cron** | GitHub Actions scheduled workflow | Free (public repo) / 2K min/mo (private) | Hits `/api/cron/refresh-ratings` daily |
| **AI** | Azure OpenAI gpt-4.1-mini | Pay-per-token | Already set up — costs ~₹50-200/mo at personal usage |
| **DNS / domain** | Cloudflare (DNS) + Freenom or .tk OR free subdomain | Free | See "Domain options" below |

**Total cost in your Azure credit**: ~₹2,000-2,500/mo, leaving ~₹10,000 buffer.

---

## Domain options (cheapest first)

### Option A — Free subdomain (₹0, recommended for v1)

| Provider | URL pattern | Notes |
|---|---|---|
| **Vercel** | `joc.vercel.app` | Free, instant, SSL included. Just deploy on Vercel instead of Azure. |
| **Azure Static Web Apps** | `joc-app.azurestaticapps.net` | Free, but ugly URL |
| **GitHub Pages** | `riyansh.github.io/joc` | Static-only, won't work for our Next.js server features |
| **Render** | `joc.onrender.com` | Free tier, sleeps after 15 min idle |

**Pick this if**: you want to launch in 1 hour and don't care about the URL.

### Option B — Free domain (₹0, but limited TLDs)

These TLDs are genuinely free for 12 months:

| Provider | TLDs | Renewal |
|---|---|---|
| **Freenom** | `.tk`, `.ml`, `.ga`, `.cf`, `.gq` | Free renewal annually (have to remember) |
| **Eu.org** | `*.eu.org` | Free forever, but slow approval (~weeks) |
| **InfinityFree** | `*.infinityfree.app` | Subdomain only, free |

**Honest warning**: Freenom TLDs (`.tk` etc.) look unprofessional and Google occasionally penalizes them in rankings. Use only as throwaway demos.

### Option C — Cheap real domain (₹100-800/yr) ⭐ Best value

| Registrar | TLD examples | Annual cost |
|---|---|---|
| **Cloudflare Registrar** | `.com` $10.44, `.in` $10, `.dev` $11 | ~₹830-940/yr at-cost (no markup) |
| **Porkbun** | `.in` $7, `.com` $11, `.app` $13 | ~₹600-1100/yr |
| **Namecheap** | `.in` ~₹400 first year, `.com` ~₹950 | India-based, INR billing |
| **GoDaddy India** | `.in` often ₹99 first year | UPI / NetBanking, but expensive renewals |

**My recommendation:** Buy `joboffercompare.in` from **Porkbun** (~₹600/yr) or **Cloudflare Registrar** (~₹830/yr).

- `.in` is appropriate (India-focused product)
- Honest pricing (Cloudflare doesn't mark up renewals)
- Both registrars include free WHOIS privacy

### Option D — Use a domain you already own

If you have a personal domain (e.g. `riyansh.dev`), just point a subdomain like `joc.riyansh.dev` to the Azure host. ₹0 incremental cost.

---

## Step-by-step deployment

### Phase 1 — Get it running on Azure (no domain yet, ~30 min)

1. **Push code to GitHub** (private repo is fine).

2. **Create Azure Postgres Flexible Server** (B1ms tier):
    ```pwsh
    az postgres flexible-server create `
      --resource-group job-offer-compare-rg `
      --name joc-db-prod `
      --location centralindia `
      --tier Burstable --sku-name Standard_B1ms `
      --storage-size 32 `
      --admin-user jocadmin `
      --admin-password '<strong-password>'
    ```
    Cost: ~₹1500/mo. Use **Central India** region for low latency.

3. **Allow Azure services to connect** (in portal: Networking → Allow public access from any Azure service).

4. **Run migrations against prod DB**:
    ```pwsh
    $env:DATABASE_URL = "postgresql://jocadmin:...@joc-db-prod.postgres.database.azure.com:5432/postgres?sslmode=require"
    npx prisma db push
    npm run db:seed
    ```

5. **Create Azure Static Web App**:
    - Portal → Create resource → "Static Web App"
    - Plan: **Free**
    - Source: GitHub → pick the repo
    - Build presets: **Next.js**
    - App location: `/`
    - API location: leave blank (Next.js routes handle API)
    - Output location: `.next`
    - GitHub Action gets auto-created → triggers a build

6. **Add env vars in Azure Static Web App** (Configuration tab):
    ```
    DATABASE_URL=<your prod Postgres URL>
    AUTH_SECRET=<openssl rand -base64 32>
    AUTH_URL=<your eventual prod URL, set later>
    AZURE_OPENAI_ENDPOINT=https://job-offer-compare-ai.openai.azure.com/
    AZURE_OPENAI_API_KEY=<rotate first!>
    AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini
    AZURE_OPENAI_API_VERSION=2024-04-01-preview
    GEMINI_API_KEY=<rotate first!>
    CRON_SECRET=<openssl rand -hex 16>
    ```

7. **Verify it works** at `joc-app.azurestaticapps.net`.

### Phase 2 — Custom domain (~15 min)

Assuming you bought `joboffercompare.in` from Porkbun/Cloudflare:

1. **In Azure Static Web App** → **Custom domains** → **+ Add**
2. Choose **Custom domain on other DNS** (since registrar is Porkbun, not Azure DNS)
3. Type your domain: `joboffercompare.in`
4. Azure shows you a **CNAME** record to create at your registrar
5. **At Porkbun/Cloudflare** → DNS settings → Add:
   - Type: `CNAME`
   - Name: `@` (or `www`, depending on what Azure asks)
   - Value: `<azure-static-app>.azurestaticapps.net`
6. Wait 5-10 min for DNS propagation
7. Azure auto-provisions a free SSL cert via Let's Encrypt
8. Update `AUTH_URL` env var in Azure SWA to `https://joboffercompare.in`

### Phase 3 — Daily cron (~10 min)

Create `.github/workflows/refresh-ratings.yml`:

```yaml
name: Refresh ratings (daily)
on:
  schedule:
    - cron: '0 2 * * *'  # 02:00 UTC = 07:30 IST
  workflow_dispatch:
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Hit cron endpoint
        run: |
          curl -X POST "https://joboffercompare.in/api/cron/refresh-ratings?n=10" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

Add `CRON_SECRET` to GitHub repo Settings → Secrets and variables → Actions.

This refreshes 10 stalest companies daily — full catalog cycles in ~17 days.

### Phase 4 — Email signup (optional, ~30 min)

If you want users to sign up by email (not just demo account):

1. **Azure Communication Services** has free tier for email
2. OR use **Resend** (3000 emails/mo free)
3. Wire to NextAuth's email provider

Skip this for v1 — keep email/password auth or just Google OAuth.

---

## Honest cost breakdown

Monthly running cost (assuming ~50 daily users):

| Service | Cost |
|---|---|
| Azure Postgres B1ms | ~₹1500 |
| Azure Static Web Apps (Free) | ₹0 |
| Azure OpenAI gpt-4.1-mini (~5K calls/mo) | ~₹150 |
| Gemini grounded search (free tier, daily cron) | ₹0 |
| Yahoo Finance / Reddit / HN | ₹0 |
| Domain (`joboffercompare.in` amortized) | ~₹50/mo |
| **Total** | **~₹1700/mo** |

Inside your ₹12,500 Azure credit. Leaves ~₹10,800/mo headroom for traffic spikes.

---

## Things that will trip you up

These are real, not theoretical:

1. **`AUTH_URL` mismatch.** If `AUTH_URL` doesn't exactly match the URL users access on, NextAuth login will redirect-loop. Set it after the custom domain is live.

2. **Postgres SSL.** Azure Postgres requires SSL. Connection string MUST end with `?sslmode=require`.

3. **Static Web Apps API timeout.** SWA caps API routes at 100s. The bulk ratings refresh takes 6+ minutes — never run it from the web. Always trigger via the bootstrap script locally OR via the daily cron (which only does 10 at a time).

4. **Free SSL cert for apex domain.** Some registrars don't allow CNAME on the apex (`@`). You may need ALIAS / ANAME / use Cloudflare DNS instead. Cloudflare DNS is free and handles this automatically.

5. **Time zone in cron.** GitHub Actions cron is UTC. `0 2 * * *` is 7:30 AM IST.

6. **First-deploy build failure.** Azure Static Web Apps sometimes fail the first build if `prisma generate` hasn't run. Fix: add `"postinstall": "prisma generate"` to package.json.

---

## My recommendation for fastest path

1. **This week**: Buy `joboffercompare.in` on Porkbun (₹600). Push to GitHub.
2. **Tomorrow morning** (1.5 hrs): Run Phase 1 + Phase 2.
3. **Day 2** (15 min): Add Phase 3 cron.
4. **When ready to share**: rotate keys, share the URL.

You can defer Postgres and run on free SQLite (file in container) for the first week if you want — it'll work fine for personal use, you just lose data if Azure restarts the container. **Postgres is the responsible choice for anything you'd share publicly.**
