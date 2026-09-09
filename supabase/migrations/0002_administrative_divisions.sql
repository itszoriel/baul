-- ============================================================================
-- Global administrative divisions (adjacency list + country-scoped type
-- metadata), replacing the hardcoded region_code system.
--
-- Why: the old design derived a coarse region code from IP headers and looked
-- it up in a hardcoded TypeScript map. That supported exactly one hierarchy
-- shape, couldn't drive a location picker UI, and adding a region meant a
-- code deploy. This model supports any country's hierarchy (any depth,
-- level-skipping allowed) as DATA:
--
--   countries ─< division_types      (what "level 2" is CALLED per country)
--   countries ─< administrative_divisions ─< administrative_divisions (self)
--
-- Vaults now store a user-CHOSEN division (wizard step) instead of an
-- IP-derived guess. Privacy rules unchanged: coarse divisions only, explicit
-- opt-out, the public globe reads only aggregated region_stats.
-- ============================================================================

-- ============ COUNTRIES ============
create table public.countries (
  id uuid primary key default gen_random_uuid(),
  iso3 char(3) not null unique check (iso3 ~ '^[A-Z]{3}$'),  -- ISO 3166-1 alpha-3
  iso2 char(2) not null unique check (iso2 ~ '^[A-Z]{2}$'),  -- alpha-2 (flags, legacy codes)
  name text not null,
  lat double precision,                 -- centroid for the globe
  lng double precision
);

-- ============ DIVISION TYPES ============
-- A type's rank is scoped to its COUNTRY: "City" is level 3 in PH but level 2
-- in JP. 1 = top of that country's hierarchy.
create table public.division_types (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete cascade,
  name text not null,                   -- e.g. Region, State, Prefecture, Barangay
  level int not null check (level between 1 and 10),
  unique (country_id, level),
  unique (country_id, name)
);

-- ============ ADMINISTRATIVE DIVISIONS ============
create table public.administrative_divisions (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete cascade,
  type_id uuid not null references public.division_types(id) on delete restrict,
  parent_division_id uuid references public.administrative_divisions(id) on delete cascade,
  name text not null,
  code text,                            -- official code: PSGC (PH), ISO 3166-2, FIPS…
  lat double precision,                 -- centroid; null = no dot of its own,
  lng double precision,                 --   counts still roll up to ancestors
  sort_order int,
  is_active boolean not null default true,  -- divisions merge/rename: soft-retire
  -- Country-scoped sibling uniqueness. NULLS NOT DISTINCT so two roots of the
  -- SAME country can't share a name, while PK-Punjab and IN-Punjab coexist.
  constraint adm_div_sibling_unique unique nulls not distinct (country_id, parent_division_id, name)
);

create index adm_div_parent_idx  on public.administrative_divisions (parent_division_id);
create index adm_div_country_idx on public.administrative_divisions (country_id);
create index adm_div_type_idx    on public.administrative_divisions (type_id);
create unique index adm_div_code_idx on public.administrative_divisions (country_id, code)
  where code is not null;

-- Integrity: child and parent share a country; the type belongs to that
-- country; a child sits STRICTLY deeper than its parent (level-skipping ok).
create or replace function public.division_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type_country uuid;
  v_child_level int;
  v_parent_country uuid;
  v_parent_level int;
begin
  select t.country_id, t.level into v_type_country, v_child_level
  from public.division_types t where t.id = new.type_id;

  if v_type_country is distinct from new.country_id then
    raise exception 'division type % belongs to a different country', new.type_id;
  end if;

  if new.parent_division_id is not null then
    select d.country_id, t.level into v_parent_country, v_parent_level
    from public.administrative_divisions d
    join public.division_types t on t.id = d.type_id
    where d.id = new.parent_division_id;

    if v_parent_country is distinct from new.country_id then
      raise exception 'parent division belongs to a different country';
    end if;
    if v_child_level <= v_parent_level then
      raise exception 'child level (%) must be deeper than parent level (%)', v_child_level, v_parent_level;
    end if;
  end if;

  return new;
end;
$$;

create trigger division_integrity
  before insert or update on public.administrative_divisions
  for each row execute function public.division_integrity();

-- ============ VAULTS: user-chosen division replaces IP-derived region ============
alter table public.vaults
  add column division_id uuid references public.administrative_divisions(id) on delete set null;
alter table public.vaults drop column region_code;

create index vaults_division_idx on public.vaults (division_id) where division_id is not null;

-- ============ REGION_STATS: rebuilt against divisions ============
drop function public.refresh_region_stats();
drop table public.region_stats;

-- Still the ONLY publicly readable aggregate. Display fields are denormalized
-- so the landing page needs no joins; parent/level let the globe drill down.
create table public.region_stats (
  division_id uuid primary key references public.administrative_divisions(id) on delete cascade,
  name text not null,
  country_iso3 char(3) not null,
  level int not null,
  parent_division_id uuid,
  lat double precision,
  lng double precision,
  vault_count int not null default 0,
  duo_count int not null default 0,
  circle_count int not null default 0,
  memory_count int not null default 0,
  song_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- Rollup refresh: every vault counts at its own division AND every ancestor,
-- so the globe is correct at any zoom level. Full rebuild in one transaction
-- (readers never see intermediate state; stale divisions disappear).
create or replace function public.refresh_region_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.region_stats;

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
end;
$$;

revoke execute on function public.refresh_region_stats() from public, anon, authenticated;

-- ============ RLS ============
-- countries / division_types / administrative_divisions are public REFERENCE
-- data: the location picker runs before any session exists. Read-only for
-- clients; all writes via service role (seeds/admin).
alter table public.countries                enable row level security;
alter table public.division_types           enable row level security;
alter table public.administrative_divisions enable row level security;
alter table public.region_stats             enable row level security;

revoke insert, update, delete on public.countries                from anon, authenticated;
revoke insert, update, delete on public.division_types           from anon, authenticated;
revoke insert, update, delete on public.administrative_divisions from anon, authenticated;
revoke insert, update, delete on public.region_stats             from anon, authenticated;

create policy "countries are public reference data"
  on public.countries for select to anon, authenticated using (true);

create policy "division types are public reference data"
  on public.division_types for select to anon, authenticated using (true);

create policy "divisions are public reference data"
  on public.administrative_divisions for select to anon, authenticated using (is_active);

create policy "region stats are public"
  on public.region_stats for select to anon, authenticated using (true);
