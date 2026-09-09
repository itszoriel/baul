begin;
create extension if not exists pgtap with schema extensions;
select plan(83);

-- Keep the transaction-safe suite runnable against a populated staging or
-- hosted project as well as a clean local stack.
create temporary table _baul_test_baseline as
select count(*)::integer as vault_count from public.vaults;

insert into public.vaults (id, name, key_hash, key_lookup, vault_type, purpose, max_members)
values
  ('10000000-0000-0000-0000-000000000001', 'First', 'hash', repeat('a', 64), 'circle', 'friends', 3),
  ('20000000-0000-0000-0000-000000000002', 'Second', 'hash', repeat('b', 64), 'circle', 'family', 3);

insert into public.members (id, vault_id, user_id, display_name, avatar_color, role)
values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', '#AABBCC', 'admin'),
  ('12000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B', '#BBCCDD', 'member'),
  ('21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'C', '#CCDDEE', 'admin');

insert into public.member_secrets (member_id, secret_hash)
select id, 'test-hash'
from public.members
where id in (
  '11000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000002',
  '21000000-0000-0000-0000-000000000003'
);

insert into public.memories (id, vault_id, member_id, kind, content, unlock_at)
values
  ('13000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'note', 'visible', null);

insert into public.messages (id, vault_id, member_id, body)
values
  ('15000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'First whisper'),
  ('25000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000003', 'Second whisper');

select ok(not has_table_privilege('anon', 'public.vaults', 'select'), 'anon cannot read Baul rows');
select ok(not has_table_privilege('authenticated', 'public.vaults', 'select'), 'authenticated has no whole-table vault grant');
select ok(has_column_privilege('authenticated', 'public.vaults', 'name', 'select'), 'authenticated can read safe vault columns');
select ok(not has_column_privilege('authenticated', 'public.vaults', 'key_hash', 'select'), 'authenticated cannot read key hashes');
select ok(not has_table_privilege('authenticated', 'public.vault_invites', 'select'), 'invite hashes are server-only');
select ok(not has_table_privilege('authenticated', 'public.membership_events', 'select'), 'membership audit events are server-only');
select ok(not has_table_privilege('authenticated', 'public.rate_limit_buckets', 'select'), 'rate-limit identifiers are server-only');
select ok(has_function_privilege('service_role', 'public.consume_rate_limit(text,integer,integer,integer)', 'execute'), 'service role can call rate limiter');
select ok(not has_function_privilege('authenticated', 'public.consume_rate_limit(text,integer,integer,integer)', 'execute'), 'browser roles cannot call privileged limiter');
select ok(to_regprocedure('public.auth_vault_id()') is null, 'legacy JWT helper has been removed');
select ok(has_table_privilege('service_role', 'public.vault_invites', 'select'), 'service role has explicit secret-table access');
select ok(has_table_privilege('authenticated', 'public.memory_capsule_payloads', 'select'), 'payload reads are available only through RLS');
select ok(has_table_privilege('anon', 'public.country_stats', 'select'), 'anonymous landing page can read safe aggregates');
select ok(not has_function_privilege('authenticated', 'public.refresh_region_stats()', 'execute'), 'clients cannot refresh aggregates');
select is((select count(*)::integer from storage.buckets where id in ('avatars', 'photos', 'music') and public), 0, 'all application buckets are private');
select is((select file_size_limit::bigint from storage.buckets where id = 'avatars'), 5242880::bigint, 'avatar bucket enforces the server size limit');
select is((select file_size_limit::bigint from storage.buckets where id = 'photos'), 10485760::bigint, 'photo bucket enforces the server size limit');
select is((select file_size_limit::bigint from storage.buckets where id = 'music'), 15728640::bigint, 'music bucket enforces the server size limit');
select is((select array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'avatars'), 'image/webp', 'avatar bucket allows only WebP');
select is((select array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'photos'), 'image/webp', 'photo bucket allows only WebP');
select is((select array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'music'), 'audio/mpeg', 'music bucket allows only MPEG audio');
select ok(not (select public from storage.buckets where id = 'stickers'), 'custom stickers stay in private storage');
select is((select file_size_limit::bigint from storage.buckets where id = 'stickers'), 524288::bigint, 'sticker bucket enforces a 512KB limit');
select is((select array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'stickers'), 'image/webp', 'sticker bucket accepts only normalized WebP files');
select ok(has_table_privilege('authenticated', 'public.vault_stickers', 'select'), 'keepers can read the sticker library through RLS');
select ok(not has_table_privilege('authenticated', 'public.vault_stickers', 'insert'), 'browser roles cannot bypass the sticker upload route');
select ok(has_function_privilege('service_role', 'public.create_vault_sticker(uuid,uuid,uuid,text,text)', 'execute'), 'the server may create a validated sticker');
select ok(not has_function_privilege('authenticated', 'public.create_vault_sticker(uuid,uuid,uuid,text,text)', 'execute'), 'keepers cannot bypass sticker capacity checks');
select ok(has_table_privilege('authenticated', 'public.message_reactions', 'select'), 'keepers can read message reactions through RLS');
select ok(not has_table_privilege('authenticated', 'public.media_upload_intents', 'select'), 'upload reservations are server-only');
select ok(has_table_privilege('service_role', 'public.media_upload_intents', 'select'), 'service role can inspect upload reservations');
select ok(has_function_privilege('service_role', 'public.reserve_song_upload(uuid,uuid,uuid,text,bigint)', 'execute'), 'service role can reserve a song upload');
select ok(not has_function_privilege('authenticated', 'public.reserve_song_upload(uuid,uuid,uuid,text,bigint)', 'execute'), 'keepers cannot reserve storage without the API');
select ok(has_function_privilege('service_role', 'public.complete_song_upload(uuid,uuid)', 'execute'), 'service role can finalize a validated upload');
select ok(not has_function_privilege('authenticated', 'public.complete_song_upload(uuid,uuid)', 'execute'), 'keepers cannot finalize unvalidated storage objects');

select is(
  (public.reserve_song_upload(
    '16000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'Uploaded song',
    1024
  )).object_key,
  '10000000-0000-0000-0000-000000000001/16000000-0000-0000-0000-000000000001.mp3',
  'song reservations derive a tenant-bound object key'
);
select throws_ok(
  $$select public.reserve_song_upload(
    '26000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '12000000-0000-0000-0000-000000000002',
    'Cross tenant upload',
    1024
  )$$,
  '42501', null, 'song reservations reject a member from another Baul'
);
select is(
  (public.complete_song_upload(
    '16000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001'
  )).title,
  'Uploaded song',
  'a validated reservation finalizes to a song'
);
select is(
  (public.complete_song_upload(
    '16000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001'
  )).id,
  '16000000-0000-0000-0000-000000000001'::uuid,
  'song finalization is idempotent'
);
insert into public.media_upload_intents (
  id, vault_id, member_id, object_key, title, declared_bytes, expires_at
) values (
  '16000000-0000-0000-0000-000000000099',
  '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001/16000000-0000-0000-0000-000000000099.mp3',
  'Expired upload',
  1024,
  now() - interval '1 minute'
);
select throws_ok(
  $$select public.complete_song_upload(
    '16000000-0000-0000-0000-000000000099',
    '11000000-0000-0000-0000-000000000001'
  )$$,
  'P0001', null, 'expired upload reservations cannot be finalized'
);
insert into public.songs (id, vault_id, added_by, title, file_url)
select
  ('17000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  'Quota song ' || n,
  'music/10000000-0000-0000-0000-000000000001/' || ('17000000-0000-0000-0000-' || lpad(n::text, 12, '0')) || '.mp3'
from generate_series(1, 9) n;
select throws_ok(
  $$select public.reserve_song_upload(
    '16000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'Over quota',
    1024
  )$$,
  'P0001', null, 'a Baul cannot reserve more than ten uploaded-song slots'
);

insert into public.vault_stickers (id, vault_id, created_by, name, storage_path)
values
  ('14000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Kilig', 'stickers/10000000-0000-0000-0000-000000000001/14000000-0000-0000-0000-000000000001.webp'),
  ('24000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000003', 'Wave', 'stickers/20000000-0000-0000-0000-000000000002/24000000-0000-0000-0000-000000000002.webp');

select throws_ok(
  $$insert into public.vault_stickers (vault_id, created_by, name, storage_path)
    values ('10000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000003', 'Cross keeper', 'stickers/10000000-0000-0000-0000-000000000001/14000000-0000-0000-0000-000000000099.webp')$$,
  '23503', null, 'a sticker creator must belong to the same Baul'
);
select throws_ok(
  $$insert into public.reactions (memory_id, member_id, vault_id, sticker_id)
    values ('13000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000002')$$,
  '23503', null, 'a custom reaction cannot reference another Baul sticker'
);
select throws_ok(
  $$insert into public.reactions (memory_id, member_id, vault_id, emoji, sticker_id)
    values ('13000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '❤️', '14000000-0000-0000-0000-000000000001')$$,
  '23514', null, 'a reaction cannot contain both an emoji and a sticker'
);
select throws_ok(
  $$insert into public.message_reactions (message_id, member_id, vault_id, sticker_id)
    values ('15000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000002')$$,
  '23503', null, 'a whisper cannot use another Baul sticker'
);
select throws_ok(
  $$insert into public.message_reactions (message_id, member_id, vault_id, sticker_id)
    values ('15000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001')$$,
  '23503', null, 'a whisper reaction member must belong to the same Baul'
);
select throws_ok(
  $$insert into public.message_reactions (message_id, member_id, vault_id, emoji, sticker_id)
    values ('15000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '❤️', '14000000-0000-0000-0000-000000000001')$$,
  '23514', null, 'a whisper reaction cannot contain both an emoji and a sticker'
);

insert into public.message_reactions (message_id, member_id, vault_id, sticker_id)
values ('25000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000002');
delete from public.members where id = '21000000-0000-0000-0000-000000000003';
select is((select count(*)::integer from public.message_reactions where message_id = '25000000-0000-0000-0000-000000000002'), 0, 'permanent member deletion cascades whisper reactions cleanly');

select throws_ok(
  $$insert into public.songs (vault_id, added_by, title, source_url)
    values ('10000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000003', 'Cross tenant', 'https://youtu.be/dQw4w9WgXcQ')$$,
  '23503', null, 'a song author must belong to the same Baul'
);
select throws_ok(
  $$insert into public.messages (vault_id, member_id, body)
    values ('10000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000003', 'Cross tenant')$$,
  '23503', null, 'a message author must belong to the same Baul'
);
select throws_ok(
  $$update public.members
    set revoked_by = '21000000-0000-0000-0000-000000000003'
    where id = '12000000-0000-0000-0000-000000000002'$$,
  '23503', null, 'a revocation actor must belong to the same Baul'
);
select throws_ok(
  $$insert into public.vault_invites (vault_id, token_hash, created_by, expires_at)
    values ('10000000-0000-0000-0000-000000000001', repeat('c', 64), '21000000-0000-0000-0000-000000000003', now() + interval '1 day')$$,
  '23503', null, 'an invitation creator must belong to the same Baul'
);
select throws_ok(
  $$insert into public.membership_events (vault_id, actor_member_id, event_type)
    values ('10000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000003', 'key_rotated')$$,
  '23503', null, 'an audit actor must belong to the same Baul'
);

insert into public.countries (id, iso3, iso2, name, lat, lng)
values
  ('30000000-0000-0000-0000-000000000001', 'ZXX', 'ZX', 'Test Alpha', 1, 1),
  ('30000000-0000-0000-0000-000000000002', 'ZXY', 'ZY', 'Test Beta', 2, 2);
insert into public.division_types (id, country_id, name, level)
values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Test Region', 1),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Test Region', 1);
insert into public.administrative_divisions (id, country_id, type_id, name, lat, lng)
values
  ('32000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'Alpha One', 1, 1),
  ('32000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'Beta One', 2, 2);
select throws_ok(
  $$update public.vaults
    set country_id = '30000000-0000-0000-0000-000000000001',
        division_id = '32000000-0000-0000-0000-000000000002'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '23503', null, 'a selected division must belong to the selected country'
);

select ok(
  (select r.allowed and r.current_hits = 1 and not r.challenge_required
   from public.consume_rate_limit('test:rate-limit:security', 2, 60, 300) r),
  'the rate limiter atomically records the first hit'
);
select ok(
  (select r.allowed and r.current_hits = 2 and r.challenge_required
   from public.consume_rate_limit('test:rate-limit:security', 2, 60, 300) r),
  'the rate limiter escalates to a challenge at its threshold'
);
select ok(
  (select not r.allowed and r.current_hits = 3 and r.challenge_required
   from public.consume_rate_limit('test:rate-limit:security', 2, 60, 300) r),
  'the rate limiter blocks after the configured limit'
);
select throws_ok(
  $$select public.consume_rate_limit('test:rate-limit:invalid', 0, 60, 300)$$,
  '22023', null, 'the rate limiter rejects invalid configuration'
);

insert into public.vault_invites (vault_id, token_hash, created_by, expires_at)
values (
  '10000000-0000-0000-0000-000000000001',
  repeat('e', 64),
  '11000000-0000-0000-0000-000000000001',
  now() + interval '1 day'
);
select is(
  (select r.member_role from public.redeem_vault_invite(
    repeat('e', 64),
    'dddddddd-0000-0000-0000-000000000004',
    'D',
    '#DDEEFF',
    'test-hash'
  ) r),
  'member',
  'an invitation creates a keeper transactionally'
);
select throws_ok(
  $$select public.redeem_vault_invite(
    repeat('e', 64),
    'eeeeeeee-0000-0000-0000-000000000005',
    'E',
    '#EEFFAA',
    'test-hash'
  )$$,
  'P0001', null, 'an invitation cannot be redeemed twice'
);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(private.current_member_id('10000000-0000-0000-0000-000000000001'), '11000000-0000-0000-0000-000000000001'::uuid, 'live member resolves from auth.uid');
select is((select count(*)::integer from public.vaults), 1, 'a keeper sees only their own Baul');
select is((select count(*)::integer from public.memories), 1, 'a keeper sees memories in their Baul');
select ok(not private.is_active_member('20000000-0000-0000-0000-000000000002'), 'cross-Baul membership is denied');
select is((select count(*)::integer from public.vault_stickers), 1, 'a keeper sees only stickers in their Baul');
insert into public.reactions (memory_id, member_id, vault_id, sticker_id)
values ('13000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.reactions where sticker_id = '14000000-0000-0000-0000-000000000001'), 1, 'a keeper can use a same-Baul custom sticker');
insert into public.message_reactions (message_id, member_id, vault_id, sticker_id)
values ('15000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.message_reactions), 1, 'a keeper can react to a same-Baul whisper');

reset role;
update public.members set revoked_at = now() where id = '11000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.vaults), 0, 'revocation takes effect with the same JWT');
select is((select count(*)::integer from public.vault_stickers), 0, 'revocation also removes sticker-library access immediately');
select is((select count(*)::integer from public.message_reactions), 0, 'revocation also removes whisper-reaction access immediately');
reset role;

update public.members set revoked_at = null where id = '11000000-0000-0000-0000-000000000001';
select public.create_memory_entry(
  '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  'letter',
  'future payload',
  now() + interval '1 day',
  null
);
set local role authenticated;
select is((select count(*)::integer from public.memories), 2, 'locked envelope metadata is visible');
select is((select count(*)::integer from public.memory_capsule_payloads), 0, 'locked payload remains unreadable, including to its author');
select throws_ok(
  $$select public.join_vault_member('10000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000004', 'D', '#DDEEFF', 'hash')$$,
  '42501',
  null,
  'authenticated callers cannot execute privileged join functions'
);

reset role;

update public.vaults
set country_id = '30000000-0000-0000-0000-000000000001',
    division_id = '32000000-0000-0000-0000-000000000001'
where id = '10000000-0000-0000-0000-000000000001';
select public.refresh_region_stats();
select is((select vault_count from public.country_stats where iso3 = 'ZXX'), 1, 'an explicitly shared country appears as a coarse aggregate');
select is((select count(*)::integer from public.region_stats where division_id = '32000000-0000-0000-0000-000000000001'), 0, 'division locations with fewer than three Bauls are suppressed');

insert into public.vaults (
  id, name, key_hash, key_lookup, vault_type, purpose, max_members, country_id, division_id
) values
  (
    '30000000-0000-0000-0000-000000000003', 'Third', 'hash', repeat('d', 64),
    'circle', 'friends', 3, '30000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000004', 'Fourth', 'hash', repeat('e', 64),
    'circle', 'friends', 3, '30000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001'
  );
select public.refresh_region_stats();
select is((select vault_count from public.country_stats where iso3 = 'ZXX'), 3, 'country aggregate appears at the privacy threshold');
select is((select vault_count from public.region_stats where division_id = '32000000-0000-0000-0000-000000000001'), 3, 'division aggregate appears at the privacy threshold');
select is(
  (select vault_count from public.country_stats where iso3 = 'WLD'),
  (select vault_count + 4 from _baul_test_baseline),
  'world total remains exact without exposing a location'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'vaults', 'members', 'member_secrets', 'songs', 'memories', 'messages',
        'reactions', 'message_reactions', 'memory_replies', 'memory_capsule_payloads', 'vault_invites',
        'vault_recovery_requests', 'vault_email_confirmations', 'membership_events',
        'rate_limit_buckets', 'storage_cleanup_queue', 'media_upload_intents', 'vault_stickers', 'region_stats', 'country_stats'
      )
      and not c.relrowsecurity
  ),
  0,
  'every exposed or sensitive application table has RLS enabled'
);

create table public._table_privilege_probe (id integer primary key);
create function public._function_privilege_probe() returns integer
language sql as $$ select 1 $$;
select ok(not has_table_privilege('anon', 'public._table_privilege_probe', 'select'), 'new tables are not auto-exposed to anon');
select ok(not has_table_privilege('service_role', 'public._table_privilege_probe', 'select'), 'new tables require an explicit service-role grant');
select ok(not has_function_privilege('anon', 'public._function_privilege_probe()', 'execute'), 'new functions are not auto-exposed to anon');
select ok(not has_function_privilege('service_role', 'public._function_privilege_probe()', 'execute'), 'new functions require an explicit service-role grant');

select * from finish();
rollback;
