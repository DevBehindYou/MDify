# Technical Decisions

Status: ACTIVE (in force), TEMPORARY, REVISIT (needs a decision or re-check).

## Decision 1 — MVVM frontend
- **Decision:** Model (`lib/models`), ViewModel (`viewmodels/` hooks), View (`app/`, `components/`).
- **Reason:** owner asked for MVVM "to increase the optimization and performance"; separates transport/state from UI.
- **Alternatives:** keep the monolithic page; Redux/Zustand. **Rejected:** no extra dependency needed with `useSyncExternalStore`.
- **Status:** ACTIVE

## Decision 2 — Separate folders and Python FastAPI backends
- **Decision:** `frontend/`, `backendN/` (N1/N2), `backendO/` (O1/O2), later `backendZ/` (Z1/Z2); FastAPI.
- **Reason:** owner request (2 normal + 2 OCR backends in separate folders); MarkItDown and Tesseract are Python-native.
- **Consequence:** `app/common` must stay byte-identical (test-enforced).
- **Status:** ACTIVE

## Decision 3 — Supabase instead of Cloudflare R2/D1
- **Decision:** Supabase Storage (S3-compatible) + Postgres, REST without SDK.
- **Reason:** owner's "change of plan".
- **Constraint:** never go back to Cloudflare; never use the Supabase connector account (`TheHopeTarot-database`).
- **Status:** ACTIVE

## Decision 4 — Only images go to OCR
- **Decision:** routing by extension; PDFs → N; scanned PDF pages reach O only as PNG images rendered by N.
- **Reason:** owner instruction.
- **Status:** ACTIVE

## Decision 5 — Durable queue in Postgres, driven by browser + cron
- **Decision:** `work_items` with leases/retries; browser polls `/advance`; Supabase Cron hits `/api/jobs/tick` every minute. No always-on worker.
- **Reason:** free tiers have no background workers; Vercel functions max 300 s; jobs must survive closed tabs.
- **Alternatives:** long HTTP requests (fail on big jobs), queue service (cost), Edge Functions as worker (time limits).
- **Status:** ACTIVE

## Decision 6 — PGlite for SQL tests
- **Decision:** `@electric-sql/pglite` (dev dependency, owner approved install) runs the real migrations in `node --test`, with a Supabase shim and a PostgREST-like adapter.
- **Reason:** real Postgres semantics without Docker; owner pastes SQL so the real DB can't be used for tests.
- **Status:** ACTIVE

## Decision 7 — Render Free for O1/O2, timeouts sized for wake-up
- **Decision:** Render Free (512 MB, 0.1 CPU, sleeps after 15 min, ~1 min wake). Dispatcher attempt 150 s (OCR) / 120 s (normal); routes 300 s; `OCR_TIMEOUT_S` 85; wake-on-open.
- **Reason:** owner choice (2026-09-27).
- **Consequence:** slow OCR (ESTIMATED), 750 h/month limit.
- **Status:** ACTIVE (REVISIT after real measurements)

## Decision 8 — Image limits: 10 MB all formats; WebP ≤ 12 MP
- **Decision:** 10 MB cap for every image format (owner); WebP capped at 12 MP from the header (agent, delegated by owner).
- **Reason:** bandwidth/storage (owner); WebP decode peaked at 442 MB at 25 MP vs 243 MB at 12 MP (measured), must fit 512 MB.
- **Status:** ACTIVE

## Decision 9 — backendZ for ZIP files
- **Decision:** separate archive pool (Z1/Z2 on Vercel) with safety limits; images inside go to O as OCR items; credentials never read; build folders skipped.
- **Reason:** owner "we can use BackendZ for this".
- **Status:** ACTIVE

## Decision 10 — Retention: 48 h, delete by folder, forget names
- **Decision:** AUTO deletion 48 h after upload; KEEP/EXTEND by admin; cleanup deletes all of `jobs/<id>/`; then names/paths cleared from DB.
- **Reason:** GDPR minimisation; intermediate objects are not all registered.
- **Status:** ACTIVE

