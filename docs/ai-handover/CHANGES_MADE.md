# Changes Made

Ordered roughly by date. "Verification" states exactly how far each change was checked.

## Change: Repository split + MVVM frontend

### Problem
One Next.js app at the repo root converted files in JavaScript (`lib/converters/*`). No separation between UI and conversion; no path to separate normal/OCR pools.
### Root Cause
Original prototype design.
### Solution
`frontend/` (Next.js 14 App Router, MVVM), `backendN/` (FastAPI + MarkItDown), `backendO/` (FastAPI + Tesseract). Shared backend core `app/common/` (config, app factory, storage client, security, profiles, files, errors), byte-identical in every backend.
### Files Modified
Old root `app/`, `components/`, `lib/converters/*`, `package.json` etc. deleted; new trees created.
### Key Implementation Details
Model = `frontend/lib/models/*` (pure JS: `conversionService`, `queueModel`, `sessionRepository`, `themeRepository`, `consentRepository`, `wakeModel`, `adminApi`, `contentTree`), ViewModel = `frontend/viewmodels/*` hooks (`useSyncExternalStore`), View = `app/` + `components/`.
### Verification
Build, unit tests, browser checks. VERIFIED locally.
### Remaining Concerns
Component files still named `MarkDify*.js` (internal only).

## Change: Dispatcher with pools and failover

### Problem
Route each file to the right pool and survive one dead instance.
### Solution
`frontend/lib/server/dispatcher.js`: `getPoolConfig()` reads `NORMAL_BACKEND_URLS`, `OCR_BACKEND_URLS`, `ARCHIVE_BACKEND_URLS`; `attemptOrder()` uses FNV-1a hash of the job/work-item id; `sendToPool()` retries once on the peer only for connection errors and 502/503/504 (never 4xx/422/timeout). `TIMEOUT_MS_BY_POOL = { normal: 120_000, ocr: 150_000 }` (Render Free wake-up).
### Verification
`test/dispatcher.test.mjs`; live local failover run (80/80 single-outage jobs masked, `docs/testing/FAILOVER_REPORT.md`). VERIFIED locally.

## Change: OCR pipeline fixes (backendO)

### Problem
Rotated scans returned garbage (rotation recall 0.0); peak memory high.
### Root Cause
Tesseract read rotated pages as-is; OSD never consulted. Full-colour decode of large images.
### Solution
`backendO/app/converter.py`: grayscale-first `_prepare` (JPEG draft mode "L", manual EXIF transpose, autocontrast, downscale above 12 MP / upscale below 1000 px); OSD only when upright confidence < 75 or < 3 words; accept rotation only if confidence rises by > 5. `ready()` cached 300 s. WebP capped at 12 MP from the header (`OCR_MAX_WEBP_PIXELS`), all images ≤ 10 MB.
### Verification
Tests with real Tesseract (70/70); `docs/testing/OCR_BENCHMARK_REPORT.md`: recall 0.0 → 1.0; worst memory 243 MB (WebP 12 MP), was 442 MB at 25 MP. VERIFIED locally.
### Remaining Concerns
Not measured on Render Free (0.1 CPU).

## Change: Supabase Storage + Postgres instead of Cloudflare

### Problem
Owner changed the platform: "use Supabase S3 storage and Database … instead of cloudflare."
### Solution
- `supabase/migrations/20260926000000_mdify_init.sql`: `jobs`, `file_objects`, `job_events`, `audit_logs`, indexes, `confirm_upload`, `sweep_stale_jobs`, `claim_cleanup_batch`, `request_delete_now`, `get_admin_kpis`; bucket `mdify-pro-files` (private, 15 MB). All functions SECURITY INVOKER, executable only by `service_role` (explicit revokes from `anon`, `authenticated`).
- `frontend/lib/server/supabaseRest.js`: REST/PostgREST client without SDK (insert, insertMany, update, select, remove, rpc, signed upload/download URLs, listObjects, removeObjects).
- Backends: `app/common/storage.py` `StorageClient` with an object-path allow-list.
### Verification
SQL on PGlite (tests); Storage REST against the real project (5/5). Tables NOT APPLIED to the real project.

