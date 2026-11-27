-- Recovery may rotate the permanent key only for a vault whose recovery email
-- was confirmed. An unconfirmed (possibly mistyped or foreign) address must
-- never receive a working path to a new permanent key.

create or replace function public.confirm_vault_recovery(
  p_token_hash text,
  p_key_hash text,
  p_key_lookup text
)
returns table (
  vault_id uuid,
  vault_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_request public.vault_recovery_requests%rowtype;
  selected_vault public.vaults%rowtype;
begin
  select r.* into selected_request
  from public.vault_recovery_requests r
  where r.token_hash = p_token_hash
  for update;

  if not found
    or selected_request.used_at is not null
    or selected_request.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'recovery_unavailable';
  end if;

  select v.* into selected_vault
  from public.vaults v
  where v.id = selected_request.vault_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'vault_not_found';
  end if;

  if selected_vault.recovery_email_hash is null
    or selected_vault.recovery_email_confirmed_at is null then
    raise exception using errcode = 'P0001', message = 'recovery_unavailable';
  end if;

  update public.vaults v
  set key_hash = p_key_hash, key_lookup = p_key_lookup
  where v.id = selected_vault.id;

  update public.vault_recovery_requests r
  set used_at = now()
  where r.vault_id = selected_vault.id and r.used_at is null;

  insert into public.membership_events (
    vault_id, subject_member_id, event_type
  ) values (
    selected_vault.id, null, 'key_rotated'
  );

  return query select selected_vault.id, selected_vault.name;
end
$$;

revoke all on function public.confirm_vault_recovery(text, text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_vault_recovery(text, text, text)
  to service_role;
