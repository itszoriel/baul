-- Capsule payload isolation, tenant-consistency constraints, and retryable
-- storage cleanup. Existing rows are preserved and backfilled in place.

create table public.memory_capsule_payloads (
  memory_id uuid primary key references public.memories(id) on delete cascade,
  vault_id uuid not null references public.vaults(id) on delete cascade,
  content text not null check (char_length(content) <= 20000),
  unlock_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index memory_capsule_payloads_unlock_idx
  on public.memory_capsule_payloads (vault_id, unlock_at);

alter table public.memory_capsule_payloads enable row level security;
revoke all on public.memory_capsule_payloads from anon, authenticated;
grant select on public.memory_capsule_payloads to authenticated;

create policy "active members read unlocked capsule payloads"
  on public.memory_capsule_payloads for select to authenticated
  using (
    private.is_active_member(vault_id)
    and unlock_at <= now()
  );

insert into public.memory_capsule_payloads (memory_id, vault_id, content, unlock_at, created_at)
select m.id, m.vault_id, m.content, m.unlock_at, m.created_at
from public.memories m
where m.unlock_at > now() and m.content is not null
on conflict (memory_id) do nothing;

update public.memories m
set content = null
where m.unlock_at > now()
  and exists (
    select 1 from public.memory_capsule_payloads p where p.memory_id = m.id
  );

drop policy if exists "active members read unlocked memories" on public.memories;
create policy "active members read memory envelopes"
  on public.memories for select to authenticated
  using (private.is_active_member(vault_id));

drop policy if exists "active members add own memory" on public.memories;
create policy "active members add own unsealed memory"
  on public.memories for insert to authenticated
  with check (
    private.is_active_member(vault_id)
    and member_id = private.current_member_id(vault_id)
    and kind in ('note', 'letter')
    and unlock_at is null
  );

create or replace function public.create_memory_entry(
  p_vault_id uuid,
  p_member_id uuid,
  p_kind text,
  p_content text,
  p_unlock_at timestamptz default null,
  p_song_id uuid default null
)
returns public.memories
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_memory public.memories%rowtype;
begin
  if p_kind not in ('note', 'letter') then
    raise exception using errcode = '22023', message = 'invalid_memory_kind';
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = p_member_id
      and m.vault_id = p_vault_id
      and m.revoked_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'membership_unavailable';
  end if;

  if p_song_id is not null and not exists (
    select 1 from public.songs s where s.id = p_song_id and s.vault_id = p_vault_id
  ) then
    raise exception using errcode = '23503', message = 'song_outside_vault';
  end if;

  if p_unlock_at is not null and p_unlock_at > now() then
    insert into public.memories (vault_id, member_id, kind, content, unlock_at, song_id)
    values (p_vault_id, p_member_id, 'letter', null, p_unlock_at, p_song_id)
    returning * into created_memory;

    insert into public.memory_capsule_payloads (memory_id, vault_id, content, unlock_at)
    values (created_memory.id, p_vault_id, coalesce(p_content, ''), p_unlock_at);
  else
    insert into public.memories (vault_id, member_id, kind, content, unlock_at, song_id)
    values (p_vault_id, p_member_id, p_kind, p_content, null, p_song_id)
    returning * into created_memory;
  end if;

  return created_memory;
end
$$;

revoke all on function public.create_memory_entry(uuid, uuid, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.create_memory_entry(uuid, uuid, text, text, timestamptz, uuid)
  to service_role;

-- Add explicit tenant columns to child tables whose original schema only
-- referenced a memory/member id. The trigger fills them for existing clients.
alter table public.reactions add column vault_id uuid;
alter table public.memory_replies add column vault_id uuid;

update public.reactions r
set vault_id = m.vault_id
from public.memories m
where m.id = r.memory_id and r.vault_id is null;

update public.memory_replies r
set vault_id = m.vault_id
from public.memories m
where m.id = r.memory_id and r.vault_id is null;

alter table public.reactions alter column vault_id set not null;
alter table public.memory_replies alter column vault_id set not null;

alter table public.members
  add constraint members_id_vault_unique unique (id, vault_id);
alter table public.songs
  add constraint songs_id_vault_unique unique (id, vault_id);
alter table public.memories
  add constraint memories_id_vault_unique unique (id, vault_id);

alter table public.memories
  add constraint memories_member_same_vault_fk
  foreign key (member_id, vault_id)
  references public.members(id, vault_id) not valid;

alter table public.memories
  add constraint memories_song_same_vault_fk
  foreign key (song_id, vault_id)
  references public.songs(id, vault_id) not valid;

alter table public.messages
  add constraint messages_member_same_vault_fk
  foreign key (member_id, vault_id)
  references public.members(id, vault_id) not valid;

alter table public.reactions
  add constraint reactions_memory_same_vault_fk
  foreign key (memory_id, vault_id)
  references public.memories(id, vault_id) on delete cascade not valid,
  add constraint reactions_member_same_vault_fk
  foreign key (member_id, vault_id)
  references public.members(id, vault_id) not valid;

alter table public.memory_replies
  add constraint memory_replies_memory_same_vault_fk
  foreign key (memory_id, vault_id)
  references public.memories(id, vault_id) on delete cascade not valid,
  add constraint memory_replies_member_same_vault_fk
  foreign key (member_id, vault_id)
  references public.members(id, vault_id) not valid;

alter table public.memory_capsule_payloads
  add constraint capsule_memory_same_vault_fk
  foreign key (memory_id, vault_id)
  references public.memories(id, vault_id) on delete cascade not valid;

create or replace function private.set_memory_child_vault_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_vault_id uuid;
begin
  select m.vault_id into parent_vault_id
  from public.memories m
  where m.id = new.memory_id;

  if parent_vault_id is null then
    raise exception using errcode = '23503', message = 'memory_not_found';
  end if;

  new.vault_id := parent_vault_id;
  return new;
end
$$;

revoke all on function private.set_memory_child_vault_id() from public, anon, authenticated;

create trigger reactions_set_vault_id
before insert or update of memory_id on public.reactions
for each row execute function private.set_memory_child_vault_id();

create trigger memory_replies_set_vault_id
before insert or update of memory_id on public.memory_replies
for each row execute function private.set_memory_child_vault_id();

create index reactions_vault_memory_idx on public.reactions (vault_id, memory_id);
create index memory_replies_vault_memory_idx on public.memory_replies (vault_id, memory_id, created_at);
create index memories_member_vault_idx on public.memories (member_id, vault_id);
create index memories_song_vault_idx on public.memories (song_id, vault_id) where song_id is not null;
create index messages_member_vault_idx on public.messages (member_id, vault_id);

-- Application/domain integrity checks. NOT VALID preserves unusual legacy rows
-- while enforcing every new write during the rollout.
alter table public.reactions
  add constraint reactions_emoji_allowlist_check
  check (emoji in ('❤️', '🥺', '🔥', '😂', '✨')) not valid;

alter table public.songs
  add constraint songs_exactly_one_source_check
  check ((source_url is null) <> (file_url is null)) not valid,
  add constraint songs_source_url_check
  check (
    source_url is null or (
      char_length(source_url) <= 2048
      and source_url ~* '^https://'
      and (
        source_url ~* '^https://([^/]+\\.)?(youtube\\.com|youtu\\.be)/'
        or source_url ~* '\\.(mp3|m4a|aac|ogg|opus|wav|flac)(\\?.*)?$'
      )
    )
  ) not valid,
  add constraint songs_file_path_check
  check (
    file_url is null or file_url ~ '^music/[0-9a-f-]{36}/[0-9a-f-]{36}\\.mp3$'
  ) not valid;

alter table public.memories
  add constraint memories_media_path_check
  check (
    media_url is null
    or media_url ~ '^(photos/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp|avatars/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp|music/[0-9a-f-]{36}/[0-9a-f-]{36}\\.mp3)$'
  ) not valid;

alter table public.members
  add constraint members_avatar_path_check
  check (
    avatar_url is null or avatar_url ~ '^avatars/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$'
  ) not valid,
  add constraint members_avatar_color_check
  check (avatar_color ~ '^#[0-9A-Fa-f]{6}$') not valid;

create table public.storage_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('avatars', 'photos', 'music')),
  object_key text not null check (char_length(object_key) between 3 and 500),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create unique index storage_cleanup_pending_object_idx
  on public.storage_cleanup_queue (bucket, object_key)
  where processed_at is null;
create index storage_cleanup_available_idx
  on public.storage_cleanup_queue (available_at, created_at)
  where processed_at is null;

alter table public.storage_cleanup_queue enable row level security;
revoke all on public.storage_cleanup_queue from anon, authenticated;

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
  else
    stored_path := old.avatar_url;
  end if;

  if stored_path is null then
    return old;
  end if;

  stored_bucket := split_part(stored_path, '/', 1);
  stored_key := substring(stored_path from position('/' in stored_path) + 1);

  if stored_bucket in ('avatars', 'photos', 'music') and stored_key <> '' then
    insert into public.storage_cleanup_queue (bucket, object_key)
    values (stored_bucket, stored_key)
    on conflict (bucket, object_key) where processed_at is null do nothing;
  end if;

  return old;
end
$$;

revoke all on function private.enqueue_deleted_media() from public, anon, authenticated;

create trigger memories_queue_storage_cleanup
after delete on public.memories
for each row execute function private.enqueue_deleted_media();

create trigger songs_queue_storage_cleanup
after delete on public.songs
for each row execute function private.enqueue_deleted_media();

create trigger members_queue_avatar_cleanup
after delete on public.members
for each row execute function private.enqueue_deleted_media();

-- Keep RLS checks on child rows aligned with the explicit tenant columns.
drop policy if exists "active members read vault reactions" on public.reactions;
create policy "active members read vault reactions"
  on public.reactions for select to authenticated
  using (
    private.is_active_member(vault_id)
    and exists (
      select 1 from public.memories mem
      where mem.id = memory_id
        and mem.vault_id = reactions.vault_id
        and (mem.unlock_at is null or mem.unlock_at <= now())
    )
  );

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
  );

