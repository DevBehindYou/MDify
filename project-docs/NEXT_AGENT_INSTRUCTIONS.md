> **Superseded (2026-09-28):** the current, complete handover is `docs/ai-handover/INDEX.md`. This file keeps older dated snapshots for history; where they conflict (for example Cloudflare R2/D1), the handover wins.

# AI Agent — Next Instructions for MarkDify

> **Decision update — 2026-09-26:** Storage and metadata move from Cloudflare to **Supabase**.
> Cloudflare R2 → **Supabase Storage** (private bucket, S3-compatible API, signed URLs).
> Cloudflare D1 + Worker API → **Supabase Postgres** (jobs, audit_logs, job_events; accessed server-side only).
> Everything else below still applies; read "R2" as Supabase Storage and "D1 / Worker" as Supabase Postgres until this document is rewritten.


You are continuing the **MarkDify / Atomic-Shifter** project.

## Final Architecture Decision

Do not change this architecture unless the user explicitly asks:

```text
Frontend:
- Vercel

Normal Pool:
- N1 → Vercel
- N2 → Vercel

OCR Pool:
- O1 → Render
- O2 → Render

File Storage:
- Cloudflare R2

Job Metadata / KPIs / Audit:
- Cloudflare D1 + Cloudflare Worker API

Admin:
- /mdify-controller
- protected by two secret keys

Retention:
- Hybrid
- default auto-delete after 48 hours
- admin can KEEP / EXTEND / DELETE_NOW
```

---

## What you must build or verify next

### 1. Verify repository state first
Before editing:

- inspect tree
- inspect env files
- inspect frontend upload flow
- inspect backend processing flow
- inspect storage integration
- inspect current admin work
- run tests/builds
- record exact status

Use only these status labels when reporting:

- VERIFIED
- IMPLEMENTED BUT UNTESTED
- PARTIALLY VERIFIED
- BROKEN
- NOT IMPLEMENTED
- UNKNOWN

---

### 2. Implement direct R2 upload flow
If large file bytes are still being proxied through Vercel/backend routes, replace that with:

1. create upload authorization
2. browser uploads directly to R2
3. frontend starts job using object key only
4. backend fetches file from R2

This is mandatory.

---

### 3. Make D1 the metadata source of truth
Implement or verify:

- `jobs` table
- `audit_logs` table
- optional `job_events` table
- KPI queries
- retention fields
- cleanup state fields
- proper indexes

Do not store file bytes in D1.

---

### 4. Split processing roles
Use one backend codebase if possible, but deploy with different roles.

Required target:

- N1 = normal
- N2 = normal
- O1 = ocr
- O2 = ocr

Normal pool:
- on Vercel
- no Tesseract dependency required

OCR pool:
- on Render
- Tesseract + `tessdata_fast`
- decoded dimension caps
- `OMP_THREAD_LIMIT=1`

---

### 5. Build the dispatcher correctly
Route based on workload type:

- document → N1/N2
- image → O1/O2

Use a stateless selection rule such as stable hash of `job_id`.

Peer failover only once for transient infrastructure failures.

Do not retry validation or policy failures.

---

### 6. Build /mdify-controller
This admin panel is required.

It must support:

- dual-key login
- dashboard KPIs
- jobs list
- storage list
- process overview
- preview/download
- download multiple files in ZIP
- delete jobs/files
- bulk cleanup
- retention override
- audit visibility

Without both keys, the panel must not open.

After successful key validation, issue a short-lived admin session.

---

### 7. Implement retention logic
Default behavior:

- store input + output in R2
- create metadata row in D1
- set default deletion deadline to 48 hours

Admin actions must include:

- KEEP
- EXTEND
- DELETE_NOW

Also create cleanup logic for expired AUTO jobs.

---

### 8. Preserve security
You must verify and preserve:

- extension allowlist
- filename sanitation
- magic-byte validation
- decoded dimension guard for OCR
- internal process endpoint protection
- no secret leakage to client bundles
- strict CORS
- short-lived signed URLs
- audit logging for admin destructive actions

---

### 9. Optimize performance
Check and fix:

- direct upload flow
- paginated admin data
- indexed KPI queries
- orphan cleanup logic
- OCR memory controls
- heavy UI lag in admin pages
- unbounded ZIP export paths

---

### 10. Run tests
At minimum verify:

- upload flow
- normal conversion
- OCR conversion
- metadata writes
- retention cleanup
- dual-key admin auth
- ZIP export
- delete actions
- failover in both pools
- R2/D1 failure handling

---

## Required deliverables from your next run

When you report back, include:

1. files inspected
2. current-state findings
3. files changed
4. direct-upload status
5. D1 schema status
6. R2 storage status
7. N1 status
8. N2 status
9. O1 status
10. O2 status
11. admin panel status
12. retention system status
13. security findings
14. bugs fixed
15. performance findings
16. tests run and exact results
17. unresolved risks
18. next recommended step

Do not claim completion unless the hybrid architecture, D1 metadata layer, R2 persistence, and MDAdmin are actually working end-to-end.

---

## Status snapshot — 2026-09-26

Repository split into `frontend/`, `backendN/` (N1/N2), `backendO/` (O1/O2).
See `CODEBASE_STRUCTURE.md`.

