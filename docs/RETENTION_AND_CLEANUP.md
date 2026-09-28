# Retention and cleanup — as built

Status: SQL **VERIFIED on PGlite** (`frontend/test/sql/*.test.mjs`). Storage list/delete calls were
checked against the real project (`tests/integration/storage_live.mjs`). Edge Function deployed and
scheduled on 2026-09-28, but the first version was **BROKEN**: it compared the caller's key with
`SUPABASE_SERVICE_ROLE_KEY`, and on the live project the key string the function receives differs
from the dashboard's legacy key. Every call got 401 `unauthorized`, so nothing was deleted. The code
now checks the cron secret instead; it works once the steps below are done. Not yet tested live.

## Policy

- `AUTO` (default): files deleted after `upload_completed_at + 48 h`.
  `confirm_upload()` sets the deadline atomically.
- `KEEP`: never selected by cleanup.
- `EXTEND`: deleted after `retention_extended_until`.
- `DELETE_NOW`: `request_delete_now()`. An active job is asked to cancel first; a finished job becomes due immediately.
- Files are never deleted while a job is `UPLOADING`, `QUEUED` or `PROCESSING`.
- Abandoned uploads (> 2 h) and stuck jobs (> 15 min) are retired by `sweep_stale_jobs()`, so their objects get cleaned too.

## Run (every 30 min, `supabase/cron.sql`)

Access: the cron job sends two headers from Vault. `Authorization: Bearer <legacy service_role
key>` (`mdify_service_role_key`) passes the platform's JWT check (JWT verification stays on).
`x-mdify-cron-secret` (`mdify_cron_secret`) must equal the function secret `MDIFY_CRON_SECRET`
(Edge Functions → Secrets), the same value as the frontend's `CRON_SECRET`; the function compares
it in constant time and answers 401 otherwise. For Storage and the database the function uses
`SUPABASE_SERVICE_ROLE_KEY`, or the default key in `SUPABASE_SECRET_KEYS`.

To finish the fix on a project that ran the first version:

1. Edge Functions → Secrets: add `MDIFY_CRON_SECRET` = the value of `CRON_SECRET`.
2. Edge Functions → cleanup-expired-jobs → Code: paste the current `index.ts`, deploy.
3. SQL Editor: run the `mdify-cleanup-expired-jobs` block of `supabase/cron.sql` again (with the
   project ref filled in). It updates the job in place so it sends the new header.

The run stays every 30 minutes on purpose. Files are due 48 hours after upload, so they are gone
48 to 48.5 hours after upload, which is what the site and the Privacy Policy promise ("within 48
hours", "cleanup runs every 30 minutes"). A 48-hour run interval would keep files up to 96 hours.

```text
Supabase Cron (pg_cron + pg_net, secrets from Vault)
 → Edge Function cleanup-expired-jobs (checks x-mdify-cron-secret)
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
