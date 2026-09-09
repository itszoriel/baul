# Project Specification: **Baul** — A Private Shared Memory Keepsake Platform

> **Purpose of this document:** This is the complete product + technical specification for building this web application. It contains the concept, features, tech stack, database schema, security rules, UI design language, and build order. Follow it as the source of truth. Where the spec says "DECISION", a choice has already been made — implement it as written.

---

## 0. Brand & Naming

**DECISION — the product is named "Baul"** (Filipino: *baúl*, pronounced "bah-OOL" — a traditional wooden treasure chest where Filipino families keep photos, letters, and heirlooms). The product is a digital baul.

- **User-facing terminology:** vaults are called **bauls** in ALL UI copy, marketing text, emails, and page titles. Examples:
  - "Create your baul"
  - "Here's the only key to your baul — guard it well."
  - "I have a key" → opens "Enter your baul"
  - Vault types in UI: **"a baul for two"** (intimate) and **"Circle Baul"** (group)
  - Globe tagline: *"Somewhere on this globe, someone just opened their baul."*
- **Code-facing terminology (DECISION):** keep `vault` in all code, database tables, API routes, and internal identifiers (`vaults`, `vault_id`, `vault_type`, etc.) exactly as specified below. Only human-visible strings use "baul". Do NOT rename database tables or code symbols to "baul".
- **Pronunciation note on landing page** (doubles as brand story, one line): *"Baul (bah-ool) — a Filipino treasure chest."*
- **Brand visual direction:** minimal logo of a chest with a keyhole that doubles as a heart; warm wood-and-brass accent tones layered on the dark cosmic theme; key-recovery email styled like an heirloom letter/deed; vault-open animation = a chest lid lifting with light spilling out.
- **Domain candidates (verify availability):** `baul.app`, `getbaul.com`, `baul.love`, `mybaul.ph`. Note: "Baul" also refers to a Bengali music tradition — unrelated domain, but avoid relying on bare-word SEO.

---

## 1. Product Concept

A web platform where a user creates a **Vault**: a private, key-gated shared space where a small group of people (a couple, friends, or family) can store memories together — notes, photos, letters, a chat, and a shared music soundtrack.

- Access is via a **secret key** (no public signup, no discoverability). The key is the only door.
- The original use case is a romantic keepsake for two people, but the system also supports groups.
- The public landing page is an interactive 3D globe showing anonymous, aggregate vault counts by region — proof that "millions of little secret worlds exist," without exposing any of them.

### Terminology
| Term (code) | Term (UI copy) | Meaning |
|------|------|---------|
| Vault | Baul | A private space created by one user, entered via key |
| Intimate vault (`vault_type='intimate'`) | "a baul for two" | 2-person vault created for romantic purpose. Warm, intimate UX |
| Circle vault (`vault_type='circle'`) | Circle Baul | 3+ people, or any non-romantic purpose. Casual, group UX |
| Key | Key | High-entropy secret string generated at creation. Never stored raw |
| Memory | Memory | Any item in the timeline: note, photo, letter, voice memo |
| Member | Member | A person inside a baul (display name + avatar) |

Remember: `vault` in code, "baul" in anything a human reads. See section 0.

---

## 2. Core Features

### 2.1 Vault creation flow (full-screen step wizard, one question per screen)
1. **Name your vault** (free text).
2. **How many people can join?** (2, or custom 3–50).
3. **What is this vault for?** Picker: Romance / Friends / Family / Team / Other.
4. **Where in the world is this vault?** (DECISION — replaces IP-derived location.) Searchable **country** picker; if the country has seeded administrative divisions (see §4), a second picker refines to a coarse division (e.g. PH province, US state). Always offer an explicit **"Somewhere on Earth (don't show my region)"** choice — the question is mandatory to answer, disclosure is not. Copy must reassure: *"This only places a soft anonymous glow on the globe — never your exact location."*
5. **Optional recovery email.** Strongly encouraged. Copy to show if skipped: *"Without an email, if you lose this key, your vault is gone forever."* Frame the choice as **"Guarded vault"** (email backup) vs **"Sealed vault"** (no recovery).
6. **Key reveal screen.** Show the generated key ONCE, with copy button, QR code, and share instructions. If email was given, send the key email (see 2.6).