| Area | Status | Notes |
|------|--------|-------|
| Frontend MVVM refactor | VERIFIED | build + 26 unit tests; UI checked in browser (desktop, mobile, theme) |
| Dispatcher (routing, stable hash, one failover) | VERIFIED | unit tests + live run with a dead N instance |
| backendN (MarkItDown) | PARTIALLY VERIFIED | 47 tests + live E2E locally; not yet deployed to Vercel; bundle size (~260 MB deps) unmeasured on Vercel |
| backendO (Tesseract) | IMPLEMENTED BUT UNTESTED | 36 tests with OCR mocked; no local Tesseract/Docker; Docker image never built |
| N1 / N2 deployment | NOT IMPLEMENTED | needs two Vercel projects, root `backendN` |
| O1 / O2 deployment | NOT IMPLEMENTED | `render.yaml` written, not applied |
| Direct R2 upload | NOT IMPLEMENTED | bytes still proxied through `/api/convert` |
| D1 schema / Worker API | NOT IMPLEMENTED | |
| `/mdify-controller` admin | NOT IMPLEMENTED | |
| Retention engine | NOT IMPLEMENTED | |

Next recommended step: deploy N1/N2 and O1/O2 as-is to validate hosting
limits, then Phase 1–2 (D1 schema, R2 direct upload).

---

## Status snapshot — 2026-09-27

Storage and metadata moved from Cloudflare R2/D1 to **Supabase Storage + Postgres**
(sections 2, 3 and 7 above still say R2/D1; read them as Supabase). Only images go to
O1/O2. Reports: `docs/testing/` (start with `CAPACITY_SUMMARY.md`).

| Area | Status | Notes |
|------|--------|-------|
| Frontend (MVVM, consent, legal pages, theme icons) | VERIFIED | 57 unit tests, lint, `next build`, browser check light/dark and 375 px |
| Dispatcher (stable hash, one peer retry) | VERIFIED | unit tests + failover runs (80/80 single-outage jobs masked) |
| backendN (MarkItDown) | VERIFIED locally | 70 tests, load matrix, 20-min soak; not deployed |
| backendO (Tesseract, OSD rotation, grayscale-first prep) | VERIFIED locally | 68 tests incl. real Tesseract; not deployed; Docker image not built |
| Upload caps | VERIFIED by tests | 15 MB documents, 10 MB images, 25 MP per image |
| N1 / N2 on Vercel, O1 / O2 on Render | NOT IMPLEMENTED | `render.yaml` written, not applied |
| Supabase schema, RPCs, bucket, cleanup function | IMPLEMENTED BUT UNTESTED | no project yet (owner will create it) |
| Direct upload + Storage process endpoint | IMPLEMENTED BUT UNTESTED | unit tests with fakes pass |
| `/mdify-controller` admin | NOT IMPLEMENTED | needs the Supabase project |
| Blog | VERIFIED | posts in `frontend/content/blog/`, pipeline in `MDify-Blog-Generation-Pipeline/` |

Decided 2026-09-27: WebP capped at 12 MP (worst OCR case 243 MB); O1/O2 on Render Free
(timeouts sized for its wake-up); site URL https://mdify-app.vercel.app; legal documents
name DevBehindYou and an email only, with providers by category; the four placeholder
blog posts removed. Next proposal to build: `project-docs/unified-content-aware/`
(read `REVIEW.md` first). Waiting for: Supabase keys.

---

## Status snapshot — 2026-09-27 (evening)

Supabase project exists (MDify, reached through the env keys only; never through the Supabase
connector account). Tables are NOT applied yet: the owner pastes `supabase/MDIFY_SETUP.sql`
(generated from the migrations; `npm run sql:setup` / `sql:check` in `frontend/`).
Checklist: `docs/GO_LIVE.md`.

| Area | Status | Notes |
|------|--------|-------|
| Wake all backends on page open | VERIFIED | `lib/server/wake.js`, header shows "Waking · Ns" |
| Durable work queue (background jobs) | VERIFIED on PGlite | `docs/BACKGROUND_JOBS.md`; browser drives `/advance`, cron drives `/api/jobs/tick` |
| Storage budget check | VERIFIED by tests | 800 MiB default |
| Scanned-page PDFs | VERIFIED locally | `backendN/app/pdf_tasks.py`, only rendered page images go to O1/O2 |
| ZIP files, backendZ (Z1/Z2) | VERIFIED locally | 38 tests + live run through the frontend; not deployed |
| Supabase Storage paths | VERIFIED against the real project | `tests/integration/storage_live.mjs` 5/5 |
| Schema + RPCs (init, work queue, admin) | VERIFIED on PGlite; NOT APPLIED | `supabase/MDIFY_SETUP.sql` |
| Cleanup Edge Function (whole job folder, names forgotten) | IMPLEMENTED BUT UNTESTED | not deployed |
| `/mdify-controller` admin | PARTIALLY VERIFIED | tests pass; UI checked signed in without data |
| Deployments (N, O, Z, frontend env) | NOT IMPLEMENTED | `docs/GO_LIVE.md` |
| Picture-area OCR inside documents | NOT IMPLEMENTED | only if real documents need it |

Test counts: frontend 107, backendN 81, backendO 70, backendZ 38. Backends read their own `.env`
for local runs; `magika` (a MarkItDown dependency) also loads `backendN/.env` on import, so each
`tests/conftest.py` blanks the Supabase variables before any import.
