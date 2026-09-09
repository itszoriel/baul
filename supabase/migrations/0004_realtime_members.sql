-- ============================================================================
-- Add members to the realtime publication.
--
-- The vault page subscribes to members (joins/renames/avatars/removals), but
-- 0001 never published the table. Realtime then rejects the WHOLE channel's
-- postgres_changes bindings — silently: the join still acks SUBSCRIBED and the
-- failure arrives only as a 'system' broadcast — so NO vault events (memories,
-- reactions, replies, songs) were ever delivered.
-- ============================================================================

alter publication supabase_realtime add table public.members;

-- DELETE events carry only the replica identity; with the default (PK) the
-- vault_id filter can never match, so member removals would not be delivered.
alter table public.members replica identity full;