## Change: Durable work queue (build step 1)

### Problem
Multi-part jobs (scanned PDFs, ZIPs) span several servers and outlive one HTTP request; Vercel functions max 300 s.
### Solution
`supabase/migrations/20260927000000_mdify_work_queue.sql`: `content_nodes`, `work_items`; `enqueue_root`, `add_work_items`, `claim_work_items` (per-pool advisory lock, capacity check, fair `row_number() over (partition by job_id)`, `FOR UPDATE SKIP LOCKED`, 6-min lease), `complete_work_item` (attempt guard; RETRY requeues), `settle_job` (unblocks BLOCKED merges, finishes/fails/cancels), `requeue_expired_work_items`, `sweep_stale_jobs`, `storage_usage_bytes`, `get_job_tree`, `forget_job_details`, extended `get_admin_kpis`. Orchestrator `frontend/lib/server/jobQueue.js` (`runTick`, `executeItem`, `spawnFromResult`); job service rewrite `frontend/lib/server/jobService.js`; routes `start`, `advance`, `tick`; browser `waitForJob` polling in `conversionService.js`.
### Key Implementation Details
Browser polls `/api/jobs/:id/advance` (0.5 s, 3 s while queued, backoff on errors, 30 min cap). Supabase Cron calls `/api/jobs/tick` every minute with `x-mdify-cron-secret`. No document text in DB rows (`statsOnly`).
### Verification
`test/sql/workQueue.test.mjs` (10) and `test/storageFlow.test.mjs` (15) on PGlite with fake backends. VERIFIED on PGlite; real DB NOT APPLIED.

## Change: Storage budget check

### Solution
`jobService.checkStorageBudget()`: bucket usage (`storage_usage_bytes`, 15 s cache) + expected footprint (×2 documents/images, ×3 PDFs/ZIPs) must stay under `STORAGE_BUDGET_BYTES` (default 800 MiB), else 503 "MDify is handling a lot of files right now…". Fails open if the usage query fails.
### Verification
Tests. VERIFIED on PGlite.

## Change: Wake all backends on page open

### Problem
Render Free sleeps after 15 idle minutes; first request waits ~1 minute.
### Solution
`frontend/lib/server/wake.js` (pings `/api/v1/health` of every instance, 10 s cache), `app/api/wake/route.js`, `lib/models/wakeModel.js` (sessionStorage throttle 10 min, countdown), `components/WakeOnOpen.js` (mounted in layout; re-wakes after ≥ 10 min hidden), header badge "Waking · Ns".
### Verification
`test/wake.test.mjs` (7), browser. VERIFIED locally; real Render wake NOT TESTED.

## Change: Scanned-page PDFs (build step 2)

### Solution
`backendN/app/pdf_tasks.py`: `classify_pages` (pypdfium2: text chars, image coverage ≥ 0.3 with < 20 chars = scan), `page_runs`, native runs converted via sub-PDFs, scan pages rendered to grayscale PNG at 200 dpi (≤ 12 MP) under `materialized/`, `PDF_PAGE_OCR` items to O pool (`raw: true`), `PDF_MERGE` in page order with placeholders for failed pages. `PDF_MAX_OCR_PAGES` = 100. Endpoints `/api/v1/internal/pdf/analyze|merge`.
### Verification
`backendN/tests/test_pdf_tasks.py` (10) with generated PDFs. VERIFIED locally.

## Change: ZIP support, backendZ (build step 3)

### Solution
`backendZ/app/archive.py` (safety + classification + conversion + `PROJECT_INDEX.md` + `manifest.json`), `archive_tasks.py` (`/api/v1/internal/archive/process` single/split mode, `/merge`), `converter.py` (multipart fallback, images listed only), `main.py` (role archive, port 8005). Limits: 2,000 entries, 100 MB uncompressed, 15 MB per entry, 10 MB per image, ratio 100, nested depth 1 (max 10), 50 OCR images, 40 MB output, 100 s budget, output parts ≤ 4 MB. Skips `node_modules`, `.git`, `dist`, `build`, `bin`, … (listed); credential files (`.env`, keys, certs) never read ("Sensitive").
### Verification
38 tests; live run through the frontend multipart path to Z1 (2026-09-27). VERIFIED locally; Storage split mode only with fake Storage.