**DECISION — vault type derivation:** `vault_type = 'intimate'` if (max_members == 2 AND purpose == 'romance'), else `vault_type = 'circle'`. The frontend reads this single field to decide which experience to render.

### 2.2 Vault entry (join flow)
1. User enters key (from link, QR, or manual input).
2. Server verifies key hash → issues a vault-scoped session token.
3. First-time members set up identity: **display name** + **avatar photo upload** (with circular crop) OR fallback auto-assigned color + initials.
4. Returning members go straight to the vault (session persisted).

### 2.3 The vault interior
- **Memory timeline:** vertical, parallax-scrolling timeline of memories. Desktop: cards alternate left/right; mobile: single column. Each memory shows content, who added it (name + avatar), timestamp.
- **Memory types (`kind`):** `note` (text), `photo` (image + optional caption), `letter` (longer text, can be a **time capsule** — locked until a future `unlock_at` date), `voice` (audio memo, optional/v2).
- **Reactions + threads:** any member can react (emoji) or reply on a memory, so a photo can grow a small conversation under it.
- **Chat:** realtime chat panel (slide-in) scoped to the vault.
- **Music / shared soundtrack:**
  - Any member can **add** a song (upload mp3 or paste a source URL) and **remove** a song.
  - Persistent bottom music bar with play/pause/skip; shows "added by {name}".
  - A memory can optionally link a `song_id` → opening that memory plays that song.
- **Milestone system (branches by vault type):**
  - Intimate: anniversary + monthsary trackers, "days together" counter, love-letter time capsules. Language: "your person added a memory."
  - Circle: group milestones — "1 year of this vault", "100 memories added", member birthdays, trip countdowns. Language: "{name} added to the board."

### 2.4 Members, display names, avatars
- **Display name:**
  - Set freely at first join (this does NOT count as a "change").
  - After that, renames are limited to **once per 30 days**. Enforce SERVER-SIDE (edge function / DB check on `name_changed_at`), never frontend-only.
  - On a blocked rename, respond with the date they CAN rename: *"You can change your name again on {date}."*
  - **DECISION:** display names are unique **within a vault** (not globally).
- **Avatar:**
  - User uploads a photo → client-side circular crop (`react-easy-crop`) → client-side compress to 512×512 WebP (`browser-image-compression`) → upload to private `avatars` bucket at `avatars/{vault_id}/{member_id}.webp` (overwrite same path on change).
  - Server validates: image mime types only, ≤5MB pre-compression, strip EXIF (including GPS).
  - Fallback: colored circle with initials from `avatar_color` (auto-assigned at join from a pleasant palette).
  - Avatars are served via signed URLs with ~24h expiry, cached client-side (they render everywhere — do not re-sign per render).
- **Roles:** creator = `admin`, others = `member`. Admin powers (mainly matter in Circle Vaults): remove a member, delete any content, regenerate the vault key (invalidates old), reset a member's name/photo if inappropriate.

### 2.5 Globe landing page (public homepage)
- Full-viewport, slowly auto-rotating 3D Earth (three-globe / react-three-fiber). Users can drag to spin, scroll to zoom.
- Glowing dots = **aggregate vault counts per region** (province/city level max). Zooming breaks clusters apart into region counts, e.g. "Bataan — 1,204 vaults."
- Tapping a region → stat card: total vaults, split "X Duo Vaults · Y Circle Vaults", fun aggregates ("12,400 memories stored this month").
- Optional flourish: realtime soft "ping" of light where a new vault was just created.
- Header: live world counters ("N memories kept · N songs playing somewhere").
- Floating UI over the globe: logo, one-line tagline, two buttons — **"Create a vault"** and **"I have a key."** Scrolling down transitions into parallax feature-explainer sections.
- **PRIVACY RULES (non-negotiable):**
  - Globe shows aggregate counts ONLY. Never individual vault pins, names, or content.
  - Location = coarse administrative division **chosen by the creator** in the wizard (never derived from IP), with an explicit opt-out at creation. Coarsest displayed granularity: province/state level.
  - State it on the page: "locations are approximate and anonymous."
  - The landing page reads from the aggregated stats tables (`region_stats` + `country_stats`) — it must never query real vault rows.

