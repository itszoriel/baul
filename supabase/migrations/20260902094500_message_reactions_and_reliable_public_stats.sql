-- Reactions for the Whispers conversation reuse the same built-in emoji and
-- private per-Baul sticker library as memory reactions. Public landing stats
-- are refreshed inside Postgres so local and non-Vercel deployments do not
-- silently depend on an external scheduler.

-- A composite key lets every message-reaction reference prove tenant
-- consistency at the database boundary.
alter table public.messages
  add constraint messages_id_vault_unique unique (id, vault_id);

create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  member_id uuid not null,
  vault_id uuid not null,
  emoji text,
  sticker_id uuid,
  created_at timestamptz not null default now(),
  constraint message_reactions_message_same_vault_fk
    foreign key (message_id, vault_id)
    references public.messages(id, vault_id)
    on delete cascade,
  constraint message_reactions_member_same_vault_fk
    foreign key (member_id, vault_id)
    references public.members(id, vault_id),
  constraint message_reactions_sticker_same_vault_fk
    foreign key (sticker_id, vault_id)
    references public.vault_stickers(id, vault_id),
  constraint message_reactions_kind_check
    check (
      (sticker_id is null and emoji in ('❤️', '🥺', '🔥', '😂', '✨'))
      or (sticker_id is not null and emoji is null)
    )
);

create unique index message_reactions_unique_emoji_idx
  on public.message_reactions (message_id, member_id, emoji)
  where emoji is not null;
create unique index message_reactions_unique_sticker_idx
  on public.message_reactions (message_id, member_id, sticker_id)
  where sticker_id is not null;
create index message_reactions_vault_message_idx
  on public.message_reactions (vault_id, message_id, created_at);
create index message_reactions_member_vault_idx
  on public.message_reactions (member_id, vault_id);
create index message_reactions_sticker_vault_idx
  on public.message_reactions (sticker_id, vault_id)
  where sticker_id is not null;

-- Browser inserts name only the message. Derive the tenant id from the parent
-- so a caller cannot smuggle a reaction across Bauls.
create or replace function private.set_message_reaction_vault_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_vault_id uuid;
begin
  select m.vault_id into parent_vault_id
  from public.messages m
  where m.id = new.message_id;

  if parent_vault_id is null then
    raise exception using errcode = '23503', message = 'message_not_found';
  end if;

  new.vault_id := parent_vault_id;
  return new;
end
$$;

revoke all on function private.set_message_reaction_vault_id()
  from public, anon, authenticated;

create trigger message_reactions_set_vault_id
before insert or update of message_id on public.message_reactions
for each row execute function private.set_message_reaction_vault_id();

alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from anon, authenticated;
grant select, insert, delete on public.message_reactions to authenticated;
grant select, insert, update, delete on public.message_reactions to service_role;

create policy "active members read message reactions"
  on public.message_reactions for select to authenticated
  using (private.is_active_member(vault_id));

create policy "active members react to messages as self"
  on public.message_reactions for insert to authenticated
  with check (
    private.is_active_member(vault_id)
    and member_id = private.current_member_id(vault_id)
    and exists (
      select 1 from public.messages message
      where message.id = message_reactions.message_id
        and message.vault_id = message_reactions.vault_id
    )
    and (
      sticker_id is null
      or exists (
        select 1 from public.vault_stickers sticker
        where sticker.id = sticker_id
          and sticker.vault_id = message_reactions.vault_id
          and sticker.retired_at is null
      )
    )
  );

create policy "active members remove own message reactions"
  on public.message_reactions for delete to authenticated
  using (
    private.is_active_member(vault_id)
    and member_id = private.current_member_id(vault_id)
  );

alter table public.message_reactions replica identity full;
alter publication supabase_realtime add table public.message_reactions;

-- Country sharing is an explicit, coarse opt-in. Publish that country-level
-- aggregate even for one Baul; keep the k=3 threshold for finer divisions.
-- The WLD row remains exact and includes Bauls that opted out of location.
create or replace function public.refresh_region_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- External and database schedulers may briefly overlap during rollout.
  perform pg_advisory_xact_lock(hashtextextended('baul:refresh_region_stats', 0));

  delete from public.region_stats where division_id is not null;
  delete from public.country_stats where iso3 is not null;

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
  from public.vaults v;
end
$$;

revoke execute on function public.refresh_region_stats()
  from public, anon, authenticated;
grant execute on function public.refresh_region_stats() to service_role;

-- Run the delayed aggregate refresh in the database as well as during the
-- transition from the existing Vercel cron. The advisory lock above makes an
-- overlap harmless. This keeps localhost and alternative deployments fresh.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'baul-refresh-public-stats',
  '*/10 * * * *',
  $schedule$select public.refresh_region_stats()$schedule$
);

-- Backfill the current aggregate snapshot as part of the additive migration.
select public.refresh_region_stats();
