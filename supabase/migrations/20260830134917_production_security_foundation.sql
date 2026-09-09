-- Baul production security foundation.
-- This migration is intentionally additive: legacy JWT helper functions remain
-- available during the application dual-read window, but no policy relies on
-- cached app_metadata after this migration is applied.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated, service_role;

alter default privileges in schema private revoke execute on functions from public;

alter table public.members
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.members(id) on delete set null;

alter table public.vaults
  add column if not exists milestone_date date,
  add column if not exists recovery_email_confirmed_at timestamptz;

create index if not exists members_active_user_vault_idx
  on public.members (user_id, vault_id)
  where revoked_at is null;

create index if not exists members_vault_active_idx
  on public.members (vault_id, joined_at)
  where revoked_at is null;

create table if not exists public.membership_events (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  subject_member_id uuid,
  actor_member_id uuid,
  event_type text not null check (
    event_type in ('joined', 'reclaimed', 'revoked', 'reactivated', 'key_rotated')
  ),
  previous_user_id uuid,
  new_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists membership_events_vault_created_idx
  on public.membership_events (vault_id, created_at desc);

alter table public.membership_events enable row level security;
revoke all on public.membership_events from anon, authenticated;

create or replace function private.current_member_id(target_vault_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.members m
  where m.vault_id = target_vault_id
    and m.user_id = (select auth.uid())
    and m.revoked_at is null
  limit 1
$$;

create or replace function private.is_active_member(target_vault_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_member_id(target_vault_id) is not null
$$;

create or replace function private.is_active_admin(target_vault_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.id = private.current_member_id(target_vault_id)
      and m.vault_id = target_vault_id
      and m.role = 'admin'
      and m.revoked_at is null
  )
$$;

revoke all on function private.current_member_id(uuid) from public, anon;
revoke all on function private.is_active_member(uuid) from public, anon;
revoke all on function private.is_active_admin(uuid) from public, anon;
grant execute on function private.current_member_id(uuid) to authenticated, service_role;
grant execute on function private.is_active_member(uuid) to authenticated, service_role;
grant execute on function private.is_active_admin(uuid) to authenticated, service_role;

-- Replace claim-based policies with live membership checks. Revocation and
-- reclaim now take effect on the next statement, even with an old access token.
drop policy if exists "members read own vault" on public.vaults;
create policy "active members read own vault"
  on public.vaults for select to authenticated
  using (private.is_active_member(id));

drop policy if exists "members read vault members" on public.members;
create policy "active members read vault members"
  on public.members for select to authenticated
  using (private.is_active_member(vault_id));

drop policy if exists "read unlocked vault memories" on public.memories;
create policy "active members read unlocked memories"
  on public.memories for select to authenticated
  using (
    private.is_active_member(vault_id)
    and (unlock_at is null or unlock_at <= now())
  );

drop policy if exists "add own memory" on public.memories;
create policy "active members add own memory"
  on public.memories for insert to authenticated
  with check (
    private.is_active_member(vault_id)
    and member_id = private.current_member_id(vault_id)
    and kind in ('note', 'letter')
  );

drop policy if exists "delete own memory or admin" on public.memories;
create policy "active members delete own memory or admin"
  on public.memories for delete to authenticated
  using (
    private.is_active_member(vault_id)
    and (
      member_id = private.current_member_id(vault_id)
      or private.is_active_admin(vault_id)
    )
  );

drop policy if exists "read vault messages" on public.messages;
create policy "active members read vault messages"
  on public.messages for select to authenticated
  using (private.is_active_member(vault_id));

drop policy if exists "send own message" on public.messages;
create policy "active members send own message"
  on public.messages for insert to authenticated
  with check (
    private.is_active_member(vault_id)
    and member_id = private.current_member_id(vault_id)
  );

drop policy if exists "delete own message or admin" on public.messages;
create policy "active members delete own message or admin"
  on public.messages for delete to authenticated
  using (
    private.is_active_member(vault_id)
    and (
      member_id = private.current_member_id(vault_id)
      or private.is_active_admin(vault_id)
    )
  );

drop policy if exists "read vault songs" on public.songs;
create policy "active members read vault songs"
  on public.songs for select to authenticated
  using (private.is_active_member(vault_id));

drop policy if exists "add own song" on public.songs;
create policy "active members add own song"
  on public.songs for insert to authenticated
  with check (
    private.is_active_member(vault_id)
    and added_by = private.current_member_id(vault_id)
    and file_url is null
  );

drop policy if exists "any member removes songs" on public.songs;
create policy "active members remove songs"
  on public.songs for delete to authenticated
  using (private.is_active_member(vault_id));

drop policy if exists "read vault reactions" on public.reactions;
create policy "active members read vault reactions"
  on public.reactions for select to authenticated
  using (exists (
    select 1
    from public.memories mem
    where mem.id = memory_id
      and private.is_active_member(mem.vault_id)
      and (mem.unlock_at is null or mem.unlock_at <= now())
  ));

drop policy if exists "react as self" on public.reactions;
create policy "active members react as self"
  on public.reactions for insert to authenticated
  with check (exists (
    select 1
    from public.memories mem
    where mem.id = memory_id
      and private.is_active_member(mem.vault_id)
      and member_id = private.current_member_id(mem.vault_id)
      and (mem.unlock_at is null or mem.unlock_at <= now())
  ));

drop policy if exists "remove own reaction" on public.reactions;
create policy "active members remove own reaction"
  on public.reactions for delete to authenticated
  using (exists (
    select 1
    from public.memories mem
    where mem.id = memory_id
      and private.is_active_member(mem.vault_id)
      and member_id = private.current_member_id(mem.vault_id)
  ));

drop policy if exists "read vault replies" on public.memory_replies;
create policy "active members read vault replies"
  on public.memory_replies for select to authenticated
  using (exists (
    select 1
    from public.memories mem
    where mem.id = memory_id
      and private.is_active_member(mem.vault_id)
      and (mem.unlock_at is null or mem.unlock_at <= now())
  ));

drop policy if exists "reply as self" on public.memory_replies;
create policy "active members reply as self"
  on public.memory_replies for insert to authenticated
  with check (exists (
    select 1
    from public.memories mem
    where mem.id = memory_id
      and private.is_active_member(mem.vault_id)
      and member_id = private.current_member_id(mem.vault_id)
      and (mem.unlock_at is null or mem.unlock_at <= now())
  ));

drop policy if exists "delete own reply or admin" on public.memory_replies;
create policy "active members delete own reply or admin"
  on public.memory_replies for delete to authenticated
  using (exists (
    select 1
    from public.memories mem
    where mem.id = memory_id
      and private.is_active_member(mem.vault_id)
      and (
        member_id = private.current_member_id(mem.vault_id)
        or private.is_active_admin(mem.vault_id)
      )
  ));

-- Keep secret columns out of browser queries. Member user ids and revocation
-- actor ids are also server-only; attribution remains through stable member ids.
revoke all on public.vaults from anon, authenticated;
grant select (id, name, vault_type, purpose, max_members, milestone_date, created_at)
  on public.vaults to authenticated;

revoke all on public.members from anon, authenticated;
grant select (
  id, vault_id, display_name, name_changed_at, avatar_url, avatar_color,
  role, joined_at, revoked_at
) on public.members to authenticated;

revoke all on public.memories from anon, authenticated;
grant select, insert, delete on public.memories to authenticated;
revoke all on public.messages from anon, authenticated;
grant select, insert, delete on public.messages to authenticated;
revoke all on public.songs from anon, authenticated;
grant select, insert, delete on public.songs to authenticated;
revoke all on public.reactions from anon, authenticated;
grant select, insert, delete on public.reactions to authenticated;
revoke all on public.memory_replies from anon, authenticated;
grant select, insert, delete on public.memory_replies to authenticated;

-- Basic limits are installed NOT VALID so existing data remains deployable;
-- Postgres still enforces them for every newly inserted or updated row.
alter table public.vaults
  add constraint vaults_name_length_check
  check (char_length(btrim(name)) between 1 and 80) not valid;

alter table public.members
  add constraint members_display_name_length_check
  check (char_length(btrim(display_name)) between 1 and 40) not valid;

alter table public.memories
  add constraint memories_content_length_check
  check (content is null or char_length(content) <= 20000) not valid;

alter table public.messages
  add constraint messages_body_length_check
  check (char_length(body) between 1 and 2000) not valid;

alter table public.memory_replies
  add constraint memory_replies_body_length_check
  check (char_length(body) between 1 and 2000) not valid;

alter table public.songs
  add constraint songs_title_length_check
  check (char_length(btrim(title)) between 1 and 120) not valid;

-- Service-role-only transactional membership mutation. The vault row lock makes
-- capacity checks and first-admin assignment race-safe.
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

create or replace function public.rebind_vault_member(
  p_member_id uuid,
  p_user_id uuid
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
  selected_member public.members%rowtype;
  selected_vault public.vaults%rowtype;
  old_user_id uuid;
begin
  select m.* into selected_member
  from public.members m
  where m.id = p_member_id
  for update;

  if not found or selected_member.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'membership_unavailable';
  end if;

  old_user_id := selected_member.user_id;

  update public.members m
  set user_id = p_user_id
  where m.id = p_member_id
  returning * into selected_member;

  select v.* into selected_vault
  from public.vaults v
  where v.id = selected_member.vault_id;

  insert into public.membership_events (
    vault_id, subject_member_id, event_type, previous_user_id, new_user_id
  ) values (
    selected_member.vault_id, selected_member.id, 'reclaimed', old_user_id, p_user_id
  );

  return query select selected_member.id, selected_vault.id, selected_vault.name,
    selected_vault.vault_type, selected_member.role;
end
$$;

create or replace function public.revoke_vault_member(
  p_vault_id uuid,
  p_actor_member_id uuid,
  p_subject_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.members%rowtype;
  subject public.members%rowtype;
  active_admin_count integer;
begin
  select m.* into actor from public.members m
  where m.id = p_actor_member_id and m.vault_id = p_vault_id
  for update;

  if not found or actor.revoked_at is not null or actor.role <> 'admin' then
    raise exception using errcode = 'P0001', message = 'admin_required';
  end if;

  select m.* into subject from public.members m
  where m.id = p_subject_member_id and m.vault_id = p_vault_id
  for update;

  if not found or subject.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'membership_unavailable';
  end if;

  if actor.id = subject.id then
    raise exception using errcode = 'P0001', message = 'cannot_revoke_self';
  end if;

  if subject.role = 'admin' then
    select count(*)::integer into active_admin_count
    from public.members m
    where m.vault_id = p_vault_id and m.role = 'admin' and m.revoked_at is null;
    if active_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'last_admin';
    end if;
  end if;

  update public.members m
  set revoked_at = now(), revoked_by = actor.id
  where m.id = subject.id;

  insert into public.membership_events (
    vault_id, subject_member_id, actor_member_id, event_type, previous_user_id
  ) values (
    p_vault_id, subject.id, actor.id, 'revoked', subject.user_id
  );
end
$$;

revoke all on function public.join_vault_member(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.rebind_vault_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_vault_member(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.join_vault_member(uuid, uuid, text, text, text) to service_role;
grant execute on function public.rebind_vault_member(uuid, uuid) to service_role;
grant execute on function public.revoke_vault_member(uuid, uuid, uuid) to service_role;
