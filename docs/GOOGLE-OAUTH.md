# Google OAuth Integration Plan

> Step-by-step plan for making Google OAuth the **only** sign-in method in
> production. Local dev keeps the email/password path behind an `OPEN_SIGNUP`
> flag so you can keep iterating without a Google account in the loop.

**Status**: planning. No code changes from this plan have been applied yet.

**Owner**: [TODO.md](../TODO.md) → 🔴 Blockers → "Authentication (prod hardening)".

---

## Goal

| Environment | Sign-in methods | Sign-up methods |
|---|---|---|
| Local dev (`OPEN_SIGNUP=true`) | Google OAuth **+** email/password | Email/password form available |
| Production (`OPEN_SIGNUP=false`, the default) | Google OAuth **only** | None — Credentials provider disabled, signup form hidden |

No email allowlist. Anyone with a Google account can sign in. Abuse is mitigated by per-user rate limits (separate TODO item) and Sentry alerts.

---

## What already exists in the codebase

This isn't a green-field task — most of the wiring is already in place. Read these files before touching anything:

- [src/lib/auth.ts](../src/lib/auth.ts) — NextAuth v5 config, Prisma adapter, Credentials + conditional Google provider
- [src/lib/auth-actions.ts](../src/lib/auth-actions.ts) — `signupAction`, `signInWithCredentials`, `signInWithGoogle` server actions
- [src/components/AuthForms.tsx](../src/components/AuthForms.tsx) — `SignInForm` and `SignUpForm` client components
- [src/app/auth/signin/page.tsx](../src/app/auth/signin/page.tsx) — sign-in route, conditionally shows the Google button based on env
- [src/app/auth/signup/page.tsx](../src/app/auth/signup/page.tsx) — sign-up route
- [src/app/auth/error/page.tsx](../src/app/auth/error/page.tsx) — generic error display
- [src/middleware.ts](../src/middleware.ts) — auth-gates everything except `/`, `/auth/*`, `/api/auth/*`
- [.env](../.env) — has empty `AUTH_GOOGLE_ID=""` and `AUTH_GOOGLE_SECRET=""` placeholders
- [.env.example](../.env.example) — same placeholders, will be the source of truth for documenting new env vars

The Google provider already auto-registers when both env vars are populated, so Phase 1 is mostly a credentials + env exercise.

---

## Phase 0 — Google Cloud Console setup (manual, ~10 min)

**One-time external setup.** Do this first; nothing else can be tested without real OAuth credentials.

1. Open <https://console.cloud.google.com>.
2. **Create / select project** named `job-offer-compare` (or pick an existing personal project).
3. **OAuth consent screen**:
   - User type: **External**
   - App name: `Job Offer Compare`
   - User support email: your gmail
   - Developer contact email: your gmail
   - Scopes: leave defaults (`openid`, `email`, `profile`). These are **non-sensitive** scopes, which means **no Google verification process is needed** for up to 100 sign-ins.
   - Test users: skip — leave the app in "Testing" mode. Flip to "In production" before you publicize the URL.
4. **Credentials → Create OAuth Client ID → Web application**:
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (dev)
     - `https://<your-prod-domain>` (add after the domain is bought; you can update this any time)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://<your-prod-domain>/api/auth/callback/google`
5. Copy the **Client ID** and **Client Secret** from the credential detail page.

> **Note on scopes:** `openid email profile` covers everything we need (name, email, profile picture). Adding any other Google API scope (Calendar, Drive, etc.) would tip the app into "sensitive" territory and require Google's verification review.

---

## Phase 1 — Wire credentials, smoke-test dev sign-in

No code changes — just config + manual verification. Confirms the Google round-trip works before we change application logic.

