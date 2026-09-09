# Production-readiness implementation report

Updated 9 September 2026. The intended first release is a protected, owner-only beta at `https://baul.vercel.app`. It is designed and programmed by Paul John E. Antigo; public support and privacy contact use `pauljohn.antigo@gmail.com`.

## Implemented

- Moved MP3 bytes out of Vercel Functions. The browser now reserves a short-lived, member-bound upload intent, uploads directly to the private Supabase `music` bucket, and asks the server to validate and finalize it. Database advisory locks enforce the ten-uploaded-song limit and make completion idempotent.
- Added upload abuse and cost controls: 15 MB songs, ten uploaded songs per Baul, 250 photos per Baul, and per-member hourly upload limits. Existing image normalization and private bucket enforcement remain in place.
- Replaced Vercel cron configuration with a scheduled Supabase Edge cleanup worker. It authenticates with a dedicated secret, redacts logs, retries queued object deletion with backoff, and removes expired unfinished upload intents in bounded batches.
- Added privacy-filtered Sentry integration. Default PII, request data, users, extras, URLs, email addresses, content-like fields, and token-like strings are excluded; tracing and replay collection are disabled.
- Split rendering policy by route. Public pages remain cacheable, while private and token-bearing pages render dynamically with a per-request nonce. CSP upgrading is limited to HTTPS so local production smoke tests behave correctly in WebKit.
- Added `/privacy`, `/terms`, `/acceptable-use`, `/support`, `/robots.txt`, `/sitemap.xml`, and a shallow `/api/health`. Private/token routes are `noindex`; the canonical public origin is `baul.vercel.app`.
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

- `npm run check` passed: ESLint, strict TypeScript, 28 Vitest tests, the 42-route Next.js optimized build, and the production dependency audit. A full `npm audit` also reported zero vulnerabilities.
- The optimized application served successfully, with cacheable public pages, no-store sensitive/API pages, route-specific CSP, security headers, health output, robots directives, sitemap, public support address, and programmer attribution inspected over HTTP.
- Production-mode Playwright passed 41 tests across Chromium, WebKit, and an iPhone profile, including axe checks, CSP behavior, query-key removal, no-JavaScript landing fallbacks, public metadata, health endpoints, and reviewed visual baselines. Thirteen full-stack tests were skipped because they require the unavailable disposable database.
- Mobile Lighthouse measured performance 85, accessibility 100, best practices 100, SEO 100, CLS 0, LCP 3.99 s, FCP 0.79 s, and total blocking time 182 ms against the local optimized server. This is a lab result, not field performance.
- The linked hosted Supabase schema currently lints without warnings. Its migration ledger is aligned through `20260902111000`; the new media-upload migration is intentionally pending.

## Release blockers and required operator work

- Install/start Docker Desktop and pass `npm run db:start`, `npm run db:lint`, `npm run test:db`, and the `E2E_FULL=1` security/media suite against a disposable database. Docker is not installed/running on this workstation, so the new migration has not been applied to hosted Supabase.
- Restore valid Vercel CLI authentication, link the correct Vercel project, configure production/preview variables, enable Deployment Protection, and deploy. The cached Vercel token is invalid.
- Add and verify a Git remote before relying on GitHub Actions. This checkout has no remote and the GitHub CLI is not installed, so CI and the backup workflow cannot run remotely yet.
- Confirm control of the `baul.vercel.app` project before deployment. A live check on 9 September 2026 returned an unrelated page titled “Baul Survey Jumper - #1 Free Survey Bypass & Hack Tool 2026” from that hostname. Replacing it is safe only if Paul owns that Vercel project; otherwise a different available project name or custom domain is required.
- Configure Sentry DSNs/project credentials, Turnstile keys/hostname, and the owner-only Resend variables in Vercel.
- Create a dedicated private R2 bucket and least-privilege credentials, configure the GitHub backup secrets, run the workflow manually, and complete a restore drill. A backup could not be taken from this workstation because the Supabase dump client also requires Docker.
- Deploy the cleanup Edge Function only after the pending migration, set `CLEANUP_SECRET`, install its Vault-backed schedule, and confirm successful recent invocations.
- Confirm hosted Supabase anonymous-only Auth/provider settings, SSL/network restrictions, organization MFA, Storage limits, and Advisor results immediately before release.
- Have the privacy notice, beta terms, acceptable-use text, media rights language, and deletion/retention promises reviewed by a qualified human for the jurisdictions and audience actually served.
- Re-run every release gate under Node 24. Local checks used Node 25.2.1 because that is the runtime installed on this machine.

Until these blockers are cleared, the repository is substantially hardened but must not be represented as fully production-ready or fully tested.
