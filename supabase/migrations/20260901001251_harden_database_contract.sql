-- Finalize the production database contract after the additive security
-- foundation. This migration deliberately fails closed: browser roles receive
-- only the exact privileges listed below, every tenant-owned reference is
-- checked by the database, and public map data is suppressed until at least
-- three Bauls contribute to an aggregate location.

-- Supabase historically auto-granted Data API roles on newly created public
-- objects. Make future exposure opt-in, independently of dashboard defaults.
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- Global revokes remove PostgreSQL's default PUBLIC function execution. The
-- schema-scoped revokes also undo Supabase's historical Data API auto-grants.
alter default privileges for role postgres
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- Re-state the complete Data API surface. RLS remains the row-level boundary;
-- these grants are the independent table/function boundary.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke all privileges (
  id, name, key_hash, key_lookup, vault_type, purpose, max_members,
  recovery_email_enc, recovery_email_hash, recovery_email_confirmed_at,
  country_id, division_id, milestone_date, created_at
) on public.vaults from anon, authenticated;
revoke all privileges (
  id, vault_id, user_id, display_name, name_changed_at, avatar_url,
  avatar_color, role, joined_at, revoked_at, revoked_by
) on public.members from anon, authenticated;

grant select on public.countries, public.division_types,
  public.administrative_divisions, public.region_stats, public.country_stats
  to anon, authenticated;

grant select (id, name, vault_type, purpose, max_members, milestone_date, created_at)
  on public.vaults to authenticated;
grant select (
  id, vault_id, display_name, name_changed_at, avatar_url, avatar_color,
  role, joined_at, revoked_at
) on public.members to authenticated;
grant select, insert, delete on public.memories, public.messages, public.songs,
  public.reactions, public.memory_replies to authenticated;
grant select on public.memory_capsule_payloads to authenticated;

-- The application server is the only caller of privileged RPCs and secret
-- tables. BYPASSRLS does not replace ordinary object privileges.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Storage remains server-mediated and private. Bucket limits duplicate the
-- route-level byte-signature checks so a future upload path cannot bypass size
-- or MIME policy.
update storage.buckets
set public = false,
    file_size_limit = case id
      when 'avatars' then 5 * 1024 * 1024
      when 'photos' then 10 * 1024 * 1024
      when 'music' then 15 * 1024 * 1024
    end,
    allowed_mime_types = case id
      when 'avatars' then array['image/webp']::text[]
      when 'photos' then array['image/webp']::text[]
      when 'music' then array['audio/mpeg']::text[]
    end
where id in ('avatars', 'photos', 'music');

-- Cached JWT helpers are retained for one rollout only, but are no longer
-- callable through the Data API and no policy depends on them.
revoke execute on function public.auth_vault_id() from public, anon, authenticated;
revoke execute on function public.auth_member_id() from public, anon, authenticated;
revoke execute on function public.auth_is_admin() from public, anon, authenticated;

-- Composite candidate keys let foreign keys prove tenant consistency instead
-- of trusting route code to keep ids from different Bauls apart.
alter table public.administrative_divisions
  add constraint administrative_divisions_id_country_unique unique (id, country_id);

alter table public.songs
  add constraint songs_added_by_same_vault_fk
  foreign key (added_by, vault_id)
  references public.members(id, vault_id) not valid;

alter table public.members
  add constraint members_revoked_by_same_vault_fk
  foreign key (revoked_by, vault_id)
  references public.members(id, vault_id)
  on delete set null (revoked_by) not valid;

alter table public.vault_invites
  add constraint vault_invites_creator_same_vault_fk
    foreign key (created_by, vault_id)
    references public.members(id, vault_id)
    on delete set null (created_by) not valid,
  add constraint vault_invites_redeemer_same_vault_fk
    foreign key (redeemed_by, vault_id)
    references public.members(id, vault_id)
    on delete set null (redeemed_by) not valid;

