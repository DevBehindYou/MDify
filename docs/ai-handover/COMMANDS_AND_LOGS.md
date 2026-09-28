# Commands and Logs

Paths are relative to `C:\Users\temp\Documents\GitHub\MDify-Pro` unless absolute. Shell: Git Bash (PowerShell for robocopy). Never print secret values.

## Build Commands

```bash
cd frontend && npm install          # once per checkout (node_modules not mirrored)
cd frontend && npm run build        # prebuild regenerates the blog index
cd frontend && npx next lint
```

## Test Commands

```bash
cd frontend && npm test                                        # 112 tests incl. PGlite SQL tests
cd frontend && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test test/seo.test.mjs   # single file
cd backendN && .venv/Scripts/python -m pytest -p no:warnings -q -o addopts=""                 # 81
cd backendO && TESSERACT_CMD="C:/Program Files/Tesseract-OCR/tesseract.exe" .venv/Scripts/python -m pytest -p no:warnings -q -o addopts=""   # 70 (real Tesseract)
cd backendZ && ../backendN/.venv/Scripts/python -m pytest -p no:warnings -q -o addopts=""     # 38 (uses backendN venv)
cd frontend && npm run sql:check                               # MDIFY_SETUP.sql up to date
node --check MDify-Blog-Generation-Pipeline/check.mjs
```

Real Supabase Storage check (uses `frontend/.env.local`; creates and deletes test objects under a fresh `jobs/<uuid>/`; prints timings, bucket settings and whether tables exist):

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/integration/storage_live.mjs 5
```

## Run Locally

Preferred: the Claude desktop preview tool with `.claude/launch.json` names `frontend`, `frontend-prod`, `backendN-N1` (8001), `backendN-N2` (8003), `backendO-O1` (8002), `backendO-O2` (8004), `backendZ-Z1` (8005). Manual equivalents:

```bash
cd frontend && npm run dev                                                   # http://localhost:3000
backendN/.venv/Scripts/python -m uvicorn app.main:app --app-dir backendN --port 8001
backendO/.venv/Scripts/python -m uvicorn app.main:app --app-dir backendO --port 8002 --workers 1
backendN/.venv/Scripts/python -m uvicorn app.main:app --app-dir backendZ --port 8005
curl -s http://127.0.0.1:8005/api/v1/ready
```

Backends read `BACKEND_ROLE`/`BACKEND_INSTANCE`/secret/Supabase vars from their own `.env` (process vars win). O1/O2 need `TESSERACT_CMD` and `TESSDATA_PREFIX` (launch.json points `TESSDATA_PREFIX` at a session scratch folder; fix if missing).

## Generators

```bash
cd frontend && npm run sql:setup      # regenerate supabase/MDIFY_SETUP.sql after editing migrations
cd frontend && npm run brand:images   # regenerate public/og-card.png and public/mdify-icon.png (sharp)
cd frontend && npm run blog:index     # rebuild lib/blogPosts.generated.json
```

## Admin checks

```bash
B=http://localhost:3000/api/admin
curl -s -o /dev/null -w "%{http_code}\n" $B/overview                                  # 401 without session
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/bulk -H content-type:application/json -d {}   # 403 without x-mdify-admin
curl -s $B/session                                                                   # {"configured":true,"authenticated":false,...}
```
A local test session can be signed with `lib/server/adminAuth.js` `issueSession(adminKeys(env))` reading `frontend/.env.local` (write the token to a temp file, never to chat or git).

## Load / capacity (local laptop measurements; see `docs/testing/`)

```bash
backendN/.venv/Scripts/python tests/load/harness.py health
backendN/.venv/Scripts/python tests/load/harness.py matrix --kind ocr --levels 2 4 8 16
backendN/.venv/Scripts/python tests/load/harness.py soak --minutes 20 --concurrency 4
backendN/.venv/Scripts/python tests/load/ocr_cap_bench.py --run-id <id> --new O1 --only webp
```
Env overrides: `MDIFY_FRONTEND`, `MDIFY_N1..MDIFY_O2`, `MDIFY_SECRET`. **Known limitation (found by code inspection, not executed):** `harness.py` line 52 `PORTS = {name: int(url.rsplit(":", 1)[1]) …}` raises `ValueError` for URLs without an explicit port (e.g. `https://n1.vercel.app`), and the harness has no Z pool and only uses `/api/convert`. Adapt it before measuring deployed services.

