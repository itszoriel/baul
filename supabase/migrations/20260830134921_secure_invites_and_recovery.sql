-- Expiring invitations, confirm-only key recovery, and a shared atomic limiter.
-- Raw invitation/recovery tokens and permanent Baul keys never enter Postgres.

create table public.vault_invites (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.members(id) on delete set null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references public.members(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint vault_invites_expiry_after_creation
    check (expires_at > created_at)
);

create index vault_invites_vault_created_idx
  on public.vault_invites (vault_id, created_at desc);
create index vault_invites_active_idx
  on public.vault_invites (vault_id, expires_at)
  where redeemed_at is null and revoked_at is null;

alter table public.vault_invites enable row level security;
revoke all on public.vault_invites from anon, authenticated;

create table public.vault_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint vault_recovery_expiry_after_creation
    check (expires_at > created_at)
);

create index vault_recovery_active_idx
  on public.vault_recovery_requests (vault_id, expires_at)
  where used_at is null;

alter table public.vault_recovery_requests enable row level security;
revoke all on public.vault_recovery_requests from anon, authenticated;

create table public.vault_email_confirmations (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint vault_email_confirmation_expiry_after_creation check (expires_at > created_at)
);

create index vault_email_confirmations_active_idx
  on public.vault_email_confirmations (vault_id, expires_at) where used_at is null;
alter table public.vault_email_confirmations enable row level security;
revoke all on public.vault_email_confirmations from anon, authenticated;

create table public.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null default 0 check (hit_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint rate_limit_bucket_key_length check (char_length(bucket_key) between 16 and 200)
);

create index rate_limit_buckets_updated_idx
  on public.rate_limit_buckets (updated_at);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer default 300
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  current_hits integer,
  challenge_required boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket public.rate_limit_buckets%rowtype;
  current_time timestamptz := clock_timestamp();
  threshold integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_block_seconds < 1 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit';
  end if;

  threshold := greatest(2, ceiling(p_limit::numeric / 2)::integer);

  insert into public.rate_limit_buckets (
    bucket_key, window_started_at, hit_count, updated_at
  ) values (
    p_bucket_key, current_time, 0, current_time
  ) on conflict (bucket_key) do nothing;

  select b.* into bucket
  from public.rate_limit_buckets b
  where b.bucket_key = p_bucket_key
  for update;

  if bucket.blocked_until is not null and bucket.blocked_until > current_time then
    return query select
      false,
      greatest(1, ceiling(extract(epoch from bucket.blocked_until - current_time))::integer),
      bucket.hit_count,
      true;
    return;
  end if;

  if bucket.window_started_at + make_interval(secs => p_window_seconds) <= current_time then
    bucket.window_started_at := current_time;
    bucket.hit_count := 1;
    bucket.blocked_until := null;
  else
    bucket.hit_count := bucket.hit_count + 1;
  end if;

  if bucket.hit_count > p_limit then
    bucket.blocked_until := current_time + make_interval(secs => p_block_seconds);
  end if;

  update public.rate_limit_buckets b
  set window_started_at = bucket.window_started_at,
      hit_count = bucket.hit_count,
      blocked_until = bucket.blocked_until,
      updated_at = current_time
  where b.bucket_key = p_bucket_key;

  return query select
    bucket.hit_count <= p_limit,
    case
      when bucket.hit_count > p_limit then p_block_seconds
      else greatest(
        0,
        ceiling(extract(epoch from (
          bucket.window_started_at + make_interval(secs => p_window_seconds) - current_time
        )))::integer
      )
    end,
    bucket.hit_count,
    bucket.hit_count >= threshold;
end
$$;

