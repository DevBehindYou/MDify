# Architecture

Status labels as in `INDEX.md`. More detail: `docs/ARCHITECTURE.md`, `docs/BACKGROUND_JOBS.md`, `docs/ADMIN_ARCHITECTURE.md`.

## High-Level Architecture (EXISTING in code; NOT DEPLOYED)

```text
Browser
  │ 0 POST /api/wake (page open) ──────────► pings every backend instance (Render Free wake-up)
  │ 1 POST /api/uploads/create ─────────────► Frontend (Next.js 14): storage budget check, jobs row, signed upload URL
  │ 2 PUT bytes (signed URL) ──────────────► Supabase Storage  (private bucket mdify-pro-files)
  │ 3 POST /api/jobs/:id/start ────────────► confirm_upload + enqueue_root + first scheduling pass
  │ 4 POST /api/jobs/:id/advance (repeat) ─► one scheduling pass for this job, then its status
  │                                              │ claim_work_items() per pool (capacity, fairness, leases)
  │                                              ├─ normal ──► N1 | N2  (MarkItDown; PDF analyse/merge)
  │                                              ├─ ocr ─────► O1 | O2  (Tesseract; images only)
  │                                              └─ archive ─► Z1 | Z2  (ZIP inspect/convert/merge)
  │                                                     │ read inputs / write results by object path
  │                                                     └──────► Supabase Storage
  │                                              └─ queue + job state ─► Supabase Postgres
  │ 5 GET signed download URL ─────────────► Supabase Storage
Supabase Cron ── every minute ─► POST /api/jobs/tick (retries, abandoned jobs)      [NOT SCHEDULED]
              └─ every 30 min ─► Edge Function cleanup-expired-jobs (retention)     [NOT DEPLOYED]
Admin ─► /mdify-controller (two keys) ─► /api/admin/* (session cookie, audited)
```

Fallback when Supabase is not configured: browser → `POST /api/convert` (multipart) → dispatcher → backend `/api/v1/internal/convert` → Markdown in the response. No queue, so scanned PDF pages aren't OCR'd and ZIP images are only listed. In production this path is limited by Vercel's 4.5 MB body limit.

## Application Layers

| Layer | Location | Notes |
|---|---|---|
| View | `frontend/app/*`, `frontend/components/*` | React components; converter screen is a client component; legal pages server-rendered |
| ViewModel | `frontend/viewmodels/*` | Hooks with `useSyncExternalStore` over model stores |
| Model (browser) | `frontend/lib/models/*` | `conversionService` (transport), `queueModel`, repositories (session, theme, consent), `wakeModel`, `adminApi`, `contentTree` |
| Server (Node, route handlers) | `frontend/lib/server/*`, `frontend/app/api/*` | dispatcher, jobService, jobQueue, wake, supabaseRest, admin* |
| Backends (Python) | `backendN`, `backendO`, `backendZ` | FastAPI; shared `app/common` |
| Data | `supabase/*` | migrations, cron, Edge Function |

## Directory Structure

```text
MDify-Pro/
├── frontend/            Next.js app (MVVM) + API routes + tests + scripts
│   ├── app/             routes: /, /usecase, /privacy, /terms, /mdify-controller, api/*, robots.js, sitemap.js
│   ├── components/      UI (admin/, converter/, AppIcon, JsonLd, Legal*, BlogModal, …)
│   ├── viewmodels/      hooks
│   ├── lib/             models/, server/, legal/, formats.js, siteContent.js, blog.mjs
│   ├── content/blog/    blog posts (empty except README)
│   ├── public/          icons, og-card.png, llms.txt
│   ├── scripts/         build-blog-index, build-setup-sql, build-brand-images
│   └── test/            node --test suites (+ sql/ PGlite)
├── backendN/            normal pool (N1/N2): app/{main,converter,pdf_fast_path,pdf_tasks}.py, app/common/, tests/
├── backendO/            OCR pool (O1/O2): app/{main,converter}.py, app/common/, Dockerfile, tests/
├── backendZ/            archive pool (Z1/Z2): app/{main,archive,archive_tasks,converter}.py, app/common/, tests/
├── supabase/            migrations/ (3), MDIFY_SETUP.sql, cron.sql, functions/cleanup-expired-jobs/, tests/
├── docs/                architecture, go-live, testing reports, ai-handover/
├── project-docs/        owner planning packages + reviews
├── tests/               load/ (harness, benches), integration/storage_live.mjs
├── MDify-Blog-Generation-Pipeline/   blog writing rules + check.mjs
├── render.yaml          O1/O2 on Render Free
└── README.md, LICENSE (GPL-3.0), .gitignore, .claude/launch.json
```

## Major Modules

