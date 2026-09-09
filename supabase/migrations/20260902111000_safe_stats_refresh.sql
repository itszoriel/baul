-- Supabase secret keys enforce safe-update semantics for RPC calls. Keep the
-- complete aggregate rebuild, but qualify each full-table delete with its
-- non-null primary key so the Vercel fallback and database cron behave alike.

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
