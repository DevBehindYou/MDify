# Going live — checklist

Do these in order. Nothing here is done yet unless marked.

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

In Supabase → Project Settings → Vault, add:

- `mdify_service_role_key` = the project's service role key
- `mdify_cron_secret` = the same value as `CRON_SECRET`

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

1. `supabase functions deploy cleanup-expired-jobs`
2. SQL Editor: run `supabase/cron.sql` after replacing `<project-ref>`.
   It schedules the cleanup (every 30 minutes) and the job tick (every minute).

## 6. Measure (step 5 of the plan)

Convert a document, an image, a scanned PDF and a ZIP with images on the live site; watch them in
`/mdify-controller`. Then rerun the load harness in `tests/load/` against the deployed URLs and update
`docs/testing/CAPACITY_SUMMARY.md` (Render Free wake-up, Vercel cold starts, queue throughput).
