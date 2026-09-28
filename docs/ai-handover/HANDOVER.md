# Project Handover

## Project Name

MDify (never "MarkDify"; some source files still carry the old `MarkDify` prefix, e.g. `MarkDifyHeader.js`). Owner/brand: **DevBehindYou**, devbehindyou@gmail.com, GitHub `DevBehindYou`.

## Current Objective

The last completed task was this handover. Before it: README rewrite + SEO/GEO optimisation of README and app (done), then copying the project into the `MDify` repository folder without committing (done).

## User's Final Goal

A production-ready, free MDify service at https://mdify-app.vercel.app that:

- converts documents, images, scanned PDFs and ZIP projects to Markdown through separate backend pools (N = normal documents, O = OCR for images only, Z = ZIP archives), with durable background jobs;
- stores files privately in Supabase Storage for at most 48 hours, with job metadata/KPIs in Supabase Postgres;
- has a two-key admin panel at `/mdify-controller`;
- has EU-compliant Terms/Privacy, SEO/GEO-optimised copy, and a blog fed by `MDify-Blog-Generation-Pipeline`.

The owner's build order (from 2026-09-27): 1 background jobs, 2 scanned-page PDFs, 3 ZIP v1, 4 admin tree view, 5 measure on real servers, 6 picture-area OCR only if needed. Steps 1–4 are built; step 5 needs deployment.

## Current Status

- Project builds: **YES** (`npm run build` in `frontend/`, 2026-09-28)
- Application launches: **YES locally** (dev server + N1/O1/Z1 via `.claude/launch.json`)
- Core functionality works: **PARTIAL**. Multipart path (`/api/convert` → backend) VERIFIED locally. Storage/queue path VERIFIED only against PGlite + fake backends; the real Supabase database has **no tables yet**, so with the Supabase keys set, uploads through the Storage path FAIL until the SQL is applied.
- Tests passing: frontend **112/112**, backendN **81/81**, backendO **70/70** (real Tesseract), backendZ **38/38**
- Lint: clean (`next lint`)
- CI/CD working: **NOT IMPLEMENTED** (no GitHub Actions workflows exist)
- Deployment working: **NO** for the new architecture. The live site runs an older single-app version (unverified which commit).

## What Was Completed

