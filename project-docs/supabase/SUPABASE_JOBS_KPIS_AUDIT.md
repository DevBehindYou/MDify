# MarkDify — Supabase Postgres Jobs, KPIs & Audit Architecture

**Database:** Supabase Postgres  
**Purpose:** durable job state, file metadata, operational KPIs, retention state, and audit logs

---

# 1. Decision

Cloudflare D1 is replaced by **Supabase Postgres**.

The Cloudflare D1 proxy Worker is no longer part of the target architecture.

All trusted MarkDify services should use Supabase through:

- server-side Supabase client / Data API, or
- an appropriate pooled Postgres connection where actually needed

Do not expose service-role credentials to the browser.

---

# 2. Database Role in the System

Supabase Postgres is the authoritative source for:

```text
job state
processing state
backend assignment
retry state
file metadata
retention
cleanup state
KPIs
audit records
job event history
```

Supabase Storage remains authoritative for the actual file bytes.

---

# 3. Core Tables

Use:

```text
jobs
file_objects
job_events
audit_logs
```

Optional future tables:

```text
daily_metrics
admin_sessions
export_jobs
```

Do not add optional tables unless they solve an actual requirement.

---

# 4. jobs Table

The `jobs` table represents one logical conversion job.

Recommended fields:

```text
job_id UUID PRIMARY KEY

status
workload_type
profile
stage
progress

source_extension
source_mime
original_filename

engine
backend_role
backend_instance

attempt_count
max_attempts

created_at
upload_completed_at
queued_at
started_at
completed_at
updated_at

processing_ms
total_ms

estimated_tokens
quality_score

error_code
error_message

retention_mode
auto_delete_at
retention_extended_until

files_deleted_at
deleted_at

cleanup_state
cleanup_claimed_at
cleanup_attempt_count
cleanup_last_error

correlation_id
request_id

metadata JSONB
```

---

# 5. Job Status Model

Recommended status values:

```text
UPLOADING
QUEUED
PROCESSING
COMPLETED
FAILED
CANCEL_REQUESTED
CANCELLED
DELETING
DELETED
```

Do not use a high-frequency database write for every tiny progress percentage.

Prefer meaningful stages.

---

# 6. Workload Values

```text
NORMAL
OCR
```

Backend roles:

```text
normal
ocr
```

Backend instances:

```text
n1
n2
o1
o2
```

Do not hardcode these values throughout unrelated components.

Centralize them in contracts/configuration.

---

# 7. file_objects Table

Purpose:

- track every application-owned Storage object
- calculate file counts/storage usage
- enable safe cleanup
- enable reconciliation

Recommended fields:

```text
file_id UUID PRIMARY KEY
job_id UUID REFERENCES jobs(job_id)

bucket
object_path
kind
original_filename
extension
mime_type
size_bytes
checksum
storage_status

created_at
uploaded_at
deleted_at

metadata JSONB
```

Kinds:

```text
INPUT
OUTPUT
EXPORT
PREVIEW
```

---

# 8. job_events Table

Use `job_events` for important lifecycle history, not noisy telemetry.

Examples:

```text
UPLOAD_COMPLETED
QUEUED
BACKEND_ASSIGNED
PROCESSING_STARTED
OCR_STARTED
OUTPUT_STORED
COMPLETED
FAILED
RETRYING
CANCEL_REQUESTED
FILES_DELETED
```

Recommended fields:

```text
event_id
job_id
event_type
status
stage
backend_role
backend_instance
message
details JSONB
created_at
```

---

# 9. audit_logs Table

Audit logs record security-sensitive or destructive actions.

Audit examples:

```text
ADMIN_LOGIN_SUCCESS
ADMIN_LOGIN_FAILED
FILE_DOWNLOAD
ZIP_EXPORT
DELETE_FILE
DELETE_JOB
BULK_DELETE
KEEP_JOB
EXTEND_RETENTION
DELETE_NOW
CLEANUP_RUN
CLEANUP_FAILURE
RECONCILIATION
```