| Step | Action |
|---|---|
| 1.1 | Add to [.env.local](../.env.local): `AUTH_GOOGLE_ID=<client-id>` and `AUTH_GOOGLE_SECRET=<client-secret>` |
| 1.2 | Restart `npm run dev` (env vars are only read at process start) |
| 1.3 | Visit <http://localhost:3000/auth/signin> — confirm "Continue with Google" button now appears |
| 1.4 | Click the button → Google consent screen → approve → land on `/dashboard` |
| 1.5 | Open Prisma Studio (`npm run db:studio`) → verify a new row in `User` and a matching row in `Account` (provider=`google`, providerAccountId=Google's user id) |
| 1.6 | Sign out → sign back in → confirm the **same** user row is reused (no duplicate) |

**Done when:** end-to-end Google sign-in works locally and account rows are correctly linked.

---

## Phase 2 — Code hardening

Pure application changes. Each is small and independently revertible. Listed in dependency order.

### 2.1 Enable account linking on the Google provider

**Why:** if a user previously signed up via email/password as `you@gmail.com` (in dev) and later clicks "Continue with Google" with the same Google account, NextAuth currently throws `OAuthAccountNotLinked`. Setting `allowDangerousEmailAccountLinking: true` merges them transparently.

**File:** [src/lib/auth.ts](../src/lib/auth.ts)

**Change:**
```ts
Google({
  clientId: process.env.AUTH_GOOGLE_ID,
  clientSecret: process.env.AUTH_GOOGLE_SECRET,
  allowDangerousEmailAccountLinking: true, // safe here because we trust Google's verified-email claim
}),
```

The "dangerous" name is a warning that you'd be vulnerable if you trusted email claims from a provider that doesn't verify them. Google **does** verify, so this is the correct setting for our case.

### 2.2 Gate the Credentials provider on `OPEN_SIGNUP`

**Why:** in prod we want Google-only. Removing the Credentials provider entirely means no dictionary-attack surface and no password-reset flow to build.

**File:** [src/lib/auth.ts](../src/lib/auth.ts)

**Change:** wrap the `Credentials({ … })` block in `if (process.env.OPEN_SIGNUP === 'true') { providers.push(Credentials({ … })) }`. Move the existing Credentials registration out of the static `providers` array initializer into a conditional push, matching how the Google provider is registered today.

### 2.3 Tighten JWT lifetime

**Why:** NextAuth defaults to 30-day JWTs. A tool that stores salary data should expire sessions sooner. 7 days is a reasonable balance between convenience and exposure.

**File:** [src/lib/auth.ts](../src/lib/auth.ts)

**Change:**
```ts
session: {
  strategy: 'jwt',
  maxAge: 7 * 24 * 60 * 60, // 7 days
  updateAge: 24 * 60 * 60, // sliding refresh once per day of activity
},
```

### 2.4 Disable signup server action when `OPEN_SIGNUP !== 'true'`

**Why:** stop the signup endpoint from creating new email/password users in prod even if someone POSTs to it directly (bypassing the UI).

**File:** [src/lib/auth-actions.ts](../src/lib/auth-actions.ts)

**Change:** at the top of `signupAction`, before any DB work:
```ts
if (process.env.OPEN_SIGNUP !== 'true') {
  return { error: 'Sign-up is disabled. Please continue with Google.' };
}
```

### 2.5 Hide the "Create an account" link when signup is off

**File:** [src/app/auth/signin/page.tsx](../src/app/auth/signin/page.tsx)

**Change:** render the `<Link href="/auth/signup">` only when `process.env.OPEN_SIGNUP === 'true'`. Pass the flag down from the server component to the client form if needed.

### 2.6 Convert the signup page to a "disabled" landing when off

**File:** [src/app/auth/signup/page.tsx](../src/app/auth/signup/page.tsx)

**Change:** if `OPEN_SIGNUP !== 'true'`, render a friendly card with text "Sign-up is via Google only" and the same Google button used on the sign-in page. Otherwise render the existing form.

### 2.7 Promote Google as the primary CTA on the sign-in form

**Why:** today the form puts email/password first and Google second with an "or" divider. In prod most users will use Google, so Google should be the primary action.

**File:** [src/components/AuthForms.tsx](../src/components/AuthForms.tsx)

**Change:** in `SignInForm`, render the Google button **above** the email/password form, with the "or" divider between. Only show the email/password form when `googleEnabled` is true **and** `OPEN_SIGNUP === 'true'` (pass it as a new prop).

### 2.8 Map NextAuth error codes to friendly messages

**Why:** today the error page shows raw codes like `OAuthAccountNotLinked` or `Configuration`. Users have no idea what to do.

**File:** [src/app/auth/error/page.tsx](../src/app/auth/error/page.tsx)

**Change:** add a `MESSAGES` map:
```ts
const MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    'This email is already linked to a different sign-in method. Use the original method to sign in.',
  AccessDenied: 'You cancelled the sign-in.',
  Configuration: 'Server configuration error. Please contact the admin.',
  Verification: 'The sign-in link expired. Request a new one.',
  CredentialsSignin: 'Invalid email or password.',
};
```
Look up `MESSAGES[sp.error ?? '']` with a generic fallback.

### 2.9 Document env vars

**File:** [.env.example](../.env.example)

**Change:** add or update with explanatory comments:
```dotenv
# NextAuth (Auth.js v5)
# ----------------------------------------------------------------------------
# Long random string, different per environment. Generate with:
#   openssl rand -base64 32
AUTH_SECRET="change-me-to-a-long-random-string"

# Required behind reverse proxies (Azure SWA, Vercel). Leave unset in local dev.
# AUTH_TRUST_HOST=true

# Google OAuth (https://console.cloud.google.com → Credentials → Web app)
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""

# Local-only escape hatch: allow email/password registration when "true".
# DO NOT set this in production. Default behavior is signup-disabled.
OPEN_SIGNUP=false
```

Also add `OPEN_SIGNUP=true` to `.env.local` so the existing dev workflow doesn't break.

### Verification gate

Before merging Phase 2:

- [ ] `npm test` → 27/27 pass
- [ ] `npx tsc --noEmit` → clean
- [ ] In `.env.local` with `OPEN_SIGNUP=true`: email/password sign-in still works
- [ ] In `.env.local` with `OPEN_SIGNUP=false`: signup page shows "Sign-up disabled"; credentials sign-in returns an error; Google sign-in still works
- [ ] Auth-error page shows friendly messages for `?error=OAuthAccountNotLinked` and `?error=AccessDenied`

---

## Phase 3 — Production deployment

These belong on the deployment runbook ([docs/DEPLOYMENT.md](DEPLOYMENT.md)). Summarized here for completeness.

### Env vars to set in Azure SWA → Configuration

| Var | Value |
|---|---|
| `AUTH_SECRET` | Fresh `openssl rand -base64 32` — **must differ from dev** |
| `AUTH_GOOGLE_ID` | From Google Console |
| `AUTH_GOOGLE_SECRET` | From Google Console |
| `AUTH_TRUST_HOST` | `true` |
| `NEXTAUTH_URL` | `https://<your-prod-domain>` (NextAuth v5 also reads `AUTH_URL`) |
| `OPEN_SIGNUP` | unset or `false` |

### Update Google Console after DNS is live

- Add `https://<your-prod-domain>` to **Authorized JavaScript origins**
- Add `https://<your-prod-domain>/api/auth/callback/google` to **Authorized redirect URIs**
- Save — propagation is instant

### Pre-launch smoke test (≤5 min)

1. Open the prod URL in an incognito window
2. Click "Continue with Google" with a Google account that has **never used the dev environment**
3. Verify redirect lands on `/dashboard`
4. Open `/companies/meta` → confirm the layoff banner renders
5. Refresh the tab — session should persist
6. Click sign out — cookie should clear; revisiting `/dashboard` should redirect to `/auth/signin`

### Clean up dev artifacts in prod DB

Run after seeding but before announcing the URL:

```sql
DELETE FROM "User" WHERE email IN (
  'demo@example.com',
  'test@example.com'
  -- add any other dev emails that leaked into the prod seed
);
```

(These aren't in `prisma/seed.ts` so should already be absent — just verify.)

---

## Phase 4 — Promote OAuth app from "Testing" to "In production"

Required only once you expect external (non-dev-test) users.

1. Google Console → OAuth consent screen → **Publish app**.
2. App stays in "In production" — no review is triggered as long as scopes remain `openid email profile`.
3. If you ever add a sensitive scope, Google starts the verification flow at that point.

---

## Explicitly NOT doing in v1

These were considered and deferred. The TODO blocker subsection records the same list.

- **Email allowlist** (`AUTH_ALLOWED_EMAILS`) — adds friction without proportional security gain at this scale.
- **Magic-link email verification** — needs SMTP/Resend, DNS records on the prod domain, and a `VerificationToken` flow. Defer until a real Google-less user requests it.
- **App-level MFA** — Google's own 2FA covers our OAuth users. Not worth building.
- **Password reset flow** — would only be needed if Credentials stayed in prod, which it doesn't.
- **Account linking UI** — `allowDangerousEmailAccountLinking` handles the only realistic linking case (same email across providers). A real linking UI is post-launch.

---

## Open questions (answer before Phase 2)

- **Do you want existing dev users (`demo@example.com`, etc.) to keep working in dev?** Default plan above says yes (since `OPEN_SIGNUP=true` in `.env.local`). If you'd rather wipe them, add a step to Phase 0.
- **Where will the prod URL live?** If you already know the domain, paste it now so all the redirect URIs are correct on the first Google Console save.
- **Do you want a "Remember me" toggle?** Currently the 7-day expiry is universal. A toggle would mean two session durations. Default: skip.
