# Baul security review

Reviewed 2026-09-01 against the repository, the configured hosted Supabase
project, Supabase's current security guidance, PostgreSQL 17 semantics, and the
Next.js 16 documentation shipped with this installation.

## Executive result

At the time of the 1 September review, the linked hosted project matched the
repository's migration history. With the owner's explicit approval, its test data, anonymous Auth
users, and Storage objects were removed before rebuilding the database from the
checked-in migrations and reference seed. The live-membership authorization,
least-privilege grants, private buckets, tenant constraints, locked payloads,
invitations, recovery, rate limiting, and cleanup queue are active remotely.

The hosted schema passes all 51 pgTAP assertions and Supabase's schema lint.
The Security Advisor has no error-level findings. Its remaining anonymous-auth
warnings are expected for Baul's accountless identity model; those policies
still require a live, unrevoked membership row. Server-only tables intentionally
have RLS enabled with no browser policies.

## 9 September production-hardening delta

The repository now includes one additional additive migration,
`20260909070958_production_media_uploads.sql`, for private direct-upload
reservations and idempotent song completion. It is not yet applied to the
linked hosted project because this workstation cannot run the Docker-backed
database tests or create the planned pre-migration dump. The hosted schema
continues to lint without warnings, but the earlier statement that local and
remote migration versions match no longer applies until this release gate is
completed. See `docs/production-readiness-report.md` for the current status.

## Findings

### SBR-001 — Critical — Hosted schema is behind the application

- Evidence: the hosted Data API returns PostgreSQL `42703` for
  `members.revoked_at` and `vaults.milestone_date`, and `PGRST205` for the new
  security tables. The failing query originates in
  `src/app/api/me/vaults/route.ts`.
- Impact: the vault picker fails; more importantly, the hosted project still
  uses the original cached-claim authorization model rather than immediate live
  membership revocation.
- Remediation: apply all migrations through
  `20260901005040_fix_rate_limit_and_invite_functions.sql` in order, then run the complete
  database and E2E security suites.
- Status: **fixed and verified on hosted Supabase**. The compatibility read is
  retained only for rolling deployments of other environments.

### SBR-002 — High — New Data API objects could be exposed by default

- Evidence: local `auto_expose_new_tables` previously inherited the permissive
  fallback, and PostgreSQL grants function execution to `PUBLIC` by default.
- Impact: a future migration could accidentally make a secret table or
  security-definer function reachable through PostgREST.
- Remediation: `supabase/config.toml:23` now disables automatic exposure.
  `20260901001251_harden_database_contract.sql:14` revokes global and
  schema-scoped defaults, resets all existing browser grants, and re-grants an
  explicit allowlist. pgTAP creates probe objects to prevent regression.
- Status: **fixed and verified at the database layer**. The pgTAP future-object
  probes confirm that neither browser nor service roles inherit access to new
  tables/functions without an explicit grant.

### SBR-003 — High — Tenant references were not complete

- Evidence: `songs.added_by`, revocation actors, invite actors, membership event
  actors, and the selected division/country pair could reference different
  Bauls/countries at the database layer.
- Impact: a privileged route bug could create cross-tenant attribution or
  location inconsistencies even if RLS later hid the malformed row.
- Remediation: composite tenant foreign keys and supporting indexes begin at
  `20260901001251_harden_database_contract.sql:85`. Existing hosted rows were
  audited read-only: two vaults, two members, no content rows, and zero detected
  mismatches.
- Status: **fixed and verified on hosted Supabase**.

### SBR-004 — Medium — Small public location aggregates weakened anonymity

- Evidence: the original refresh function emitted a country/division row for a
  single Baul.
- Impact: a public globe point and its changes could reveal the coarse location
  of an individual Baul despite the “anonymous aggregate” description.
- Remediation: finer division locations remain suppressed until at least three
  Bauls contribute. Country is a separate, explicit coarse opt-in: a
  country-level aggregate may appear after one selection, but the client gives
  it a stable country-only offset and never receives a Baul coordinate. The
  non-location `WLD` row remains exact. Aggregate refresh is scheduled in
  Postgres and guarded by an advisory transaction lock.
- Status: **mitigated with an explicit country-level privacy tradeoff**. A
  single country count can reveal that an anonymous keeper selected that
  country; onboarding and privacy copy must continue to state this plainly.

### SBR-005 — Medium — Unused email/password signup broadened Auth abuse surface

- Evidence: Baul is anonymous-auth-only, while the hosted Auth settings report
  global signup enabled and the email provider active. The local configuration
  also previously enabled email signup.
- Impact: callers holding the public key could create unused email identities,
  increasing spam and operational load without enabling a product feature.
- Remediation: `supabase/config.toml:258` disables email signup while retaining
  anonymous sign-ins. Verify the same provider setting on the hosted project.
- Status: **fixed locally; hosted dashboard action remains**. Disable email
  signups while keeping anonymous sign-ins enabled before public launch.

### SBR-006 — Medium — Incomplete database error handling obscured failures

- Evidence: the vault-list route checked only the first query error and could
  silently turn later database failures into an empty or partial list.
