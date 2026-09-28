# Instructions for the Next AI Agent

You are continuing an existing, largely built project: **MDify**, a free PDF/document/image/ZIP → Markdown converter by DevBehindYou.

**Do NOT restart the project from scratch. Do NOT redesign the UI. Do NOT move off Supabase.**

Before making changes, read:

1. `HANDOVER.md`
2. `CURRENT_STATE.md`
3. `ERRORS_AND_FIXES.md`
4. `PENDING_TASKS.md`
5. `DECISIONS.md`
6. `PROJECT_CONTEXT.md` (user constraints, verbatim)

Work in `C:\Users\temp\Documents\GitHub\MDify-Pro` (source of truth). `C:\Users\temp\Documents\GitHub\MDify` is a mirror the owner commits from; re-sync it with the robocopy command in `COMMANDS_AND_LOGS.md` after changes the owner wants there.

## First Objective

Find out from the owner whether `supabase/MDIFY_SETUP.sql` has been applied and whether they chose MIT or GPL-3.0. Then run the real-database end-to-end check (P1 in `PENDING_TASKS.md`).

## Inspect These Files First

1. `docs/GO_LIVE.md`
2. `frontend/lib/server/jobService.js` and `frontend/lib/server/jobQueue.js`
3. `supabase/migrations/20260926000000_mdify_init.sql`, `…_mdify_work_queue.sql`, `…_mdify_admin.sql`
4. `frontend/lib/server/adminService.js`, `adminRoute.js`, `adminAuth.js`
5. `backendN/app/pdf_tasks.py`, `backendZ/app/archive_tasks.py`
6. `frontend/lib/siteContent.js`, `frontend/lib/legal/policies.js`
7. `.claude/launch.json`

## Run These Commands First

```bash
cd C:/Users/temp/Documents/GitHub/MDify-Pro
git status --short | head
cd frontend && npm test && npx next lint
cd ../backendN && .venv/Scripts/python -m pytest -q -o addopts=""
cd ../backendO && TESSERACT_CMD="C:/Program Files/Tesseract-OCR/tesseract.exe" .venv/Scripts/python -m pytest -q -o addopts=""
cd ../backendZ && ../backendN/.venv/Scripts/python -m pytest -q -o addopts=""
cd .. && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/integration/storage_live.mjs 3
```

## Verify

- Tests: frontend 112, backendN 81, backendO 70, backendZ 38 — all passing.
- `storage_live.mjs`: rounds pass; check the `tables:` line (present = schema applied) and `file_size_limit` (15728640 = applied).

## Then Continue With

1. Real-database end-to-end conversions (DOCX, PNG, scanned PDF, ZIP with an image) through the local UI, plus the admin panel with real data (P1).
2. Help the owner deploy per `docs/GO_LIVE.md`; verify each `/api/v1/ready`.
3. Add a remote mode to `tests/load/harness.py` and measure the deployed services (step 5); update `docs/testing/CAPACITY_SUMMARY.md`.
4. Test the cleanup Edge Function and cron after deployment.
5. Update this handover (`CURRENT_STATE.md`, `PENDING_TASKS.md`, `SESSION_HISTORY.md`) at the end of your session.

## Do Not Repeat

- Using Supabase MCP/connector tools (they see only the forbidden `TheHopeTarot-database`).
- Generating code with backslashes/backticks through bash heredoc + Python (use Edit/Write).
- Reproducing pytest env issues with `python -c` (magika `.env` loading differs).
- Timestamp-only pagination cursors.
- `find`/`grep -r`/`du` over `node_modules` (hangs).
- Treating robocopy exit codes 1–7 as failures.
- Judging `og:image` from `next dev` output (check a production build).

## Important Constraints

- Name: **MDify**. Owner: DevBehindYou, devbehindyou@gmail.com.
- Only images go to O1/O2; PDFs to N (scan pages to O only as rendered PNG).
- Never print, log or commit secrets; never `NEXT_PUBLIC_` for secrets; don't log document content, signed URLs or admin keys. No document text in DB rows.
- Don't commit or push; the owner commits.
- Ask before downloads/installs (e.g. `pip install`, `npm install <new pkg>`).
- Public copy (README, pages, metadata, llms.txt, blog, social card): no engine/host names (MarkItDown, Tesseract, Supabase, Render, Vercel as vendor). Only Terms §10 / Privacy §6 credit the engines. Keep "Cut PDF token costs by 70%" with its sourced method (`lib/siteContent.js`). `frontend/test/seo.test.mjs` must stay green.
- Legal texts: operator + email only; no address/EU rep/region/governing law; any material change bumps `LEGAL_VERSION` (forces re-consent). Writing style: no em dashes, no semicolons, banned words (see `test/legalStyle.test.mjs`).
- Keep the Blog popup design. Keep light/dark themes and 375 px layouts working.
- `app/common/*.py` must stay byte-identical across backendN, backendO, backendZ (edit one, copy to all; `tests/test_common.py`).
- After editing migrations run `npm run sql:setup` (and `sql:check` in tests).
- If the owner says "Stop the process for now", stop all servers and background tasks immediately.
- Report with status labels: VERIFIED / PARTIALLY VERIFIED / IMPLEMENTED BUT UNTESTED / BROKEN / NOT IMPLEMENTED / UNKNOWN.

## Definition of Done (next phase: go-live)

- [ ] Schema applied; `storage_live.mjs` shows tables present and 15 MB bucket limit.
- [ ] License decided and consistent across LICENSE, Terms, README, JSON-LD, footer, llms.txt.
- [ ] Local end-to-end on the real DB passes for DOCX, PNG, scanned PDF, ZIP-with-image; admin shows tree; delete-now removes the whole job folder.
- [ ] All services deployed and ready; frontend on https://mdify-app.vercel.app uses the Storage path.
- [ ] Cleanup and tick schedules observed working in production.
- [ ] Production capacity measured and documented.
- [ ] All automated suites still green; handover docs updated.
