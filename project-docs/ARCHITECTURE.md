# MarkDify — Production Architecture

> **Decision update — 2026-09-26:** Storage and metadata move from Cloudflare to **Supabase**.
> Cloudflare R2 → **Supabase Storage** (private bucket, S3-compatible API, signed URLs).
> Cloudflare D1 + Worker API → **Supabase Postgres** (jobs, audit_logs, job_events; accessed server-side only).
> Everything else below still applies; read "R2" as Supabase Storage and "D1 / Worker" as Supabase Postgres until this document is rewritten.


**Public Product:** MarkDify  
**Internal Codename:** Atomic-Shifter  
**Domain:** `mdify-app.vercel.app`  
**Architecture Version:** Hybrid Vercel + Render + Cloudflare  
**Status:** Target Production Architecture

---

## 1. Executive Summary

MarkDify converts supported documents and images into structured Markdown for AI, RAG, documentation, and workflow usage.

### Final production split

```text
Frontend          → Vercel
Normal N1         → Vercel
Normal N2         → Vercel
OCR O1            → Render
OCR O2            → Render
File Storage      → Cloudflare R2
Metadata / Admin  → Cloudflare D1 + Worker
```

### Why this split

- **Vercel** is a strong fit for the frontend and normal conversion services
- **Render** is a stronger fit for OCR because Tesseract and native runtime dependencies are easier to manage there
- **R2** stores both input and output files
- **D1** stores job metadata, process state, KPIs, audit data, and admin data
- **/mdify-controller** gives the team operational visibility and controlled cleanup powers

---

## 2. Goals

The architecture must prioritize:

1. reliable document conversion
2. stable OCR support
3. safe file storage
4. direct file flow without pushing large bodies through Vercel Functions
5. clear workload split between document and OCR jobs
6. low operational complexity
7. auditability and cleanup controls
8. secure admin operations
9. scalability without unnecessary system duplication
10. clean rollback and observability

---

## 3. Core Components

Code layout for these components: see `CODEBASE_STRUCTURE.md` (`frontend/`, `backendN/` for N1/N2, `backendO/` for O1/O2).

### 3.1 Frontend — Vercel

Responsibilities:

- public website
- upload UI
- document conversion UI
- image OCR UI
- status/result UI
- blog and marketing pages
- admin shell route `/mdify-controller`
- upload authorization
- workload dispatch
- download authorization

The frontend should **not** directly process documents or images.

---

### 3.2 Normal Backends — N1 and N2 (Vercel)

Responsibilities:

- process non-OCR file formats
- use Microsoft MarkItDown
- fetch source objects from R2
- validate source bytes
- convert to Markdown
- store output in R2
- update D1 metadata
- return small JSON result metadata

Supported target classes:

- PDF (text-native)
- DOCX
- PPTX
- XLSX
- EPUB
- TXT / MD
- HTML
- CSV / TSV
- JSON / XML

---

### 3.3 OCR Backends — O1 and O2 (Render)

Responsibilities:

- OCR-specific conversion
- use Tesseract + `tessdata_fast`
- fetch images or OCR-routed objects from R2
- validate source bytes and decoded dimensions
- preprocess lightly
- perform OCR
- store output in R2
- update D1 metadata
- return small JSON result metadata

Supported target classes:

- JPG / JPEG
- PNG
- WEBP
- TIFF / TIF
- BMP
- GIF

Optional future support:

- scanned PDF → OCR path only after tested page rendering flow is implemented

---

### 3.4 Cloudflare R2

R2 is the authoritative object storage layer.

It stores:

- input files
- output markdown files
- optional output ZIPs
- preview artifacts if needed

Suggested object structure:

```text
jobs/
└── <job_id>/
    ├── input.<ext>
    ├── output.md
    ├── output.zip
    └── preview.json
```

R2 must remain private.

---

### 3.5 Cloudflare D1

D1 stores:

- job metadata
- process state
- KPI data sources
- audit logs
- admin actions
- retention policy values
- deletion scheduling markers

D1 should not store file bytes.

---

### 3.6 Cloudflare Worker API

Use a narrow Worker API in front of D1 for:

- controlled job CRUD
- KPI reads
- audit writes
- admin queries
- cleanup operations

Do not expose arbitrary SQL.

---

### 3.7 MDAdmin Panel — `/mdify-controller`

The admin panel is required.

It must be protected by **two secret keys**. Without both, it must not open.

Required capabilities:

- dashboard KPIs
- live job list
- file/storage list
- process visibility
- result preview
- download single files
- download multiple files as ZIP
- delete jobs
- delete files
- bulk cleanup
- retention override
- keep/extend/delete actions
- audit log visibility

---

## 4. Current vs Target State

### 4.1 Current starting point

The project history indicates the repository was previously structured around:

- Vercel frontend
- one backend handling conversion
- OCR not fully separated
- storage and metadata partially implemented
- admin and cleanup logic not yet fully complete

### 4.2 Target state

The final state should be:

```text
User
  ↓
Vercel Frontend
  ↓
Direct Upload Authorization
  ↓
Cloudflare R2
  ↓
Dispatcher chooses:
  - N1/N2 for normal documents
  - O1/O2 for OCR images
  ↓
Selected backend processes
  ↓
Output written to R2
  ↓
Metadata written to D1
  ↓
User or Admin reads status and output
```

