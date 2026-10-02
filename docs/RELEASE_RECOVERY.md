# Recovery release gates

Apply the additive migration `20261001000000_mdify_atomic_jobs.sql` to the **MDify** database before deploying the frontend that calls its RPCs. Keep the existing RPCs during the rolling release. This migration alone does not change the old frontend's conversion behavior.

1. Wait for all Checks jobs: frontend unit/SQL tests, lint, generated artifacts and production build; N/O/Z Python tests; independent PostgreSQL connection concurrency tests.
2. Back up the database and record the frontend's currently deployed revision. Apply the migration as one transaction in the MDify SQL Editor. Never apply it to the unrelated connector account.
3. Verify the three new RPCs exist, are invoker functions and cannot be executed by anon/authenticated. Verify service_role access.
4. Deploy a preview using the selected MDify project settings. Convert a synthetic document, image, scanned PDF and ZIP; check registered outputs and repeat start/result retrieval. Do not use private user files for smoke tests.
5. Promote only after the migration and smoke checks pass. Check the existing cron tick returns a successful response and jobs settle after the browser closes.
6. On failure, roll the frontend back to its previous deployed revision. Leave the additive migration in place; do not remove old signatures while an older deployment may still use them.

The GitHub workflow runs in isolated synthetic environments and does not deploy or mutate production. Passing local checks is not evidence that the production database has the migration. Production promotion remains blocked until the MDify migration and end-to-end smoke checks are recorded.

## Expected recovery changes

Upload activation, root enqueue and the queued event share one transaction after Storage metadata verification. Child expansion checks the parent attempt before writing. Completion, output rows and completion event share one transaction. Repeated terminal retrieval repairs missing output metadata left by the previous frontend. Malformed HTTP 200 JSON is treated as an infrastructure error.

## Cleanup recovery release

This release also requires `20261001010000_mdify_cleanup_recovery.sql`. It changes cleanup ownership and requires the updated Edge Function and frontend together. Vercel/Render deployments do **not** deploy Supabase SQL or Edge Functions.

1. Leave this PR unmerged until the database and Edge release can be coordinated. Pause the cleanup cron and avoid admin deletion actions during the rollout. Record the currently deployed Edge revision and back up the database.
2. Apply the cleanup migration in one transaction, then deploy `cleanup-expired-jobs` from this commit, including `cleanup.mjs`. Verify `MDIFY_CRON_SECRET` remains configured and `verify_jwt` remains false for the custom cron header. Never print the secret. `supabase/config.toml` persists this setting for CLI deployments. A Dashboard deployment must also disable the platform JWT check; a header-less request must reach our handler and return `{ "error": "unauthorized" }`, rather than a platform `UNAUTHORIZED_NO_AUTH_HEADER` response. CLI example: `supabase functions deploy cleanup-expired-jobs --project-ref ppmbqgecdbrezxedyeur --no-verify-jwt`.
3. Wait for every Checks job, including Edge compilation and competing PostgreSQL cleanup claims. Confirm the production RPCs exist and run `supabase/tests/verify_permissions.sql` (every `ok` must be true) before merging/promoting the frontend. Verify the build includes the shared cleanup module.
4. Use a synthetic completed job for an admin Delete now check and an expired synthetic job for an authorized cron check. Verify Storage is empty, files_deleted_at is set, only one owner finishes, and filenames/metadata are forgotten. An unauthorized cron request must return 401. A failed cleanup returns 500 and must not count the job as deleted.
5. Re-enable the cleanup cron after these checks pass. On failure, leave the cron paused and fix forward. Rolling back only the frontend is safe for conversions, but old cleanup/admin code cannot honor ownership tokens; do not resume old deletion code against active new leases.

A pending cleanup claim can be invalidated by KEEP/EXTEND. Once deletion starts, retention changes return 409 because removed objects cannot be restored. Expired DELETING leases are reclaimed with a new token; stale owners cannot finish or overwrite recovery state. Requests have a 30 second timeout, well below the 30 minute lease. Excessive folder depth fails visibly rather than silently omitting objects.

## Verified atomic release (PR #3)

All five GitHub Checks jobs and Vercel preview checks passed. After the owner applied the atomic migration, all three RPC availability probes succeeded. Synthetic production conversions passed for TXT, PNG OCR, scanned PDF (3 work items), and ZIP (3 registered outputs). Downloads, repeated starts and one completion event were verified; synthetic Storage objects were removed afterward. These checks validate the exercised paths, not every possible production input or provider failure.

To pause the existing cleanup schedule in the MDify SQL Editor:

```sql
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'mdify-cleanup-expired-jobs';
select jobname, active from cron.job
where jobname = 'mdify-cleanup-expired-jobs';
```

Wait for any in-flight invocation to finish before applying the migration. After deployment and the synthetic smoke check succeed, repeat the first query with `active := true`. Do not re-run the placeholder cron template against production without replacing its project reference and frontend URL.