## Change: Admin `/mdify-controller` (build step 4)

### Solution
- SQL `supabase/migrations/20260928000000_mdify_admin.sql`: `admin_list_jobs`, `admin_list_files`, `admin_list_audit` (keyset pages, JSON arrays), `admin_set_retention` (KEEP / EXTEND 1 h–90 d / AUTO = 48 h after upload), `admin_retry_cleanup`, `mark_job_files_deleted`.
- Server: `lib/server/adminAuth.js` (two keys ≥ 24 chars and different; SHA-256 + `timingSafeEqual`; HMAC session 30 min; cookie `mdify_admin`, `Path=/api/admin`, HttpOnly, SameSite=Strict, Secure in prod; login throttle 5 per 15 min per client), `adminService.js` (overview, lists, jobDetail, signFile, purgeJobFiles, setRetention, deleteNow, deleteJob, retryCleanup, bulkAction, processes, audit), `adminRoute.js` (guard, `x-mdify-admin: 1` + same-origin for mutations, `no-store`, `noindex`).
- API: `app/api/admin/{session,overview,jobs,jobs/[id],jobs/[id]/action,jobs/[id]/files/[fileId],bulk,files,audit,processes}`.
- UI: `app/mdify-controller/page.js` (noindex), `components/admin/*`, `viewmodels/useAdminViewModel.js`, `lib/models/{adminApi,contentTree,adminFormat}.js`. ZIP export built in the browser from signed links (≤ 200 files / 200 MB).
### Verification
`test/admin.test.mjs` (15) + `test/sql/admin.test.mjs` (6) + `test/contentTree.test.mjs` (4); curl probes (401/403 as expected); browser: login, wrong keys, tabs, Processes live. PARTIALLY VERIFIED (no real data).

## Change: Retention cleanup deletes the whole job folder

### Problem
Only registered `file_objects` were deleted; scanned-PDF pages, ZIP images and partial results would remain.
### Solution
`supabase/functions/cleanup-expired-jobs/index.ts`: recursive `listTree` of `jobs/<id>/` (folders have `id === null`), `removeAll` in chunks of 100, then `mark_job_files_deleted()` (file_objects DELETED, job COMPLETE, names forgotten). Same logic in admin `purgeJobFiles`.
### Verification
SQL on PGlite; Storage list/delete behaviour on the real project (storage_live). Edge Function IMPLEMENTED BUT UNTESTED.

## Change: Local env loading + test isolation

### Problem / Root Cause
See ERRORS_AND_FIXES #1 and #2 (magika `.env` leak; launch.json secret mismatch).
### Solution
`app/common/config.py` `load_local_env(path)` (process vars win), called in each `app/main.py` before `load_settings`; every `tests/conftest.py` blanks `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` first; `INTERNAL_SHARED_SECRET` removed from `.claude/launch.json`; `.env` added to `.vercelignore` of N and Z.
### Verification
All backend suites pass; N1/O1/Z1 start with secret + storage from their `.env`. VERIFIED.

## Change: Combined setup SQL

### Solution
`frontend/scripts/build-setup-sql.mjs` → `supabase/MDIFY_SETUP.sql` (all migrations in one transaction; `npm run sql:setup`, `npm run sql:check`). Idempotent.
### Verification
`test/sql/setupSql.test.mjs`: up to date; applies on fresh PGlite; second paste keeps data. VERIFIED on PGlite.

## Change: EU legal texts + consent