- **Dispatcher** (`frontend/lib/server/dispatcher.js`): pools from env, FNV-1a hash order, 1 peer retry on network/502/503/504, per-pool attempt timeouts 120 s / 150 s.
- **Job service** (`jobService.js`): `createUpload`, `startJob`, `advanceJob`, `jobStatus` (signed URLs for up to 25 outputs), `downloadUrl`, `checkStorageBudget`.
- **Queue orchestrator** (`jobQueue.js`): `runTick` (requeue expired → claim per pool → execute concurrently), `executeItem` (send to pool, record outcome, spawn children), `spawnFromResult` (PDF split, archive split).
- **Backends' shared core** (`app/common`): settings, `run()` pipeline, `/process` (Storage) and `/convert` (multipart), path allow-list, internal secret check, output profiles.
- **PDF tasks** (N): classify pages, convert text runs, render scan pages, merge.
- **Archive** (Z): safe walk, classification, direct text/code fencing, document conversion, OCR hand-off, index/manifest/combined output (parts ≤ 4 MB).
- **Admin**: auth, service, route guard, UI.

## Data Flow — Storage layout

```text
jobs/<job_id>/input/source.<ext>                 upload
jobs/<job_id>/materialized/<node>/source.<ext>   rendered PDF pages, images from a ZIP (for O1/O2)
jobs/<job_id>/nodes/<node>/result.md             one piece's text
jobs/<job_id>/nodes/archive-N/partial.json       converted ZIP entries waiting for the merge
jobs/<job_id>/output/result.md                   documents, images, PDFs
jobs/<job_id>/output/combined(-NNN).md           ZIP result
jobs/<job_id>/output/PROJECT_INDEX.md, manifest.json
```

## Database Flow

Tables: `jobs`, `file_objects`, `job_events`, `audit_logs` (init); `content_nodes`, `work_items` (work queue). Task types: CONVERT, OCR_IMAGE, PDF_ANALYZE, PDF_PAGE_OCR, PDF_MERGE, ARCHIVE_PROCESS, PROJECT_MERGE. Item statuses: BLOCKED, QUEUED, RUNNING, SUCCEEDED, FAILED, SKIPPED, CANCELLED. Merge items wait BLOCKED until siblings finish (`settle_job`). RLS enabled; all functions `SECURITY INVOKER`, granted to `service_role` only.

## Authentication Flow

- Backends: `X-Internal-Secret` = `BACKEND_SHARED_SECRET` (frontend) = `INTERNAL_SHARED_SECRET` (backend); fail closed if unset.
- Admin: POST `/api/admin/session` `{key1,key2}` → both keys match → HMAC-signed token (key derived from both admin keys) in cookie → every `/api/admin/*` checks it; mutations also need `x-mdify-admin: 1` + same Origin host.
- Cron: `x-mdify-cron-secret`.

## File Handling Flow

Upload never passes through a Vercel function in Storage mode (signed PUT). Backends download by path (max bytes enforced), re-validate magic bytes and limits, upload results by path. Downloads use 10-minute signed URLs. Deletion: cleanup Edge Function or admin removes the whole `jobs/<id>/` folder, then `mark_job_files_deleted` forgets names.

## State Management

Browser: model stores + `useSyncExternalStore`; localStorage for theme, consent version, last 5 sessions; sessionStorage for wake throttle. Server: stateless route handlers; state in Postgres.

## Background Tasks

Browser-driven `/advance` polling; Supabase Cron → `/api/jobs/tick` (every minute) and Edge Function cleanup (every 30 min). No separate worker process.

## External Integrations

Supabase (Storage, Postgres, Cron, Vault, Edge Functions); Vercel (frontend, N, Z); Render (O); GitHub (repos). No analytics, no ads.

## Build System

npm + Next.js build (`output: 'standalone'`); Python services without build (Vercel Python runtime for N/Z via `vercel.json`, Docker for O).

## Deployment Architecture (PLANNED)

| Component | Host | Instances |
|---|---|---|
| frontend | Vercel Hobby (`frontend` root) | 1 |
| backendN | Vercel Hobby (`backendN` root) | N1, N2 (2 projects) |
| backendZ | Vercel Hobby (`backendZ` root) | Z1, Z2 (2 projects) |
| backendO | Render Free via `render.yaml` (Docker) | O1, O2 |
| DB/Storage | Supabase Free, project `ppmbqgecdbrezxedyeur` | – |

## Known Architectural Problems

- Render Free: 750 instance hours per workspace per month; hash routing keeps both O1 and O2 awake → hours can run out mid-month (see `project-docs/unified-content-aware/REVIEW.md` "O2 as standby").
- Render Free 0.1 CPU: OCR will be much slower than local measurements (ESTIMATED).
- Vercel Hobby 300 s function limit; a tick waits on backends inside that budget.
- Supabase Free: 1 GB storage (budget 800 MiB enforced), 500 MB DB, egress quotas.
- No conversion rate limiting.
- Multipart fallback path is capped at 4.5 MB on Vercel.

## Proposed (NOT built)

- Picture-area OCR inside documents (owner: only if real documents need it).
- O2 as standby instead of hash-balanced (to save Render hours).
- Blog posts at `/blog/{slug}` with `BlogPosting` JSON-LD (the pipeline docs describe this as a separate app change; popup design must stay).
- Remaining parts of `project-docs/unified-content-aware/` not covered by steps 1–4 (see its `REVIEW.md`).
