# Errors and Fixes

## Error 1 — Tests reached the real Supabase project (magika loads `.env`)

### Error Message
```text
AssertionError: assert 409 == 503
DBG https://ppmbqgecdbrezxedyeur.supabase.co/storage/v1 True mdify-pro-files
```
### Where It Occurred
`backendZ/tests/test_archive_tasks.py::test_without_storage_the_endpoints_are_unavailable` (expected 503 "Storage is not configured", got 409 "Input object not found").
### Root Cause
`magika` (MarkItDown dependency) runs `dotenv.load_dotenv(dotenv.find_dotenv())` in `magika/__init__.py`. Under pytest (`__main__` has `__file__`), `find_dotenv` walks up from the library file inside `backendN/.venv` and finds `backendN/.env`, loading the real `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`. `StorageClient.from_env()` then pointed at the real project. With `python -c`, `find_dotenv` uses the cwd instead, which hid the bug.
### Investigation
Printed env inside pytest; only tests that instantiate the converter (import MarkItDown → magika) saw the vars.
### Final Fix
Every `tests/conftest.py` (N, O, Z) sets `os.environ["SUPABASE_URL"] = ""` and `os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""` before any import (load_dotenv never overrides set vars). Each `app/main.py` now loads its own `.env` explicitly via `load_local_env`.
### Verification
All suites pass; no network access to Supabase in tests. Impact of the bug: one harmless GET of a non-existent object.
### Status
RESOLVED
### Notes for Next Agent
Keep that block at the top of every conftest. Any process using the backendN venv (including backendZ) will get backendN's `.env` via magika unless its own vars are set first.

## Error 2 — Local backends would reject the frontend (secret mismatch)

### Error Message
None visible yet (would be HTTP 401 "Unauthorized" from backends).
### Root Cause
`.claude/launch.json` passed an agent-generated `INTERNAL_SHARED_SECRET` per backend; the owner's `.env` files and `frontend/.env.local` share a different secret. Process env wins over `.env`.
### Final Fix
Removed `INTERNAL_SHARED_SECRET` from every launch.json entry; backends read their `.env` through `load_local_env`.
### Verification
N1/O1/Z1 `/ready` show `secret_configured: true`; frontend → Z1 multipart conversion succeeded.
### Status
RESOLVED

## Error 3 — Uploads fail while Supabase keys are set but tables are missing

### Error Message
```text
Supabase POST /rest/v1/rpc/get_admin_kpis failed: Could not find the function public.get_admin_kpis without parameters in the schema cache
tables: {"jobs":"missing (404)","work_items":"missing (404)","content_nodes":"missing (404)"}
```
### Root Cause
Migrations not applied to project `ppmbqgecdbrezxedyeur` (the owner pastes SQL; the service key cannot run DDL).
### Fix Attempted
Admin routes now return 503 "The database is not set up yet: run supabase/MDIFY_SETUP.sql in the Supabase SQL Editor." for PostgREST 404s.
### Final Fix
Owner runs `supabase/MDIFY_SETUP.sql`.
### Status
UNRESOLVED (owner action)

## Error 4 — backendZ tests: `bin/tool.exe` skipped for the wrong reason

### Error Message
```text
assert result["bin/tool.exe"].skip_reason == "binary file"
# actual: 'dependency or build folder (smart project mode)'
```
### Root Cause
Test mistake: `bin` is in `SKIP_DIRS` on purpose.
### Final Fix
Test path changed to `tools/tool.exe`.
### Status
RESOLVED

## Error 5 — Encrypted ZIP entry not detected in test

### Error Message
```text
assert entries["secret.txt"].skip_reason == "encrypted"   # actual: None
```
### Root Cause
`zipfile.ZipFile.writestr` resets `ZipInfo.flag_bits` in `_open_to_write`, so setting bit 0x1 never reaches the archive. The code under test was correct; the test never created an encrypted entry.
### Final Fix
`backendZ/tests/zips.py::mark_encrypted(data, name)` patches the flag byte in the local header (offset 6) and central directory (offset 8).
### Status
RESOLVED

