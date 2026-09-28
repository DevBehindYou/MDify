# Current Project State (2026-09-28)

## Build Status

`frontend`: `npm run build` → "✓ Compiled successfully" (2026-09-28). Routes include `/`, `/usecase`, `/privacy`, `/terms`, `/mdify-controller` (dynamic), `/robots.txt`, `/sitemap.xml`, all `/api/*`. **VERIFIED.**
Backends: no build step (Python). backendO has a `Dockerfile` for Render; **the Docker image has never been built.**

## Runtime Status

- Local dev: `frontend` (port 3000), N1 (8001), N2 (8003), O1 (8002), O2 (8004), Z1 (8005) start from `.claude/launch.json`. N1, O1, Z1 reported `ready=true secret=true storage=true` on 2026-09-27. **VERIFIED locally.**
- Production: the new architecture is **NOT DEPLOYED**. https://mdify-app.vercel.app serves an older single-app version (exact commit UNKNOWN).

## Feature Status

| Feature | Status | Notes |
|---|---|---|
| Frontend UI (MVVM), light/dark, 375 px | VERIFIED | build, tests, browser checks |
| Consent banner (Terms + Privacy) | VERIFIED | hidden on `/mdify-controller`; `LEGAL_VERSION` 2026-09-28 forces re-accept |
| Legal pages `/privacy`, `/terms` | VERIFIED | EU texts; engine credit in Terms §10, Privacy §6 |
| Multipart conversion `/api/convert` → backend | VERIFIED locally | used when Supabase is not configured; 4.5 MB Vercel body limit applies in production |
| Dispatcher (hash routing, 1 peer retry) | VERIFIED | unit tests + live local failover |
| Wake all backends on page open | VERIFIED locally | Render wake-up itself NOT TESTED |
| Storage direct upload (signed URL) | VERIFIED against real Supabase Storage | `tests/integration/storage_live.mjs` 5/5 |
| Durable work queue (jobs, work_items, content_nodes) | VERIFIED on PGlite with fake backends | real Supabase: NOT APPLIED |
| Storage budget check (800 MiB) | VERIFIED (tests) | |
| Scanned-page PDFs (N analyse/merge, O page OCR) | VERIFIED locally (real PDFs, tests) | not run end-to-end on real Supabase |
| ZIP archives (backendZ) | VERIFIED locally | 38 tests + live multipart run through frontend; Storage split mode tested with fake Storage only |
| Admin `/mdify-controller` | PARTIALLY VERIFIED | auth, guards, actions, SQL tested; UI viewed signed in with no data (tables missing) |
| Retention cleanup Edge Function | IMPLEMENTED BUT UNTESTED | SQL parts verified on PGlite; function not deployed |
| Cron tick `/api/jobs/tick` | IMPLEMENTED BUT UNTESTED in production | route tested locally via tests; cron not scheduled |
| SEO/GEO (metadata, JSON-LD, robots, sitemap, llms.txt) | VERIFIED locally | production HTML has correct canonical/og:image |
| Blog popup + pipeline | VERIFIED | 0 posts currently (4 old posts removed); `frontend/content/blog/README.md` only |
| Conversion rate limiting | NOT IMPLEMENTED | admin login is throttled only |
| CI/CD | NOT IMPLEMENTED | no `.github/workflows` |
| Picture-area OCR inside documents | NOT IMPLEMENTED | owner: only if real documents need it |

## Working Components

frontend UI and API routes; backendN, backendO, backendZ services and tests; SQL migrations on PGlite; Storage REST calls on the real project; admin server logic; SEO files.

## Partially Working Components

- Admin UI: works, but real data untested.
- Storage/queue path: all pieces work separately; the real database lacks the tables, so the full path fails in an environment that has the Supabase keys set (e.g. local `frontend/.env.local`). With keys unset, the app falls back to multipart and works.

## Broken Components

