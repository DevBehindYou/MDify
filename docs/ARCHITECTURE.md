# MDify — Architecture (as built)

Status labels: VERIFIED · IMPLEMENTED BUT UNTESTED · PARTIALLY VERIFIED · BROKEN · NOT IMPLEMENTED.
"VERIFIED" alone means verified **locally** (see `docs/testing/`). Everything was deployed on
2026-09-28; "LIVE" says what was checked on the deployed system. Conversions through the live
site (document, image, scanned PDF, ZIP) have not been run yet.

```text
Browser
  │ 0 POST /api/wake (page open) ──────────► pings every backend instance (Render Free wake-up)
  │ 1 POST /api/uploads/create ─────────────► Frontend (Vercel, Next.js 14): storage budget check
  │ 2 PUT bytes (signed URL) ──────────────► Supabase Storage  (private bucket mdify-pro-files)
  │ 3 POST /api/jobs/:id/start ────────────► enqueue root work item, first scheduling pass
  │ 4 POST /api/jobs/:id/advance (repeat) ─► one scheduling pass for this job, then its status
  │                                              │ claim_work_items() per pool (capacity, fairness, leases)
  │                                              ├─ normal ──► N1 | N2  (Vercel, MarkItDown; PDF analyse/merge)
  │                                              ├─ ocr ─────► O1 | O2  (Render Free, Tesseract; images only)
  │                                              └─ archive ─► Z1 | Z2  (Vercel, ZIP inspect/convert/merge)
  │                                                     │ read inputs / write results by object path
  │                                                     └──────► Supabase Storage
  │                                              └─ queue + job state ─► Supabase Postgres
  │ 5 GET signed download URL ─────────────► Supabase Storage
Supabase Cron ── every minute ─► POST /api/jobs/tick (retries, abandoned jobs)
              ├─ every 30 min ─► Edge Function cleanup-expired-jobs (retention)
              └─ every 30 min, 12:00–23:30 UTC ─► GET O1, O2 /api/v1/health (keep-warm)
Admin ─► /mdify-controller (two keys) ─► /api/admin/* (session cookie, audited)
```

When Supabase is not configured (local development), the browser falls back
to `POST /api/convert`: the file travels to the dispatcher and on to the
backend as multipart, and the Markdown comes back in the response. That path
has no queue: scanned PDF pages are not recognised and images inside a ZIP are
listed only.

## Components

| Component | Code | Status |
|-----------|------|--------|
| Frontend UI (MVVM) | `frontend/app`, `frontend/components`, `frontend/viewmodels`, `frontend/lib/models` | VERIFIED (build, unit tests, browser checks) |
| Wake all backends on page open | `frontend/lib/server/wake.js`, `app/api/wake`, `components/WakeOnOpen.js` | VERIFIED (unit tests, browser) |
| Dispatcher: pool routing, FNV-1a hash, one peer retry | `frontend/lib/server/dispatcher.js` | VERIFIED (unit tests + live failover) |
| Durable work queue (background jobs) | `supabase/migrations/20260927000000_mdify_work_queue.sql`, `frontend/lib/server/jobQueue.js`, `jobService.js` | VERIFIED on real Postgres (PGlite) with fake backends; LIVE: the tick runs every minute and returns 200 — see `docs/BACKGROUND_JOBS.md` |
| Storage budget check before new jobs | `jobService.checkStorageBudget` | VERIFIED (tests) |
| Scanned-page PDFs (text pages direct, scanned pages to O1/O2) | `backendN/app/pdf_tasks.py` | VERIFIED locally (real PDFs, 10 tests) |
| ZIP files (backendZ, Z1/Z2) | `backendZ/app/archive.py`, `archive_tasks.py` | VERIFIED locally (38 tests, live run through the frontend); LIVE on Vercel (Tokyo): ready, secret and storage configured |
| N1/N2 normal backend (`backendN`) | FastAPI + MarkItDown 0.1.8 | VERIFIED locally; LIVE on Vercel (Tokyo): ready, secret and storage configured |
| O1/O2 OCR backend (`backendO`) | FastAPI + Tesseract 5 `tessdata_fast` + OSD | VERIFIED locally; LIVE on Render Free (Singapore): ready, Tesseract 5.5.0 |
| OCR keep-warm | `supabase/migrations/20260928120000_mdify_keepwarm.sql`, `supabase/cron.sql` | LIVE: O1 and O2 answered 200 (`keepwarm_pings`) |
| Supabase Storage paths (signed upload, service read/write, signed download, list, delete) | `supabaseRest.js`, `app/common/storage.py` | VERIFIED against the real MDify project (`tests/integration/storage_live.mjs`, 5/5 rounds) |
| Postgres schema, RPCs, bucket | `supabase/migrations/*.sql`, pasted as `supabase/MDIFY_SETUP.sql` | VERIFIED on PGlite; LIVE: applied to the MDify project, admin RPCs return data |
| Retention cleanup (whole job folder, then names forgotten) | `supabase/functions/cleanup-expired-jobs`, `supabase/cron.sql` | SQL parts VERIFIED on PGlite; Edge Function deployed but BROKEN until redeployed: the first version rejected every call (fixed in code, see `docs/RETENTION_AND_CLEANUP.md`) |
| `/mdify-controller` admin | `frontend/app/mdify-controller`, `components/admin`, `lib/server/admin*.js`, `app/api/admin` | PARTIALLY VERIFIED: auth, guards, actions and SQL tested; LIVE session API works; not yet checked with real jobs — see `docs/ADMIN_ARCHITECTURE.md` |
| Rate limiting (conversions) | – | NOT IMPLEMENTED (admin login is throttled) |

