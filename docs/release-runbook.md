# Production release runbook

## Release gates

- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass with no warnings promoted to failures.
- `npm run audit:prod` reports no high or critical production advisories.
- pgTAP passes the cross-Baul, revocation, reclaim, locked-letter, invite, capacity, and least-privilege scenarios.
- Playwright passes creation, manual entry, invitation, multi-Baul switching, cross-browser reclaim/old-device denial, admin revocation, media, capsule, keyboard, mobile, and axe scenarios.
- Core-route accessibility audits have no violations; mobile Lighthouse performance is at least 85; CLS is below 0.1; the console has no avoidable errors.
- A source/log scan confirms new URLs and operational events do not contain permanent keys or action tokens.

## Before deployment

1. Freeze schema changes and record application and migration commit IDs.
2. Take a database backup and confirm restore instructions.
3. Export a Supabase Advisor snapshot and resolve new security/performance findings.
4. Run the migration chain on a recent sanitized production snapshot.
5. Record pre/post row counts for vaults, members, memories, capsules, messages, songs, and storage objects.
6. Confirm the owner-only Resend sender/recipient allowlist, reply-to address, Turnstile hostnames, cleanup secret, Sentry project, Vercel environment separation/protection, and anonymous Auth settings.
7. In Supabase, require opt-in Data API exposure, disable email/password signup,
   keep anonymous sign-ins enabled, require SSL, restrict direct database
   networks, enforce MFA for organization members, and rotate any legacy
   service-role key after the application uses a secret key.
8. Confirm `NEXT_PUBLIC_APP_URL` exactly matches the assigned production origin, then inspect canonical metadata, `robots.txt`, `sitemap.xml`, invite URLs, and recovery links on the protected deployment.

## Rollout order

1. Apply additive tables, columns, functions, indexes, and unvalidated constraints.
2. Backfill membership references, capsule payloads, and tenant keys in bounded batches.
3. Deploy dual-read application code and validate old/new paths.
4. Switch RLS to live memberships and run the two-user/two-Baul smoke suite.
5. Validate constraints only after backfill reconciliation.
6. Deploy the cleanup Edge Function, configure its Vault-backed `pg_cron` caller, and confirm both the aggregate and cleanup schedules have successful recent runs.
7. Deploy the client route switch, then monitor 5xx, rate-limit, email, recovery, invite, and cleanup events.

Do not drop legacy columns/functions or remove query-key compatibility in this release. Schedule that cleanup only after the observation window.

## Rollback

- Roll application traffic back to the preceding dual-read build.
- Unschedule the affected Supabase cron job if its worker is implicated.
- Keep additive schema in place unless a migration has a proven isolated rollback; do not destroy backfilled data.
- Restore from backup only for confirmed corruption, after preserving evidence and newly written rows.
- If email delivery degrades, stop issuing new recovery links; current permanent keys remain valid because rotation occurs only at confirmation.

## Post-release checks

- Verify old-device denial immediately after a cross-browser reclaim.
- Confirm a revoked member cannot read or mutate while attributed content remains visible to active keepers.
- Confirm invitation replay, expired recovery confirmation, and cross-Baul foreign keys fail.
- Confirm locked payload access fails before and succeeds after `unlock_at`.
- Confirm a country-only choice produces one approximate country dot, division
  aggregates with fewer than three Bauls remain absent, and the non-location
  world total remains correct.
- Check storage cleanup retries and delayed aggregate refreshes.
- Review the first 24 hours of redacted operational events and the Supabase Advisors again.
