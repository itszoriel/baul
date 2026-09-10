# Production-readiness implementation report

Updated 10 September 2026. The intended first release is a protected, owner-only Vercel beta at an available project hostname. It is designed and programmed by Paul John E. Antigo; public support and privacy contact use `pauljohn.antigo@gmail.com`.

## Implemented

- Moved MP3 bytes out of Vercel Functions. The browser now reserves a short-lived, member-bound upload intent, uploads directly to the private Supabase `music` bucket, and asks the server to validate and finalize it. Database advisory locks enforce the ten-uploaded-song limit and make completion idempotent.
- Added upload abuse and cost controls: 15 MB songs, ten uploaded songs per Baul, 250 photos per Baul, and per-member hourly upload limits. Existing image normalization and private bucket enforcement remain in place.
- Replaced Vercel cron configuration with a scheduled Supabase Edge cleanup worker. It authenticates with a dedicated secret, redacts logs, retries queued object deletion with backoff, and removes expired unfinished upload intents in bounded batches.
- Added privacy-filtered Sentry integration. Default PII, request data, users, extras, URLs, email addresses, content-like fields, and token-like strings are excluded; tracing and replay collection are disabled.
- Split rendering policy by route. Public pages remain cacheable, while private and token-bearing pages render dynamically with a per-request nonce. CSP upgrading is limited to HTTPS so local production smoke tests behave correctly in WebKit.
- Added `/privacy`, `/terms`, `/acceptable-use`, `/support`, `/robots.txt`, `/sitemap.xml`, and a shallow `/api/health`. Private/token routes are `noindex`; canonical, sitemap, robots, invite, and recovery origins follow `NEXT_PUBLIC_APP_URL`.
- Removed nested interactive elements, raised placeholder contrast, retained visible focus/focus trapping, and added Chromium/WebKit/mobile accessibility coverage.
- Added nightly encrypted, deduplicated database and private-storage backups to a private R2 repository with seven daily/four weekly retention and a documented monthly restore drill.
- Added exact Node 24 runtime declarations, production-mode Playwright, CI database/browser gates, third-party notices, and operational/release documentation.

## Why these decisions

- Direct Storage uploads avoid Vercel's function body-size boundary and reduce function bandwidth, duration, and memory use without making the bucket public.
- Database-backed reservations, tenant foreign keys, live membership checks, and idempotency keep authorization and capacity authoritative under concurrency.
- Route-specific rendering preserves strict nonces where secrets or sessions exist without forcing the public marketing shell to render on every request.
- A fail-closed production email allowlist prevents the Resend sandbox configuration from implying general invitation delivery.
- Supabase scheduling avoids Vercel Hobby cron frequency constraints. R2 plus Restic provides an encrypted recovery copy outside the primary provider.
- Sparse, scrubbed error events improve incident detection while reducing the chance that private memories or access material enter telemetry.

## Verified in this workspace

- `npm run check` passed under Node 24.19.0 and npm 11.6.3: ESLint, strict TypeScript, 29 Vitest tests, the 42-route Next.js optimized build, and the production dependency audit with zero reported vulnerabilities.
- The optimized application served successfully, with cacheable public pages, no-store sensitive/API pages, route-specific CSP, security headers, health output, robots directives, sitemap, public support address, and programmer attribution inspected over HTTP.
- After a clean local database reset, production-mode Playwright passed 51 tests across Chromium, WebKit, and an iPhone profile. Three tests were intentionally skipped: the stateful membership scenario runs only once in Chromium, and WebKit is excluded from Chromium-reviewed pixel snapshots. Coverage includes creation, anonymous Auth, manual entry, one-time invitations, multi-Baul membership, reclaim/old-device denial, capsules, direct private MP3 upload, YouTube failure handling, axe checks, CSP, query-key removal, no-JavaScript fallbacks, metadata, health, and visual baselines.
- Mobile Lighthouse measured performance 85, accessibility 100, best practices 100, SEO 100, CLS 0, LCP 3.99 s, FCP 0.79 s, and total blocking time 182 ms against the local optimized server. This is a lab result, not field performance.
- A clean local Supabase reset applied the complete migration chain through `20260909070958_production_media_uploads.sql`; schema lint reported no warnings and all 83 pgTAP database tests passed. The linked hosted project remains aligned through `20260902111000`; the media-upload migration is intentionally pending until a verified backup exists.
- Git remote `origin` points to `https://github.com/itszoriel/baul`; `main` is pushed and GitHub Actions is enabled. Remote CI status is recorded separately from this local evidence.
- A read-only hosted-data inventory confirmed the accidental E2E incident created exactly four empty vault rows and no related members, memories, messages, songs, invites, or storage objects. They remain untouched pending an export and explicit cleanup confirmation.

## Release blockers and required operator work

- Complete the Vercel device login, create/link the correct project, choose an available project hostname, configure separate production/preview variables, enable Deployment Protection, and deploy. No `.vercel` project link exists yet.
- Select a hostname other than `baul.vercel.app` unless ownership can be proven. A live check on 10 September 2026 returned an unrelated page titled “Baul Survey Jumper - #1 Free Survey Bypass & Hack Tool 2026”. `baul-project.vercel.app` returned no deployment during inspection, but only Vercel can confirm availability while creating the project.
- Configure Sentry DSNs/project credentials, Turnstile keys/hostname, and the owner-only Resend variables in Vercel.
- Create a dedicated private R2 bucket and least-privilege credentials, configure the GitHub backup secrets, run the workflow manually, and complete a restore drill. Docker is now available, but the cloud backup credentials and production database URL have not been supplied or verified.
- Deploy the cleanup Edge Function only after the pending migration, set `CLEANUP_SECRET`, install its Vault-backed schedule, and confirm successful recent invocations.
- Confirm hosted Supabase anonymous-only Auth/provider settings, SSL/network restrictions, organization MFA, Storage limits, and Advisor results immediately before release.
- Have the privacy notice, beta terms, acceptable-use text, media rights language, and deletion/retention promises reviewed by a qualified human for the jurisdictions and audience actually served.
- Export the four identified empty hosted test vault rows, obtain explicit cleanup confirmation, delete only those exact IDs, and verify the row count afterward.

Until these blockers are cleared, the repository is substantially hardened but must not be represented as fully production-ready or fully tested.