### 2.6 Key recovery email (Resend)
- At creation (if email provided): send a beautifully designed email containing the key, a direct "open my vault" link, and share instructions.
- "I lost my key" flow: user enters the vault's recovery email → because raw keys are never stored, the system **regenerates a NEW key**, invalidates the old one, and emails it. (Explain this to the user in UI copy.)
- Recovery email is stored **encrypted at rest** (`recovery_email_enc`).

---

## 3. Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **Next.js (App Router) + TypeScript** | Deploy on Vercel |
| Styling | **Tailwind CSS** | |
| Animation | **Framer Motion** | Parallax, scroll-triggered reveals, transitions |
| 3D Globe | **react-three-fiber + drei + three-globe** | GitHub-style globe |
| Backend | **Supabase** | Postgres, Storage, Realtime, Edge Functions, Auth |
| Auth model | Supabase anonymous sign-in + custom JWT claim (`vault_id`) after key verification | |
| Email | **Resend** (+ React Email for templates) | |
| Image crop | `react-easy-crop` | |
| Image compression | `browser-image-compression` | |
| Hosting | Vercel (frontend) + Supabase cloud | Free tiers to start |

---

## 4. Database Schema (Postgres / Supabase)

### Global administrative divisions (DECISION)

Locations use a **single self-referencing table + country-scoped type metadata** — an adjacency list — so ANY country's hierarchy (any depth, level-skipping allowed) is representable as rows, never as schema changes. A division's type carries its rank *within its own country* ("City" is level 3 in PH, level 2 in JP). Divisions carry official codes (PSGC for PH, ISO 3166-2 for US states) and centroids for the globe.

