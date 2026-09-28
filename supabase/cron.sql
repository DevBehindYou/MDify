-- MDify schedules (Supabase Cron = pg_cron + pg_net). Run once, after:
--   1. the migrations in supabase/migrations/ are applied,
--   2. the Edge Function cleanup-expired-jobs is deployed (Dashboard → Edge
--      Functions → Deploy a new function → Via Editor, or
--      `supabase functions deploy cleanup-expired-jobs`), JWT verification on,
--   3. two secrets are stored in Vault (Dashboard → Integrations → Vault),
--      so they never appear in this SQL:
--        'mdify_service_role_key'  the project's legacy service_role key (the
--                                  function compares it with its own
--                                  SUPABASE_SERVICE_ROLE_KEY, so it must match)
--        'mdify_cron_secret'       the same value as CRON_SECRET on the frontend
-- Replace <project-ref> before running. Running it again updates both jobs
-- (cron.schedule replaces a job with the same name).
--
-- mdify-cleanup-expired-jobs  every 30 minutes: deletes expired files.
-- mdify-jobs-tick             every minute: finishes background work when no
--                             browser is waiting (retries, archive images,
--                             merges) and retires stale jobs.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'mdify-cleanup-expired-jobs',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/cleanup-expired-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'mdify_service_role_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'mdify-jobs-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://mdify-app.vercel.app/api/jobs/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-mdify-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'mdify_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    -- One tick can wait on a Render instance waking up (see /api/jobs/tick,
    -- maxDuration 300 s). Overlapping ticks are safe: claims respect capacity.
    timeout_milliseconds := 300000
  );
  $$
);
