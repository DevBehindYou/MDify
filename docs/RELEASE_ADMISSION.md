# Shared admission release

New uploads and multipart conversions share a database token bucket: burst 10
per client and 60 globally, refilling at those rates each minute. Start/advance
share 120 per client and 600 globally; backend wake shares 6 per client and 30
globally. These count requests, not completed conversions. Database limits are
fixed so simultaneous deployments cannot independently expand the allowance.

The multipart path also has two shared reservations. Successful single-attempt
responses and validation failures release their reservation. Timeouts, retries
and uncertain backend failures retain it for 330 seconds, longer than the
300 second frontend function ceiling. These reservations bound admitted
multipart requests; existing durable queue pool limits remain separate. They
do not terminate a backend process that exceeds its own timeout.

The routes check admission before reading request bodies, issuing upload URLs,
starting work or waking backends. Per-client throttles return 429; shared
capacity and unavailable admission return 503. Both include Retry-After and
no-store. Oversized streamed requests return 413 even with a missing or false
Content-Length: upload metadata is capped at 8 KiB, multipart bodies at 16 MiB.
File limits still apply separately (15 MiB documents, 10 MiB images).

On Vercel, only its x-vercel-forwarded-for header determines the client. See
[Vercel request headers](https://vercel.com/docs/headers/request-headers).
Missing/invalid platform headers and self-hosted requests share an unknown
client bucket. Do not trust arbitrary forwarded headers on a self-hosted server.
The server derives a daily HMAC using its existing BACKEND_SHARED_SECRET; raw
addresses never enter the database or admission logs. Idle client keys expire
after one hour and the authenticated minute tick prunes them even without
public traffic. Secret/day rotation resets client buckets; global budgets and
multipart reservations continue. Users behind the same proxy share a bucket.

## Rollout gates

1. Wait for all six CI jobs and frontend preview build, including competing
   PostgreSQL connections, direct handler tests, permissions and Edge checks.
2. Record the deployed frontend revision and database backup. Apply the additive
   migration `20261004000000_mdify_public_admission.sql` to MDify project
   `ppmbqgecdbrezxedyeur`. It creates isolated tables/RPCs and does not change the
   old frontend. No Edge Function change or new secret is required.
3. Run `supabase/tests/verify_permissions.sql`; every row must pass. Verify one
   synthetic keyed admission/release without running a production rate flood.
4. Deploy the frontend preview with the existing MDify Supabase and backend
   settings. Verify synthetic upload/start/download and multipart compatibility.
   A preview without the migration must return 503 rather than silently bypass.
5. Merge/promote after these gates pass. Check the authenticated minute tick's
   normal scheduled execution, including idle-key pruning. Do not call the
   global tick manually against production as a smoke test.

Without a database, the multipart/wake fallback is allowed only during local
`next dev` (NODE_ENV=development and VERCEL != 1). Production and preview require
shared admission; an unavailable database or missing migration fails closed.
Rollback: restore the previous frontend while leaving these additive tables
and functions installed. That rollback also removes public admission enforcement.

## Remaining resource work

This change bounds incoming work requests and multipart reservations. Atomic
Storage reservations, output/intermediate expansion limits, queue backlog caps
and orphan reconciliation remain follow-ups. The existing Storage budget estimate
is not a hard physical-byte guarantee. Do not increase workers or processing
concurrency based only on these request limits.
