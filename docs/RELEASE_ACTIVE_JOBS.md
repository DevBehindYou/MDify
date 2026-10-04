# Active-job capacity release

The database admits at most 32 active jobs across all frontend instances.
UPLOADING, QUEUED, PROCESSING and CANCEL_REQUESTED all occupy a slot; only
committed terminal transitions release capacity. This is an active-root
ceiling, not a per-pool worker count, Storage quota, or expanded-work-item cap.
The fixed ceiling accommodates a 20-file batch without letting deployments
independently increase admission. Existing shared request budgets still apply.

`create_upload_job` inserts the job and pending input metadata in one transaction
before an upload URL can be signed. A trigger serializes capacity checks and
also protects older frontend inserts and terminal-to-active transitions.
Existing over-cap queues are preserved and allowed to finish. New uploads are
refused until capacity is available. Full/unavailable admission returns 503,
Retry-After: 30 and no-store; unavailable RPCs never fall back to direct inserts.

An unknown signing outcome retains its UPLOADING job and file metadata. Normal
stale-upload recovery retires it; no eager deletion is attempted because an
upload authorization may have been issued. Retired jobs do not invalidate an
already-issued signed upload URL. Late writes and physical Storage reservations
remain separate follow-ups. The existing Storage estimate remains cached and
fail-open and must not be described as a hard total-byte guarantee.

## Rollout

1. Require all CI jobs and previews to pass, including independent PostgreSQL
   races against both the RPC and legacy direct inserts. Record the deployed
   frontend revision and database recovery baseline before schema changes.
2. In MDify project ppmbqgecdbrezxedyeur, apply
   `supabase/migrations/20261004010000_mdify_active_jobs.sql` inside an explicit
   BEGIN/COMMIT transaction. It creates functions and a trigger and does not
   delete, cancel or rewrite existing jobs. No Edge deployment or new secret is
   required. The trigger immediately guards old frontend inserts; a full queue
   on the old frontend may show its generic retry error until promotion.
3. Run `supabase/tests/verify_permissions.sql`; every row must pass. Check the
   current active-job count. Do not flood production to exercise saturation.
4. Verify one synthetic preview upload/start/download, normal stale-upload
   recovery and scheduled tick responses. An unapplied migration must produce
   503, never an unbounded fallback. Merge/promote only after these gates pass.
5. Verify a fresh production conversion, and remove only its synthetic files
   through individually scoped cleanup. Leave normal cron schedules enabled.

Rollback restores the prior frontend while retaining the additive RPC and
capacity trigger. Removing the trigger disables the active-job bound and is
not part of routine rollback. Restoring an old frontend does not invalidate
already-signed upload authorizations.