## Error 6 — Heredoc + Python escapes corrupted source files (recurring)

### Error Message
```text
SyntaxError: Invalid or unexpected token   (frontend/lib/models/sessionRepository.js:157)
<stdin>:8: SyntaxWarning: "\`" is an invalid escape sequence.
```
### Where It Occurred
Earlier: `backendN/tests/fixtures.py`, `tests/load/pdf_xlsx_bench.py`, `backendO/app/converter.py`, `frontend/lib/blog.js` (literal newlines/BOM). 2026-09-28: `sessionRepository.js` (splice cut inside the old template; `\n` became a real newline).
### Root Cause
Bash heredoc → Python string → file: backslash escapes are processed twice; index-based splicing found a `}` inside template content.
### Final Fix
Rewrote with the Read/Edit/Write tools.
### Status
RESOLVED
### Notes for Next Agent
**Do not generate code containing backslashes, backticks or template literals through bash heredoc + Python.** Use the Edit/Write tools. The same heredoc approach also broke once on an apostrophe (`jobs'`) inside an unquoted-looking heredoc body evaluated by the tool's shell wrapper.

## Error 7 — PostgREST `setof jsonb` shape unclear

### Root Cause
PGlite adapter returned rows as `{admin_list_jobs: …}`; PostgREST's shape for `setof <scalar>` differs. Risk of prod/test mismatch.
### Final Fix
`admin_list_jobs/files/audit` return one `jsonb` array (`coalesce(jsonb_agg(...), '[]')`).
### Status
RESOLVED

## Error 8 — File/audit pagination lost rows with equal timestamps

### Error Message
```text
not ok 14 - file and audit lists page newest first   (expected: true, actual: false)
```
### Root Cause
Cursor used `created_at < before` only; files inserted in one statement share `created_at`, so ties were skipped.
### Final Fix
Keyset SQL functions with `(created_at, id)` cursors (`admin_list_files`, `admin_list_audit`); service passes `before` + `before_id`.
### Status
RESOLVED

## Error 9 — PGlite returned a row of nulls for "no row"

### Root Cause
A function returning a composite type with no result yields a row whose fields are all null.
### Final Fix
Adapter (`test/sql/pgliteSupabase.mjs`) maps an all-null composite row to `null`; test asserts `work_item_id === null` for a second `enqueue_root`.
### Status
RESOLVED

## Error 10 — Apostrophe inside single-quoted JS string

### Error Message
```text
./lib/legal/policies.js  103:108  Error: Parsing error: Unexpected token, expected ","
```
### Final Fix
Escaped `MDify\'s`.
### Status
RESOLVED

## Error 11 — Node could not import `app/robots.js`

### Error Message
```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\frontend\lib\siteContent' imported from …\frontend\app\robots.js
```
### Root Cause
Extensionless import works in Next but not in plain Node ESM (tests).
### Final Fix
`import … from '../lib/siteContent.js'` (and `policies.js`) in `robots.js`, `sitemap.js`.
### Status
RESOLVED

## Error 12 — Guard test false positive and a real hit

### Error Message
```text
components/MarkdownSkeleton.js mentions Render            (false positive: "Renders", "Rendered")
components/converter/MobileWorkspace.js mentions /markitdown/i   (real: eyebrow "FREE · NO SIGN-UP · MARKITDOWN")
```
### Final Fix
Pattern narrowed to `/Render Free|render\.com|onrender/i`; eyebrow changed to "FREE · NO SIGN-UP · 70% FEWER AI TOKENS".
### Status
RESOLVED

## Error 13 — Favicon duplicated on reload

### Root Cause
React tracks hoisted `<link rel="icon">` by `href`; changing `href` for the theme made React insert a second link.
### Final Fix
Two static icon links (dark/light SVG); theme code switches their `media` between `all` and `not all`.
### Status
RESOLVED