- Impact: authorization/schema incidents could look like ordinary empty state,
  delaying detection.
- Remediation: `src/app/api/me/vaults/route.ts:18` now checks every query,
  records only a safe operation and PostgreSQL error code, returns a generic
  request-ID error, and supports the migration compatibility window.
- Status: **fixed**.

### SBR-007 — Low — Vault creation lacked the shared origin guard

- Evidence: `POST /api/vaults` was the only application mutation without
  `isSameOrigin`.
- Impact: browser-driven cross-origin creation/email abuse had one less defense
  in depth layer.
- Remediation: `src/app/api/vaults/route.ts:14` now rejects cross-origin
  requests before parsing or rate-limiting the body.
- Status: **fixed**.

### SBR-008 — Low — Browser security headers could be stricter

- Evidence: production styles broadly allowed inline CSS and HSTS/modern
  isolation headers were absent.
- Impact: weaker mitigation if an HTML/CSS injection bug is introduced later.
- Remediation: production style elements now require the per-request nonce,
  while style attributes remain allowed for React rendering
  (`src/proxy.ts:14`). HSTS, COOP, CORP, origin isolation, and legacy plugin
  restrictions are configured in `next.config.ts:20`.
- Status: **fixed; verify CSP in the production browser console**.

### SBR-009 — Medium — Hosted buckets lacked bucket-level upload limits

- Evidence: all three hosted buckets are private, but their `file_size_limit`
  and `allowed_mime_types` settings are null.
- Impact: current server routes validate byte signatures and sizes, but a future
  upload path could accidentally rely on missing storage-layer enforcement.
- Remediation: `20260901001251_harden_database_contract.sql:62` makes every
  bucket private and mirrors the avatar/photo/music size and MIME allowlists at
  the storage layer.
- Status: **fixed and verified on hosted Supabase**.

### SBR-010 â€” High â€” Media URL/path regular expressions were over-escaped

- Evidence: PostgreSQL standard strings preserved doubled backslashes in the
  original constraints, rejecting valid YouTube URLs and private object paths.
- Impact: legitimate songs, avatars, photos, and uploaded music could fail at
  the database boundary even after application validation succeeded.
- Remediation: `20260901004136_fix_media_url_constraints.sql` replaces the
  affected expressions with unambiguous bracket syntax and validates them.
- Status: **fixed and verified on hosted Supabase**.

### SBR-011 â€” High â€” Two security-definer functions failed schema lint

- Evidence: `consume_rate_limit` shadowed PostgreSQL's `current_time` keyword,
  and `redeem_vault_invite` used an ambiguous `member_id` conflict target.
- Impact: rate-limited endpoints and repeat-member invitation redemption could
  fail at runtime, weakening availability and abuse controls.
- Remediation: `20260901005040_fix_rate_limit_and_invite_functions.sql` uses an
  explicit timestamptz variable and names the member-secret primary-key
  constraint. pgTAP now executes both limiter and one-time invite behavior.
- Status: **fixed; hosted schema lint reports no errors or warnings**.

## Residual architecture risks

- Baul is server-readable, not end-to-end encrypted. A database administrator,
  a compromised application server, or a leaked Supabase secret key can access
  content. Protect production access with MFA, short-lived staff access,
  separate environments, audit logs, and key rotation.
- Browser Supabase sessions are JavaScript-accessible because Realtime and
  direct RLS queries are part of the architecture. The strict CSP and absence of
  dangerous HTML sinks reduce XSS risk, but a backend-for-frontend-only design
  with HttpOnly sessions would provide a stronger boundary at the cost of
  replacing direct Realtime access.
- Direct third-party audio URLs reveal the listener's IP address to that host.
  Prefer uploaded private audio or approved providers, and disclose this before
  enabling broader link support.
- Turnstile escalation is secure only when both production keys and hostname
  restrictions are configured. The server intentionally fails closed after the
  challenge threshold if its secret is missing.
- The upstream `@react-three/fiber` release still instantiates deprecated
  `THREE.Clock`. This is a non-fatal compatibility warning, not a security
  failure; do not suppress it by patching vendor code.

## Verification state on 1 September

- Passed at that review: ESLint, strict TypeScript, 8 Vitest tests, the Next.js production
  build, and the production dependency audit with zero vulnerabilities.
- Passed remotely at that review: all 51 pgTAP assertions for RLS, grants, secret columns,
  tenant consistency, locked payloads, revocation, one-time invites, atomic rate
  limits, location privacy, and future-object defaults.
- Passed remotely at that review: Supabase schema lint for `public` and `private`
  reported no errors or warnings; all then-existing local and remote migration
  versions matched. See the dated delta above for the current state.
- Verified empty: zero Auth users, Storage objects, Bauls, members, memories,
  messages, songs, invitations, or recovery requests. Reference geography was
  re-seeded (250 countries and 149 administrative divisions).
- Not run locally: the Docker-backed Supabase runner and Playwright browser suite
  require Docker/browser setup on this workstation. The equivalent pgTAP SQL
  was executed transactionally against the linked hosted database.