## Decision 11 — Storage budget 800 MiB
- **Decision:** refuse new jobs above 800 MiB projected usage (Supabase Free 1 GB).
- **Reason:** owner "Check storage space before heavy jobs, yes."
- **Status:** ACTIVE (tunable `STORAGE_BUDGET_BYTES`)

## Decision 12 — Admin auth: two keys + signed session cookie
- **Decision:** `ADMIN_KEY_1` and `ADMIN_KEY_2` both required; HMAC session 30 min; cookie scoped to `/api/admin`; CSRF defence via custom header + SameSite=Strict + Origin check; login throttle; all actions audited; ZIP export built in the browser.
- **Reason:** project docs require "two secret keys"; Vercel 4.5 MB response limit rules out server-side ZIPs.
- **Status:** ACTIVE

## Decision 13 — Legal identity and wording
- **Decision:** operator DevBehindYou, devbehindyou@gmail.com; no postal address, EU representative, storage region or governing-law country; providers by category; engines credited only in Terms §10 and Privacy §6; GPL-3.0 stated.
- **Reason:** owner instructions (2026-09-27, 2026-09-28).
- **Consequence:** not lawyer-reviewed; changes bump `LEGAL_VERSION` (forces re-consent).
- **Status:** ACTIVE

## Decision 14 — Public copy: no engine/host names; "Cut PDF token costs by 70%"
- **Decision:** README, site, llms.txt, blog, social card never name MarkItDown/Tesseract/Supabase/Render; headline "Cut PDF token costs by 70%" always with its method and sources (`lib/siteContent.js`).
- **Reason:** owner; audience = free-AI users.
- **Enforcement:** `frontend/test/seo.test.mjs`, blog `check.mjs`.
- **Status:** ACTIVE

## Decision 15 — Keyword targets
- **Decision:** primary "pdf to markdown converter" / "pdf to markdown" / "pdf to md"; secondary "html to markdown", "markdown converter", "word to markdown", "convert pdf to markdown"; GEO angle "chatgpt free limit".
- **Reason:** Google Keyword Planner data (US+IN+UK, 2026-09-28), all LOW competition. Reverse terms ("markdown to pdf", 60,500) excluded: wrong intent.
- **Status:** ACTIVE (REVISIT quarterly)

## Decision 16 — Crawler policy
- **Decision:** allow all search and AI crawlers (GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Claude-SearchBot, Google-Extended, Applebot-Extended, Bingbot); disallow `/api/` and `/mdify-controller`.
- **Reason:** GEO SOP: blocked AI crawlers are the top silent failure.
- **Status:** ACTIVE

## Decision 17 — Site URL
- **Decision:** `https://mdify-app.vercel.app` (canonical, sitemap, JSON-LD, llms.txt).
- **Reason:** owner confirmed.
- **Status:** ACTIVE (change `SITE_URL` in `lib/siteContent.js` if a custom domain comes)

## Decision 18 — Keep the Blog popup
- **Decision:** posts render in the existing `BlogModal`; no redesign.
- **Reason:** owner "I like this king of popup window foe the blog so don't change that."
- **Status:** ACTIVE

## Decision 19 — Local env handling
- **Decision:** each backend loads its own `.env` (`load_local_env`, process vars win); no secrets in `.claude/launch.json`; tests blank Supabase vars.
- **Reason:** magika `.env` leak; secret mismatch.
- **Status:** ACTIVE

## Decision 20 — License GPL-3.0
- **Decision (existing in this project):** `LICENSE` is GPL-3.0; Terms §10 and README say GPL-3.0.
- **Conflict:** the `MDify` repository used MIT until the mirror replaced it (uncommitted).
- **Status:** REVISIT — owner must choose before committing `MDify`.

## Decision 21 — Theme-aware icons via CSS and `media`
- **Decision:** two `<img>` icons toggled by `dark:`; two favicon links toggled by `media`.
- **Reason:** avoids React duplicate-link bug; correct icon already in SSR HTML.
- **Status:** ACTIVE

## Decision 22 — Self-hosted fonts
- **Decision:** `next/font` (Inter, JetBrains Mono, Patrick Hand) served from own origin.
- **Reason:** GDPR (no Google Fonts IP transfer).
- **Status:** ACTIVE
