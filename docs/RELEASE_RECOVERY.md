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