alter table public.membership_events
  add constraint membership_events_subject_same_vault_fk
    foreign key (subject_member_id, vault_id)
    references public.members(id, vault_id)
    on delete set null (subject_member_id) not valid,
  add constraint membership_events_actor_same_vault_fk
    foreign key (actor_member_id, vault_id)
    references public.members(id, vault_id)
    on delete set null (actor_member_id) not valid;

alter table public.vaults
  add constraint vaults_division_same_country_fk
  foreign key (division_id, country_id)
  references public.administrative_divisions(id, country_id)
  on delete set null (division_id) not valid;

create index songs_added_by_vault_idx
  on public.songs (added_by, vault_id);
create index members_revoked_by_vault_idx
  on public.members (revoked_by, vault_id) where revoked_by is not null;
create index vault_invites_created_by_vault_idx
  on public.vault_invites (created_by, vault_id) where created_by is not null;
create index vault_invites_redeemed_by_vault_idx
  on public.vault_invites (redeemed_by, vault_id) where redeemed_by is not null;
create index membership_events_subject_vault_idx
  on public.membership_events (subject_member_id, vault_id)
  where subject_member_id is not null;
create index membership_events_actor_vault_idx
  on public.membership_events (actor_member_id, vault_id)
  where actor_member_id is not null;

-- Existing rows were audited before this rollout. VALIDATE takes the lighter
-- lock while converting the staged checks into a fully verified contract.
alter table public.vaults validate constraint vaults_name_length_check;
alter table public.vaults validate constraint vaults_division_same_country_fk;
alter table public.members validate constraint members_display_name_length_check;
alter table public.members validate constraint members_avatar_path_check;
alter table public.members validate constraint members_avatar_color_check;
alter table public.members validate constraint members_revoked_by_same_vault_fk;
alter table public.songs validate constraint songs_title_length_check;
alter table public.songs validate constraint songs_exactly_one_source_check;
alter table public.songs validate constraint songs_source_url_check;
alter table public.songs validate constraint songs_file_path_check;
alter table public.songs validate constraint songs_added_by_same_vault_fk;
alter table public.memories validate constraint memories_content_length_check;
alter table public.memories validate constraint memories_media_path_check;
alter table public.memories validate constraint memories_member_same_vault_fk;
alter table public.memories validate constraint memories_song_same_vault_fk;
alter table public.messages validate constraint messages_body_length_check;
alter table public.messages validate constraint messages_member_same_vault_fk;
alter table public.reactions validate constraint reactions_emoji_allowlist_check;
alter table public.reactions validate constraint reactions_memory_same_vault_fk;
alter table public.reactions validate constraint reactions_member_same_vault_fk;
alter table public.memory_replies validate constraint memory_replies_body_length_check;
alter table public.memory_replies validate constraint memory_replies_memory_same_vault_fk;
alter table public.memory_replies validate constraint memory_replies_member_same_vault_fk;
alter table public.memory_capsule_payloads validate constraint capsule_memory_same_vault_fk;
alter table public.vault_invites validate constraint vault_invites_creator_same_vault_fk;
alter table public.vault_invites validate constraint vault_invites_redeemer_same_vault_fk;
alter table public.membership_events validate constraint membership_events_subject_same_vault_fk;
alter table public.membership_events validate constraint membership_events_actor_same_vault_fk;

-- Public location rows require at least three contributing Bauls. The WLD row
-- remains exact because it has no location and powers only global counters.
create or replace function public.refresh_region_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.region_stats;
  delete from public.country_stats;

  with recursive vault_divisions as (
    select v.id as vault_id, v.vault_type, v.division_id
    from public.vaults v
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
    from public.vaults v
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

  with vault_content as (
    select v.id as vault_id, coalesce(mc.n, 0) as memories,
      coalesce(sc.n, 0) as songs
    from public.vaults v
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
  from public.vaults v
  join public.countries c on c.id = v.country_id
  join vault_content vc on vc.vault_id = v.id
  group by c.iso3, c.name, c.lat, c.lng
  having count(*) >= 3;

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
  from public.vaults v;
end
$$;

revoke execute on function public.refresh_region_stats()
  from public, anon, authenticated;
grant execute on function public.refresh_region_stats() to service_role;