Recommended fields:

```text
audit_id UUID PRIMARY KEY
actor_type
actor_id
action
target_type
target_id
job_id
request_id
details JSONB
created_at
```

Do not store:

- secret keys
- session tokens
- document contents

---

# 10. Audit Immutability

Application code should treat audit records as append-only.

There should be no normal admin route for:

```text
UPDATE audit_logs
DELETE audit_logs
```

If audit retention is required later, implement it as a separately authorized maintenance policy.

---

# 11. Row Level Security

Enable RLS on exposed application tables.

Recommended browser access:

```text
anon:
no direct jobs access

authenticated:
no direct jobs access unless a future authenticated-user feature explicitly requires it
```

MarkDify's normal browser flow should use server APIs.

Server-side service-role credentials may perform required database operations.

Do not assume enabling RLS alone removes existing grants; configure both grants and RLS deliberately.

---

# 12. Recommended Indexes

At minimum evaluate:

```sql
jobs(created_at desc)
jobs(status, created_at desc)
jobs(workload_type, created_at desc)
jobs(backend_instance, created_at desc)
jobs(auto_delete_at)
file_objects(job_id)
file_objects(storage_status)
audit_logs(created_at desc)
audit_logs(action, created_at desc)
job_events(job_id, created_at)
```

Use a partial cleanup index:

```sql
create index ...
on jobs(auto_delete_at)
where retention_mode = 'AUTO'
  and files_deleted_at is null;
```

Validate indexes with real query plans as the table grows.

---

# 13. MDAdmin KPI Contract

The dashboard should display:

```text
Today's Jobs
Total Active Jobs
Processing Now
Queued
Failed Today
Completed Today

Normal Jobs Today
OCR Jobs Today

Input Files
Output Files
Export Files
Active Storage Bytes

Expiring in 6 Hours
Expiring in 24 Hours
KEEP Jobs
Cleanup Errors

Average Processing Time Today
p95 Processing Time Today

N1 Jobs
N2 Jobs
O1 Jobs
O2 Jobs
```

---

# 14. KPI Query Strategy

Do not make the frontend issue 15 independent expensive queries.

Prefer one server-side RPC/function:

```text
get_admin_kpis()
```

It should return a JSON structure containing the dashboard summary.

Example shape:

```json
{
  "jobs": {
    "today": 120,
    "active": 830,
    "processing": 4,
    "queued": 2,
    "completed_today": 108,
    "failed_today": 6
  },
  "workloads": {
    "normal_today": 86,
    "ocr_today": 34
  },
  "storage": {
    "input_files": 810,
    "output_files": 779,
    "export_files": 11,
    "active_bytes": 3928492340
  },
  "retention": {
    "expiring_6h": 31,
    "expiring_24h": 118,
    "kept": 22,
    "cleanup_errors": 1
  },
  "performance": {
    "avg_processing_ms_today": 4210,
    "p95_processing_ms_today": 12800
  }
}
```

---

# 15. KPI Performance

At current/small scale, indexed live SQL aggregates are acceptable.

Do not introduce a warehouse merely for dashboard counts.

If volume later makes aggregates expensive, add:

```text
daily_metrics
```

or another rollup strategy.

This is an optimization threshold, not an initial requirement.

---

# 16. Job Creation Flow

Recommended:

```text
POST /api/uploads/create
      ↓
insert jobs row:
UPLOADING
      ↓
create signed upload authorization
      ↓
browser uploads
      ↓
confirm upload
      ↓
status QUEUED
```

The `jobs` row should exist before processing starts.

---

# 17. Job Processing Flow

```text
QUEUED
  ↓
backend assigned
  ↓
PROCESSING
  ↓
output stored
  ↓
file_objects OUTPUT row inserted
  ↓
COMPLETED
```

