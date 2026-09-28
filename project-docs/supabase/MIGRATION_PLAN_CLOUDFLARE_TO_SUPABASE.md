# MarkDify — Migration Plan: Cloudflare R2/D1 → Supabase Storage/Postgres

**Migration target:** Supabase Storage + Supabase Postgres  
**Compute remains unchanged:**
- Frontend → Vercel
- N1/N2 → Vercel
- O1/O2 → Render

---

# 1. Migration Objective

Replace:

```text
Cloudflare R2
Cloudflare D1
Cloudflare D1 proxy Worker
```

with:

```text
Supabase Storage
Supabase Postgres
Supabase Cron / Edge Function for cleanup
```

Do not rewrite working conversion logic unnecessarily.

Only replace provider integrations and related architecture.

---

# 2. Pre-Migration Inventory

Before changing code, inspect the actual repository.

Determine:

- whether Cloudflare R2 is actually provisioned
- whether D1 is actually provisioned
- whether the Worker is deployed
- whether production data exists
- number of objects
- total bytes
- D1 row count
- active jobs
- existing retention data
- current environment variables
- current provider abstractions

If Cloudflare is only code/config and has no production data:

```text
skip historical data copy
```

Do not manufacture a migration step for data that does not exist.

---

# 3. Preserve Provider Abstractions

If the project already has interfaces such as:

```text
StorageProvider
MetadataProvider
```

keep them.

Implement:

```text
SupabaseStorageProvider
SupabaseJobRepository
```

Do not scatter Supabase SDK calls across route handlers.

---

# 4. Phase 1 — Provision Supabase

Create/configure:

```text
Supabase project
private Storage bucket: markdify-files
Postgres schema
RLS/grants
server credentials
S3 credentials
Cron
```

Enable S3 protocol if S3 clients will be used.

Create separate development/staging/production values where practical.

---

# 5. Phase 2 — Apply Database Schema

Apply migration for:

```text
jobs
file_objects
job_events
audit_logs
```

Apply:

```text
constraints
indexes
RLS
grants
KPI function
cleanup claim function
updated_at trigger
```

Run database tests before application cutover.

---

# 6. Phase 3 — Configure Storage

Create:

```text
markdify-files
```

as a private bucket.

Test:

- signed upload
- resumable upload
- server S3 read
- server S3 write
- signed download
- delete

Verify N1/N2/O1/O2 can access Storage using server-only credentials.

---

# 7. Phase 4 — Environment Variable Migration

## Remove after cutover

Old Cloudflare-specific values may include:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_ENDPOINT_URL=

D1_PROXY_URL=
D1_PROXY_TOKEN=
```

Do not remove them until rollback is no longer needed.

## Add Supabase

Suggested server values:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

SUPABASE_STORAGE_BUCKET=markdify-files

SUPABASE_S3_ENDPOINT=
SUPABASE_S3_REGION=
SUPABASE_S3_ACCESS_KEY_ID=
SUPABASE_S3_SECRET_ACCESS_KEY=
```

Migration tooling may also require:

```env
SUPABASE_DB_URL=
```

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
S3 secret
DB URL/password
```

to browser code.

---

# 8. Phase 5 — Replace Storage Provider

Replace Cloudflare R2 implementation with Supabase Storage.

Preserve the application contract.

Required methods:

```text
create upload authorization
read source
write output
delete file
list job files
signed download
bulk cleanup
```

Do not change conversion engines in this phase.

---

# 9. Phase 6 — Replace D1 Repository

Remove application dependence on:

```text
D1_PROXY_URL
D1_PROXY_TOKEN
Cloudflare D1 Worker
```

Implement Supabase Postgres repository for:

```text
create job
get job
list jobs
update state
insert file metadata
job events
KPIs
audit
retention
cleanup
```

Use transactions/RPC for operations requiring atomicity.

---

# 10. Phase 7 — Direct Browser Upload

Replace R2 presigned upload flow with Supabase direct upload.

Recommended:

```text
<= ~6 MB:
signed standard upload