## Keyword research (owner's Google Ads skill)

The skill zip lives at `C:\Users\temp\Videos\DevBehindYou-Blog-Builder\keyword-research-skill.zip` and **contains live Google Ads API secrets** (`google_ads.env`). It needs `pip install google-ads` (ask the owner first). Used once on 2026-09-28 from a scratch venv; the extracted copy and venv were deleted afterwards.

```bash
python scripts/keyword_ideas.py "pdf to markdown" "word to markdown" --geo 2840,2356,2826 --limit 60 --csv out.csv
```

## Sync MDify-Pro → MDify (no commit)

```powershell
$src = 'C:\Users\temp\Documents\GitHub\MDify-Pro'; $dst = 'C:\Users\temp\Documents\GitHub\MDify'
robocopy $src $dst /MIR /XD .git node_modules .next .venv venv __pycache__ .pytest_cache .vercel "$src\tests\load\.corpus" "$src\tests\load\results" /XF *.pyc /R:1 /W:1 /NFL /NDL /NP /NJH /NJS
```
Exit codes 0–7 are success. `/MIR` deletes files in `MDify` that are not in `MDify-Pro` (except excluded dirs, so `MDify/.git` is safe).

## Git Commands

```bash
git -C C:/Users/temp/Documents/GitHub/MDify-Pro status --short
git -C C:/Users/temp/Documents/GitHub/MDify log --oneline -3
git -C C:/Users/temp/Documents/GitHub/MDify check-ignore -v frontend/.env.local
git -C C:/Users/temp/Documents/GitHub/MDify checkout HEAD -- LICENSE    # restores MIT if the owner wants it (do only on request)
```
Do not commit or push unless the owner asks.

## Deployment Commands (planned, none run)

See `docs/GO_LIVE.md`. Key ones:
```bash
supabase functions deploy cleanup-expired-jobs
# SQL Editor: paste supabase/MDIFY_SETUP.sql, then supabase/cron.sql (replace <project-ref>)
```

## Important Log Findings

### Frontend build (2026-09-28)
```text
 ✓ Compiled successfully
├ ○ /robots.txt   ├ ○ /sitemap.xml   ├ ○ /usecase 6.95 kB   ├ ƒ /mdify-controller 13.6 kB
```

### Test runs (2026-09-28)
```text
# tests 112  # pass 112  # fail 0          (frontend)
81 passed / 70 passed / 38 passed           (backendN / backendO / backendZ)
✔ No ESLint warnings or errors
supabase/MDIFY_SETUP.sql is up to date
```

### Live Storage check (2026-09-27)
```text
rounds passed: 5/5
sign upload URL median 311 ms · browser PUT 322 ms · backend GET 972 ms · backend POST 316 ms
sign download URL 216 ms · browser GET 761 ms · list folder 202 ms · delete 608 ms
bucket: public=false file_size_limit=none
tables: {"jobs":"missing (404)","work_items":"missing (404)","content_nodes":"missing (404)"}
```
Interpretation: Storage works; SQL not applied (no tables, no bucket size limit). Latencies are from the owner's laptop, not from Vercel.

### Frontend dev log with missing tables
```text
[admin overview] Supabase POST /rest/v1/rpc/get_admin_kpis failed: Could not find the function public.get_admin_kpis without parameters in the schema cache
```

### Local backend readiness (2026-09-27)
```text
N1 normal ready=true secret=true storage=true
O1 ocr ready=true secret=true storage=true      (tesseract 5.4.0.20240606, lang=eng, osd)
Z1 archive ready=true secret=true storage=true  (markitdown 0.1.8, archive limits 2000 files / 100 MB)
```

### Security probe of admin API (2026-09-27)
```text
GET /api/admin/overview -> 401 · POST /api/admin/bulk (no header) -> 403 · POST /api/admin/session (Origin evil) -> 403
Cache-Control: no-store · X-Robots-Tag: noindex, nofollow
Client bundle scan: 0 secret values (only variable names, later removed from UI text)
```

### Load test source data
`tests/load/results/run-20260926/`, `run-20260926-part2/` (gitignored, local only), `tests/load/soak.log`, `chain.log`, `chain2.log`. Summaries in `docs/testing/LOAD_TEST_REPORT.md` and `CAPACITY_SUMMARY.md`.
