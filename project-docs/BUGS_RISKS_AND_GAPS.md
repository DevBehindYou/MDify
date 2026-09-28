# MarkDify — Bugs, Risks, Gaps, and Open Items

This document lists the likely gaps, migration risks, and repository-level concerns that should be resolved before or during production rollout.

---

## 1. Architecture Gaps

### 1.1 Large file flow may still be proxy-based
**Risk:** If the current implementation still sends file bytes through the frontend/backend route, this will create payload and performance issues.

**Required fix:** Direct browser → R2 upload using presigned URLs.

### 1.2 OCR workload may not be fully isolated
**Risk:** If OCR remains mixed into the same runtime path as normal conversion, memory usage and runtime behavior become harder to control.

**Required fix:** Separate O1/O2 OCR services on Render.

### 1.3 Role-aware deployment may be incomplete
**Risk:** Same backend code may not yet properly switch behavior based on:
- `BACKEND_ROLE`
- `BACKEND_INSTANCE`
- `OCR_ENABLED`

**Required fix:** explicit role gates and health reporting.

---

## 2. Data and Storage Risks

### 2.1 Files may not yet be fully persisted in R2
**Risk:** Partial storage logic may exist, but full source + output persistence may not be consistently enforced.

**Required fix:** R2 as authoritative file store for both input and output.

### 2.2 Retention model may not be implemented
**Risk:** The requested hybrid retention logic might not yet exist.

**Required fix:** Add fields and cleanup logic for:
- `AUTO`
- `KEEP`
- `EXTEND`
- `DELETE_NOW`

### 2.3 Orphaned objects risk
**Risk:** If D1 metadata is deleted but R2 files remain, or vice versa, storage becomes inconsistent.

**Required fix:** orphan scan and cleanup tools in MDAdmin.

---

## 3. Admin Panel Risks

### 3.1 Two-key protection may not exist
**Risk:** `/mdify-controller` may not yet use dual-key access.

**Required fix:** two-key verification + short-lived admin session + audit logs.

### 3.2 Destructive actions may be unaudited
**Risk:** If deletes or bulk cleanup are not logged, operational accountability is weak.

**Required fix:** audit all admin destructive operations.

### 3.3 ZIP export may be missing
**Risk:** Multi-download ZIP export may not yet be implemented.

**Required fix:** background ZIP assembly or stream-based bundle creation.

---

## 4. OCR Risks

### 4.1 Tesseract memory risk
**Risk:** OCR inputs can decode into large in-memory bitmaps even when compressed file size is small.

**Required fix:**
- decoded dimension checks
- megapixel caps
- grayscale conversion
- one worker / one thread

### 4.2 OCR quality configuration may be oversimplified
**Risk:** using a single page segmentation mode for all images may give inconsistent results.

**Required fix:** benchmark a small set of modes or keep a conservative default with future tuning support.

### 4.3 Scanned PDF OCR may be prematurely enabled
**Risk:** scanned PDF OCR requires page rendering and page-by-page pipeline control.

**Required fix:** keep scanned-PDF OCR out of scope until implemented correctly.

---

## 5. Security Risks

### 5.1 Internal process endpoints may be under-protected
**Risk:** if internal endpoints are publicly callable, they become a public compute surface.

**Required fix:** internal shared secret and strict auth validation.

### 5.2 Secrets exposure risk
**Risk:** admin secrets, D1 token, or R2 secrets could accidentally leak to client bundles.

**Required fix:** audit environment variable scoping and never use public prefixes for secrets.

### 5.3 Incomplete CORS control
**Risk:** wildcard CORS on privileged APIs can create avoidable exposure.

**Required fix:** explicit origin restrictions.

---

## 6. Data Consistency Risks

### 6.1 D1 write failure after successful conversion
**Risk:** output may exist in R2 but metadata may fail to update.

**Required fix:** clear error handling and reconciliation tools.

### 6.2 Duplicate processing
**Risk:** retries could produce double output or conflicting state.

**Required fix:** idempotent `job_id` logic and deterministic output keying.

---

## 7. Performance Risks

### 7.1 Process-local routing state
**Risk:** round-robin in in-memory counters is unreliable across serverless instances.

**Required fix:** stateless hash-based routing.

### 7.2 Over-chatty KPI queries
**Risk:** frequent unindexed KPI reads may waste D1 daily limits.

**Required fix:** indexing and efficient query patterns.

### 7.3 Heavy blur/visual effects on frontend
**Risk:** UI effects can cause lag on mobile devices.

**Required fix:** lightweight mobile styles and desktop-only heavier effects where appropriate.

---

## 8. Known Testing Gaps Likely to Exist

- true end-to-end R2 upload flow
- full N1/N2 failover
- full O1/O2 failover
- D1 retention cleanup tests
- admin ZIP export tests
- orphan object detection
- multi-file delete
- OCR memory benchmark
- throughput benchmark
- dual-key admin auth tests

---

## 9. Priority Open Items

### High Priority
1. implement direct upload flow
2. finalize D1 schema
3. split normal/OCR deployments
4. implement `/mdify-controller`
5. implement hybrid retention cleanup

### Medium Priority
1. KPI query optimization
2. ZIP export
3. orphan scan
4. richer audit views

### Lower Priority
1. advanced OCR tuning
2. scanned PDF OCR support
3. export reports
4. analytics enhancements
