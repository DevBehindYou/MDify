# MarkDify — Testing and QA Checklist

This document defines the test plan for MarkDify.

---

## 1. Testing Goals

Verify:

- conversion correctness
- OCR correctness
- file persistence
- metadata consistency
- retention logic
- admin operations
- performance behavior
- security controls
- failover behavior

---

## 2. Unit Tests

### 2.1 Validation
- allowed extensions
- filename sanitation
- max size enforcement
- magic-byte checks
- decoded dimension guard
- unsupported format rejection

### 2.2 Routing
- image → OCR pool
- document → normal pool
- stable hash selection
- no OCR routing for supported normal documents
- bounded peer retry
- no retry on validation error

### 2.3 Retention
- default `AUTO`
- `KEEP`
- `EXTEND`
- `DELETE_NOW`
- cleanup eligibility query logic

### 2.4 Admin Auth
- both keys required
- incorrect key rejection
- session creation
- session expiry
- admin action auth guard

---

## 3. Integration Tests

### 3.1 R2 upload flow
- create upload ticket
- direct upload
- start job
- backend R2 read
- backend R2 output write

### 3.2 D1 metadata
- job row created
- status transition updates
- audit row creation
- KPI reads

### 3.3 Normal conversion
Test at least:
- PDF (text-native)
- DOCX
- PPTX
- XLSX
- EPUB
- TXT
- HTML
- CSV
- JSON

### 3.4 OCR conversion
Test at least:
- JPG
- PNG
- WEBP
- TIFF
- BMP
- corrupt image
- oversized dimension image

---

## 4. End-to-End Tests

### 4.1 User E2E
1. upload supported document
2. conversion completes
3. markdown available
4. metadata visible
5. output downloadable

### 4.2 OCR E2E
1. upload image
2. OCR conversion completes
3. markdown output stored
4. output downloadable

### 4.3 Admin E2E
1. access `/mdify-controller`
2. enter both keys
3. dashboard opens
4. job list loads
5. select items
6. download ZIP
7. delete files/jobs
8. audit log updates

---

## 5. Failover Tests

### 5.1 Normal pool
- N1 unavailable → N2 succeeds
- N2 unavailable → N1 succeeds

### 5.2 OCR pool
- O1 unavailable → O2 succeeds
- O2 unavailable → O1 succeeds

### 5.3 Storage
- R2 read failure handling
- R2 write failure handling

### 5.4 Metadata
- D1 write failure handling
- D1 read failure handling

---

## 6. Cleanup / Retention Tests

- AUTO job expires at correct time
- cleanup deletes input/output files
- KEEP job is not auto-deleted
- EXTEND delays deletion
- DELETE_NOW deletes immediately
- orphan detection works
- audit entries are created for cleanup actions

---

## 7. Security Tests

- internal processing endpoint rejects public requests
- admin panel rejects missing/one-key-only requests
- R2 signed URL expiry works
- no secret leakage to client bundle
- CORS restricted correctly
- invalid session blocked
- destructive admin action requires valid session

---

## 8. Performance Tests

- direct upload latency
- conversion throughput for normal jobs
- OCR throughput for image jobs
- D1 KPI query speed
- ZIP export speed
- admin panel load speed
- memory behavior for OCR under constrained input sizes

---

## 9. Suggested Acceptance Gates

### Before production cutover
- all critical unit tests pass
- direct R2 flow verified
- N1/N2 deployed and tested
- O1/O2 deployed and tested
- admin auth verified
- cleanup verified
- D1 queries indexed
- failover verified

### Production ready only when
- E2E passes
- security checks pass
- rollback plan documented