drop policy if exists "active members remove own reaction" on public.reactions;
create policy "active members remove own reaction"
  on public.reactions for delete to authenticated
  using (
    private.is_active_member(vault_id)
    and member_id = private.current_member_id(vault_id)
  );

drop policy if exists "active members read vault replies" on public.memory_replies;
create policy "active members read vault replies"
  on public.memory_replies for select to authenticated
  using (
    private.is_active_member(vault_id)
    and exists (
      select 1 from public.memories mem
      where mem.id = memory_id
        and mem.vault_id = memory_replies.vault_id
        and (mem.unlock_at is null or mem.unlock_at <= now())
    )
  );

drop policy if exists "active members reply as self" on public.memory_replies;
create policy "active members reply as self"
  on public.memory_replies for insert to authenticated
  with check (
    private.is_active_member(vault_id)
    and member_id = private.current_member_id(vault_id)
    and exists (
      select 1 from public.memories mem
      where mem.id = memory_id
        and mem.vault_id = memory_replies.vault_id
        and (mem.unlock_at is null or mem.unlock_at <= now())
    )
  );

drop policy if exists "active members delete own reply or admin" on public.memory_replies;
create policy "active members delete own reply or admin"
  on public.memory_replies for delete to authenticated
  using (
    private.is_active_member(vault_id)
    and (
      member_id = private.current_member_id(vault_id)
      or private.is_active_admin(vault_id)
    )
  );

-- Run VALIDATE CONSTRAINT only after the rollout audit has reviewed legacy rows.