---

## 5. File Flow Rule

Large files must not be proxied through Vercel request bodies.

Correct flow:

```text
Browser
  ↓ request upload authorization
Frontend (Vercel)
  ↓ presigned R2 upload
Browser
  ↓ upload bytes directly
R2
  ↓
Frontend job start
  ↓
Selected backend fetches object from R2
```

This avoids payload issues and keeps the architecture scalable.

---

## 6. Workload Routing

### Rule A — OCR pool
If file type is image-like:

```text
jpg / jpeg / png / webp / tif / tiff / bmp / gif
```

Route to:

```text
O1 or O2
```

### Rule B — normal pool
If file type is non-image supported document:

```text
pdf / docx / pptx / xlsx / epub / html / txt / md / csv / tsv / json / xml
```

Route to:

```text
N1 or N2
```

### Rule C — selection strategy
Use a stateless routing rule such as:

```python
stable_hash(job_id) % 2
```

Examples:

- normal: `0 → N1`, `1 → N2`
- OCR: `0 → O1`, `1 → O2`

This is better than process-local round-robin state.

---

## 7. Failover

Bounded peer failover is allowed.

### Normal pool
- N1 unavailable → retry once on N2
- N2 unavailable → retry once on N1

### OCR pool
- O1 unavailable → retry once on O2
- O2 unavailable → retry once on O1

Do not retry for:

- invalid file
- unsupported format
- policy rejection
- deterministic conversion failure

---

## 8. Retention Policy — Hybrid Model

Default:

```text
retention_mode = AUTO
auto_delete_at = created_at + 48 hours
```

Admin can override:

- `KEEP`
- `EXTEND`
- `DELETE_NOW`

### Recommended fields

- `retention_mode`
- `auto_delete_at`
- `retention_extended_until`
- `kept_by_admin`
- `deleted_at`
- `deleted_by`

### User-facing policy language

> Files are processed and automatically deleted within 48 hours by default. Authorized administrators may delete them earlier or extend retention when operationally necessary.

---

## 9. Admin Security

The route:

```text
/mdify-controller
```

must require **two secret keys**.

Recommended model:

- Key 1 = admin access key
- Key 2 = admin control key

Both must be valid.

Do not expose these keys in client bundles.

Recommended access flow:

1. admin opens `/mdify-controller`
2. submits both keys
3. server validates both
4. server issues short-lived signed admin session
5. all admin actions require that session
6. destructive actions should be logged to D1 audit tables

---

## 10. Suggested D1 Tables

### 10.1 jobs

Core source of truth.

Suggested columns:

- `job_id`
- `status`
- `profile`
- `extension`
- `engine`
- `backend_role`
- `backend_instance`
- `input_key`
- `output_key`
- `input_size`
- `output_size`
- `created_at`
- `started_at`
- `completed_at`
- `duration_ms`
- `estimated_tokens`
- `quality_score`
- `error_code`
- `error_message`
- `retention_mode`
- `auto_delete_at`
- `retention_extended_until`
- `deleted_at`
- `deleted_by`

### 10.2 audit_logs

Suggested columns:

- `audit_id`
- `actor_type`
- `actor_id`
- `action`
- `target_type`
- `target_id`
- `details_json`
- `created_at`

### 10.3 job_events (optional but useful)

Suggested columns:

- `event_id`
- `job_id`
- `stage`
- `message`
- `backend_role`
- `backend_instance`
- `created_at`

---

## 11. Key APIs

### 11.1 Frontend-side APIs

- `POST /api/uploads/create`
- `POST /api/jobs/{job_id}/start`
- `GET /api/jobs/{job_id}`
- `GET /api/jobs/{job_id}/download`

### 11.2 Backend internal APIs

- `GET /api/v1/ready`
- `GET /api/v1/health`
- `POST /api/v1/internal/process`

### 11.3 Worker/D1 APIs

- `POST /jobs`
- `PATCH /jobs/:id`
- `GET /jobs`
- `GET /jobs/:id`
- `DELETE /jobs/:id`
- `POST /jobs/bulk-delete`
- `GET /kpis`
- `POST /audit`

---

## 12. Non-Negotiable Rules

1. Frontend stays on Vercel
2. N1 and N2 stay on Vercel
3. O1 and O2 stay on Render
4. All file bytes live in R2, not D1
5. Upload bytes go directly to R2
6. All backends re-validate actual source bytes
7. D1 is the metadata and KPI source of truth
8. Admin route uses two secret keys
9. Default retention is 48 hours with admin overrides
10. Normal and OCR pools must remain separate
11. Peer retry is bounded
12. MarkDify is the public brand

---

## 13. Deployment Order

1. finalize D1 schema
2. finalize R2 integration
3. implement direct upload flow
4. refactor backend role configuration
5. deploy N1
6. deploy N2
7. verify normal conversion
8. containerize OCR service
9. deploy O1
10. deploy O2
11. verify OCR conversion
12. implement `/mdify-controller`
13. implement retention cleanup jobs
14. execute full E2E testing
15. cut over production