None known in code. **Operational break:** with Supabase keys configured and tables missing, `/api/uploads/create` fails (PostgREST 404 on `jobs`). Fix = apply `supabase/MDIFY_SETUP.sql`.

## Disabled Components

- `/api/jobs/tick` returns 501 locally because `CRON_SECRET` is not set in `frontend/.env.local` (by design).
- `/mdify-controller` shows "not configured" when `ADMIN_KEY_1/2` or Supabase config is missing.

## Temporary Workarounds

- backendZ has no own venv; it runs and tests with `backendN/.venv` (same dependencies).
- O1/O2 local runs use `TESSDATA_PREFIX` pointing at a **session scratch folder** (`C:/Users/temp/AppData/Local/Temp/claude/…/scratchpad/tessdata_fast`). A new session's scratch path may differ; update `.claude/launch.json` or install the `eng`/`osd` fast models elsewhere.

## Current Branch / Commit / Uncommitted Changes

| Repo folder | Remote | Branch | HEAD | Working tree |
|---|---|---|---|---|
| `C:\Users\temp\Documents\GitHub\MDify-Pro` | `https://github.com/DevBehindYou/MDify-Pro.git` | `main` | `ead5285 Publish-WebApp-MDify-Pro` | ~55 changed paths: old root app deleted, `frontend/`, `backend*/`, `docs/`, `supabase/`, `tests/`, `MDify-Blog-Generation-Pipeline/`, `project-docs/`, `render.yaml`, `.claude/` untracked; `README.md`, `.gitignore` modified |
| `C:\Users\temp\Documents\GitHub\MDify` | `https://github.com/DevBehindYou/MDify.git` | `main` | `354b78c New-UI/UX` | mirror of MDify-Pro (except `.git`, `node_modules`, `.next`, `.venv`, caches, load-test data): ~46 changed paths; **LICENSE changed MIT → GPL-3.0** |

Nothing was committed or pushed by the agent. The owner commits `MDify` themselves. After this handover the docs were mirrored into `MDify` again (see `COMMANDS_AND_LOGS.md`).

Unexplained files copied as-is: `mdify-main-quickpatch.diff` (root, origin UNKNOWN) and `frontend/public/mdify-icon-original.png` (old dot icon, unused).

## Environment

| Item | Value |
|---|---|
| OS | Windows 11 Home Single Language 10.0.26100 (local dev laptop: i3-1005G1, 2 cores / 4 threads, 7.7 GB RAM) |
| Shells | Git Bash + PowerShell 5.1 |
| Node / npm | v22.16.0 / 11.14.1 |
| Python | 3.14.6 (`backendN/.venv`, `backendO/.venv`) |
| Next.js / React | ^14.2.35 / ^18 |
| MarkItDown / FastAPI | 0.1.8 / 0.141.1 |
| Tesseract | v5.4.0.20240606 at `C:/Program Files/Tesseract-OCR/tesseract.exe` (set `TESSERACT_CMD`) |
| Docker | UNKNOWN / NOT VERIFIED (never used) |
| Database | Supabase Postgres (version UNKNOWN); tests use PGlite 0.5.8 |
| Browser used for checks | Claude desktop built-in browser pane |
| CI environment | none |

## Environment Variables (names only; values NOT INCLUDED FOR SECURITY)

| Where | Variables | Local file status |
|---|---|---|
| frontend | `NORMAL_BACKEND_URLS`, `OCR_BACKEND_URLS`, `ARCHIVE_BACKEND_URLS`, `BACKEND_SHARED_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `CRON_SECRET`, `ADMIN_KEY_1`, `ADMIN_KEY_2`, optional `MAX_INFLIGHT_NORMAL/OCR/ARCHIVE`, `STORAGE_BUDGET_BYTES` | `frontend/.env.local` has all except `CRON_SECRET`; admin keys there are **local-only test keys** generated by the agent |
| backendN / backendO / backendZ | `BACKEND_ROLE`, `BACKEND_INSTANCE`, `INTERNAL_SHARED_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, optional `MAX_UPLOAD_BYTES`, `APP_VERSION`; O adds `OCR_*`; Z adds `MAX_ARCHIVE_*` etc.; N adds `PDF_MAX_OCR_PAGES` | `backendN/.env`, `backendO/.env`, `backendZ/.env` exist (gitignored); all three share the frontend's secret |
| Supabase Vault (to create) | `mdify_service_role_key`, `mdify_cron_secret` | not created |

