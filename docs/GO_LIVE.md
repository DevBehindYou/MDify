# Going live — checklist

Do these in order. Nothing here is done yet unless marked.

## 0. Vercel pitfalls (learned 2026-09-28)

- **The `mdify-app` project builds from the repo root.** Pushing the new layout (app in `frontend/`) on
  2026-09-28 (commit `51e71c2 New-App-Launch`) made Vercel publish the repo root as a static site: the
  home page returned 404 and repo files were served. Fix: Instant Rollback to the previous production
  deployment, then set Root Directory = `frontend` before promoting the new frontend. A rollback also
  stops pushes from going live automatically until a deployment is promoted again.
- **Use production domains for backends** (`https://mdify-n1.vercel.app`), never the long generated
  deployment URLs (`…-<hash>-<team>.vercel.app`): on Hobby, Standard Deployment Protection puts those
  behind a Vercel login, so server-to-server calls would fail.
- **Never deploy with the local secret.** The local `.env` files use the placeholder `change-me` as the
  shared secret. Production needs a new value from `openssl rand -hex 32`.
- Put Vercel Function regions and the Render region close to the Supabase project's region.

## 1. Database (Supabase SQL Editor)

1. Open the MDify project → SQL Editor → paste `supabase/MDIFY_SETUP.sql` → Run.
   It is one transaction and safe to run again. It creates the tables, functions, permissions and sets
   the `mdify-pro-files` bucket to private with a 15 MB file limit.
2. Check: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/integration/storage_live.mjs`
   should end with `tables: {"jobs":"present",...}` and `file_size_limit=15728640`.

## 2. Secrets

Generate each with `openssl rand -hex 32`:

- `BACKEND_SHARED_SECRET` (frontend) = `INTERNAL_SHARED_SECRET` (every backend instance)
- `CRON_SECRET` (frontend)
- `ADMIN_KEY_1`, `ADMIN_KEY_2` (frontend, two different values)

In Supabase → Integrations → Vault, add:

- `mdify_service_role_key` = the project's legacy `service_role` key (passes the platform's
  JWT check on the cleanup function)
- `mdify_cron_secret` = the same value as `CRON_SECRET`
- `mdify_keepwarm_url_o1`, `mdify_keepwarm_url_o2` = the O1 and O2 base URLs (no path)

## 3. Backends

| Instances | Where | Root | Env |
|-----------|-------|------|-----|
| N1, N2 | two Vercel projects | `backendN` | `BACKEND_INSTANCE`, `INTERNAL_SHARED_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Z1, Z2 | two Vercel projects | `backendZ` | same as N |
| O1, O2 | Render (Free), `render.yaml` | `backendO` | same, set in the Render dashboard (`sync: false`) |

Check each: `GET <url>/api/v1/ready` returns `ready: true`, `secret_configured: true`,
`storage_configured: true`.

## 4. Frontend (Vercel)

Set `NORMAL_BACKEND_URLS`, `OCR_BACKEND_URLS`, `ARCHIVE_BACKEND_URLS` (comma-separated),
`BACKEND_SHARED_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ADMIN_KEY_1`,
`ADMIN_KEY_2`. Deploy. Open `/mdify-controller` → Processes: all instances ready.

## 5. Schedules

1. `supabase functions deploy cleanup-expired-jobs` (or Dashboard → Edge Functions → Via Editor),
   JWT verification on. Edge Functions → Secrets: add `MDIFY_CRON_SECRET` = the same value as
   `CRON_SECRET`. The function accepts only callers that send it as `x-mdify-cron-secret`.
2. SQL Editor: run `supabase/cron.sql` after replacing `<project-ref>`.
   It schedules the cleanup (every 30 minutes), the job tick (every minute) and the OCR
   keep-warm (every 30 minutes, 12:00–23:30 UTC; about 400 of Render's 750 free hours a month
   for two instances. Render sleeps after 15 idle minutes, so each ping wakes the instance).
3. Keep-warm outcomes (status only, no response bodies):
   `select instance, requested_at, status_code, error from public.keepwarm_pings order by id desc limit 20;`

## 6. Measure (step 5 of the plan)

Convert a document, an image, a scanned PDF and a ZIP with images on the live site; watch them in
`/mdify-controller`. Then rerun the load harness in `tests/load/` against the deployed URLs and update
`docs/testing/CAPACITY_SUMMARY.md` (Render Free wake-up, Vercel cold starts, queue throughput).
