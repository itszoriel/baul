-- PL/pgSQL treats current_time as a SQL keyword. Use an unambiguous variable
-- so the atomic limiter writes timestamptz values rather than time-of-day.
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
  v_now timestamptz := clock_timestamp();
  threshold integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_block_seconds < 1 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit';
  end if;

  threshold := greatest(2, ceiling(p_limit::numeric / 2)::integer);

  insert into public.rate_limit_buckets (
    bucket_key, window_started_at, hit_count, updated_at
  ) values (
    p_bucket_key, v_now, 0, v_now
  ) on conflict (bucket_key) do nothing;

  select b.* into bucket
  from public.rate_limit_buckets b
  where b.bucket_key = p_bucket_key
  for update;

  if bucket.blocked_until is not null and bucket.blocked_until > v_now then
    return query select
      false,
      greatest(1, ceiling(extract(epoch from bucket.blocked_until - v_now))::integer),
      bucket.hit_count,
      true;
    return;
  end if;

  if bucket.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    bucket.window_started_at := v_now;
    bucket.hit_count := 1;
    bucket.blocked_until := null;
  else
    bucket.hit_count := bucket.hit_count + 1;
  end if;

  if bucket.hit_count > p_limit then
    bucket.blocked_until := v_now + make_interval(secs => p_block_seconds);
  end if;

  update public.rate_limit_buckets b
  set window_started_at = bucket.window_started_at,
      hit_count = bucket.hit_count,
      blocked_until = bucket.blocked_until,
      updated_at = v_now
  where b.bucket_key = p_bucket_key;

  return query select
    bucket.hit_count <= p_limit,
    case
      when bucket.hit_count > p_limit then p_block_seconds
      else greatest(
        0,
        ceiling(extract(epoch from (
          bucket.window_started_at + make_interval(secs => p_window_seconds) - v_now
        )))::integer
      )
    end,
    bucket.hit_count,
    bucket.hit_count >= threshold;
end
$$;

-- The RETURNS TABLE output contains member_id, so a bare ON CONFLICT
-- (member_id) is ambiguous in PL/pgSQL. Name the primary-key constraint.
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
    on conflict on constraint member_secrets_pkey do update
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
