# Baul privacy model

Baul is private through authentication, live membership checks, row-level security, private object storage, expiring links, and careful logging. It is not end-to-end encrypted.

## What keepers can expect

- There is no public vault browsing, discovery, or search.
- Active keepers can access only Bauls whose live membership row belongs to their anonymous Auth user.
- Permanent keys are accepted through manual entry, returned only at creation or confirmed recovery, and never placed in new links, QR codes, email, analytics, or logs.
- Invitation and recovery tokens are single-use, expire, and are stored as SHA-256 hashes.
- Public globe data is delayed and aggregated. A keeper who optionally shares
  a country allows that country-level count to appear after the next refresh;
  its dot is a stable approximation around the country centroid, not a Baul
  coordinate. Finer division rows are suppressed until at least three Bauls
  contribute. The exact world total has no location, and the globe never emits
  a specific Baul or individual creation event.
- Photos, songs, avatars, and keeper-made reaction stickers are kept in private buckets and delivered with short-lived signed URLs.

## Operator access

Authorized operators with database or infrastructure privileges can technically access server-side content. Product copy must say this plainly. Do not describe Baul as zero-knowledge or end-to-end encrypted.

Operator access should be restricted with least privilege, MFA, separate production roles, audit logs, short-lived credentials, and an incident-review process. Avoid production data in local development and support tooling.

## Data lifecycle

Removing a keeper revokes access but preserves their name and attributed memories, messages, replies, reactions, and songs. Permanent content deletion is intentionally a separate operation.

Deleting media rows enqueues storage cleanup. Workers process that queue idempotently so temporary failures can retry and orphaned objects remain recoverable during the retry window.

Sealed-letter metadata (author, dates, envelope state) is separate from the payload. RLS denies the payload to every keeper, including its author, until the unlock time.

## Sensitive-data handling

Operational events may contain a generated request ID, route/event name, status code, retry duration, queue object ID, and aggregate counts. They must never contain:

- permanent keys or verifiers;
- invitation, recovery, join, or Turnstile tokens;
- email addresses or IP addresses;
- memory, message, reply, letter, or song content;
- storage object paths that encode tenant/user information.

Security reports should include the request ID and approximate time, not secrets or content.
