-- MDify schedules (Supabase Cron = pg_cron + pg_net). Run once, after:
--   1. the migrations in supabase/migrations/ are applied,
--   2. the Edge Function cleanup-expired-jobs is deployed (Dashboard → Edge
--      Functions → Deploy a new function → Via Editor, or
--      `supabase functions deploy cleanup-expired-jobs`), JWT verification on,
--      with the function secret MDIFY_CRON_SECRET (Edge Functions → Secrets)
--      set to the same value as CRON_SECRET on the frontend,
--   3. two secrets are stored in Vault (Dashboard → Integrations → Vault),
--      so they never appear in this SQL:
--        'mdify_service_role_key'  the project's legacy service_role key; it
--                                  only passes the platform's JWT check
--        'mdify_cron_secret'       the same value as CRON_SECRET on the frontend
-- Replace <project-ref> before running. Running it again updates both jobs
-- (cron.schedule replaces a job with the same name).
--
-- The keep-warm jobs also need the OCR backend URLs in Vault
-- (mdify_keepwarm_url_o1, mdify_keepwarm_url_o2: base URL, no path) and the
-- migration 20260928120000_mdify_keepwarm.sql.
--
-- mdify-cleanup-expired-jobs  every 30 minutes: deletes expired files.
-- mdify-jobs-tick             every minute: finishes background work when no
--                             browser is waiting (retries, archive images,
--                             merges) and retires stale jobs.
-- mdify-keepwarm-ocr          every 30 minutes, 12:00–23:30 UTC:
--                             GET /api/v1/health on each OCR backend.
-- mdify-keepwarm-record       00:05 UTC daily: records the outcome of the
--                             window's last pings before pg_net drops them.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'mdify-cleanup-expired-jobs',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/cleanup-expired-jobs',
    -- Authorization passes the platform's JWT check; the cron secret is what
    -- the function itself checks (function secret MDIFY_CRON_SECRET).
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'mdify_service_role_key'
      ),
      'x-mdify-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'mdify_cron_secret'
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

-- Keep-warm budget: Render gives a workspace 750 free instance hours a month
-- and suspends every free service when they run out. A free instance sleeps
-- after 15 idle minutes, so a ping every 30 minutes wakes it each time and it
-- is awake about 16 of every 30 minutes (asleep the rest): about 6.4 h a day,
-- about 400 h a month for two instances.
select cron.schedule(
  'mdify-keepwarm-ocr',
  '*/30 12-23 * * *',
  $$ select public.keepwarm_ping(); $$
);

select cron.schedule(
  'mdify-keepwarm-record',
  '5 0 * * *',
  $$ select public.keepwarm_record(); $$
);
