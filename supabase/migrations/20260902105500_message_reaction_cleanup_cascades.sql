-- Revocation preserves attributed content because it only sets revoked_at.
-- A separate permanent member/vault deletion must, however, be able to remove
-- dependent reaction rows without foreign-key ordering failures.

alter table public.message_reactions
  drop constraint message_reactions_member_same_vault_fk,
  add constraint message_reactions_member_same_vault_fk
    foreign key (member_id, vault_id)
    references public.members(id, vault_id)
    on delete cascade;

alter table public.message_reactions
  drop constraint message_reactions_sticker_same_vault_fk,
  add constraint message_reactions_sticker_same_vault_fk
    foreign key (sticker_id, vault_id)
    references public.vault_stickers(id, vault_id)
    on delete cascade;

-- Memory reactions share the sticker library and need the same permanent
-- cleanup behavior when a Baul or sticker is explicitly deleted.
alter table public.reactions
  drop constraint reactions_sticker_same_vault_fk,
  add constraint reactions_sticker_same_vault_fk
    foreign key (sticker_id, vault_id)
    references public.vault_stickers(id, vault_id)
    on delete cascade not valid;

alter table public.reactions
  validate constraint reactions_sticker_same_vault_fk;