```sql
-- ============ COUNTRIES ============
create table countries (
  id uuid primary key default gen_random_uuid(),
  iso3 char(3) not null unique,         -- ISO 3166-1 alpha-3
  iso2 char(2) not null unique,
  name text not null,
  lat double precision, lng double precision  -- centroid for the globe
);

-- ============ DIVISION TYPES (rank scoped per country; 1 = top) ============
create table division_types (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id) on delete cascade,
  name text not null,                   -- Region / Province / State / Prefecture…
  level int not null check (level between 1 and 10),
  unique (country_id, level),
  unique (country_id, name)
);

-- ============ ADMINISTRATIVE DIVISIONS (adjacency list) ============
create table administrative_divisions (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id) on delete cascade,
  type_id uuid not null references division_types(id) on delete restrict,
  parent_division_id uuid references administrative_divisions(id) on delete cascade,
  name text not null,
  code text,                            -- PSGC / ISO 3166-2 / FIPS where official
  lat double precision, lng double precision,  -- nullable: uncharted rolls up
  sort_order int,
  is_active boolean not null default true,     -- soft-retire, never delete
  unique nulls not distinct (country_id, parent_division_id, name)
);
-- Indexes on parent_division_id, country_id, type_id. A trigger enforces:
-- child.country == parent.country, type.country == country, child level
-- strictly deeper than parent level. Seeded: all ~250 countries; PH regions +
-- provinces (PSGC); US states. New countries/levels = INSERTs, not migrations.

-- ============ VAULTS ============
create table vaults (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null,               -- argon2/bcrypt hash. NEVER the raw key
  vault_type text not null check (vault_type in ('intimate','circle')),
  purpose text not null check (purpose in ('romance','friends','family','team','other')),
  max_members int not null check (max_members between 2 and 50),
  recovery_email_enc text,              -- encrypted at rest, nullable
  country_id uuid references countries(id) on delete set null,   -- user-chosen; null = opted out
  division_id uuid references administrative_divisions(id) on delete set null,  -- optional finer place
  created_at timestamptz not null default now()
  -- check: division_id is null or country_id is not null
);

-- ============ MEMBERS ============
create table members (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  display_name text not null,
  name_changed_at timestamptz,          -- null until first EDIT (initial set doesn't count)
  avatar_url text,                      -- storage path; null = use fallback
  avatar_color text not null,           -- auto-assigned at join
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  unique (vault_id, display_name)       -- names unique within a vault
);

-- ============ MEMORIES ============
create table memories (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  kind text not null check (kind in ('note','photo','letter','voice')),
  content text,                         -- note/letter text or photo caption
  media_url text,                       -- storage path for photo/voice
  song_id uuid references songs(id) on delete set null,  -- optional attached song
  unlock_at timestamptz,                -- time capsule: hidden until this date
  created_at timestamptz not null default now()
);

-- ============ MESSAGES (chat) ============
create table messages (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ============ SONGS ============
create table songs (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults(id) on delete cascade,
  added_by uuid not null references members(id) on delete cascade,
  title text not null,
  source_url text,                      -- external link (if pasted)
  file_url text,                        -- storage path (if uploaded mp3)
  created_at timestamptz not null default now()
);

-- ============ REACTIONS ============
create table reactions (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references memories(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  emoji text not null,
  unique (memory_id, member_id, emoji)
);

-- ============ REPLIES (threads under memories) ============
create table memory_replies (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references memories(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ============ GLOBE STATS (public, aggregate-only) ============
-- Division-level aggregates. The refresh ROLLS UP: a vault counts at its own
-- division and every ancestor, so the globe is correct at any zoom level.
create table region_stats (
  division_id uuid primary key references administrative_divisions(id) on delete cascade,
  name text not null,                   -- denormalized for the public read
  country_iso3 char(3) not null,
  level int not null,
  parent_division_id uuid,
  lat double precision, lng double precision,
  vault_count int not null default 0,
  duo_count int not null default 0,
  circle_count int not null default 0,
  memory_count int not null default 0,
  song_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- Country-level aggregates for the far zoom, PLUS one 'WLD' world row whose
-- totals include location-opted-out vaults (global counters must be true).
create table country_stats (
  iso3 char(3) primary key,             -- 'WLD' = world row
  name text not null,
  lat double precision, lng double precision,
  vault_count int not null default 0,
  duo_count int not null default 0,
  circle_count int not null default 0,
  memory_count int not null default 0,
  song_count int not null default 0,
  updated_at timestamptz not null default now()
);
-- Both rebuilt together by refresh_region_stats() via cron, e.g. every 10 min.
-- The landing page ONLY reads region_stats + country_stats. Never vault rows.
```

**Querying note (honest trade-off):** the adjacency list makes writes trivial and reads need a recursive CTE — which runs only inside the 10-minute stats refresh, never on a user path. If subtree queries ever become hot, add a materialized `path` column; do not build a closure table up front.

### Storage buckets (all PRIVATE)
| Bucket | Path convention | Notes |
|--------|----------------|-------|
| `avatars` | `avatars/{vault_id}/{member_id}.webp` | Overwrite on change; 24h signed URLs |
| `photos` | `photos/{vault_id}/{memory_id}.webp` | Strip EXIF/GPS server-side |
| `music` | `music/{vault_id}/{song_id}.mp3` | ≤15MB |

---

## 5. Security Model

