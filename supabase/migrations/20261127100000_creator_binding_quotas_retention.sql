-- Phase 1 integrity, abuse and retention controls.
--
-- 1. A new vault records the anonymous Auth user that created it. Until that
--    creator joins, nobody else can join, so the first admin is always the
--    creator rather than whoever uses the key first.
-- 2. Memberless vaults never appear in public statistics and are purged after
--    24 hours.
-- 3. Expired security records, idle rate-limit buckets, processed cleanup jobs
--    and abandoned anonymous Auth users are purged daily.
-- 4. Browser (PostgREST) inserts are limited per member per minute and per day.
-- 5. The per-vault photo limit is enforced atomically in the database.

alter table public.vaults add column if not exists created_by_user_id uuid;

comment on column public.vaults.created_by_user_id is
  'Anonymous Auth user that created the vault; only this user can become its first member. Null for vaults created before this column existed.';

-- ---------------------------------------------------------------------------
-- 1. Creator-bound first membership
-- ---------------------------------------------------------------------------
create or replace function public.join_vault_member(
  p_vault_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_avatar_color text,
  p_secret_hash text
)
returns table (
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
  selected_vault public.vaults%rowtype;
  selected_member public.members%rowtype;
  active_count integer;
begin
  select v.* into selected_vault
  from public.vaults v
  where v.id = p_vault_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'vault_not_found';
  end if;

  select m.* into selected_member
  from public.members m
  where m.vault_id = p_vault_id and m.user_id = p_user_id
  for update;

  if found then
    if selected_member.revoked_at is not null then
      raise exception using errcode = 'P0001', message = 'membership_revoked';
    end if;

    return query select selected_member.id, selected_vault.id, selected_vault.name,
      selected_vault.vault_type, selected_member.role;
    return;
  end if;

  select count(*)::integer into active_count
  from public.members m
  where m.vault_id = p_vault_id and m.revoked_at is null;

  if active_count = 0
    and selected_vault.created_by_user_id is not null
    and selected_vault.created_by_user_id <> p_user_id then
    raise exception using errcode = 'P0001', message = 'vault_not_ready';
  end if;

  if active_count >= selected_vault.max_members then
    raise exception using errcode = 'P0001', message = 'vault_full';
  end if;

  insert into public.members (
    vault_id, user_id, display_name, avatar_color, role
  ) values (
    p_vault_id,
    p_user_id,
    btrim(p_display_name),
    p_avatar_color,
    case when active_count = 0 then 'admin' else 'member' end
  ) returning * into selected_member;

  insert into public.member_secrets (member_id, secret_hash)
  values (selected_member.id, p_secret_hash);

  insert into public.membership_events (
    vault_id, subject_member_id, event_type, new_user_id
  ) values (
    p_vault_id, selected_member.id, 'joined', p_user_id
  );

  return query select selected_member.id, selected_vault.id, selected_vault.name,
    selected_vault.vault_type, selected_member.role;
end
$$;

revoke all on function public.join_vault_member(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.join_vault_member(uuid, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Public statistics count only vaults with at least one member
-- ---------------------------------------------------------------------------
create or replace function public.refresh_region_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('baul:refresh_region_stats', 0));

  delete from public.region_stats where division_id is not null;
  delete from public.country_stats where iso3 is not null;

  with recursive live_vaults as (
    select v.* from public.vaults v
    where exists (select 1 from public.members m where m.vault_id = v.id)
  ),
  vault_divisions as (
    select v.id as vault_id, v.vault_type, v.division_id
    from live_vaults v
    where v.division_id is not null
    union all
    select vd.vault_id, vd.vault_type, d.parent_division_id
    from vault_divisions vd
    join public.administrative_divisions d on d.id = vd.division_id
    where d.parent_division_id is not null
  ),
  vault_content as (
    select v.id as vault_id, coalesce(mc.n, 0) as memories,
      coalesce(sc.n, 0) as songs
    from live_vaults v
    left join (
      select vault_id, count(*) n from public.memories group by vault_id
    ) mc on mc.vault_id = v.id
    left join (
      select vault_id, count(*) n from public.songs group by vault_id
    ) sc on sc.vault_id = v.id
  )
  insert into public.region_stats (
    division_id, name, country_iso3, level, parent_division_id, lat, lng,
    vault_count, duo_count, circle_count, memory_count, song_count, updated_at
  )
  select
    d.id, d.name, c.iso3, t.level, d.parent_division_id, d.lat, d.lng,
    count(*)::int,
    (count(*) filter (where vd.vault_type = 'intimate'))::int,
    (count(*) filter (where vd.vault_type = 'circle'))::int,
    coalesce(sum(vc.memories), 0)::int,
    coalesce(sum(vc.songs), 0)::int,
    now()
  from vault_divisions vd
  join public.administrative_divisions d on d.id = vd.division_id
  join public.countries c on c.id = d.country_id
  join public.division_types t on t.id = d.type_id
  join vault_content vc on vc.vault_id = vd.vault_id
  group by d.id, d.name, c.iso3, t.level, d.parent_division_id, d.lat, d.lng
  having count(*) >= 3;

  with live_vaults as (
    select v.* from public.vaults v
    where exists (select 1 from public.members m where m.vault_id = v.id)
  ),
  vault_content as (
    select v.id as vault_id, coalesce(mc.n, 0) as memories,
      coalesce(sc.n, 0) as songs
    from live_vaults v
    left join (
      select vault_id, count(*) n from public.memories group by vault_id
    ) mc on mc.vault_id = v.id
    left join (
      select vault_id, count(*) n from public.songs group by vault_id
    ) sc on sc.vault_id = v.id
  )
  insert into public.country_stats (
    iso3, name, lat, lng, vault_count, duo_count, circle_count,
    memory_count, song_count, updated_at
  )
  select
    c.iso3, c.name, c.lat, c.lng,
    count(*)::int,
    (count(*) filter (where v.vault_type = 'intimate'))::int,
    (count(*) filter (where v.vault_type = 'circle'))::int,
    coalesce(sum(vc.memories), 0)::int,
    coalesce(sum(vc.songs), 0)::int,
    now()
  from live_vaults v
  join public.countries c on c.id = v.country_id
  join vault_content vc on vc.vault_id = v.id
  group by c.iso3, c.name, c.lat, c.lng;

  insert into public.country_stats (
    iso3, name, lat, lng, vault_count, duo_count, circle_count,
    memory_count, song_count, updated_at
  )
  select
    'WLD', 'World', null, null,
    count(distinct v.id)::int,
    (count(distinct v.id) filter (where v.vault_type = 'intimate'))::int,
    (count(distinct v.id) filter (where v.vault_type = 'circle'))::int,
    (select count(*) from public.memories)::int,
    (select count(*) from public.songs)::int,
    now()
  from public.vaults v
  where exists (select 1 from public.members m where m.vault_id = v.id);
end
$$;

revoke execute on function public.refresh_region_stats() from public, anon, authenticated;
grant execute on function public.refresh_region_stats() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Daily retention
-- ---------------------------------------------------------------------------
create or replace function private.purge_expired_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_buckets integer;
  removed_invites integer;
  removed_recoveries integer;
  removed_confirmations integer;
  removed_cleanup_jobs integer;
  removed_vaults integer;
  removed_anonymous_users integer;
begin
  -- The longest limiter window is 24 hours.
  delete from public.rate_limit_buckets b
  where b.updated_at < now() - interval '2 days'
    and (b.blocked_until is null or b.blocked_until < now());
  get diagnostics removed_buckets = row_count;

  delete from public.vault_invites i
  where i.expires_at < now() - interval '30 days'
     or i.redeemed_at < now() - interval '30 days'
     or i.revoked_at < now() - interval '30 days';
  get diagnostics removed_invites = row_count;

  delete from public.vault_recovery_requests r
  where r.expires_at < now() - interval '7 days';
  get diagnostics removed_recoveries = row_count;

  delete from public.vault_email_confirmations c
  where c.expires_at < now() - interval '7 days';
  get diagnostics removed_confirmations = row_count;

  delete from public.storage_cleanup_queue q
  where q.processed_at < now() - interval '30 days';
  get diagnostics removed_cleanup_jobs = row_count;

  -- A vault whose creator never joined has no content and no admin.
  delete from public.vaults v
  where v.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.members m where m.vault_id = v.id);
  get diagnostics removed_vaults = row_count;

  -- Anonymous sessions that never held any membership.
  delete from auth.users u
  where u.is_anonymous
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
    and not exists (select 1 from public.members m where m.user_id = u.id);
  get diagnostics removed_anonymous_users = row_count;

  return jsonb_build_object(
    'rate_limit_buckets', removed_buckets,
    'vault_invites', removed_invites,
    'vault_recovery_requests', removed_recoveries,
    'vault_email_confirmations', removed_confirmations,
    'storage_cleanup_queue', removed_cleanup_jobs,
    'memberless_vaults', removed_vaults,
    'anonymous_users', removed_anonymous_users
  );
end
$$;

revoke all on function private.purge_expired_records() from public, anon, authenticated;
grant execute on function private.purge_expired_records() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'baul-purge-expired-records';
select cron.schedule(
  'baul-purge-expired-records',
  '17 3 * * *',
  $schedule$select private.purge_expired_records()$schedule$
);

-- ---------------------------------------------------------------------------
-- 4. Per-member quotas on browser inserts
-- ---------------------------------------------------------------------------
-- Arguments: per-minute limit, per-day limit. Server routes (service role) and
-- internal SQL are not limited here; they carry their own limits.
create or replace function private.enforce_member_write_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  writer uuid;
  per_minute integer := tg_argv[0]::integer;
  per_day integer := tg_argv[1]::integer;
  bucket record;
begin
  if coalesce((select auth.role()), '') <> 'authenticated' then
    return new;
  end if;

  writer := coalesce(to_jsonb(new) ->> 'member_id', to_jsonb(new) ->> 'added_by')::uuid;

  -- Rows that do not belong to the caller are rejected by RLS; do not let
  -- them create limiter rows for arbitrary identifiers.
  if writer is null or not exists (
    select 1 from public.members m
    where m.id = writer
      and m.user_id = (select auth.uid())
      and m.revoked_at is null
  ) then
    return new;
  end if;

  select * into bucket
  from public.consume_rate_limit('db:' || tg_table_name || ':minute:' || writer, per_minute, 60, 60);
  if not bucket.allowed then
    raise exception using errcode = 'P0001', message = 'write_rate_limited';
  end if;

  select * into bucket
  from public.consume_rate_limit('db:' || tg_table_name || ':day:' || writer, per_day, 86400, 3600);
  if not bucket.allowed then
    raise exception using errcode = 'P0001', message = 'write_rate_limited';
  end if;

  return new;
end
$$;

revoke all on function private.enforce_member_write_quota() from public, anon, authenticated;

create trigger zz_messages_write_quota before insert on public.messages
  for each row execute function private.enforce_member_write_quota('30', '2000');
create trigger zz_memory_replies_write_quota before insert on public.memory_replies
  for each row execute function private.enforce_member_write_quota('20', '1000');
create trigger zz_reactions_write_quota before insert on public.reactions
  for each row execute function private.enforce_member_write_quota('60', '3000');
create trigger zz_message_reactions_write_quota before insert on public.message_reactions
  for each row execute function private.enforce_member_write_quota('60', '3000');
create trigger zz_memories_write_quota before insert on public.memories
  for each row execute function private.enforce_member_write_quota('20', '300');
create trigger zz_songs_write_quota before insert on public.songs
  for each row execute function private.enforce_member_write_quota('10', '100');

-- ---------------------------------------------------------------------------
-- 5. Atomic per-vault photo limit (mirrors LIMITS.photosPerVault)
-- ---------------------------------------------------------------------------
create or replace function private.enforce_vault_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'photo' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('baul:photos:' || new.vault_id::text, 0));
  if (select count(*) from public.memories m where m.vault_id = new.vault_id and m.kind = 'photo') >= 250 then
    raise exception using errcode = 'P0001', message = 'photo_limit_reached';
  end if;
  return new;
end
$$;

revoke all on function private.enforce_vault_photo_limit() from public, anon, authenticated;

create trigger memories_photo_limit before insert on public.memories
  for each row execute function private.enforce_vault_photo_limit();
