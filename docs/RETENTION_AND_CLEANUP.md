# Retention and cleanup — as built

Status: SQL **VERIFIED on PGlite** (`frontend/test/sql/*.test.mjs`); Edge Function **IMPLEMENTED BUT
UNTESTED** (not deployed). Storage list/delete calls were checked against the real project
(`tests/integration/storage_live.mjs`).

## Policy

- `AUTO` (default): files deleted after `upload_completed_at + 48 h`.
  `confirm_upload()` sets the deadline atomically.
- `KEEP`: never selected by cleanup.
- `EXTEND`: deleted after `retention_extended_until`.
- `DELETE_NOW`: `request_delete_now()`. An active job is asked to cancel first; a finished job becomes due immediately.
- Files are never deleted while a job is `UPLOADING`, `QUEUED` or `PROCESSING`.
- Abandoned uploads (> 2 h) and stuck jobs (> 15 min) are retired by `sweep_stale_jobs()`, so their objects get cleaned too.

## Run (every 30 min, `supabase/cron.sql`)

```text
Supabase Cron (pg_cron + pg_net, key from Vault)
 → Edge Function cleanup-expired-jobs
   → sweep_stale_jobs()
   → claim_cleanup_batch(100)           FOR UPDATE SKIP LOCKED, attempt cap 5
   → per job: file_objects DELETE_PENDING
              → Storage: list every object under jobs/<id>/ (folders recursively) and remove
                them all, registered or not (rendered PDF pages, ZIP images, partial results)
              → mark_job_files_deleted(): file_objects DELETED, job files_deleted_at +
                cleanup COMPLETE, then forget_job_details(): original_filename, archive
                paths, work item payloads and result names cleared
              on Storage error: cleanup PARTIAL + cleanup_last_error (retried next run)
   → audit_logs: CLEANUP_RUN / CLEANUP_FAILURE with counts and bytes
```

Storage objects are deleted before any metadata is finalized. Job rows are kept (for KPIs)
without the user's file names. The admin's "Delete files now" runs the same steps at once
(`frontend/lib/server/adminService.js#purgeJobFiles`); "Delete job and files" also removes the rows.

## Legal text

Updated on 26 September 2026. The Privacy Policy and Terms of Service live in
`frontend/lib/legal/policies.js` and state the 48-hour retention (`RETENTION_HOURS`).
Both the in-app modal (`LegalModal`) and the standalone `/privacy` and `/terms` pages
render that one source. `POLICY_VERSION` in `frontend/lib/models/consentRepository.js`
is now `LEGAL_VERSION` from the same file, so any edit that bumps `LEGAL_VERSION` makes
everyone accept the new text again. `frontend/test/legalStyle.test.mjs` checks that the
text names the retention period that the code uses.

The statement stays true in both transport modes: with Supabase Storage, files are
deleted within 48 hours, and with the multipart fallback nothing is stored at all.

`OPERATOR` names DevBehindYou and devbehindyou@gmail.com. By the owner's decision
(2026-09-27) the documents give no postal address, EU representative, storage region
or governing-law country, and describe providers by category, available on request.