If output Storage write fails:

```text
do not mark COMPLETED
```

---

# 18. Retry Model

Use bounded attempts.

Suggested concept:

```text
attempt_count
max_attempts
```

Retry only transient infrastructure failures.

Do not retry:

- invalid source
- unsupported format
- malware/policy rejection
- deterministic conversion error known not to improve

Every retry must remain idempotent.

---

# 19. Database Concurrency

For sensitive state changes, do not implement unsafe read-then-write sequences.

Use:

- transactions
- `UPDATE ... WHERE status = ...`
- RPC/database functions
- row locking where needed

Cleanup claiming should use an atomic function with:

```text
FOR UPDATE SKIP LOCKED
```

or equivalent safe claiming.

---

# 20. Cleanup State

Recommended values:

```text
IDLE
CLAIMED
DELETING
PARTIAL
COMPLETE
ERROR
```

This is separate from conversion `status`.

A completed conversion can be:

```text
status = COMPLETED
cleanup_state = IDLE
```

and later:

```text
status = COMPLETED
cleanup_state = COMPLETE
files_deleted_at != null
```

This preserves conversion analytics after file deletion.

---

# 21. File Deletion vs Job Deletion

Admin should have distinct actions.

## Delete files

Deletes Storage objects but preserves operational job metadata.

Useful for:

- privacy/storage cleanup
- retaining KPI history

## Delete job + files

Deletes Storage objects first, then deletes the job and file metadata.

Audit record remains.

Do not delete database metadata first and then attempt file deletion.

---

# 22. Privacy-Friendly Post-Cleanup Metadata

After automatic file cleanup, retain only operational metadata needed for:

- KPIs
- system performance
- error analytics
- audit

Recommended cleanup of user-identifying metadata:

```text
original_filename → NULL
object paths → optionally NULL after file metadata deletion
```

Retain non-content operational values such as:

```text
extension
file sizes
engine
backend instance
timings
success/failure
quality score
```

Confirm final retention language with the project's Privacy Policy.

---

# 23. Admin Query APIs

Recommended server endpoints:

```text
GET  /api/admin/kpis
GET  /api/admin/jobs
GET  /api/admin/jobs/:id
GET  /api/admin/jobs/:id/files
POST /api/admin/jobs/:id/keep
POST /api/admin/jobs/:id/extend
POST /api/admin/jobs/:id/delete-files
DELETE /api/admin/jobs/:id
POST /api/admin/jobs/bulk-delete
POST /api/admin/export
GET  /api/admin/audit
POST /api/admin/reconcile
```

All require the valid admin session created from the two-key login.

---

# 24. Database Access Pattern

Preferred application pattern:

```text
Browser
  ↓
Vercel server / backend services
  ↓
Supabase
```

Do not expose service-role credentials.

For serverless environments, avoid creating uncontrolled direct Postgres connections.

Use the Supabase HTTP client/Data API where appropriate, or a documented pooled connection strategy where transactions/direct SQL are actually needed.

Database migrations should use controlled migration tooling, not runtime ad-hoc schema changes.

---

# 25. Required Database Tests

- job insert
- all state transitions
- concurrent state update protection
- file metadata insert/delete
- KPI RPC
- audit append
- pagination
- retention query
- cleanup claim concurrency
- admin hard delete
- RLS deny tests
- service-role access
- query-plan/index checks

---

# 26. Definition of Done

- [ ] jobs table exists
- [ ] file_objects exists
- [ ] job_events exists
- [ ] audit_logs exists
- [ ] RLS/grants configured
- [ ] indexes applied
- [ ] KPI function works
- [ ] N1 writes state
- [ ] N2 writes state
- [ ] O1 writes state
- [ ] O2 writes state
- [ ] retention queries work
- [ ] audit is append-only through app routes
- [ ] admin pagination works
- [ ] storage byte KPI works
- [ ] cleanup state stays consistent
