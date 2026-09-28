# Testing Status (2026-09-28)

Terminology: **inspected** (code read only) · **implemented** · **compiled/built** · **tested** (automated tests pass) · **verified in runtime** (ran locally and observed) · **verified in production** (nothing yet).

## Build Testing

- `frontend`: `npm run build` succeeds (compiled). `next lint`: 0 warnings/errors.
- backendO Docker image: **never built**.
- Vercel Python builds for N/Z: **never run** (bundle size of MarkItDown extras unmeasured on Vercel; ~260 MB installed locally vs 500 MB Vercel limit).

## Unit Testing

| Suite | Command | Result |
|---|---|---|
| frontend (node --test) | `npm test` | **112/112** |
| backendN (pytest) | `.venv/Scripts/python -m pytest` | **81/81** |
| backendO (pytest, real Tesseract) | `TESSERACT_CMD=… .venv/Scripts/python -m pytest` | **70/70** |
| backendZ (pytest, backendN venv) | `../backendN/.venv/Scripts/python -m pytest` | **38/38** |

Frontend suites: admin (15), blog, consent, contentTree (4), dispatcher, legalStyle, models, queueModel, seo (5), storageFlow (15), wake (7), sql/admin (6), sql/setupSql (2), sql/workQueue (10).

## Integration Testing

- Storage/queue flows (document, image, 4xx, retry, double start, budget, scanned PDF, ZIP, browser transport): **tested** against real migrations on PGlite with fake backends (`storageFlow.test.mjs`).
- Real Supabase Storage REST: **verified in runtime** (`tests/integration/storage_live.mjs`, 5/5 rounds, 2026-09-27).
- Real Supabase Postgres: **NOT TESTED** (tables not applied).
- Frontend → Z1 multipart conversion of a real ZIP: **verified in runtime** (2026-09-27).
- Frontend → N1/O1 multipart conversions: **verified in runtime** during load tests (2026-09-26).

## UI Testing

Manual in the Claude built-in browser:
- Converter home (desktop 1280 px, dark): hero copy, layout unchanged (2026-09-28).
- `/usecase` at 375 px: no horizontal page scroll, 7 FAQ answers present in DOM, token table scrolls in its box, FAQ toggles (2026-09-28).
- `/mdify-controller`: login form (desktop, 375 px, light, dark), wrong keys error, signed-in tabs with no data, Processes tab showing N1/O1/Z1 ready (2026-09-27).
- Icons/favicon in both themes, consent banner, legal modal/pages, blog popup: verified in earlier sessions.
No automated UI/E2E tests (no Playwright/Cypress).

## Device Testing

Only emulated viewports (375×812 "mobile" preset) in the built-in browser. No real phones.

## API Testing

- Admin API guards via curl (401 without session, 403 without header / foreign Origin, `no-store`, `noindex`).
- Admin authenticated call (`/api/admin/processes`) with a locally signed session: **verified in runtime**.
- `/robots.txt`, `/sitemap.xml`, `/llms.txt`, JSON-LD on `/` and `/usecase`: fetched and parsed (2026-09-28).

## Database Testing

All migrations, RPC behaviour, permissions (`has_function_privilege` for anon/authenticated/service_role), idempotent re-run of `MDIFY_SETUP.sql`: **tested on PGlite**. `supabase/tests/verify_permissions.sql`: written, run only as part of PGlite equivalents. Real Supabase: not applied.

## Security Testing

- Admin auth unit tests (constant-time compare, forged/expired/rotated tokens, cookie flags, throttle).
- Client bundle scanned for secret values: 0 found (2026-09-27).
- ZIP hostile inputs (traversal, symlink, encrypted, bomb, duplicates, credentials) tested.
- Backend path allow-list and cross-job path refusal tested.
- `harness.py security` (CORS/traversal probes) ran in session 2 (see `docs/testing/BACKEND_INTEGRATION_REPORT.md`).
- No penetration test, no dependency audit (`npm audit`/`pip-audit` not run).

## Performance Testing

Local laptop only (i3-1005G1). Documents ~34 jobs/min comfortable, 56/min at c=16 (1.9% timeouts); images 90/min at c=16; 20-min mixed soak 1,022 jobs, 0 errors; memory: N ≤ 337 MB, O ≤ 243 MB, frontend ≤ 150 MB. Production capacity **NOT TESTED**. Reports: `docs/testing/`.

## Deployment Testing

None. Nothing of the new architecture is deployed.

## CI/CD Testing

None. No workflows exist.

## Compatibility Testing

Only Chromium-based built-in browser. Other browsers UNKNOWN.

## Tests Passing

All listed suites (301 automated tests in total).

## Tests Failing

None.

## Tests Not Yet Run

- Real-database end-to-end flows (all task types) and admin with real data.
- Cleanup Edge Function (Deno) and cron schedules.
- Deployed-service load/capacity (`harness.py` needs a remote mode, see `COMMANDS_AND_LOGS.md`).
- Docker build for backendO; Vercel builds for N/Z (bundle size).
- Render wake-up timing on real Render Free.

## Manual Verification Performed

See UI, API and integration sections above. Search Console / rich-results validation: not done.

## Known Testing Gaps

Real Supabase DB, deployments, Edge Function, real devices/browsers, rate limiting (not implemented), accessibility audit, legal review, OCR accuracy on non-English text (English only by design).
