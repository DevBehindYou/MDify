# Supabase Postgres — as built

Migration: `supabase/migrations/20260926000000_mdify_init.sql`.
Status: **VERIFIED on PGlite** (`frontend/test/sql/`) and **LIVE**: all migrations were applied to the
MDify project on 2026-09-28 through `supabase/MDIFY_SETUP.sql`; tables, bucket and the admin RPCs
were checked there. `supabase/tests/verify_permissions.sql` checks grants.
Later migrations: `…_mdify_work_queue.sql` (`docs/BACKGROUND_JOBS.md`), `…_mdify_admin.sql`
(`docs/ADMIN_ARCHITECTURE.md`) and `…_mdify_keepwarm.sql`: table `keepwarm_pings` (status code or
error per OCR health ping; successes kept 1 day, failures 14 days), `keepwarm_ping()` and
`keepwarm_record()`, called only by Supabase Cron; RLS on, no API role has access.

## Tables

`jobs`, `file_objects`, `job_events`, `audit_logs` — columns as in
`project-docs/supabase/SUPABASE_SCHEMA.sql`. `jobs.completed_at` is set for COMPLETED,
FAILED and CANCELLED. `audit_logs` has no foreign key, so it survives a job hard delete.

## Functions (all SECURITY INVOKER, EXECUTE for `service_role` only)

| Function | Purpose |
|----------|---------|
| `confirm_upload(job_id)` | UPLOADING → QUEUED; sets `upload_completed_at` and `auto_delete_at = now() + 48 h` atomically |
| `sweep_stale_jobs()` | UPLOADING > 2 h (signed upload URLs expire) → CANCELLED; QUEUED/PROCESSING > 15 min → FAILED `STALE` |
| `claim_cleanup_batch(n)` | `FOR UPDATE SKIP LOCKED` claim of expired AUTO/EXTEND jobs; reclaims claims older than 30 min; caps at 5 attempts |
| `request_delete_now(job_id)` | active job → CANCEL_REQUESTED; finished job (even KEEP) → due immediately |
| `get_admin_kpis()` | one JSON document for the dashboard, incl. per-instance counts today |

## Access control

- RLS enabled on all four tables. Grants for `anon` and `authenticated` are revoked
  explicitly: Supabase's default privileges grant them access, so revoking only from
  `PUBLIC` would not be enough (Supabase lint 0028/0029).
- `service_role`: CRUD on jobs/file_objects/job_events; **insert + select only** on
  `audit_logs` (append-only for the app).
- Browsers never call PostgREST; all access goes through the frontend server.

## Write pattern (from `frontend/lib/server/jobService.js`)

| Stage | Writes |
|-------|--------|
| upload create | `jobs` insert (UPLOADING), `file_objects` INPUT PENDING |
| start | `confirm_upload()`, INPUT → ACTIVE, job → PROCESSING |
| success | `file_objects` OUTPUT ACTIVE, job → COMPLETED with instance/engine/timings, `job_events` COMPLETED |
| failure | job → FAILED with `error_code HTTP_<status>`, `job_events` FAILED |

About 7 writes per job, one per stage. There are no progress-percentage writes.
The app sends profile `Standard`/`RAG-ready` etc. and instances `N1`…`O2`; these are
mapped to the schema's `standard`/`rag_ready` and `n1`…`o2`.

## Indexes

As in the package, plus `jobs(completed_at)` for the "today" KPI filters. They must be
checked with `EXPLAIN ANALYZE` on real data, which is **NOT TESTED**.