> ~6 MB:
TUS resumable upload
```

Do not place S3 access keys in the browser.

Test:

- upload progress
- retry
- cancellation
- network interruption
- long filenames
- duplicate source name
- maximum allowed size

---

# 11. Phase 8 — Output and Download Migration

Backends write output to:

```text
jobs/<job_id>/output/result.md
```

Browser/admin download via short-lived signed URLs.

Do not route large output files through Vercel if direct signed download works.

---

# 12. Phase 9 — Retention Migration

Implement:

```text
Supabase Cron
→ cleanup Edge Function
→ claim_cleanup_batch RPC
→ Storage delete
→ database finalize
```

Verify:

```text
AUTO
KEEP
EXTEND
DELETE_NOW
```

before enabling automatic cleanup in production.

---

# 13. Phase 10 — Admin Migration

Update `/mdify-controller` to use Supabase-backed endpoints for:

```text
KPIs
jobs
files
audit
retention
cleanup
download
ZIP export
reconciliation
```

The two-key authentication model remains unchanged unless separately redesigned.

---

# 14. Historical Data Migration — If Data Exists

Only perform this phase if Cloudflare has real production data.

## D1 → Postgres

Export:

```text
jobs
metadata
audit records if present
```

Transform field names/types.

Import in batches.

Validate:

```text
row counts
job IDs
timestamps
statuses
object paths
```

## R2 → Supabase Storage

Copy objects using an S3-compatible migration tool or controlled script.

Preserve deterministic keys where possible.

For each object verify:

```text
source size
destination size
checksum/etag where meaningful
```

Do not delete R2 originals yet.

---

# 15. Path Mapping

If existing R2 paths are already good:

```text
jobs/<job_id>/...
```

preserve them.

If not, migrate to:

```text
jobs/<job_id>/input/source.<ext>
jobs/<job_id>/output/result.md
jobs/<job_id>/exports/<export_id>.zip
```

Record old→new path mapping during migration.

---

# 16. Shadow Verification

Before production cutover, run Supabase in shadow/test mode.

For representative jobs:

```text
conversion
→ write Supabase Storage
→ write Supabase Postgres
→ compare result with existing production behavior
```

Verify:

- object exists
- file size matches
- output content matches
- job state matches
- KPIs populate
- audit writes

---

# 17. Dual-Write Option

If production migration risk is high, temporarily dual-write metadata/files:

```text
primary old provider
+
shadow Supabase
```

Do this only for a short migration window.

Do not maintain permanent dual-write complexity.

If Cloudflare is not actually carrying production data, skip dual-write.

---

# 18. Cutover Order

Recommended:

1. database schema verified
2. Storage verified
3. N1 integration verified
4. N2 integration verified
5. O1 integration verified
6. O2 integration verified
7. admin verified
8. retention verified
9. frontend upload switched
10. output download switched
11. production monitored
12. Cloudflare retained temporarily for rollback
13. Cloudflare removed only after explicit acceptance

---

# 19. Rollback Plan

Until migration is signed off:

```text
keep old provider configuration
keep old code behind a feature/provider switch where practical
do not delete old R2 objects
do not destroy D1 data
```

Example provider flag:

```env
STORAGE_PROVIDER=supabase
METADATA_PROVIDER=supabase
```

Rollback:

```text
switch providers back
redeploy
```

Only support this during the migration window.

Remove dead provider code later.

---

# 20. Validation Checklist

## Storage

- [ ] private bucket
- [ ] signed upload
- [ ] TUS upload
- [ ] N1 read/write
- [ ] N2 read/write
- [ ] O1 read/write
- [ ] O2 read/write
- [ ] signed download
- [ ] deletion

## Database

- [ ] jobs
- [ ] file_objects
- [ ] events
- [ ] audit
- [ ] KPI function
- [ ] indexes
- [ ] RLS/grants
- [ ] cleanup RPC

## Application

- [ ] normal E2E
- [ ] OCR E2E
- [ ] parallel four-backend test
- [ ] admin
- [ ] ZIP export
- [ ] cleanup
- [ ] reconciliation

---

# 21. Cloudflare Decommission

After successful migration and rollback window:

Remove:

```text
D1 Worker deployment
D1 proxy client
R2 client/config
Cloudflare storage secrets
Cloudflare database secrets
obsolete R2/D1 documentation
```

Do not remove Cloudflare DNS/CDN configuration if the project uses Cloudflare for unrelated purposes.

This migration concerns only Storage/Database infrastructure.

---

# 22. Documentation Updates

Update:

```text
README
ARCHITECTURE
deployment docs
.env.example
admin docs
privacy/retention docs
testing docs
```

Replace outdated references:

```text
Cloudflare R2 → Supabase Storage
Cloudflare D1 → Supabase Postgres
D1 Worker → removed
```

---

# 23. Definition of Done

Migration is complete only when:

- [ ] Supabase Storage is production source of file bytes
- [ ] Supabase Postgres is production source of job metadata
- [ ] N1 works
- [ ] N2 works
- [ ] O1 works
- [ ] O2 works
- [ ] all four can work concurrently
- [ ] `/mdify-controller` works
- [ ] KPIs work
- [ ] audit works
- [ ] hybrid retention works
- [ ] historical data is migrated or confirmed nonexistent
- [ ] old provider rollback is tested
- [ ] Cloudflare storage/database dependencies are safely removed after acceptance