All `.env*` files are gitignored in both repos (verified with `git check-ignore`). `.claude/launch.json` no longer contains secrets.

## Current Deployment State

- Supabase project `ppmbqgecdbrezxedyeur`: bucket `mdify-pro-files` exists (private, **no size limit yet**); **no tables**; no Vault secrets; no cron; Edge Function not deployed.
- Vercel: frontend project exists for the old app (URL above). N1/N2/Z1/Z2 projects: NOT CREATED (UNKNOWN whether the owner created any).
- Render: `render.yaml` defines `mdify-ocr-o1`, `mdify-ocr-o2` (plan free). NOT APPLIED.

## Current CI/CD State

None. No workflows, no automated deploys verified.

## Current Test State

frontend 112/112 (`npm test`, includes PGlite SQL tests), backendN 81/81, backendO 70/70 (real Tesseract), backendZ 38/38, lint clean, `sql:check` up to date. Details: `TESTING_STATUS.md`.

## Security Considerations

- Secrets live only in gitignored `.env` / `.env.local` files and (planned) provider dashboards + Supabase Vault. Names are listed above; **values are not stored in these docs.**
- The service role key bypasses RLS; it is used only server-side (Next.js route handlers, backends, Edge Function). A client bundle scan found no secret values (2026-09-27).
- `frontend/.env.local` admin keys are local test keys generated by the agent; production needs new keys (`openssl rand -hex 32`, two different values).
- The owner's `keyword-research-skill.zip` (in `C:\Users\temp\Videos\DevBehindYou-Blog-Builder\`) contains live Google Ads API credentials in plaintext. Never copy it into the repo. The agent's extracted copy was deleted.
- Backends fail closed without `INTERNAL_SHARED_SECRET`; object paths are allow-listed per job; cross-job paths refused.
- Admin: two keys, signed expiring session, SameSite=Strict + custom header + Origin check, throttled login, audit log, `noindex`.
- Not done: rate limiting for conversions, dependency audits, penetration test.

## Assumptions

### Confirmed
- Site URL is https://mdify-app.vercel.app (owner).
- O1/O2 run on Render Free (owner).
- Supabase project `ppmbqgecdbrezxedyeur` is MDify's and may be used through env keys (owner answer "Only the connector account" is forbidden).
- Bucket `mdify-pro-files` exists and is private (live check).

### Unconfirmed
- Which commit the live site currently serves.
- Whether the owner already created Vercel projects for N/Z or Render services for O.
- Whether the owner wants GPL-3.0 or MIT for the `MDify` repository.
- Origin and purpose of `mdify-main-quickpatch.diff`.

### Needs Verification
- Vercel Python bundle size for N/Z (MarkItDown extras) under the 500 MB limit.
- OCR speed and Render wake-up time on Render Free (0.1 CPU).
- ChatGPT's own PDF handling: the 70% example uses Claude's documented PDF processing (text + page image). Apps that read only extracted text save less; the copy says so.
- OpenAI Help Center rule (100 tokens ≈ 75 words) was confirmed through a search snippet; the page itself returned HTTP 403 to fetches.

## Unresolved Conflicts

- **License:** `MDify` repo history = MIT; this project's `LICENSE`, Terms §10, README, JSON-LD = GPL-3.0. Owner decision pending.
- **Older docs:** `project-docs/ARCHITECTURE.md` and parts of `project-docs/NEXT_AGENT_INSTRUCTIONS.md` still describe Cloudflare R2/D1. Superseded by the Supabase decision and by this handover (priority: latest user instruction > latest verified state > code > docs).
