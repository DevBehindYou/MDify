# MarkDify — Performance, Optimization, and Operational Checks

---

## 1. Performance Goals

The system should be optimized for:

- low-latency upload authorization
- efficient object storage usage
- stable normal conversion
- controlled OCR memory/runtime behavior
- efficient admin/KPI reads
- minimal unnecessary cloud costs

---

## 2. Frontend Performance

### Recommended
- use direct-to-R2 upload
- avoid large in-memory preview blobs
- keep admin pages paginated
- use lazy loading for logs/tables
- avoid heavy visual effects on mobile/tablet
- keep only desktop-grade richer effects if necessary

### Watch for
- large client bundles
- excessive rerenders
- KPI pages fetching too frequently
- file list pages loading too many rows at once

---

## 3. Vercel Normal Backends

### Optimize by
- keeping them stateless
- not loading OCR dependencies
- using small JSON payloads only
- streaming or temporary-file workflows only where needed
- avoiding huge inline result payloads
- storing outputs in R2

### Operational checks
- cold start impact
- response times by format
- average duration by profile
- failover correctness

---

## 4. Render OCR Backends

### Baseline recommendations
- one OCR worker at a time per process
- `OMP_THREAD_LIMIT=1`
- `tessdata_fast`
- grayscale conversion
- decoded dimension caps
- no heavy image stack unless justified
- page-by-page processing for future scanned-PDF OCR

### Critical performance checks
- peak memory usage
- OCR time by file class
- startup time
- language model load impact
- effect of image size on runtime

---

## 5. R2 Optimization

### Best practices
- use deterministic object paths
- avoid unnecessary object duplication
- keep bucket private
- use short-lived presigned URLs
- batch delete where possible for cleanup jobs

### Metrics to monitor
- object count
- storage usage
- failed uploads
- failed reads
- failed writes
- stale orphan count

---

## 6. D1 Optimization

### Why D1 fits
D1 is appropriate for structured metadata, KPIs, and audit data.

### Optimize by
- indexing high-frequency query fields
- keeping writes meaningful, not chatty
- using stage-based status transitions instead of tiny percentage updates
- paginating admin data
- caching safe KPI summaries where useful

### Likely indexes
- `status`
- `created_at`
- `auto_delete_at`
- `backend_role`
- `backend_instance`
- `extension`

### KPI examples
- today_count
- failed_count
- processing_count
- OCR_today
- normal_today
- storage_summary
- expiring_soon
- kept_jobs

---

## 7. ZIP Export Optimization

Potential issue: building a large ZIP in one blocking request.

### Recommended
- for small selections: synchronous ZIP export may be acceptable
- for larger selections: create export job, build ZIP asynchronously, store ZIP in R2, return signed URL

---

## 8. Cleanup Optimization

### Recommended strategy
- scheduled cleanup query from D1
- batch delete corresponding R2 objects
- update D1 deletion status
- write audit entry
- handle partial failures cleanly

### Watch for
- orphan rows
- orphan R2 objects
- duplicate cleanup attempts
- long cleanup runs without batching

---

## 9. Operational Performance Dashboard

MDAdmin should show:

- jobs today
- total jobs
- success rate
- failure rate
- OCR vs normal count
- average duration
- storage used
- expiring soon count
- keep count
- top error types
- backend pool distribution

---

## 10. Performance Risks to Fix

1. using large request payloads through Vercel
2. unbounded OCR image sizes
3. unindexed KPI queries
4. process-local round-robin routing
5. loading too much admin data at once
6. synchronous heavy ZIP exports for huge selections
7. no storage cleanup policy
8. overusing polling

---

## 11. Recommended Benchmarks

### Normal pool
- 10 PDFs
- 10 DOCX
- mixed batch
- average/95th percentile duration

### OCR pool
- small image
- medium image
- large but allowed image
- corrupt image
- memory footprint by category

### Admin
- list 100 jobs
- list 1000 jobs paginated
- export 10 files
- export 100 files
- delete 1 / 10 / 100 jobs

---

## 12. Production Readiness Performance Gate

Do not call the system production-ready until:

- R2 direct upload works smoothly
- N1/N2 response times are acceptable
- O1/O2 memory usage is measured
- admin KPI queries are fast enough
- cleanup tasks complete reliably
- no severe UI lag on admin or upload flows
