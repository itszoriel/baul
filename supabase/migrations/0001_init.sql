-- ============================================================================
-- Baul — initial schema
-- Terminology: `vault` in code/SQL, "baul" only in human-visible copy.
--
-- Additions beyond the spec schema (each required to make the spec's security
-- model implementable):
--   vaults.key_lookup          sha256 of the full key. bcrypt hashes are salted
--                              and cannot be searched, so an O(1) lookup column
--                              is required to find the vault a key belongs to.
--                              Keys are >=112 bits of entropy, so an unsalted
--                              sha256 preimage is computationally infeasible.
--   vaults.recovery_email_enc  per spec (AES-256-GCM, encrypted app-side).
--   vaults.recovery_email_hash HMAC-SHA256 blind index so "I lost my key" can
--                              find vaults by email without storing plaintext.
--   members.user_id            the Supabase anonymous-auth user bound to this
--                              member, so returning members skip the join flow.
--   region_stats.song_count    powers the "N songs playing somewhere" counter.
-- ============================================================================

-- ============ VAULTS ============
create table public.vaults (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null,               -- bcrypt hash. NEVER the raw key
  key_lookup text not null unique,      -- sha256(raw key) for O(1) lookup
  vault_type text not null check (vault_type in ('intimate','circle')),
  purpose text not null check (purpose in ('romance','friends','family','team','other')),
  max_members int not null check (max_members between 2 and 50),
  recovery_email_enc text,              -- AES-256-GCM, encrypted app-side, nullable
  recovery_email_hash text,             -- HMAC-SHA256 blind index for recovery lookup
  region_code text,                     -- coarse region only (e.g. 'PH-BAN'), null if opted out
  created_at timestamptz not null default now()
);

create index vaults_recovery_email_hash_idx on public.vaults (recovery_email_hash)
  where recovery_email_hash is not null;

-- ============ MEMBERS ============
create table public.members (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  user_id uuid not null,                -- supabase auth user (anonymous sign-in)
  display_name text not null,
  name_changed_at timestamptz,          -- null until first EDIT (initial set doesn't count)
  avatar_url text,                      -- storage path; null = use fallback
  avatar_color text not null,           -- auto-assigned at join
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  unique (vault_id, display_name),      -- names unique within a vault
  unique (vault_id, user_id)            -- one member row per auth user per vault
);

create index members_vault_idx on public.members (vault_id);
create index members_user_idx on public.members (user_id);

-- ============ SONGS ============
create table public.songs (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  added_by uuid not null references public.members(id) on delete cascade,
  title text not null,
  source_url text,                      -- external link (if pasted)
  file_url text,                        -- storage path (if uploaded mp3)
  created_at timestamptz not null default now()
);

create index songs_vault_idx on public.songs (vault_id, created_at);

-- ============ MEMORIES ============
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null check (kind in ('note','photo','letter','voice')),
  content text,                         -- note/letter text or photo caption
  media_url text,                       -- storage path for photo/voice
  song_id uuid references public.songs(id) on delete set null,
  unlock_at timestamptz,                -- time capsule: hidden until this date
  created_at timestamptz not null default now()
);

create index memories_vault_idx on public.memories (vault_id, created_at desc);

-- ============ MESSAGES (chat) ============
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_vault_idx on public.messages (vault_id, created_at);

-- ============ REACTIONS ============
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  emoji text not null,
  unique (memory_id, member_id, emoji)
);

create index reactions_memory_idx on public.reactions (memory_id);