1. **Key generation:** server-side, cryptographically random, ≥20 chars, formatted for humans, e.g. `VLT-x7Kq-9mPa-2wNr-Tt4z`. Shown once; only the **argon2/bcrypt hash** is stored.
2. **Key verification:** Edge Function: submitted key → hash → constant-time compare → on success, issue a signed session token (JWT) with claim `{ vault_id, member_id }`.
3. **Row-Level Security (RLS):** enable on ALL tables. Policy pattern: a request may only read/write rows where `vault_id = (auth.jwt() ->> 'vault_id')::uuid`. `region_stats` is the only publicly readable table.
4. **Rate limiting:** key-entry endpoint limited to ~5 attempts/minute/IP. Rename endpoint enforces the 30-day rule server-side.
5. **Media:** private buckets only; short-lived signed URLs (avatars may use ~24h). Validate mime + size server-side (images jpg/png/webp ≤10MB pre-compress; audio mp3 ≤15MB). **Strip EXIF GPS from all uploaded photos.**
6. **Recovery email:** encrypted at rest. Lost key = regenerate new key + invalidate old (raw keys are never recoverable by design).
7. **Admin lever:** vault creator can regenerate key (rotates hash, all members must re-enter), remove members, delete content.
8. **Globe privacy:** aggregate counts only, coarse user-chosen divisions only (province/state max, never derived from IP), opt-out honored, no per-vault data ever exposed publicly. `countries` / `division_types` / `administrative_divisions` are public read-only reference data (the picker runs before any session exists); writes go through the service role only.

---

## 6. UI / Design Language

**Theme: dark, cosmic, soft.** Unifies the space-globe landing with the intimate vault interior.

- **Base:** deep navy/charcoal (~`#0B0E1A`), not pure black.
- **Surfaces:** glassmorphism — translucent panels, `backdrop-blur`, subtle 1px borders (`white/10`).
- **Accent branches by vault type:**
  - Intimate vault: warm rose → amber gradient accents.
  - Circle vault: cool violet → teal accents.
- **Typography:** headings in a characterful serif (**Fraunces** or Playfair Display — "handwritten letter" feel); body in **Inter**.
- **Motion (Framer Motion):**
  - Parallax memory timeline: background stars drift slowest, mid-layer photos medium, foreground notes fastest.
  - Scroll-triggered fade-and-rise on each memory card (`whileInView`).
  - Micro-interactions: hearts softly burst on reaction; vinyl record spins in corner while music plays.
  - Rules: animations ≤400ms, always respect `prefers-reduced-motion`.
- **Layouts:**
  - Landing: full-viewport globe canvas + floating UI; scroll transitions into parallax feature sections.
  - Vault interior: vertical timeline (alternating left/right on desktop, single column mobile), persistent bottom music bar, slide-in chat panel, member avatar row in header (Intimate: two overlapping avatars like a locket; Circle: stacked row "+7 others").
  - Creation flow: full-screen wizard, one question per screen, smooth transitions.
- **Copy tone branches by vault type** (intimate = tender; circle = casual/fun). Seasonal globe flourishes optional (pink glow near Feb 14, gold near New Year).

---

## 7. Build Order

1. **Skeleton:** Next.js + Supabase setup. Vault creation (wizard → key generation/hash → key reveal) + key entry (verify → session token → join flow with name + avatar crop/upload). RLS policies from day one.
2. **Memory timeline:** notes + photo upload (compress, EXIF strip, signed URLs), reactions, replies, parallax + scroll animations. Vault-type theming (intimate vs circle).
3. **Realtime chat** (Supabase Realtime) + live timeline sync.
4. **Music:** add/remove songs (upload + URL), bottom player bar, per-memory attached songs.
5. **Milestones:** intimate trackers (anniversary/monthsary/days-together) and circle milestones; time-capsule letters (`unlock_at`).
6. **Email:** Resend integration — key email on creation, lost-key regeneration flow. Rename cooldown polish.
7. **Globe landing:** region_stats cron aggregation, three-globe landing with clusters, region stat cards, live counters, realtime creation pings. Ship last — most impressive, least essential.

---

## 8. Open Items / v2 Ideas (do not build in v1 unless asked)
- Voice memo memories.
- "Memory of the day" resurfacing.
- Mood/status per member.
- Export vault to PDF ("print our story") for gifts.
- Collaborative playlist judging tags ("who added this").
- True client-side (end-to-end) encryption of vault content — v1 uses server-side security (hashed keys + RLS + private buckets), which is appropriate for launch.
