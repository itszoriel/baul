-- ============================================================================
-- Portable member identity: a per-member personal passphrase.
--
-- Until now a member WAS its device (an anonymous auth session). Lose the
-- device or clear the browser and the identity was unrecoverable. Now each
-- member sets a passphrase at profile creation; from a new device they enter
-- the baul key, then their username + passphrase, and the server rebinds that
-- member to the new session.
--
-- The hash lives in its OWN table, not a column on `members`: clients read
-- members with `select *`, and a secret column would ride along in every such
-- read. This table has RLS on with NO policies and privileges revoked, so only
-- the service role (which bypasses RLS) can ever see or write it.
-- ============================================================================

create table public.member_secrets (
  member_id uuid primary key references public.members(id) on delete cascade,
  secret_hash text not null,             -- bcrypt of the personal passphrase
  set_at timestamptz not null default now()
);

alter table public.member_secrets enable row level security;
revoke all on public.member_secrets from anon, authenticated;
-- Intentionally no policies: anon/authenticated get nothing; the reclaim and
-- join flows run through the service role.

-- Case-insensitive username uniqueness. Reclaim looks members up by name, so
-- "Reias" and "reias" must not be able to coexist and split the identity.
create unique index members_vault_name_ci on public.members (vault_id, lower(display_name));
