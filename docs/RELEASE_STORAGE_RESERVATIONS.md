# Atomic upload Storage reservation rollout

Concurrent uploads previously read the same cached usage and could each pass without
reserving capacity. The database now serializes admission for the configured bucket,
counts fresh actual bytes plus unspent reservations, and creates the reservation, job
and pending input together. No signed URL is issued on refusal or unknown capacity.
The previous `create_upload_job` signature routes through the same safeguard during
rolling deployment and rollback. An input-insertion trigger also protects old RPC bodies
and legacy service inserts. Installing it fences prior file writers before backfill. No new secret or Edge Function deployment is needed.

## Accounting and trade-offs

- Default/fixed ceiling: 800 MiB per configured MDify bucket. An environment may lower
  this ceiling, but cannot raise it independently on a different deployment.
- Active forecast: max(bucket single-object limit, declared input × 2 for documents
  and images / × 3 for PDFs and archives). The bucket must have a finite positive
  single-object limit no larger than 15 MiB. Unknown/raised limits fail closed.
- Actual bytes are read from `storage.objects`, including unregistered objects and
  retained files. Invalid/missing size metadata fails closed. Storage-owned schema
  and object rows are never modified by this migration or its RPCs.
- Active unspent bytes: max(0, forecast − actual job bytes, guarded input ceiling −
  actual input bytes). Terminal jobs retain only the input guard until it expires.
- Signed upload tokens are valid for two hours, per
  https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl.
  They do not enforce the length declared to MDify. Three hours of headroom includes
  signing and in-flight grace. An unknown signing outcome keeps its reservation.
- Expired terminal reservations are pruned on the next admission. Active reservations
  do not expire. Actual retained files continue to count after pruning. Hard job
  deletion is restricted until its reservation has safely expired and been pruned.
- A newly issued tiny upload can hold almost 15 MiB for three hours. This deliberately
  trades admission throughput for protection against misdeclared or late uploads.
  No production saturation flood should be used to test the ceiling.

This is atomic admission of storage forecasts, not a hard project-wide physical-byte
cap. Worker writes are not serialized with admission; PDF/ZIP expansion can exceed its
estimate. Other buckets, late worker writes and deleting physical orphans remain
separate follow-ups. The existing admin usage display reports actual bytes, not pending
reservations; the service-only snapshot RPC exposes both for operational inspection.

## Rollout gates

1. Require all six CI jobs, including independent PostgreSQL sessions competing for
   exactly one remaining reservation. Check the exact PR revision before rollout.
2. Record the current frontend deployment, bucket private flag and file-size limit,
   active-job count, actual usage and existing RPC definitions. Keep that recovery
   evidence outside the repo; do not save credentials. A settings/metadata snapshot
   is not a full database backup.
3. In project `ppmbqgecdbrezxedyeur`, apply
   `supabase/migrations/20261007000000_mdify_storage_reservations.sql` in an explicit
   READ COMMITTED BEGIN/COMMIT transaction, then run `supabase/tests/verify_permissions.sql`.
   Existing jobs and retention schedules are not rewritten. Existing in-flight/recent
   input jobs receive reservations after the insertion trigger has drained prior writers. Reapplying the migration does not extend guards.
4. Inspect `select public.storage_capacity_snapshot('mdify-pro-files');`. If existing
   usage/reservations exceed 800 MiB, new uploads refuse safely while existing jobs
   finish. Missing/invalid Storage size metadata requires investigation; do not bypass
   admission to recover service. Leave normal schedules enabled.
5. Verify one synthetic upload/start/result against the PR frontend, and remove only
   that fixture's files through owned, individually scoped cleanup. Confirm its
   reservation remains while its upload token could still write. No legal acceptance
   is implied by the test; use an API fixture or obtain approval if a UI requires it.
6. Merge/promote only after these checks, verify one new production conversion, and
   inspect scheduled ticks/health. Verify the deployed commit; automatic deployment
   after merge was not established by the previous release.

## Rollback

Restore the prior frontend while keeping the migration. The old RPC remains available
and reserved admission continues. Never delete live reservations or restore the old
unreserved RPC as routine rollback: that would allow still-valid upload tokens to
consume space whose reservation was discarded. No bucket files are deleted by rollback.
