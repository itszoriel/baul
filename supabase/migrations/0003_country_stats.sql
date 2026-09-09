-- ============================================================================
-- Completes the divisions model for the location flow:
--
-- 1. vaults.country_id — the wizard asks country first; many countries have
--    no seeded divisions yet, so country must stand alone. division_id stays
--    optional and refines it. (country null = full opt-out.)
-- 2. country_stats — country-level aggregates for the globe's far zoom, plus
--    one 'WLD' world row whose totals INCLUDE location-opted-out vaults (the
--    landing page's "N memories kept" counters must not undercount them).
--    region_stats remains the division-level aggregate; both are public,
--    aggregate-only, and rebuilt together.
-- ============================================================================

alter table public.vaults
  add column country_id uuid references public.countries(id) on delete set null;

create index vaults_country_idx on public.vaults (country_id) where country_id is not null;

-- A division without its country is meaningless; the API sets both.
alter table public.vaults
  add constraint vaults_division_requires_country
  check (division_id is null or country_id is not null);

create table public.country_stats (
  iso3 char(3) primary key,             -- ISO 3166-1 alpha-3; 'WLD' = world row
  name text not null,
  lat double precision,
  lng double precision,
  vault_count int not null default 0,
  duo_count int not null default 0,
  circle_count int not null default 0,
  memory_count int not null default 0,
  song_count int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.country_stats enable row level security;
revoke insert, update, delete on public.country_stats from anon, authenticated;

create policy "country stats are public"
  on public.country_stats for select to anon, authenticated using (true);

-- Rebuild BOTH aggregates in one transaction.
create or replace function public.refresh_region_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.region_stats;
  delete from public.country_stats;

  -- Division-level rollup: a vault counts at its division and every ancestor.
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
    select v.id as vault_id, coalesce(mc.n, 0) as memories, coalesce(sc.n, 0) as songs
    from public.vaults v
    left join (select vault_id, count(*) n from public.memories group by vault_id) mc on mc.vault_id = v.id
    left join (select vault_id, count(*) n from public.songs    group by vault_id) sc on sc.vault_id = v.id
  )
  insert into public.region_stats
    (division_id, name, country_iso3, level, parent_division_id, lat, lng,
     vault_count, duo_count, circle_count, memory_count, song_count, updated_at)
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
  group by d.id, d.name, c.iso3, t.level, d.parent_division_id, d.lat, d.lng;

  -- Country-level totals (vaults that shared at least their country).
  with vault_content as (
    select v.id as vault_id, coalesce(mc.n, 0) as memories, coalesce(sc.n, 0) as songs
    from public.vaults v
    left join (select vault_id, count(*) n from public.memories group by vault_id) mc on mc.vault_id = v.id
    left join (select vault_id, count(*) n from public.songs    group by vault_id) sc on sc.vault_id = v.id
  )
  insert into public.country_stats
    (iso3, name, lat, lng, vault_count, duo_count, circle_count,
     memory_count, song_count, updated_at)
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

  -- World row: includes location-opted-out vaults so global counters are true.
  insert into public.country_stats
    (iso3, name, lat, lng, vault_count, duo_count, circle_count,
     memory_count, song_count, updated_at)
  select
    'WLD', 'World', null, null,
    count(distinct v.id)::int,
    (count(distinct v.id) filter (where v.vault_type = 'intimate'))::int,
    (count(distinct v.id) filter (where v.vault_type = 'circle'))::int,
    (select count(*) from public.memories)::int,
    (select count(*) from public.songs)::int,
    now()
  from public.vaults v;
end;
$$;

revoke execute on function public.refresh_region_stats() from public, anon, authenticated;
