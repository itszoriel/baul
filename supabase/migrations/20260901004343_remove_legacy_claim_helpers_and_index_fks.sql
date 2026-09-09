-- The live-membership policies no longer use the original JWT app_metadata
-- helpers. Remove them instead of leaving obsolete public-schema functions.
drop function public.auth_is_admin();
drop function public.auth_member_id();
drop function public.auth_vault_id();

-- Cover every multi-column tenant foreign key in its declared column order.
-- These also cover the single-column member/memory foreign keys by prefix.
create index capsule_payload_memory_vault_fk_idx
  on public.memory_capsule_payloads (memory_id, vault_id);

create index memory_replies_member_vault_fk_idx
  on public.memory_replies (member_id, vault_id);
create index memory_replies_memory_vault_fk_idx
  on public.memory_replies (memory_id, vault_id);

create index reactions_member_vault_fk_idx
  on public.reactions (member_id, vault_id);
create index reactions_memory_vault_fk_idx
  on public.reactions (memory_id, vault_id);

create index vaults_country_division_fk_idx
  on public.vaults (country_id, division_id)
  where country_id is not null and division_id is not null;