### Solution
`frontend/lib/legal/policies.js` (single source; `LEGAL_VERSION` 2026-09-28; `RETENTION_HOURS` 48; operator DevBehindYou + devbehindyou@gmail.com), `LegalDocument`, `LegalModal`, `LegalPage`, `/privacy`, `/terms`, `consentRepository.POLICY_VERSION = LEGAL_VERSION`. 2026-09-28: Terms §2 lists scanned PDFs + ZIP and limits; Terms §10 note credits MarkItDown (MIT) and Tesseract (Apache 2.0); Privacy §6 note says the conversion software runs on MDify's servers and sends files nowhere.
### Verification
`test/legalStyle.test.mjs`, `test/consent.test.mjs`; pages render (curl). VERIFIED.
### Remaining Concerns
Not reviewed by a lawyer.

## Change: Icons and favicon

### Solution
`components/AppIcon.js` (light/dark `<img>` pair, CSS `dark:`), cropped SVG viewBox (bigger icon), icon in header, footer, Blog popup. Favicon: both SVG `<link rel=icon>` always present; theme script + `themeRepository.applyTheme` switch their `media` (`all` / `not all`).
### Verification
Browser, reload in both themes. VERIFIED.

## Change: Blog pipeline

### Solution
`MDify-Blog-Generation-Pipeline/` (style rules, SEO/GEO, brand entity, output format, `check.mjs`, topics). Posts go to `frontend/content/blog/`, indexed by `frontend/scripts/build-blog-index.mjs` into `lib/blogPosts.generated.json`, shown in `BlogModal`. 4 old posts removed. 2026-09-28: brand brief forbids engine names; `check.mjs` rejects them; keyword table added.
### Verification
`test/blog.test.mjs`; `node --check check.mjs`. VERIFIED (no posts exist yet).

## Change: README rewrite + SEO/GEO (2026-09-28)

### Problem
README was technical (named hosts/engines, outdated R2/D1 architecture); app metadata named MarkItDown and used unsourced "110K+ GitHub Stars" and "70%" claims; no robots/sitemap/llms.txt/structured data; `og-card.png` wrong size and content.
### Solution
- `README.md`: icon (`<picture>` light/dark), TL;DR, "What is MDify?", sourced token table, formats, how-to, profiles, audiences, comparison, privacy, 6 FAQs, GPL-3.0, contact, last updated. No engine/host names.
- `frontend/lib/siteContent.js`: `SITE_URL`, `DESCRIPTION`, `KEYWORDS`, `SOURCES`, `TOKEN_EXAMPLE`, `FORMAT_GROUPS`, `FAQS`, `siteJsonLd()`, `faqJsonLd()`.
- `components/JsonLd.js`; `app/layout.js` metadata + site JSON-LD (WebSite, WebApplication, Organization); `app/robots.js` (AI crawlers allowed; `/api/`, `/mdify-controller` disallowed); `app/sitemap.js`; `public/llms.txt`.
- `/usecase` rewritten (`app/usecase/page.js` metadata + FAQPage JSON-LD; `UseCaseClient.js` answer-first copy, token table with sources, formats table, `<details>` FAQ in HTML, last updated).
- Hero copy (desktop/mobile), footer, loading label, demo session (removed invented metrics and MarkItDown snippet).
- `scripts/build-brand-images.mjs` (`npm run brand:images`, uses sharp): new `og-card.png` 1200×630, `mdify-icon.png` 512×512 from the current SVG.
- `test/seo.test.mjs`: no engine/host names in public copy; 70%/80% math; FAQ schema = visible FAQ; robots rules; JSON-LD shape.
### Verification
112/112 tests, lint, build; browser desktop + 375 px (no horizontal scroll, 7 FAQ answers in DOM); production HTML canonical/og:image point to https://mdify-app.vercel.app. VERIFIED locally.
### Remaining Concerns
Search Console / Bing submission not done (owner action). Blog posts have no own URLs (popup only).

## Change: Project mirrored into `MDify`

### Solution
`robocopy MDify-Pro MDify /MIR /XD .git node_modules .next .venv venv __pycache__ .pytest_cache .vercel tests\load\.corpus tests\load\results /XF *.pyc`, run after the copy request and again after the SEO work (and after this handover). `MDify/.git` untouched.
### Verification
File lists identical; key files byte-equal; `.env*` ignored. VERIFIED.
### Remaining Concerns
LICENSE MIT → GPL-3.0 in `MDify` (owner decision pending).
