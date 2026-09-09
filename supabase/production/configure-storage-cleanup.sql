-- Run with psql after deploying the storage-cleanup Edge Function:
--   psql "$SUPABASE_DB_URL" \
--     --set=project_url='https://PROJECT_REF.supabase.co' \
--     --set=cleanup_secret='A_RANDOM_SECRET_WITH_AT_LEAST_32_CHARACTERS' \
--     --file=supabase/production/configure-storage-cleanup.sql
-- Configure the same cleanup_secret as the Edge Function CLEANUP_SECRET.

\if :{?project_url}
\else
  \quit
\endif

\if :{?cleanup_secret}
\else
  \quit
\endif

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(:'project_url', 'baul_project_url', 'Baul Edge Function base URL')
where not exists (select 1 from vault.secrets where name = 'baul_project_url');

select vault.update_secret(id, new_secret := :'project_url')
from vault.secrets
where name = 'baul_project_url';

select vault.create_secret(:'cleanup_secret', 'baul_cleanup_secret', 'Baul cleanup scheduler secret')
where not exists (select 1 from vault.secrets where name = 'baul_cleanup_secret');

select vault.update_secret(id, new_secret := :'cleanup_secret')
from vault.secrets
where name = 'baul_cleanup_secret';

select cron.unschedule(jobid)
from cron.job
where jobname = 'baul-storage-cleanup';

select cron.schedule(
  'baul-storage-cleanup',
  '*/15 * * * *',
  $schedule$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'baul_project_url'
      ) || '/functions/v1/storage-cleanup',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cleanup-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'baul_cleanup_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    )
  $schedule$
);
