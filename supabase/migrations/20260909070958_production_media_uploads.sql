-- Direct-to-Storage song uploads avoid the Vercel Function request-body cap.
-- Intents are private, short-lived reservations. Only the service role can
-- reserve or finalize them after the Next.js API authenticates a live member.

create table public.media_upload_intents (
  id uuid primary key,
  vault_id uuid not null references public.vaults(id) on delete cascade,
  member_id uuid not null,
  bucket text not null default 'music' check (bucket = 'music'),
  object_key text not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  declared_bytes bigint not null check (declared_bytes between 1 and 15728640),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  song_id uuid unique references public.songs(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  completed_at timestamptz,
  constraint media_upload_intents_member_same_vault_fk
    foreign key (member_id, vault_id)
    references public.members(id, vault_id),
  constraint media_upload_intents_object_key_check
    check (object_key = vault_id::text || '/' || id::text || '.mp3'),
  constraint media_upload_intents_completion_check
    check (
      (status = 'pending' and song_id is null and completed_at is null)
      or (status = 'completed' and song_id is not null and completed_at is not null)
    )
);

create index media_upload_intents_pending_vault_idx
  on public.media_upload_intents (vault_id, expires_at)
  where status = 'pending';

create index media_upload_intents_pending_cleanup_idx
  on public.media_upload_intents (expires_at, created_at)
  where status = 'pending';

alter table public.media_upload_intents enable row level security;
alter table public.media_upload_intents force row level security;
revoke all on public.media_upload_intents from public, anon, authenticated;
grant select, insert, update, delete on public.media_upload_intents to service_role;

create or replace function public.reserve_song_upload(
  p_intent_id uuid,
  p_vault_id uuid,
  p_member_id uuid,
  p_title text,
  p_declared_bytes bigint
)
returns public.media_upload_intents
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  reserved_intent public.media_upload_intents;
  active_upload_count integer;
begin
  if p_intent_id is null or p_vault_id is null or p_member_id is null then
    raise exception using errcode = '22023', message = 'invalid_upload_intent';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'invalid_song_title';
  end if;
  if p_declared_bytes not between 1 and 15728640 then
    raise exception using errcode = '22023', message = 'invalid_song_size';
  end if;
  if not exists (
    select 1
    from public.members m
    where m.id = p_member_id
      and m.vault_id = p_vault_id
      and m.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'membership_unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('baul:song-upload:' || p_vault_id::text, 0));

  select
    (select count(*) from public.songs s
      where s.vault_id = p_vault_id and s.file_url is not null)
    +
    (select count(*) from public.media_upload_intents i
      where i.vault_id = p_vault_id
        and i.status = 'pending'
        and i.expires_at > now())
  into active_upload_count;

  if active_upload_count >= 10 then
    raise exception using errcode = 'P0001', message = 'song_storage_limit_reached';
  end if;

  insert into public.media_upload_intents (
    id, vault_id, member_id, object_key, title, declared_bytes
  ) values (
    p_intent_id,
    p_vault_id,
    p_member_id,
    p_vault_id::text || '/' || p_intent_id::text || '.mp3',
    btrim(p_title),
    p_declared_bytes
  )
  returning * into reserved_intent;

  return reserved_intent;
end
$$;

revoke all on function public.reserve_song_upload(uuid, uuid, uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.reserve_song_upload(uuid, uuid, uuid, text, bigint)
  to service_role;

create or replace function public.complete_song_upload(
  p_intent_id uuid,
  p_member_id uuid
)
returns public.songs
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  selected_intent public.media_upload_intents;
  completed_song public.songs;
begin
  select * into selected_intent
  from public.media_upload_intents i
  where i.id = p_intent_id
    and i.member_id = p_member_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'upload_intent_not_found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('baul:song-upload:' || selected_intent.vault_id::text, 0)
  );

  -- Re-read after taking the per-vault lock so concurrent completion requests
  -- observe the same terminal state.
  select * into selected_intent
  from public.media_upload_intents i
  where i.id = p_intent_id
    and i.member_id = p_member_id;

  if selected_intent.status = 'completed' and selected_intent.song_id is not null then
    select * into completed_song
    from public.songs s
    where s.id = selected_intent.song_id;
    return completed_song;
  end if;

  if selected_intent.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'upload_intent_expired';
  end if;

  if not exists (
    select 1
    from public.members m
    where m.id = selected_intent.member_id
      and m.vault_id = selected_intent.vault_id
      and m.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'membership_unavailable';
  end if;

  insert into public.songs (id, vault_id, added_by, title, file_url)
  values (
    selected_intent.id,
    selected_intent.vault_id,
    selected_intent.member_id,
    selected_intent.title,
    'music/' || selected_intent.object_key
  )
  returning * into completed_song;

  update public.media_upload_intents
  set status = 'completed', song_id = completed_song.id, completed_at = now()
  where id = selected_intent.id;

  return completed_song;
end
$$;

revoke all on function public.complete_song_upload(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_song_upload(uuid, uuid)
  to service_role;

-- The free-tier cleanup worker is a scheduled Supabase Edge Function. The
-- function URL and secret are environment-specific, so the schedule itself is
-- configured after deployment rather than embedded in migration history.
create extension if not exists pg_net with schema extensions;