-- Invitation redemption locks both the invitation and vault. A revoked member
-- can only return with a fresh admin-issued invite, preserving old attribution.
create or replace function public.redeem_vault_invite(
  p_token_hash text,
  p_user_id uuid,
  p_display_name text,
  p_avatar_color text,
  p_secret_hash text
)
returns table (
  invite_id uuid,
  member_id uuid,
  vault_id uuid,
  vault_name text,
  vault_type text,
  member_role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_invite public.vault_invites%rowtype;
  selected_vault public.vaults%rowtype;
  selected_member public.members%rowtype;
  active_count integer;
begin
  select i.* into selected_invite
  from public.vault_invites i
  where i.token_hash = p_token_hash
  for update;

  if not found
    or selected_invite.revoked_at is not null
    or selected_invite.redeemed_at is not null
    or selected_invite.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'invite_unavailable';
  end if;

  select v.* into selected_vault
  from public.vaults v
  where v.id = selected_invite.vault_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'vault_not_found';
  end if;

  select count(*)::integer into active_count
  from public.members m
  where m.vault_id = selected_vault.id and m.revoked_at is null;

  select m.* into selected_member
  from public.members m
  where m.vault_id = selected_vault.id and m.user_id = p_user_id
  for update;

  if found then
    if selected_member.revoked_at is not null then
      if active_count >= selected_vault.max_members then
        raise exception using errcode = 'P0001', message = 'vault_full';
      end if;

      update public.members m
      set display_name = btrim(p_display_name),
          avatar_color = p_avatar_color,
          revoked_at = null,
          revoked_by = null
      where m.id = selected_member.id
      returning * into selected_member;

      insert into public.membership_events (
        vault_id, subject_member_id, actor_member_id, event_type, new_user_id
      ) values (
        selected_vault.id,
        selected_member.id,
        selected_invite.created_by,
        'reactivated',
        p_user_id
      );
    end if;

    insert into public.member_secrets (member_id, secret_hash, set_at)
    values (selected_member.id, p_secret_hash, now())
    on conflict (member_id) do update
      set secret_hash = excluded.secret_hash, set_at = excluded.set_at;
  else
    if active_count >= selected_vault.max_members then
      raise exception using errcode = 'P0001', message = 'vault_full';
    end if;

    insert into public.members (
      vault_id, user_id, display_name, avatar_color, role
    ) values (
      selected_vault.id,
      p_user_id,
      btrim(p_display_name),
      p_avatar_color,
      case when active_count = 0 then 'admin' else 'member' end
    ) returning * into selected_member;

    insert into public.member_secrets (member_id, secret_hash)
    values (selected_member.id, p_secret_hash);

    insert into public.membership_events (
      vault_id, subject_member_id, actor_member_id, event_type, new_user_id
    ) values (
      selected_vault.id,
      selected_member.id,
      selected_invite.created_by,
      'joined',
      p_user_id
    );
  end if;

  update public.vault_invites i
  set redeemed_at = now(), redeemed_by = selected_member.id
  where i.id = selected_invite.id;

  return query select selected_invite.id, selected_member.id, selected_vault.id,
    selected_vault.name, selected_vault.vault_type, selected_member.role;
end
$$;

-- Rotation occurs only inside this confirmation transaction. Merely requesting
-- or failing to deliver a recovery email never changes the permanent key.
create or replace function public.confirm_vault_recovery(
  p_token_hash text,
  p_key_hash text,
  p_key_lookup text
)
returns table (
  vault_id uuid,
  vault_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_request public.vault_recovery_requests%rowtype;
  selected_vault public.vaults%rowtype;
begin
  select r.* into selected_request
  from public.vault_recovery_requests r
  where r.token_hash = p_token_hash
  for update;

  if not found
    or selected_request.used_at is not null
    or selected_request.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'recovery_unavailable';
  end if;

  select v.* into selected_vault
  from public.vaults v
  where v.id = selected_request.vault_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'vault_not_found';
  end if;

  update public.vaults v
  set key_hash = p_key_hash, key_lookup = p_key_lookup
  where v.id = selected_vault.id;

  update public.vault_recovery_requests r
  set used_at = now()
  where r.vault_id = selected_vault.id and r.used_at is null;

  insert into public.membership_events (
    vault_id, subject_member_id, event_type
  ) values (
    selected_vault.id, null, 'key_rotated'
  );

  return query select selected_vault.id, selected_vault.name;
end
$$;

create or replace function public.confirm_vault_recovery_email(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_confirmation public.vault_email_confirmations%rowtype;
begin
  select c.* into selected_confirmation
  from public.vault_email_confirmations c
  where c.token_hash = p_token_hash
  for update;

  if not found or selected_confirmation.used_at is not null or selected_confirmation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'confirmation_unavailable';
  end if;

  update public.vault_email_confirmations c
  set used_at = now()
  where c.vault_id = selected_confirmation.vault_id and c.used_at is null;

  update public.vaults v
  set recovery_email_confirmed_at = now()
  where v.id = selected_confirmation.vault_id;

  return selected_confirmation.vault_id;
end
$$;

revoke all on function public.consume_rate_limit(text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.redeem_vault_invite(text, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.confirm_vault_recovery(text, text, text)
  from public, anon, authenticated;
revoke all on function public.confirm_vault_recovery_email(text)
  from public, anon, authenticated;

grant execute on function public.consume_rate_limit(text, integer, integer, integer)
  to service_role;
grant execute on function public.redeem_vault_invite(text, uuid, text, text, text)
  to service_role;
grant execute on function public.confirm_vault_recovery(text, text, text)
  to service_role;
grant execute on function public.confirm_vault_recovery_email(text)
  to service_role;
