# Supabase Report (Storage + Postgres)

**Updated:** 2026-09-27 · Replaces `STORAGE_DATABASE_REPORT.md` (Cloudflare R2/D1 was
dropped for Supabase on 2026-09-26).
Labels: **VERIFIED** (run here), **IMPLEMENTED BUT UNTESTED** (code and unit tests with
fakes, never run against Supabase), **NOT IMPLEMENTED**, **NOT TESTED**.

## Why nothing here is VERIFIED yet

There is no MDify Supabase project. The owner will create it. The only project in the
connected account (`TheHopeTarot-database`) is unrelated and was not touched. Everything
below runs against fakes until the project ref, URL and service-role key exist.

## Status

| Area | Status | Where / evidence |
|---|---|---|
| Schema: `jobs`, `file_objects`, `job_events`, `audit_logs`, 12 indexes | IMPLEMENTED BUT UNTESTED | `supabase/migrations/20260926000000_mdify_init.sql`. Parsed with pglast (SQL and PL/pgSQL), no syntax errors |
| RPCs `confirm_upload`, `sweep_stale_jobs`, `claim_cleanup_batch` (`FOR UPDATE SKIP LOCKED`), `request_delete_now`, `get_admin_kpis` | IMPLEMENTED BUT UNTESTED | Same migration. All `SECURITY INVOKER`, executable by `service_role` only, grants revoked from `anon` and `authenticated` explicitly |
| Permission check script | IMPLEMENTED BUT UNTESTED | `supabase/tests/verify_permissions.sql` |
| Private bucket `mdify-pro-files`, 15 MB bucket limit | IMPLEMENTED BUT UNTESTED | Created by the migration. The app enforces 15 MB for documents and 10 MB for images before issuing an upload URL |
| Browser upload to a signed URL, then `/api/jobs/:id/start` | IMPLEMENTED BUT UNTESTED | `frontend/lib/models/conversionService.js`, `app/api/uploads/create`, `app/api/jobs/[id]/start`. Falls back to `/api/convert` when the server answers 501 (Supabase not configured) |
| Job service: create, confirm, dispatch, record events, signed download (600 s) | IMPLEMENTED BUT UNTESTED | `frontend/lib/server/jobService.js`, `supabaseRest.js`. 10 unit tests with a fake Supabase (`frontend/test/storageFlow.test.mjs`) pass |
| Backends read input from and write output to Storage | IMPLEMENTED BUT UNTESTED | `POST /api/v1/internal/process`, `app/common/storage.py` (path allowlist `jobs/<uuid>/...`). 13 unit tests with a fake Storage pass (11 backendN, 2 backendO) |
| 48-hour retention and cleanup | IMPLEMENTED BUT UNTESTED | Edge Function `supabase/functions/cleanup-expired-jobs`, schedule in `supabase/cron.sql` (every 30 minutes) |
| Legal text states the retention | DONE | Privacy Policy section 4 uses `RETENTION_HOURS = 48` from `frontend/lib/legal/policies.js`, checked by `legalStyle.test.mjs` |
| Admin area `/mdify-controller` (KPIs, keep, extend, delete now) | NOT IMPLEMENTED | Needs the project. Design: `docs/ADMIN_ARCHITECTURE.md` |
| Reconciliation (orphan objects without rows, rows without objects) | NOT IMPLEMENTED | |
| Failure injection (Storage or DB down during a job) | NOT TESTED | |

## Required metrics

| Metric | Value |
|---|---|
| Storage signed upload / server download / upload / signed download latency | NOT TESTED |
| DB insert, update, single-row read | NOT TESTED |
| `get_admin_kpis()` latency | NOT TESTED |
| 100-row list and 1,000-row paginated list | NOT TESTED |
| Cleanup batch throughput | NOT TESTED |
| Error rate under load | NOT TESTED |

## Facts from the local runs that shaped the design

- **Uploads through Vercel can't carry large files.** Vercel caps request and response
  bodies at 4.5 MB. A 14 MB text file produced 14 MB of Markdown. Files and results
  therefore travel by signed URL, and only small JSON goes through the functions.
- **Backends stay light.** The backendN environment is 298 MB installed, so both
  backends talk to Storage over REST with `httpx` instead of an S3 SDK.
- **The process endpoint returns a 4,000-character preview, not the whole result**, so
  large Markdown never passes through a function response.

## To finish this phase

1. Create the Supabase project (EU region recommended, it appears in the Privacy Policy).
2. Apply the migration, then run `supabase/tests/verify_permissions.sql`.
3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_STORAGE_BUCKET` on the frontend
   and all four backends (server-side only, never `NEXT_PUBLIC_`).
4. Deploy the cleanup Edge Function and the cron schedule.
5. Run the end-to-end flow, then fill the metrics table above with the harness.
