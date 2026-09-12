# Production-readiness implementation report

Updated 12 September 2026. The first release target is the protected, owner-only Vercel beta at `https://baul-memories.vercel.app`. It is designed and programmed by Paul John E. Antigo (`itszoriel`); public support and privacy contact use `pauljohn.antigo@gmail.com`.

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
- Migrated the action-email template from the deprecated React Email component packages to the supported unified React Email 6 package, pinned the version, and added a markup-rendering regression test.
- Located Vercel Functions in Sydney (`syd1`) beside the hosted Supabase project (`ap-southeast-2`) to avoid an unnecessary trans-Pacific round trip on API requests.
- Replaced the placeholder chest mark with the owner-supplied woven Baul logo across the interface. Added stable PNG favicon and Apple-icon URLs, a 1200×630 social card, author/creator metadata, visible `itszoriel` attribution, and truthful `WebSite`/`Person` structured data.

## Why these decisions

- Direct Storage uploads avoid Vercel's function body-size boundary and reduce function bandwidth, duration, and memory use without making the bucket public.
- Database-backed reservations, tenant foreign keys, live membership checks, and idempotency keep authorization and capacity authoritative under concurrency.
- Route-specific rendering preserves strict nonces where secrets or sessions exist without forcing the public marketing shell to render on every request.
- A fail-closed production email allowlist prevents the Resend sandbox configuration from implying general invitation delivery.
- Supabase scheduling avoids Vercel Hobby cron frequency constraints. R2 plus Restic provides an encrypted recovery copy outside the primary provider.
- Sparse, scrubbed error events improve incident detection while reducing the chance that private memories or access material enter telemetry.

## Verified in this workspace

- `npm run check` passed under Node 24.19.0 and npm 11.6.3: ESLint, strict TypeScript, 30 Vitest tests, the 42-route Next.js optimized build, and the production dependency audit with zero reported vulnerabilities.
- The optimized application served successfully, with cacheable public pages, no-store sensitive/API pages, route-specific CSP, security headers, health output, robots directives, sitemap, public support address, and programmer attribution inspected over HTTP.
- After a clean local database reset, production-mode Playwright passed 51 tests across Chromium, WebKit, and an iPhone profile. Three tests were intentionally skipped: the stateful membership scenario runs only once in Chromium, and WebKit is excluded from Chromium-reviewed pixel snapshots. Coverage includes creation, anonymous Auth, manual entry, one-time invitations, multi-Baul membership, reclaim/old-device denial, capsules, direct private MP3 upload, YouTube failure handling, axe checks, CSP, query-key removal, no-JavaScript fallbacks, metadata, health, and visual baselines.
- Mobile Lighthouse measured performance 85, accessibility 100, best practices 100, SEO 100, CLS 0, LCP 3.99 s, FCP 0.79 s, and total blocking time 182 ms against the local optimized server. This is a lab result, not field performance.
- A clean local Supabase reset applied the complete migration chain through `20260909070958_production_media_uploads.sql`; schema lint reported no warnings and all 83 pgTAP database tests passed. A pre-migration hosted roles/schema/data dump was restored into an isolated local database: all 51 dumped tables matched their source row counts, all 22 application tables and 128 constraints restored, no constraint remained unvalidated, and all 27 RLS policies restored. The scratch database was removed afterward.
- The hosted migration `20260909070958_production_media_uploads.sql` was applied after the successful restore drill. Hosted migration history is synchronized and hosted schema lint reports no errors or warnings.
- The `storage-cleanup` Edge Function is active with a dedicated shared secret. Its Vault-backed `pg_cron` job is active every 15 minutes; an authenticated smoke invocation completed the one existing cleanup item with zero deferrals, leaving zero pending queue items.
- Hosted Supabase now enforces SSL for direct database connections, keeps anonymous Auth enabled, disables email/password signup, uses the production Auth site URL, and reports no performance-advisor issues. The Data API is limited to `public` and `graphql_public`, with automatic exposure of new public objects disabled.
- Git remote `origin` points to `https://github.com/itszoriel/baul`; `main` is pushed. GitHub Actions gates each push with application, database, and production-browser jobs; the exact run used for a release is recorded in the deployment handoff.
- Vercel project `prince-98d5/baul-memories` is linked locally and to `itszoriel/baul`, with `main` as its production branch. Production has the application, owner-only Resend, Turnstile, and Sentry variables; preview receives no production database credentials. Secret values use Vercel's non-readable Sensitive type where appropriate. Vercel Authentication protects all deployments, including the production domain, and Git-fork protection is enabled.
- A read-only hosted-data inventory confirmed the accidental E2E incident created exactly four empty vault rows and no related members, memories, messages, songs, invites, or storage objects. They remain untouched pending an export and explicit cleanup confirmation.

## Release blockers and required operator work

- Owner decision recorded 12 September 2026: R2 setup is intentionally postponed for the owner-only beta. The automated workflow and restore runbook exist, but there is no verified independent recovery copy. Keep Vercel Authentication enabled, avoid treating beta data as recoverable, and complete the private bucket, least-privilege credentials, first backup, and restore drill before inviting external users or storing irreplaceable content.
- Turn off the dormant hosted Twilio provider in the Supabase dashboard. Phone signup is already disabled, but the provider toggle cannot be cleared by the CLI. Confirm organization-member MFA in the dashboard.
- Choose a fixed-egress backup/administration path before restricting direct Postgres CIDRs. Direct database access currently requires SSL but permits all IPv4/IPv6 sources so dynamic GitHub-hosted backup runners can connect.
- Have the privacy notice, beta terms, acceptable-use text, media rights language, and deletion/retention promises reviewed by a qualified human for the jurisdictions and audience actually served.
- Export the four identified empty hosted test vault rows, obtain explicit cleanup confirmation, delete only those exact IDs, and verify the row count afterward.

Until these blockers are cleared, the deployment is suitable only as an owner-protected beta and must not be represented as a public production-ready or fully tested service.
