# Baul

Baul is a private, accountless memory chest for two people or a trusted circle. Keepers can save notes, photos, songs, and sealed letters; react with classics or a shared collection of keeper-made stickers; invite another keeper with an expiring link; and return from another device with the shared permanent key plus their personal keeper phrase.

Baul uses server-side access controls and private storage. It is **not end-to-end encrypted**: authorized operators can technically access server-side content. The public globe is built from delayed, coarse aggregate statistics. Optional country choices can appear as approximate country-level dots; finer division rows remain hidden until three Bauls contribute. The globe never emits individual creation events.

## Architecture

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, and a nonce-based CSP.
- Supabase Postgres, anonymous Auth, RLS, Realtime, and private Storage.
- Resend for single-use invite/recovery-address/recovery confirmation links.
- Supabase `pg_cron` refreshes delayed public aggregates; a scheduled Supabase Edge Function performs idempotent private-storage cleanup without consuming the single daily Vercel Hobby cron allowance.
- Sentry captures a small allowlist of operational failures after removing request data, user identity, URLs, email addresses, content, and token-like values.
- Zod domain schemas, Supabase-generated database types, Vitest, pgTAP, Playwright, and axe.

The authorization source of truth is the live `members` row: `auth.uid() = members.user_id`, matching `vault_id`, with `revoked_at IS NULL`. Cached JWT metadata is not used for access decisions.

## Requirements

- Node.js 24 LTS and npm 11+
- Docker Desktop for the local Supabase stack and database tests
- Supabase CLI (installed as a development dependency)
- A Resend account for real email delivery
- Optional Cloudflare Turnstile keys for escalated anti-abuse challenges

## Local setup

```bash
npm ci
copy .env.example .env.local
npm run db:start
npm run db:reset
npm run db:types
npm run dev
```

Open `http://localhost:3000`. Supabase Studio is exposed by the local CLI (normally `http://127.0.0.1:54323`). `supabase/config.toml` enables anonymous sign-ins; production projects must also enable **Authentication → Providers → Anonymous Sign-Ins**.

`db:types` replaces `src/lib/database.types.ts` from the running local schema. Regenerate it after every schema migration and commit the result.

## Environment variables

Copy `.env.example` and fill in the values printed by `npm run db:start`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server Supabase URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key |
| `SUPABASE_SECRET_KEY` | Server-only secret/service-role key |
| `APP_SECRET` | At least 32 random characters for application crypto |
| `NEXT_PUBLIC_APP_URL` | Canonical origin used in action links |
| `RESEND_API_KEY` / `EMAIL_FROM` | Transactional email delivery; the sandbox sender is owner-only |
| `EMAIL_REPLY_TO` | Public support/reply address (`pauljohn.antigo@gmail.com`) |
| `EMAIL_RECIPIENT_ALLOWLIST` | Comma-separated beta recipients; production rejects all recipients when unset |
| `CRON_SECRET` | Bearer secret for the manual aggregate/cleanup fallback routes |
| `CLEANUP_SECRET` | Shared secret for the scheduled Supabase cleanup Edge Function |
| `TURNSTILE_SECRET_KEY` | Server verification key for escalated challenges |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Matching browser widget site key |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Optional privacy-filtered browser/server error reporting |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | Optional server-only source-map upload configuration |
| `NEXT_PUBLIC_LEGACY_QUERY_KEY_CUTOFF` | Final UTC instant for old `?key=` compatibility |

Never expose `SUPABASE_SECRET_KEY`, `APP_SECRET`, `CRON_SECRET`, tokens, permanent keys, email addresses, or user content in browser bundles or logs.

## Security and recovery model

