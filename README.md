# Vormir ReviewFlow AI

A product of **Vormir Tech Solutions**.

Businesses create a feedback funnel, share its QR code, and customers describe their real experience, get five
editable AI draft suggestions (or write their own), and continue to the business's official Google review page.
The customer always decides whether to post and what rating to give.

- Frontend: React 19, TypeScript (strict), Vite, Tailwind CSS 4, React Router, TanStack Query, React Hook Form, Zod, Recharts, `qrcode`, jsPDF
- Backend: Supabase (Postgres with Row Level Security, Auth, Storage, Edge Functions)
- AI: Google Gemini API, called only from the `generate-review-drafts` Edge Function
- Hosting: Cloudflare Pages (frontend), GitHub Actions (CI and deploy)

> **Status: built and tested locally. Nothing has been deployed.** No Supabase project, Gemini key, GitHub
> repository or Cloudflare project was created while building this. See [What is verified](#what-is-verified-and-what-is-not).

## Quick start (no accounts needed)

```bash
npm install
npm run dev
```

Open http://localhost:5173. With no Supabase variables set, the app runs in **demo mode**: data is kept in your
browser, AI drafts are simulated, and a banner says so. Log in with `demo@example.com` (any password) for a
fictional sample business, or sign up. Settings has a switch to simulate "quota exhausted" and "AI disabled".

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, strict |
| `npm test` | Unit, integration and jsdom end-to-end tests (107 tests) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run verify` | lint + typecheck + test + build |
| `npm run check:functions` | Type-check the Edge Functions with Deno (downloads Deno via npx) |

## Project structure

```
public/                 logo, favicon, _redirects (SPA fallback), _headers (CSP)
src/
  app/                  App.tsx (routes), shell.tsx (auth, organization, dashboard layout)
  components/           design system (ui.tsx), toasts, brand, error boundary
  features/
    auth/               login, signup, forgot password, auth callback
    businesses/         list, form, detail, zod schema
    funnels/            list, no-code builder with live preview, defaults
    feedback/           public customer journey (FunnelView), page, EN/HI strings, templates
    qr-assets/          QR + flyer rendering (qr.ts), page
    analytics/          dashboard charts, shared stat card
    settings/           dashboard home, customization, settings and members
  hooks/data.ts         shared queries and helpers
  lib/                  api.ts (interface), supabaseApi.ts, mock.ts (demo backend), publicApi.ts, env.ts
  routes/               marketing pages, account barrel
  styles/index.css      design tokens (Tailwind @theme)
supabase/
  migrations/           schema, RLS, triggers, RPC, storage policies
  functions/
    _shared/            config (FREE_MODE), validation, roles, gemini adapter, core handlers, analytics, http
    generate-review-drafts/  resolve-public-funnel/  track-funnel-event/  create-qr-asset/  export-analytics/
  config.toml  seed.sql
tests/                  unit/  integration/ (functions, demo backend, rls)  e2e/
.github/workflows/      ci.yml  deploy.yml
```

The request logic of the public Edge Functions lives in `supabase/functions/_shared/core.ts` and is
runtime-neutral, so the same code runs in Deno, in the demo backend and in the tests.

## FREE_MODE and cost policy

`supabase/functions/_shared/config.ts` is the single place for limits and switches. Defaults:

| Setting | Default | Meaning |
| --- | --- | --- |
| `FREE_MODE` | `true` | Paid providers prohibited |
| `ALLOW_PAID_AI` | `false` | Must be `true` **and** `FREE_MODE=false` before any non-Gemini provider is called |
| `AI_ENABLED` | `true` | Global AI switch |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | Check current free-tier models in AI Studio and change if needed |
| `MAX_AI_REQUESTS_PER_SESSION` | 3 | First request plus regenerations, per visitor per funnel |
| `MAX_AI_REQUESTS_PER_FUNNEL_WINDOW` / `_IP_WINDOW` | 30 / 6 per hour | Abuse limits |
| `AI_QUOTA_COOLDOWN_SECONDS` | 600 | After a quota error the provider is not called again for this long |
| `MAX_NOTE_CHARS`, `MAX_ATTRIBUTES`, `MAX_DRAFT_CHARS`, `MAX_OUTPUT_TOKENS` | 500, 8, 600, 1200 | Input and output bounds |

There is no billing code, no payment form and no upgrade path in this app. When AI is unavailable (no key,
quota exhausted, limit reached, disabled), customers get fixed sentence templates clearly labelled as templates,
a manual editor, copy, and the Google button. Nothing falls back to a paid provider.

**Zero cost is a goal, not a guarantee.** See [Free-tier limits and future costs](#free-tier-limits-and-future-costs).

## Environment variables

Frontend (public, build-time; local file `.env.local`):

| Name | Required | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | for cloud mode | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | for cloud mode | Publishable (or legacy anon) key. Safe to expose because RLS is enforced |
| `VITE_PUBLIC_SITE_URL` | recommended | Production origin used inside QR codes, so previews never leak into print |
| `VITE_CONTACT_EMAIL` | optional | Shown on `/contact` |

Edge Function secrets (server only, set with `supabase secrets set`):

| Name | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | for AI | Never give it a `VITE_` prefix |
| `GEMINI_MODEL` | optional | Defaults as above |
| `FREE_MODE`, `ALLOW_PAID_AI` | optional | Keep `true` / `false` |
| `PUBLIC_SITE_URL` | yes | Same value as `VITE_PUBLIC_SITE_URL` |
| `ALLOWED_ORIGIN` | recommended | Restricts CORS to your site. Defaults to `*` |
| `IP_HASH_SALT` | recommended | Random string |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions by Supabase.
No OpenAI key is needed or used.

## Supabase setup

1. Create a project on the Free plan at https://supabase.com/dashboard. Note the project ref and database password.
2. Install the CLI (https://supabase.com/docs/guides/cli) and link:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
3. Apply the schema and policies:
   ```bash
   supabase db push
   ```
4. Deploy the functions (JWT verification is disabled per function in `supabase/config.toml`; each function checks its own caller):
   ```bash
   supabase functions deploy
   ```
5. Set the secrets. Copy the server block of `.env.example` to `supabase/.env`, fill it in, then:
   ```bash
   supabase secrets set --env-file supabase/.env
   ```
6. Authentication (dashboard > Authentication > URL Configuration):
   - Site URL: `https://<your-project>.pages.dev`
   - Redirect URLs: `https://<your-project>.pages.dev/auth/callback` (add `http://localhost:5173/auth/callback` for local work)
   - Keep "Confirm email" enabled.
   - The built-in email sender is heavily rate-limited and meant for testing. For real sign-up volume you need your own SMTP provider, which may cost money.
   - Google sign-in is not wired up. Email and password only.
7. Schedule retention clean-up (dashboard > Database > Extensions: enable `pg_cron`, then SQL editor):
   ```sql
   select cron.schedule('reviewflow-retention', '15 3 * * *', 'select public.purge_expired_data()');
   ```
8. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (dashboard > Project Settings > API keys) in `.env.local` and in your hosting build variables.

### Verify RLS on your project

- Dashboard > Advisors > Security: no "RLS disabled in public" findings.
- In the SQL editor: `select tablename, rowsecurity from pg_tables where schemaname = 'public';` shows `true` for all 11 tables.
- With only the publishable key: `curl "$VITE_SUPABASE_URL/rest/v1/businesses" -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"` must return a permission error, not rows.
- Create two accounts and confirm neither sees the other's businesses.

### Local Supabase (optional, needs Docker)

```bash
supabase start            # prints the local URL and keys for .env.local
supabase functions serve --env-file supabase/.env
```

Sign up in the app, then load fictional sample data:
`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed.sql`

### Free plan behaviour to know

Free projects are paused after a period of inactivity and must be restored from the dashboard; while paused, funnel
pages fall back to the copy cached on a returning visitor's device (manual writing only) and new visitors see an
error with a retry button. Check usage under dashboard > Usage.

## Gemini (free tier) setup

1. Open https://aistudio.google.com and sign in.
2. **Get API key > Create API key.** Prefer a Google Cloud project with **no billing account** attached; on such a project the API can only use the free tier. If your account or region is not eligible for the free tier, or the project has billing enabled, usage can be charged and this app cannot prevent that.
3. Check which models currently have a free tier and their rate limits at https://ai.google.dev/gemini-api/docs/rate-limits, and set `GEMINI_MODEL` accordingly. The default was chosen when this was written and may be outdated.
4. Store the key as a secret: `supabase secrets set GEMINI_API_KEY=<key>`.
5. Test the function (replace the slug with a published funnel and use fresh UUIDs):
   ```bash
   curl -X POST "$VITE_SUPABASE_URL/functions/v1/generate-review-drafts" \
     -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" -H "content-type: application/json" \
     -d '{"slug":"<slug>","sessionId":"<uuid>","attributeIds":["<attribute-uuid>"],"notes":"","language":"en"}'
   ```
   Expect `{"drafts":[...five strings...],"label":"ai_generated_draft","remaining":2}`.
6. Quota errors: the function answers `429 {"error":"quota_exhausted","fallback":true}` and stops calling Gemini for `AI_QUOTA_COOLDOWN_SECONDS`. Rows with `status = 'quota'` in `review_draft_generations` show when it happened. Function logs: `supabase functions logs generate-review-drafts`.
7. Rotation: delete the key in AI Studio, create a new one, run `supabase secrets set GEMINI_API_KEY=<new>` again. No redeploy of the frontend is needed.

Privacy note: on the free tier Google may use submitted content to improve its products. Customer selections and
optional notes are sent to Gemini to prepare drafts. The in-app privacy notice says so; keep that disclosure accurate.

## GitHub setup

```bash
git init -b main
git add .
git commit -m "Initial commit: Vormir ReviewFlow AI"
git remote add origin https://github.com/<you>/vormir-reviewflow-ai.git
git push -u origin main
```

`ci.yml` runs lint, type-check, tests, build and a Deno check of the functions on every pull request and branch push.
`deploy.yml` runs the same validation on `main`, then deploys. Its two deploy jobs stay skipped until you add
repository **variables** (`CLOUDFLARE_PROJECT_NAME`, optionally `SUPABASE_PROJECT_REF`), so a fresh repository does not fail.

## Cloudflare Pages deployment

Choose **one** of the two routes.

**A. Cloudflare Git integration (simplest, no tokens in GitHub)**

1. Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git, select the repository.
2. Framework preset: None. Build command: `npm run build`. Build output directory: `dist`.
3. Environment variables (Production and Preview): `NODE_VERSION=22`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_PUBLIC_SITE_URL=https://<project>.pages.dev`, optionally `VITE_CONTACT_EMAIL`.
4. Deploy. You get HTTPS on `https://<project>.pages.dev` with no custom domain.

**B. GitHub Actions (`deploy.yml`)**

1. Create a Pages project of type Direct Upload: `npx wrangler pages project create <name> --production-branch main`.
2. Create an API token with the "Cloudflare Pages: Edit" permission.
3. GitHub repository > Settings > Secrets and variables > Actions. Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Variables: `CLOUDFLARE_PROJECT_NAME` and the `VITE_*` values.
4. Optional backend deploy from CI: variable `SUPABASE_PROJECT_REF`, secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`.

Never put `GEMINI_API_KEY` or the service-role key in Cloudflare or in `VITE_*` variables.

Routing: `public/_redirects` sends every path to `index.html`, so direct visits to `/f/<slug>`, `/app/...` and
`/auth/callback` work. `public/_headers` sets the Content-Security-Policy; it allows connections to
`https://*.supabase.co`. If you use a custom Supabase domain, add it to `connect-src` there.

After the first deploy, set `PUBLIC_SITE_URL` and `ALLOWED_ORIGIN` secrets and the Supabase Auth URLs to the real origin.

## Honest-review safeguards

- Every customer gets the same path and the same Google button. There is no rating question and no branching on sentiment (no review gating).
- Attributes are descriptive and include "Areas for improvement" by default. The prompt tells the model to keep neutral, mixed or negative sentiment and to invent nothing.
- Drafts are labelled as AI-generated, are always editable, and can be ignored. Templates are labelled as templates.
- The app never posts to Google, never asks for Google credentials and never shows a Google look-alike screen.
- Analytics count "outbound Google clicks". Nothing in the UI, CSV or database calls them reviews.
- Before launch, read Google's current Maps user-generated content policy and review-solicitation rules, and do not offer incentives for reviews: https://support.google.com/contributionpolicy/answer/7400114

Analytics limits: counts are anonymous, per browser tab, and can be affected by blockers or repeat visits. A click
on the Google button shows intent only. Published reviews, ratings and their text are not visible to this app.

## Free-tier limits and future costs

Quotas change; confirm them on the provider's pricing page before relying on them.

| Service | Typical free-tier constraint | What happens at the limit | Possible future cost |
| --- | --- | --- | --- |
| Gemini API | Per-model requests per minute and per day | Fallback to templates and manual writing for the cooldown | Paid tier if you enable billing |
| Supabase Free | Database size, storage, monthly active users, function invocations, limited active projects, pausing when inactive, rate-limited built-in email | Writes or functions fail, or the project pauses, until usage drops or you restore it | Pro plan, custom SMTP |
| Cloudflare Pages Free | Builds per month, file count and size per deployment | Builds queue or fail; the live site keeps serving | Paid plan |
| GitHub Actions | Free minutes for private repositories (public repositories are free) | Workflows stop until the next cycle | Extra minutes |
| Domain | `*.pages.dev` is free | n/a | A custom domain is an annual cost |

This app never enables a paid plan by itself and never collects payment details. It also cannot stop a provider from
charging an account that has billing enabled.

## What is verified and what is not

Verified on the development machine:

- `npm run lint`, `npm run typecheck`, `npm run build`: pass.
- `npm test`: 107 tests pass.
  - The real SQL migration runs in PGlite (in-process Postgres) with stand-ins for Supabase's `auth` and `storage` schemas: no anonymous access, tenant isolation, role limits, publish and slug guards, aggregation, retention purge, storage policy.
  - Edge Function request logic with an in-memory store and a **mocked** Gemini HTTP response: five-draft validation, quota circuit breaker, timeouts, malformed output, limits, paid-provider prohibition, no notes or drafts stored.
  - Full UI journey in jsdom against the demo backend: sign up, business, funnel, publish, customer flow, edit, copy, Google link, analytics, SVG QR download, quota and AI-off fallbacks, Hindi.
  - QR codes are decoded back to the expected URL, with and without a centre logo.
- `deno check` of all five Edge Functions: passes.
- Manual browser check of the production build in demo mode: home, login, dashboard, direct `/f/<slug>` navigation, customer flow, QR and flyer preview, analytics.

Not verified (needs your accounts):

- Any deployment: Supabase project, migrations on hosted Postgres, deployed Edge Functions, Cloudflare Pages, GitHub Actions runs.
- A real Gemini API call, its structured output with the chosen model, and real quota behaviour.
- Supabase Auth emails (confirmation, password reset), Supabase Storage uploads and the `supabaseApi.ts` data layer against a live project.
- The optional OpenAI-compatible adapter (disabled by default and prohibited in FREE_MODE).
- PNG and PDF export in automated tests (canvas is unavailable in jsdom; checked by hand in a browser preview only).
- Google Business Profile API integration: not implemented. The review URL is entered manually.

Known simplifications:

- Saving a funnel and its attributes uses two statements from the client, not one transaction.
- Members are added by the email of an existing account. There are no invitation emails.
- The Terms and Privacy pages are templates and need legal review.

## Go-live checklist

- [ ] Supabase project created, `supabase db push` and `supabase functions deploy` succeeded
- [ ] Secrets set: `GEMINI_API_KEY`, `PUBLIC_SITE_URL`, `ALLOWED_ORIGIN`, `IP_HASH_SALT` (and `FREE_MODE=true`, `ALLOW_PAID_AI=false`)
- [ ] Auth Site URL and redirect URLs set, email confirmation tested
- [ ] `pg_cron` retention job scheduled
- [ ] Frontend deployed with the four `VITE_*` variables; `/f/<slug>` opens directly on a phone
- [ ] RLS checks above pass on the hosted project
- [ ] One real funnel published; AI drafts work; with the key removed the fallback works
- [ ] Printed QR code scanned and resolves to the production URL
- [ ] Terms, privacy notice and contact address reviewed

See [SECURITY.md](SECURITY.md) for the security model and reporting.
