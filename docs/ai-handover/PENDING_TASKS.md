# Pending Tasks

Items marked **(owner)** need the owner to act or decide; the agent must not do them alone.

## P0 — Critical

- [ ] **Apply the database schema** (owner)
  - Problem: the MDify Supabase project has no tables; with Supabase keys set, uploads and the admin fail (PostgREST 404).
  - Required action: owner pastes `supabase/MDIFY_SETUP.sql` into Supabase Dashboard → SQL Editor → Run (one transaction, idempotent). If a migration changed since, run `cd frontend && npm run sql:setup` first.
  - Relevant files: `supabase/migrations/*.sql`, `supabase/MDIFY_SETUP.sql`, `frontend/scripts/build-setup-sql.mjs`.
  - Verification: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/integration/storage_live.mjs 3` prints `tables: {"jobs":"present","work_items":"present","content_nodes":"present"}` and `file_size_limit=15728640`.

- [ ] **Resolve the license conflict before committing `MDify`** (owner)
  - Problem: `MDify` repo was MIT; the mirror replaced it with this project's GPL-3.0 (uncommitted). Terms §10, README and JSON-LD say GPL-3.0.
  - Required action: owner chooses. If MIT: `git -C C:/Users/temp/Documents/GitHub/MDify checkout HEAD -- LICENSE`, copy it to `MDify-Pro/LICENSE`, and change GPL-3.0 mentions in `frontend/lib/legal/policies.js` (Terms §10, bump `LEGAL_VERSION`), `README.md`, `frontend/lib/siteContent.js` (`license`), `frontend/components/MarkDifyFooter.js`, `public/llms.txt`, then re-mirror.
  - Verification: `grep -rn "GPL" README.md frontend/lib frontend/components frontend/public` matches the chosen license.

## P1 — High Priority

- [ ] **Local end-to-end on the real database** (after P0 schema)
  - Required action: start `frontend`, N1, O1, Z1 (`.claude/launch.json`); convert via the UI: a DOCX, a PNG, a PDF with a scanned page, a ZIP containing an image. Watch `/mdify-controller` (sign in with the local keys in `frontend/.env.local`).
  - Relevant files: `lib/server/jobService.js`, `jobQueue.js`, `backendN/app/pdf_tasks.py`, `backendZ/app/archive_tasks.py`.
  - Dependencies: P0 schema; `TESSDATA_PREFIX` for O1 must point to a folder with `eng` + `osd` fast models.
  - Verification: every job COMPLETED; outputs downloadable; admin shows the content tree; "Delete files now" removes all objects under `jobs/<id>/` (check with `storage_live`-style list) and clears names.

- [ ] **Deploy** (owner does accounts/secrets; agent can prepare and verify)
  - Required action: follow `docs/GO_LIVE.md`: secrets (`BACKEND_SHARED_SECRET`/`INTERNAL_SHARED_SECRET`, `CRON_SECRET`, `ADMIN_KEY_1`, `ADMIN_KEY_2`), Vault (`mdify_service_role_key`, `mdify_cron_secret`), Vercel projects N1/N2/Z1/Z2 (roots `backendN`, `backendZ`), Render O1/O2 (`render.yaml`), frontend env, `supabase functions deploy cleanup-expired-jobs`, `supabase/cron.sql` (replace `<project-ref>` = `ppmbqgecdbrezxedyeur`).
  - Verification: each `GET <url>/api/v1/ready` → `ready:true, secret_configured:true, storage_configured:true`; `/mdify-controller` → Processes all ready.
  - Risk: Vercel Python bundle for N/Z may exceed 500 MB (MarkItDown extras ~260 MB installed on Windows) — check first deploy logs.

- [ ] **Step 5: measure on the real servers**
  - Problem: capacity numbers are from one laptop.
  - Required action: add a remote mode to `tests/load/harness.py` (line 52 `PORTS = … int(url.rsplit(":", 1)[1])` crashes for https URLs without a port; skip local PID/memory sampling; add the Z pool and the Storage/queue path), then run `health`, `matrix --kind normal|ocr|mixed`, `ocr_cap_bench.py` against deployed URLs. Measure Render wake-up time.
  - Verification: updated `docs/testing/CAPACITY_SUMMARY.md` with production numbers; decide `MAX_INFLIGHT_*` values.

- [ ] **Test the cleanup Edge Function and cron**
  - Required action: after deploy, create a job, set `auto_delete_at` in the past (or admin "Back to 48 h" on an old job), invoke the function (or wait 30 min), confirm objects gone, `file_objects` DELETED, names cleared, `audit_logs` CLEANUP_RUN. Confirm `/api/jobs/tick` runs every minute (Vercel logs).
  - Relevant files: `supabase/functions/cleanup-expired-jobs/index.ts`, `supabase/cron.sql`, `frontend/app/api/jobs/tick/route.js`.

## P2 — Medium Priority

- [ ] **Search visibility setup** (owner): add the site to Google Search Console and Bing Webmaster Tools, submit `https://mdify-app.vercel.app/sitemap.xml`, validate structured data with Google's Rich Results Test. Re-check keyword data quarterly (`MDify-Blog-Generation-Pipeline/02-SEO-GEO.md`).
- [ ] **Blog posts** using the pipeline (`MDify-Blog-Generation-Pipeline/`), starting with topics in `topics.md` (e.g. `free-ai-plan-markdown`, `scanned-pdf-to-markdown`); run `check.mjs`. Keep the popup design.
- [ ] **Blog URLs for SEO** (optional app change): `/blog/[slug]` pages with `BlogPosting` JSON-LD and sitemap entries while the popup stays the reading UI. Ask the owner first.
- [ ] **Conversion rate limiting** (NOT IMPLEMENTED): per-IP limits on `/api/uploads/create` and `/api/convert` (Vercel has no shared memory; consider a Postgres counter or Vercel firewall rules).
- [ ] **CI**: GitHub Actions running `npm test`, `npm run lint`, `npm run sql:check`, and the three pytest suites (backendO needs Tesseract; install via apt).
- [ ] **Dependency audit**: `npm audit`, `pip-audit` for the backends.
- [ ] **Render hours**: consider "O2 as standby" routing (see `project-docs/unified-content-aware/REVIEW.md`) if 750 h/month runs out.

## P3 — Optional Improvements

- [ ] Picture-area OCR inside documents — only if real documents need it (owner's step 6).
- [ ] Ask the owner about `mdify-main-quickpatch.diff` (root, origin unknown) and `frontend/public/mdify-icon-original.png` (unused old icon); delete only with approval.
- [ ] Rename internal `MarkDify*` component files to `MDify*` (not user-visible; low value, touches many imports).
- [ ] Give backendZ its own venv/requirements install (currently borrows backendN's venv locally).
- [ ] Move the O1/O2 `TESSDATA_PREFIX` in `.claude/launch.json` off the session scratch folder.
- [ ] Legal review of Privacy Policy/Terms by a qualified person (owner).
- [ ] Accessibility audit (axe/Lighthouse) of `/`, `/usecase`, `/mdify-controller`.

## Completed (for reference)

- [x] Build steps 1–4: background jobs, scanned-page PDFs, ZIP v1 (backendZ), admin tree view.
- [x] Wake-on-open, storage budget check, image caps, WebP decision, legal texts, icons, blog pipeline.
- [x] README rewrite + SEO/GEO + keyword research; social card and icon regenerated.
- [x] Mirror into `MDify` (not committed).
- [x] This handover.
