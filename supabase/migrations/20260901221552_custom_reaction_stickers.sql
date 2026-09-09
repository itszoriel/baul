-- Per-Baul custom reaction stickers. Uploaded files stay in a dedicated
-- private bucket; only active keepers can discover sticker metadata or use a
-- sticker on a memory in the same Baul.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stickers', 'stickers', false, 512 * 1024, array['image/webp']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.vault_stickers (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  created_by uuid,
  name text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  constraint vault_stickers_id_vault_unique unique (id, vault_id),
  constraint vault_stickers_name_length_check
    check (char_length(name) between 1 and 32),
  constraint vault_stickers_storage_path_check
    check (storage_path ~ '^stickers/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'),
  constraint vault_stickers_creator_same_vault_fk
    foreign key (created_by, vault_id)
    references public.members(id, vault_id)
    on delete set null (created_by)
);

create unique index vault_stickers_active_name_idx
  on public.vault_stickers (vault_id, lower(name))
  where retired_at is null;
create index vault_stickers_creator_vault_idx
  on public.vault_stickers (created_by, vault_id)
  where created_by is not null;
create index vault_stickers_active_vault_idx
  on public.vault_stickers (vault_id, created_at)
  where retired_at is null;

alter table public.vault_stickers enable row level security;
revoke all on public.vault_stickers from anon, authenticated;
grant select on public.vault_stickers to authenticated;
grant select, insert, update, delete on public.vault_stickers to service_role;

create policy "active members read vault stickers"
  on public.vault_stickers for select to authenticated
  using (private.is_active_member(vault_id));

-- The server calls this after placing a validated WebP in private Storage.
-- Locking the parent row makes the 50-sticker capacity safe under concurrency.
create or replace function public.create_vault_sticker(
  target_id uuid,
  target_vault_id uuid,
  target_member_id uuid,
  sticker_name text,
  target_storage_path text
)
returns public.vault_stickers
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_sticker public.vault_stickers;
begin
  perform 1
  from public.vaults v
  where v.id = target_vault_id
  for update;

  if not exists (
    select 1
    from public.members m
    where m.id = target_member_id
      and m.vault_id = target_vault_id
      and m.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'active_membership_required';
  end if;

  if (select count(*) from public.vault_stickers s
      where s.vault_id = target_vault_id and s.retired_at is null) >= 50 then
    raise exception using errcode = 'P0001', message = 'sticker_limit_reached';
  end if;

  insert into public.vault_stickers (id, vault_id, created_by, name, storage_path)
  values (target_id, target_vault_id, target_member_id, sticker_name, target_storage_path)
  returning * into created_sticker;

  return created_sticker;
end
$$;

revoke execute on function public.create_vault_sticker(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_vault_sticker(uuid, uuid, uuid, text, text)
  to service_role;

-- Existing emoji rows remain valid. A reaction now carries exactly one of a
-- built-in emoji or a custom sticker reference.
alter table public.reactions
  drop constraint reactions_memory_id_member_id_emoji_key,
  drop constraint reactions_emoji_allowlist_check,
  alter column emoji drop not null,
  add column sticker_id uuid;

alter table public.reactions
  add constraint reactions_sticker_same_vault_fk
    foreign key (sticker_id, vault_id)
    references public.vault_stickers(id, vault_id) not valid,
  add constraint reactions_kind_check
    check (
      (sticker_id is null and emoji in ('❤️', '🥺', '🔥', '😂', '✨'))
      or (sticker_id is not null and emoji is null)
    ) not valid;

create unique index reactions_unique_emoji_idx
  on public.reactions (memory_id, member_id, emoji)
  where emoji is not null;
create unique index reactions_unique_sticker_idx
  on public.reactions (memory_id, member_id, sticker_id)
  where sticker_id is not null;
create index reactions_sticker_vault_idx
  on public.reactions (sticker_id, vault_id)
  where sticker_id is not null;

alter table public.reactions validate constraint reactions_sticker_same_vault_fk;
alter table public.reactions validate constraint reactions_kind_check;

drop policy if exists "active members react as self" on public.reactions;
create policy "active members react as self"
  on public.reactions for insert to authenticated
  with check (
    private.is_active_member(vault_id)
    and member_id = private.current_member_id(vault_id)
    and exists (
      select 1 from public.memories mem
      where mem.id = memory_id
        and mem.vault_id = reactions.vault_id
        and (mem.unlock_at is null or mem.unlock_at <= now())
    )
    and (
      sticker_id is null
      or exists (
        select 1 from public.vault_stickers sticker
        where sticker.id = sticker_id
          and sticker.vault_id = reactions.vault_id
          and sticker.retired_at is null
      )
    )
  );

-- Extend the existing idempotent cleanup queue to sticker objects.
alter table public.storage_cleanup_queue
  drop constraint storage_cleanup_queue_bucket_check,
  add constraint storage_cleanup_queue_bucket_check
    check (bucket in ('avatars', 'photos', 'music', 'stickers'));

create or replace function private.enqueue_deleted_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_path text;
  stored_bucket text;
  stored_key text;
begin
  if tg_table_name = 'memories' then
    stored_path := old.media_url;
  elsif tg_table_name = 'songs' then
    stored_path := old.file_url;
  elsif tg_table_name = 'vault_stickers' then
    stored_path := old.storage_path;
  else
    stored_path := old.avatar_url;
  end if;

  if stored_path is null then
    return old;
  end if;

  stored_bucket := split_part(stored_path, '/', 1);
  stored_key := substring(stored_path from position('/' in stored_path) + 1);

  if stored_bucket in ('avatars', 'photos', 'music', 'stickers') and stored_key <> '' then
    insert into public.storage_cleanup_queue (bucket, object_key)
    values (stored_bucket, stored_key)
    on conflict (bucket, object_key) where processed_at is null do nothing;
  end if;

  return old;
end
$$;

revoke all on function private.enqueue_deleted_media() from public, anon, authenticated;

create trigger vault_stickers_queue_storage_cleanup
after delete on public.vault_stickers
for each row execute function private.enqueue_deleted_media();

alter table public.vault_stickers replica identity full;
alter publication supabase_realtime add table public.vault_stickers;
