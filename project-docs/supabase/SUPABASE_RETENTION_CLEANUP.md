# MarkDify — Supabase Retention & Cleanup Architecture

**Default file retention:** 48 hours  
**Model:** Hybrid AUTO + KEEP + EXTEND + DELETE_NOW

---

# 1. Policy

Default:

```text
retention_mode = AUTO
```

The file retention clock begins when upload successfully completes.

```text
auto_delete_at = upload_completed_at + 48 hours
```

User-facing language:

> Files are processed and automatically deleted within 48 hours by default. Authorized administrators may delete them earlier or extend retention when operationally necessary.

---

# 2. Retention Modes

## AUTO

```text
delete after default deadline
```

## KEEP

```text
no automatic deletion
```

Requires an explicit admin action.

## EXTEND

```text
delete at administrator-selected future deadline
```

## DELETE_NOW

Immediate cleanup request.

This is an action more than a long-lived state.

---

# 3. Safety Rule

Never auto-delete source/output objects while conversion is actively:

```text
UPLOADING
QUEUED
PROCESSING
```

If the deadline passes during active processing:

```text
skip deletion
record cleanup deferral
retry on next cleanup run
```

---

# 4. Cleanup Architecture

Use:

```text
Supabase Cron
      ↓
Supabase Edge Function: cleanup-expired-jobs
      ↓
Postgres RPC: claim_cleanup_batch
      ↓
Supabase Storage deletes
      ↓
Postgres finalization
      ↓
audit_logs
```

This keeps scheduling, storage, and database operations inside one provider.

---

# 5. Schedule

Recommended starting cadence:

```text
every 30 minutes
```

Do not run cleanup every minute without a need.

Suggested batch size:

```text
50–100 jobs per execution
```

Tune from measurements.

---

# 6. Atomic Cleanup Claim

Create a Postgres function:

```text
claim_cleanup_batch(limit)
```

Concept:

1. select eligible jobs
2. lock rows
3. skip rows already claimed
4. set `cleanup_state = CLAIMED`
5. set `cleanup_claimed_at`
6. return claimed jobs

Use transaction-safe claiming such as:

```text
FOR UPDATE SKIP LOCKED
```

This prevents two cleanup workers from deleting the same job concurrently.

---

# 7. Eligibility

A job is eligible when:

```text
files_deleted_at IS NULL
AND conversion status is terminal
AND (
    retention_mode = AUTO
    AND auto_delete_at <= now()
  OR
    retention_mode = EXTEND
    AND retention_extended_until <= now()
)
```

KEEP is never selected automatically.

---

# 8. Cleanup Execution

For each claimed job:

1. list `file_objects`
2. mark files `DELETE_PENDING`
3. delete Storage objects
4. confirm deletion results
5. update/delete `file_objects`
6. set `files_deleted_at`
7. set cleanup state COMPLETE
8. remove sensitive filename/path metadata as configured
9. append audit event

If one object fails:

```text
cleanup_state = PARTIAL or ERROR
cleanup_last_error = ...
```

Retry later.

---

# 9. DELETE_NOW

Admin flow:

```text
Admin confirms
  ↓
audit intent
  ↓
claim job cleanup
  ↓
delete objects
  ↓
update metadata
  ↓
audit result
```

Do not execute irreversible deletion without a confirmation UI.

Supabase Storage deletion should be treated as permanent.

---

# 10. KEEP

Admin flow:

```text
retention_mode = KEEP
auto_delete_at = NULL
retention_extended_until = NULL
```

Audit:

```text
KEEP_JOB
```

Dashboard must visually distinguish KEEP jobs.

---

# 11. EXTEND

Admin selects:

```text
+24 hours
+7 days
+30 days
custom date
```

Do not hardcode only these choices if current UI requires custom dates.

Database:

```text
retention_mode = EXTEND
retention_extended_until = <timestamp>
```

Audit:

```text
EXTEND_RETENTION
```

---

# 12. Automatic File Deletion vs Metadata Retention

The 48-hour promise applies to **stored files**.

After file cleanup, MarkDify may keep minimal operational metadata for:

- job counts
- conversion timing
- error analytics
- backend capacity
- audit

Recommended:

```text
remove/null original_filename
remove file objects
retain non-content performance metadata
```

If the legal policy promises deletion of metadata too, change this behavior accordingly.

Do not let implementation contradict legal text.

---

# 13. Job Hard Delete

Admin may separately choose:

```text
Delete Job + Files
```

Order:

```text
delete Storage objects
  ↓
verify
  ↓
write audit record
  ↓
delete child rows / job row
```

Audit should not rely on a foreign key that disappears with the job.

---

# 14. Cleanup KPIs

MDAdmin should show:

```text
AUTO jobs
KEEP jobs
EXTEND jobs
expiring in 6h
expiring in 24h
cleanup claimed
cleanup partial
cleanup errors
files deleted today
bytes deleted today
```

---

# 15. Cleanup Failure Recovery

Failures must be retryable and idempotent.

Deleting an object that is already missing should be handled as a reconciled state rather than an infinite failure where safe.

Never:

```text
retry forever without a cap/log
```

Track:

```text
cleanup_attempt_count
cleanup_last_error
```

Admin should be able to trigger:

```text
RETRY CLEANUP
```

---

# 16. Orphan Reconciliation

Periodic/admin scan:

```text
file_objects row + missing Storage object
Storage object + missing file_objects row
job files_deleted_at + active file object
```

Admin should get:

```text
View
Repair Metadata
Retry Delete
Delete Orphan
```

All actions audited.

---

# 17. Retention Tests

Test:

- AUTO file deletion
- KEEP never selected by cron
- EXTEND deadline honored
- DELETE_NOW
- partial object failure
- repeated cleanup run
- concurrent cleanup runs
- active PROCESSING job at expired deadline
- missing object
- admin hard delete
- audit events

---

# 18. Definition of Done

- [ ] 48-hour AUTO deadline is created
- [ ] Supabase Cron configured
- [ ] cleanup Edge Function deployed
- [ ] atomic claim RPC implemented
- [ ] Storage deletion verified
- [ ] KEEP verified
- [ ] EXTEND verified
- [ ] DELETE_NOW verified
- [ ] active processing protected
- [ ] partial failures recover
- [ ] cleanup audit works
- [ ] cleanup KPIs work
- [ ] orphan reconciliation works
