# Security policy

Vormir ReviewFlow AI is maintained by Vormir Tech Solutions.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's **Security > Report a vulnerability**
(private advisory) on this repository, or the contact address shown on the deployed `/contact` page.
Include steps to reproduce and the affected URL or file. We aim to acknowledge reports within 5 business days.

## Security model

| Area | How it is protected |
| --- | --- |
| Tenant data | Postgres Row Level Security on every table in `public`. Access is decided by `organization_members.role`, never by the frontend. |
| Anonymous visitors | The `anon` role has **no** table or function privileges. Public funnel pages are served by Edge Functions that return only published, customer-facing fields. |
| AI key | `GEMINI_API_KEY` exists only as a Supabase Edge Function secret. The browser calls `generate-review-drafts`; it never calls Gemini. |
| Paid AI | `FREE_MODE=true` and `ALLOW_PAID_AI=false` by default. A non-Gemini provider is refused server-side unless both are changed explicitly. |
| Service-role key | Used only inside Edge Functions. Never in the frontend, never in GitHub or Cloudflare variables. |
| Abuse | Server-side limits per session, per IP hash and per funnel for AI; per session and per funnel for events; per user for exports and asset creation. A quota error opens a cooldown during which the provider is not called. |
| Input | Every endpoint whitelists fields, bounds sizes and rejects unknown keys. Model output must be exactly five distinct bounded strings or it is discarded. |
| Uploads | Logos only: PNG, JPEG or WebP up to 1 MB, enforced by the storage bucket and by an RLS policy on the organization folder. SVG is not accepted. |
| Privacy | No customer name, email or phone. Notes and draft text are never stored. IPs are stored only as a salted hash. Retention is configurable per organization. |
| Browser | Strict Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff` and a restrictive Permissions-Policy in `public/_headers`. |

## What is tested

`npm test` runs the real migration in an in-process Postgres (PGlite) and checks, among other things: no anonymous
access to any table, no cross-organization reads or writes, role limits, the permanent-slug and publish guards, the
last-owner guard, server-side aggregation, export rate limiting and the storage policy. The hosted Supabase platform
itself (its Auth, Storage and API gateway) is not exercised by these tests. Verify on your own project with the
checklist in the README before going live.

## Operator checklist

- [ ] `.env`, `.env.local` and `supabase/.env` are not committed (`git status` shows them ignored).
- [ ] Cloudflare Pages and GitHub hold only `VITE_*` public values plus deploy tokens.
- [ ] `supabase secrets list` shows `GEMINI_API_KEY`, `FREE_MODE=true`, `ALLOW_PAID_AI=false`, `IP_HASH_SALT`, `PUBLIC_SITE_URL`, `ALLOWED_ORIGIN`.
- [ ] Supabase Auth: email confirmation on, Site URL and redirect URLs set to the production origin only.
- [ ] Supabase dashboard > Advisors shows no "RLS disabled" warnings.
- [ ] The Google AI Studio key is restricted to the Generative Language API and its project has **no billing account** if you need a hard zero-cost guarantee.
- [ ] Rotate `GEMINI_API_KEY` immediately if it is ever pasted into a chat, log, commit or screenshot.