- MVVM frontend (Next.js 14 App Router), split into `frontend/`, `backendN/`, `backendO/`, `backendZ/` (FastAPI).
- Dispatcher with stable hashing and one peer retry; wake-all-backends on page open.
- Supabase Storage direct upload + durable Postgres work queue (jobs, work_items, content_nodes), browser-driven `/advance` + cron `/tick`.
- Scanned-page PDFs (text runs direct, scanned pages rendered to PNG and OCR'd on O1/O2, merged in order).
- ZIP support (backendZ): safe inspection, code/doc conversion, image OCR items, project index + manifest.
- Admin `/mdify-controller` with two-key login, KPIs, job list, content tree, preview/download/ZIP export, retention actions, audit log.
- EU Privacy Policy + Terms, consent banner, theme-aware icons/favicon, blog popup + pipeline.
- Load/OCR/failover benchmarks (local laptop), capacity decisions.
- README rewrite, SEO/GEO (metadata, JSON-LD, robots, sitemap, llms.txt, `/usecase` rewrite, new social card), Google Ads keyword research.
- Project mirrored into `C:\Users\temp\Documents\GitHub\MDify` (not committed).

## What Is Currently Being Worked On

Nothing in progress. All started tasks are finished; the owner will commit `MDify` themselves.

## Most Important Discoveries

1. `magika` (a MarkItDown dependency) calls `load_dotenv(find_dotenv())` on import and silently loads `backendN/.env` (real Supabase keys) into any process using the backendN venv, including pytest. Tests now blank those vars in every `tests/conftest.py`.
2. The Supabase connector/MCP account in this environment belongs to an unrelated project (`TheHopeTarot-database`). **Never use it.** The MDify project is reached only through the env keys.
3. OCR memory: WebP at 25 MP peaked at 442 MB; capped WebP at 12 MP → worst case 243 MB (fits Render Free 512 MB).
4. PDF token math: many AI apps read a PDF as text + a page image; that is the basis of the approved "Cut PDF token costs by 70%" claim (500-word page ≈ 667 tokens as Markdown vs ≈ 2,235 as PDF on standard-resolution models).
5. Render Free sleeps after 15 idle minutes and takes ~1 minute to wake; timeouts are sized for that (dispatcher attempt 150 s for OCR, route budget 300 s, `OCR_TIMEOUT_S=85`).

## Major Problems Found

- Supabase tables not applied (blocks all real Storage/queue/admin testing).
- License conflict: `MDify` repo had **MIT**; this project's `LICENSE` and Terms say **GPL-3.0**. The mirror replaced MIT with GPL-3.0 (uncommitted). Owner must decide.
- Production capacity unknown: all load numbers are from one laptop.
- No CI, no conversion rate limiting.

## Fixes Already Applied

See `ERRORS_AND_FIXES.md` (20+ entries). Key ones: magika env leak, launch.json secret mismatch, PGlite null composite mapping, keyset pagination ties, encrypted-ZIP test, favicon duplication, wake throttle bug, heredoc escape corruption.

## Current Blockers

1. **Owner action:** run `supabase/MDIFY_SETUP.sql` in the MDify Supabase project's SQL Editor.
2. **Owner action:** deployments (Vercel N1/N2/Z1/Z2/frontend, Render O1/O2), secrets, Vault entries, Edge Function, cron (`docs/GO_LIVE.md`).
3. **Owner decision:** MIT vs GPL-3.0.

## Pending Work

See `PENDING_TASKS.md`. Top items: apply SQL → verify with `tests/integration/storage_live.mjs`; resolve license; deploy; end-to-end tests on real services; measure capacity (step 5); test cleanup Edge Function; admin with real data.

## Recommended Next Action

Ask the owner whether `supabase/MDIFY_SETUP.sql` has been applied. If yes, run `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/integration/storage_live.mjs` and expect `tables: {"jobs":"present",...}` and `file_size_limit=15728640`. Then run a local end-to-end conversion through the Storage path (document, image, scanned PDF, ZIP with images) and exercise `/mdify-controller` with real data.

## Critical Warnings for Next Agent

- **Never touch the Supabase connector/MCP tools** (they point at `TheHopeTarot-database`). Use only the MDify project via env keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). The owner pastes SQL themselves; the service key cannot run DDL.
- **Never print or commit secret values.** `.env`, `.env.local` are gitignored; keep it that way.
- **Don't commit or push** unless the owner asks. The owner commits `MDify` themselves.
- **Only images go to O1/O2** (OCR). PDFs go to N; scanned PDF pages reach O only as rendered PNG images.
- **No engine or hosting names in public copy** (README, site, llms.txt, blog, social card). Only Terms §10 and Privacy §6 credit MarkItDown/Tesseract. `frontend/test/seo.test.mjs` enforces it.
- **Keep the Blog popup design unchanged.**
- **Downloads/installs need explicit permission** from the owner.
- **Don't generate code with backslash escapes via bash heredoc + Python**; use file edit tools (this corrupted files four times).
- Name is **MDify**.

## Files the Next Agent Should Inspect First

1. `docs/GO_LIVE.md`
2. `frontend/lib/server/jobService.js`, `frontend/lib/server/jobQueue.js`
3. `supabase/migrations/*.sql` (3 files) and `supabase/MDIFY_SETUP.sql` (generated)
4. `frontend/lib/server/admin*.js`, `frontend/app/api/admin/**`
5. `backendN/app/pdf_tasks.py`, `backendZ/app/archive.py`, `backendZ/app/archive_tasks.py`
6. `frontend/lib/siteContent.js` (public copy, sources, JSON-LD)
7. `.claude/launch.json` (local run configs)