-- ============ REPLIES (threads under memories) ============
create table public.memory_replies (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index memory_replies_memory_idx on public.memory_replies (memory_id, created_at);

-- ============ GLOBE STATS (public, aggregate-only) ============
create table public.region_stats (
  region_code text primary key,
  vault_count int not null default 0,
  duo_count int not null default 0,
  circle_count int not null default 0,
  memory_count int not null default 0,
  song_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- JWT claim helpers
-- Claims live in app_metadata (server-controlled via the admin API — never in
-- user_metadata, which users can edit themselves).
-- ============================================================================
create or replace function public.auth_vault_id()
returns uuid
language sql stable
as $$
  select nullif(coalesce(auth.jwt() -> 'app_metadata' ->> 'vault_id', ''), '')::uuid
$$;

create or replace function public.auth_member_id()
returns uuid
language sql stable
as $$
  select nullif(coalesce(auth.jwt() -> 'app_metadata' ->> 'member_id', ''), '')::uuid
$$;

create or replace function public.auth_is_admin()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.members m
    where m.id = public.auth_member_id()
      and m.vault_id = public.auth_vault_id()
      and m.role = 'admin'
  )
$$;

-- ============================================================================
-- Row Level Security
-- Pattern: a request may only touch rows in the vault named by its JWT claim.
-- Writes that need server-side rules (key hashing, rename cooldown, uploads,
-- membership) go through API routes using the service role and have NO client
-- policies at all.
-- ============================================================================
alter table public.vaults         enable row level security;
alter table public.members        enable row level security;
alter table public.memories       enable row level security;
alter table public.messages      enable row level security;
alter table public.songs          enable row level security;
alter table public.reactions      enable row level security;
alter table public.memory_replies enable row level security;
alter table public.region_stats   enable row level security;

-- --- vaults: members may read their own vault's public fields only.
-- Column-level grant keeps key_hash / key_lookup / recovery columns unreadable
-- even for vault members. Clients must select columns explicitly (no `*`).
revoke all on public.vaults from anon, authenticated;
grant select (id, name, vault_type, purpose, max_members, created_at)
  on public.vaults to authenticated;

create policy "members read own vault"
  on public.vaults for select
  to authenticated
  using (id = public.auth_vault_id());

-- --- members: readable within the vault; all writes via service role.
create policy "members read vault members"
  on public.members for select
  to authenticated
  using (vault_id = public.auth_vault_id());

-- --- memories: vault-scoped. Time capsules stay hidden until unlock_at,
--     except from their author.
create policy "read unlocked vault memories"
  on public.memories for select
  to authenticated
  using (
    vault_id = public.auth_vault_id()
    and (unlock_at is null or unlock_at <= now() or member_id = public.auth_member_id())
  );

create policy "add own memory"
  on public.memories for insert
  to authenticated
  with check (
    vault_id = public.auth_vault_id()
    and member_id = public.auth_member_id()
    and kind in ('note','letter')  -- photo/voice rows are created by the upload API after validation
  );

create policy "delete own memory or admin"
  on public.memories for delete
  to authenticated
  using (
    vault_id = public.auth_vault_id()
    and (member_id = public.auth_member_id() or public.auth_is_admin())
  );

-- --- messages
create policy "read vault messages"
  on public.messages for select
  to authenticated
  using (vault_id = public.auth_vault_id());

create policy "send own message"
  on public.messages for insert
  to authenticated
  with check (vault_id = public.auth_vault_id() and member_id = public.auth_member_id());

create policy "delete own message or admin"
  on public.messages for delete
  to authenticated
  using (
    vault_id = public.auth_vault_id()
    and (member_id = public.auth_member_id() or public.auth_is_admin())
  );

-- --- songs: any vault member can add and remove (per spec 2.3).
create policy "read vault songs"
  on public.songs for select
  to authenticated
  using (vault_id = public.auth_vault_id());

create policy "add own song"
  on public.songs for insert
  to authenticated
  with check (
    vault_id = public.auth_vault_id()
    and added_by = public.auth_member_id()
    and file_url is null  -- uploaded files go through the upload API
  );

create policy "any member removes songs"
  on public.songs for delete
  to authenticated
  using (vault_id = public.auth_vault_id());

-- --- reactions: scoped through the parent memory's vault.
create policy "read vault reactions"
  on public.reactions for select
  to authenticated
  using (exists (
    select 1 from public.memories mem
    where mem.id = memory_id and mem.vault_id = public.auth_vault_id()
  ));

create policy "react as self"
  on public.reactions for insert
  to authenticated
  with check (
    member_id = public.auth_member_id()
    and exists (
      select 1 from public.memories mem
      where mem.id = memory_id and mem.vault_id = public.auth_vault_id()
    )
  );

create policy "remove own reaction"
  on public.reactions for delete
  to authenticated
  using (member_id = public.auth_member_id());

-- --- memory_replies
create policy "read vault replies"
  on public.memory_replies for select
  to authenticated
  using (exists (
    select 1 from public.memories mem
    where mem.id = memory_id and mem.vault_id = public.auth_vault_id()
  ));

create policy "reply as self"
  on public.memory_replies for insert
  to authenticated
  with check (
    member_id = public.auth_member_id()
    and exists (
      select 1 from public.memories mem
      where mem.id = memory_id and mem.vault_id = public.auth_vault_id()
    )
  );

create policy "delete own reply or admin"
  on public.memory_replies for delete
  to authenticated
  using (member_id = public.auth_member_id() or public.auth_is_admin());

-- --- region_stats: the ONLY publicly readable table (aggregates, no vault rows).
create policy "region stats are public"
  on public.region_stats for select
  to anon, authenticated
  using (true);

-- ============================================================================
-- Realtime
-- ============================================================================
alter table public.messages       replica identity full;
alter table public.memories       replica identity full;
alter table public.memory_replies replica identity full;
alter table public.reactions      replica identity full;
alter table public.songs          replica identity full;

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.memories;
alter publication supabase_realtime add table public.memory_replies;
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.songs;

-- ============================================================================
-- Storage buckets — all PRIVATE. Clients never touch storage directly; every
-- upload and signed URL goes through the API (service role), so no storage
-- RLS policies are granted here.
-- ============================================================================
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', false),
  ('photos',  'photos',  false),
  ('music',   'music',   false)
on conflict (id) do nothing;

-- ============================================================================
-- Globe aggregation. SECURITY DEFINER so it can read vaults past RLS; EXECUTE
-- is revoked from client roles — only the service role (cron route) or pg_cron
-- may call it.
-- ============================================================================
create or replace function public.refresh_region_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into region_stats as rs
    (region_code, vault_count, duo_count, circle_count, memory_count, song_count, updated_at)
  select
    v.region_code,
    count(*)::int,
    (count(*) filter (where v.vault_type = 'intimate'))::int,
    (count(*) filter (where v.vault_type = 'circle'))::int,
    coalesce(sum(mc.n), 0)::int,
    coalesce(sum(sc.n), 0)::int,
    now()
  from vaults v
  left join (select vault_id, count(*) n from memories group by vault_id) mc on mc.vault_id = v.id
  left join (select vault_id, count(*) n from songs    group by vault_id) sc on sc.vault_id = v.id
  where v.region_code is not null
  group by v.region_code
  on conflict (region_code) do update set
    vault_count  = excluded.vault_count,
    duo_count    = excluded.duo_count,
    circle_count = excluded.circle_count,
    memory_count = excluded.memory_count,
    song_count   = excluded.song_count,
    updated_at   = excluded.updated_at;
end;
$$;

revoke execute on function public.refresh_region_stats() from public, anon, authenticated;

-- To refresh on a schedule inside Supabase (alternative to the Vercel cron
-- route at /api/cron/refresh-stats), enable the pg_cron extension and run:
--   select cron.schedule('refresh-region-stats', '*/10 * * * *',
--     $$select public.refresh_region_stats()$$);