- A permanent Baul key is generated once and stored only as a verifier. New URLs, QR codes, emails, analytics, and logs never contain it.
- Invitations expire after seven days by default, work once, and are stored only as SHA-256 hashes. Admins can revoke unused invitations.
- Recovery requests always return a generic response. A 30-minute, one-use confirmation link rotates the key only after confirmation; failed email delivery leaves the old key valid.
- Every keeper sets a 10–128 character personal keeper phrase. Legacy six-character phrases still reclaim the keeper, then require an upgrade.
- Removing a keeper revokes access while preserving their attributed content. Reclaim atomically rebinds the membership, immediately denying the former anonymous user.
- Sealed-letter metadata remains visible, while its payload is isolated and unreadable—including by its author—until `unlock_at`.
- Custom reaction stickers are normalized to small metadata-free WebP images, kept in a private bucket, and may only be used on memories or Whispers from the same Baul.
- Cookie-authenticated mutations require same-origin requests. Sensitive responses are `no-store`; `/enter`, invitation, and recovery pages use `Referrer-Policy: no-referrer`.

See the [privacy model](docs/privacy.md), [security review](docs/security-review.md),
[backup/restore runbook](docs/backup-restore.md), [production-readiness report](docs/production-readiness-report.md),
and [release runbook](docs/release-runbook.md).

## Migrations and live rollout

Migrations live in `supabase/migrations` and are additive. For an existing production project:

1. Take a database backup and Supabase Advisor snapshot.
2. Apply new tables, functions, indexes, nullable columns, and `NOT VALID` constraints.
3. Run backfills and validate their counts.
4. Deploy application dual-read support, then switch RLS policies to live memberships.
5. Validate constraints and security scenarios.
6. Remove legacy claim/query-key behavior in a later release, never in the same release that stops using it.

Do not reset production data. Test the exact migration chain against a recent sanitized snapshot before deployment.

## Commands

```bash
npm run lint            # ESLint, zero warnings
npm run typecheck       # strict TypeScript
npm run test            # Vitest unit tests
npm run test:db         # pgTAP against local Supabase
npm run test:e2e        # Playwright + axe + visual baselines
npm run build           # production Next build
npm run audit:prod      # high/critical production advisories
npm run check           # core non-Docker release checks
```

Use `npm run test:e2e:update` only after deliberately reviewing visual changes. The design explorer is a self-contained file at [docs/design/baul-visual-playground.html](docs/design/baul-visual-playground.html).

## Deployment

The first target is a protected Vercel beta at `https://baul.vercel.app`, backed by a separate hosted Supabase environment.

1. Apply and validate migrations first.
2. Configure all environment variables in Vercel, including `NEXT_PUBLIC_APP_URL=https://baul.vercel.app`; keep preview and production secrets separate.
3. Enable Vercel Deployment Protection while the beta is limited to its owner.
4. Keep Resend's sandbox sender and `EMAIL_RECIPIENT_ALLOWLIST=pauljohn.antigo@gmail.com` for the owner-only beta. Verify an owned sender domain before allowing other recipients. Configure Turnstile for `baul.vercel.app`.
5. Deploy `supabase/functions/storage-cleanup`, set its `CLEANUP_SECRET`, then run `supabase/production/configure-storage-cleanup.sql` with the same secret. Confirm both Supabase schedules are active.
6. Configure the encrypted GitHub Actions backup to a dedicated private Cloudflare R2 bucket and complete a restore drill.
7. Deploy, run the full database and Playwright security suites, check Supabase Advisors, then monitor redacted operational events for email failures, rate limits, storage cleanup, and 5xx responses.

The CI workflow runs quality checks against a disposable local Supabase stack. Production release gates and rollback steps are documented in the runbook.

## Project notes

- `BAUL_PROJECT_SPEC.md` describes the original product concept. Where it conflicts with the secure recovery/invite behavior above, the current migrations, typed API contracts, and this README are authoritative.
- `AGENTS.md` requires contributors to consult the version-matched documentation under `node_modules/next/dist/docs/` before changing Next.js behavior.
- New marquee features—exports, retention notifications, advanced search—remain deferred until the production core passes all release gates.