## Error 14 — Wake throttle treated "never woken" as "just woken"

### Root Cause
Missing sessionStorage timestamp read as 0; with an injected clock of 0 it looked recent.
### Final Fix
`lastWakeAt` returns `null` when absent.
### Status
RESOLVED

## Error 15 — Shell commands hung on `node_modules`

### Error Message
```text
Command did not complete within its 120s timeout and was moved to the background
```
### Root Cause
`find`/`grep -r`/`du` over `frontend/node_modules`.
### Final Fix
Stop the task; use the Grep tool with globs excluding `node_modules`, or exclude paths explicitly.
### Status
RESOLVED (process lesson)

## Error 16 — robocopy exit code shown as failure

### Error Message
```text
Exit code 3 … robocopy exit code: 3        /  Exit code 1 … robocopy exit code: 1
```
### Root Cause
robocopy exit codes 0–7 are success (1 = files copied, 2 = extras, 3 = copied + extras removed). The tool reports any non-zero as an error.
### Status
NOT AN ERROR. Verified by comparing file lists.

## Error 17 — `og:image` showed localhost in dev

### Root Cause
Dev-server behaviour. Production build HTML contains `https://mdify-app.vercel.app/og-card.png`.
### Status
NOT AN ERROR (verified in `.next/server/app/index.html` after `npm run build`).

## Error 18 — OpenAI pages return 403 to WebFetch

### Error Message
```text
The server returned HTTP 403 Forbidden.
```
### Where It Occurred
`help.openai.com/en/articles/4936856-…`, `openai.com/index/scaling-ai-for-everyone/`.
### Workaround
Token rule of thumb confirmed through WebSearch result text (OpenAI Help Center); user numbers confirmed through TechCrunch (2026-02-27).
### Status
PARTIAL (the OpenAI help page itself was not fetched).

## Earlier errors (sessions 1–3, from the compacted history)

| Error | Root cause | Fix | Status |
|---|---|---|---|
| OCR rotation recall 0.0 | OSD never used | Confidence-gated OSD | RESOLVED |
| PDFs parsed twice | MarkItDown path + extra parse | Opt-in `PDF_FAST_SAMPLE_PAGES` | RESOLVED |
| O1 `/ready` 51 ms | Tesseract probe each call | Cache 300 s | RESOLVED |
| WebP 25 MP → 442 MB | WebP decode cost | Cap WebP at 12 MP (243 MB) | RESOLVED |
| Legal style check missed banned words | Regex bug | Proper `legalStyle.test.mjs` | RESOLVED |
| `pglast.parse_plpgsql` JSON decode bug | Library bug | Used `parse_plpgsql_json` + negative control | RESOLVED |
| Load results invalid | Owner stopped servers mid-chain | File marked INVALID; rerun later | RESOLVED |
| PDF comparison mismatch | Different normalisation | Normalise before comparing | RESOLVED |
| `node --test` glob | Glob not expanded | Quoted glob in npm script | RESOLVED |
| Supabase keys ignored | Env lines were commented out | Uncommented (values never printed) | RESOLVED |

## Failed Approaches (do not repeat)

### Using the Supabase MCP/connector tools
Attempted: listing/querying projects with the connector. Why it failed: that account only sees `TheHopeTarot-database`, an unrelated project the owner forbade touching. **Do NOT use it under any circumstances.** Use env keys for the MDify project; the owner pastes SQL.

### Generating code through bash heredoc + Python
See Error 6. Use Edit/Write.

### Relying on `python -c` to reproduce pytest env behaviour
It hid the magika `.env` leak because `find_dotenv` uses cwd in interactive/`-c` mode. Reproduce inside pytest.

### Cursor pagination on timestamp alone
Loses ties. Always `(created_at, id)`.

### Running `next build` while a load test uses `next start`
It overwrites `.next` and skews measurements. Build only when no server depends on `.next`. Note: `next dev` also rewrites `.next`, so a production build must be re-run before inspecting `.next/server/app/*.html`.
