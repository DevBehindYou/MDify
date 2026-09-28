# Files Changed

Everything below is **uncommitted** in `MDify-Pro` (HEAD `ead5285`) and mirrored uncommitted into `MDify` (HEAD `354b78c`). "Created" = new in this project history; "Modified" = changed in the latest sessions.

## Deleted (old single-app layout at repo root; still in git history)

`app/` (page.js, layout.js, globals.css, MdifyProPopup.js, api/convert, api/health, usecase/*), `components/*` (ApiModal, BlogModal, DocStatsWidget, LegalModal, MarkDifyFooter, MarkDifyHeader, MarkdownSkeleton, MarkdownViewer, MobileDock, OutputStatusBar, RecentSessionsSidebar), `lib/converters/*` (docx, epub, html, htmlToMarkdown, image, index, pdf, pptx, spreadsheet, text), `lib/recentSessions.js`, `public/*` (moved to `frontend/public`), `.env.example`, `.eslintrc.json`, `bun.lock`, `metadata.json`, `next.config.js`, `package.json`, `package-lock.json`, `postcss.config.js`, `tailwind.config.js`.
Reason: moved into `frontend/` (MVVM) with conversion delegated to Python backends.

## Root

| File | Change | Reason |
|---|---|---|
| `README.md` | Rewritten 2026-09-28 | Owner request: icon, non-technical, SEO/GEO |
| `LICENSE` | GPL-3.0 (in MDify-Pro); replaced MIT in `MDify` by the mirror | Terms §10 says GPL-3.0; owner decision pending |
| `.gitignore` | Python, Node, `.env*`, `tests/load/.corpus/`, `tests/load/results/` | Keep secrets and generated data out |
| `render.yaml` | Created | O1/O2 on Render Free, `OCR_TIMEOUT_S` 85, env keys `sync: false` |
| `.claude/launch.json` | Created; secrets removed 2026-09-27; `backendZ-Z1` added | Local run configs (untracked; contains a session-specific `TESSDATA_PREFIX` path) |
| `mdify-main-quickpatch.diff` | Present, origin UNKNOWN | Not created knowingly by the agent; ask the owner |

## frontend/

### App routes
| File | Change |
|---|---|
| `app/layout.js` | Metadata from `siteContent.js` (title "MDify: Free PDF to Markdown Converter Online", description, keywords, OG/Twitter), site JSON-LD, theme script with favicon `media` switch, `next/font`, `WakeOnOpen`, `ConsentBanner` |
| `app/page.js` | Converter screen (client, MVVM) |
| `app/usecase/page.js`, `app/usecase/UseCaseClient.js` | Rewritten 2026-09-28 (see CHANGES_MADE) |
| `app/privacy/page.js`, `app/terms/page.js` | Created (server-rendered legal pages) |
| `app/mdify-controller/page.js` | Created (admin, noindex) |
| `app/robots.js`, `app/sitemap.js` | Created 2026-09-28 (imports use explicit `.js` so Node tests can import them) |
| `app/api/convert/route.js` | Multipart fallback; `maxDuration` 300; size check after extension check |
| `app/api/uploads/create/route.js` | Create job + signed upload URL (501 when Supabase unset) |
| `app/api/jobs/[id]/start|advance|download/route.js` | Queue start, advance pass, download link |
| `app/api/jobs/tick/route.js` | Cron sweep + scheduling pass (`CRON_SECRET`, `timingSafeEqual`) |
| `app/api/wake/route.js`, `app/api/health/route.js` | Wake pings; health (+ storage flag) |
| `app/api/admin/**/route.js` (10 files) | Admin API (session, overview, jobs, job, action, file sign, bulk, files, audit, processes) |

### Server libraries (`lib/server/`)
`dispatcher.js` (pools, hash, retry, timeouts), `supabaseRest.js` (+ `insertMany`, `remove`, `listObjects`, `removeObjects`), `jobService.js` (rewritten), `jobQueue.js` (new), `wake.js` (new), `adminAuth.js`, `adminService.js`, `adminRoute.js` (new).

### Models (`lib/models/`)
`conversionService.js` (Storage path + polling + fallback), `queueModel.js` (`jobProgress`), `wakeModel.js` (new), `sessionRepository.js` (demo session replaced 2026-09-28), `consentRepository.js`, `themeRepository.js`, `adminApi.js`, `contentTree.js`, `adminFormat.js` (new).

### Other libraries
`lib/formats.js` (extension lists incl. zip, `MAX_IMAGE_FILE_SIZE` 10 MB, `sizeLimitMessage`), `lib/legal/policies.js` (legal texts, `LEGAL_VERSION` 2026-09-28), `lib/siteContent.js` (new, public copy + JSON-LD), `lib/blog.mjs`, `lib/blogPosts.generated.json` (generated).

### Components
`AppIcon.js`, `JsonLd.js`, `WakeOnOpen.js`, `ConsentBanner.js` (hidden on `/mdify-controller`), `LegalDocument.js`, `LegalModal.js`, `LegalPage.js`, `MarkDifyHeader.js` (icon, wake badge), `MarkDifyFooter.js` (engine line replaced by "Free · no sign-up · files deleted within {RETENTION_HOURS} hours · open source (GPL-3.0)"), `MarkdownSkeleton.js` ("MDify engine"), `BlogModal.js` (icon in header; design unchanged), `converter/LandingWorkspace.js` + `converter/MobileWorkspace.js` (hero copy, ZIP tag), `components/admin/*` (AdminApp, AdminLogin, OverviewPanel, JobsPanel, JobDetail, ContentTreeView, ListPanels, ui).

### View models
`useServerStatusViewModel.js` (wake states), `useConverterScreenViewModel.js`, `useConverterViewModel.js` (progress), `useAdminViewModel.js` (new).

### Public assets
`public/mdify-icon-dark.svg`, `mdify-icon-light.svg` (cropped viewBox), `mdify-icon.png` (regenerated 512×512 from SVG, 2026-09-28), `og-card.png` (regenerated 1200×630, 2026-09-28), `llms.txt` (new), `mdify-icon-original.png` (old, unused).

### Scripts
`scripts/build-blog-index.mjs`, `scripts/build-setup-sql.mjs` (new), `scripts/build-brand-images.mjs` (new).

### Tests (`frontend/test/`)
`admin`, `blog`, `consent`, `contentTree`, `dispatcher`, `legalStyle`, `models`, `queueModel`, `seo`, `storageFlow`, `wake` (`*.test.mjs`); `sql/{admin,setupSql,workQueue}.test.mjs`, helpers `sql/pgliteDb.mjs` (exports `SUPABASE_SHIM`, `freshDb`), `sql/pgliteSupabase.mjs` (PostgREST-like adapter with in-memory Storage `objects` Map, `eq`/`lt` filters).

### Config
`package.json` (scripts `sql:setup`, `sql:check`, `brand:images`, `blog:*`; dev dep `@electric-sql/pglite`), `.env.example` (all variable names incl. `ARCHIVE_BACKEND_URLS`, `CRON_SECRET`, `ADMIN_KEY_1/2`, tuning), `.env.local` (gitignored; not in repo), `next.config.js` (`output: 'standalone'`), `tailwind.config.js` (`darkMode: ['selector','[data-theme="dark"]']`).

## backendN/, backendO/, backendZ/

| File | Change |
|---|---|
| `app/common/*.py` (all three, identical) | `config.py` (roles normal/ocr/archive, upload caps 15/10/15 MB, `load_local_env`), `app_factory.py` (`/process` with `raw`, `work_item_id`, `outputs`), `storage.py` (path allow-list incl. materialized/nodes/output variants), `security.py`, `profiles.py`, `files.py`, `errors.py` |
| `app/main.py` (each) | `load_local_env(<backend>/.env)` before `load_settings` |
| `backendN/app/pdf_tasks.py` | Created (scanned-page PDFs) |
| `backendN/app/converter.py`, `pdf_fast_path.py` | Low-text note; opt-in fast path |
| `backendO/app/converter.py`, `Dockerfile` | OCR pipeline; osd model download |
| `backendZ/app/{archive,archive_tasks,converter,main}.py` | Created |
| `*/tests/conftest.py` | Blank Supabase env before imports (magika leak) |
| `*/tests/test_common.py` | Compare `app/common` with every other present backend |
| `backendZ/tests/{test_archive,test_archive_tasks,test_common,zips}.py` | Created (`zips.mark_encrypted` patches ZIP header flags) |
| `backendN/.vercelignore`, `backendZ/.vercelignore` | `.env`, `.env.*`, `!.env.example` added |
| `*/README.md`, `*/.env.example`, `*/requirements*.txt`, `*/pytest.ini`, `*/vercel.json` (N, Z: 300 s) | Created/updated |

## supabase/

`migrations/20260926000000_mdify_init.sql` (renamed from `_markdify_init`), `migrations/20260927000000_mdify_work_queue.sql`, `migrations/20260928000000_mdify_admin.sql`, `MDIFY_SETUP.sql` (generated; do not edit by hand), `cron.sql` (cleanup every 30 min + tick every minute; Vault names), `functions/cleanup-expired-jobs/index.ts` (folder delete + `mark_job_files_deleted`), `tests/verify_permissions.sql`.

## docs/, project-docs/, tests/, MDify-Blog-Generation-Pipeline/

- `docs/`: `ARCHITECTURE.md`, `ADMIN_ARCHITECTURE.md`, `BACKGROUND_JOBS.md`, `GO_LIVE.md`, `RETENTION_AND_CLEANUP.md`, `SUPABASE_*_ARCHITECTURE.md`, `testing/{BACKEND_INTEGRATION,CAPACITY_SUMMARY,FAILOVER,LOAD_TEST,OCR_BENCHMARK,PERFORMANCE,SUPABASE}_REPORT.md` (`STORAGE_DATABASE_REPORT.md` removed), `ai-handover/*` (this package).
- `project-docs/`: planning package (Cloudflare era), `supabase/REVIEW.md`, `unified-content-aware/` (+ `REVIEW.md`), `NEXT_AGENT_INSTRUCTIONS.md` (dated snapshots).
- `tests/load/` (harness.py, ocr_cap_bench.py, pdf_xlsx_bench.py, zip_bench.mjs, corpus.py, tables.py), `tests/integration/storage_live.mjs` (real Storage check).
- `MDify-Blog-Generation-Pipeline/`: `01-STYLE-RULES.md`, `02-SEO-GEO.md` (keyword table 2026-09-28), `03-BRAND-ENTITY.md` (no engine names; capabilities updated), `04-OUTPUT-FORMAT.md`, `README.md`, `check.mjs` (rejects MarkDify and engine names), `topics.md`, `Blogs/`, `Outputs/`.