## Invariants

1. **Only images go to O1/O2.** Routing is by extension; PDFs go to N1/N2, which render scanned
   pages to PNG and hand those images to the OCR pool as separate work items. ZIP files go to Z1/Z2,
   which hand images inside the archive to the OCR pool the same way.
2. **Storage is the large-file transport.** Requests and responses carry object paths and statistics,
   never file content. Results are fetched with 10-minute signed URLs.
3. **Backends only touch their job's objects.** `app/common/storage.py` allows only
   `jobs/<uuid>/input/source.<ext>`, `materialized/<id>/source.<ext>`, `nodes/<id>/(result.md|partial.json)`
   and `output/(result.md|combined[-NNN].md|PROJECT_INDEX.md|manifest.json)`, and every path in a
   request must belong to the request's job.
4. **Every backend re-validates bytes** (magic bytes, zip-bomb limits, decoded image dimensions).
5. **No document content in database rows.** Work item results keep statistics only; after deletion the
   file names and paths inside archives are cleared too (`forget_job_details`).
6. **No privileged function is callable by browser roles**; all RPCs are granted to `service_role` only.
7. **Secrets are server-only**: `BACKEND_SHARED_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
   `ADMIN_KEY_1/2` never use a `NEXT_PUBLIC_` prefix.

## Configuration

| Where | Variables |
|-------|-----------|
| Frontend | `NORMAL_BACKEND_URLS`, `OCR_BACKEND_URLS`, `ARCHIVE_BACKEND_URLS`, `BACKEND_SHARED_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `CRON_SECRET`, `ADMIN_KEY_1`, `ADMIN_KEY_2`, optional `MAX_INFLIGHT_*`, `STORAGE_BUDGET_BYTES` |
| backendN (N1/N2) | `BACKEND_ROLE=normal`, `BACKEND_INSTANCE=N1/N2`, `INTERNAL_SHARED_SECRET`, `SUPABASE_*`, optional `PDF_MAX_OCR_PAGES` |
| backendO (O1/O2) | `BACKEND_ROLE=ocr`, `BACKEND_INSTANCE=O1/O2`, `INTERNAL_SHARED_SECRET`, `SUPABASE_*`, `OMP_THREAD_LIMIT=1`, `OCR_*` limits |
| backendZ (Z1/Z2) | `BACKEND_ROLE=archive`, `BACKEND_INSTANCE=Z1/Z2`, `INTERNAL_SHARED_SECRET`, `SUPABASE_*`, optional archive limits (`backendZ/.env.example`) |

Each backend reads its own `.env` for local runs (`load_local_env` in `app/main.py`); deployments use
real environment variables. Going live, step by step: `docs/GO_LIVE.md`.

Details: `docs/BACKGROUND_JOBS.md`, `docs/SUPABASE_STORAGE_ARCHITECTURE.md`,
`docs/SUPABASE_DATABASE_ARCHITECTURE.md`, `docs/RETENTION_AND_CLEANUP.md`, `docs/ADMIN_ARCHITECTURE.md`,
measurements in `docs/testing/`. Planning packages are in `project-docs/`.
