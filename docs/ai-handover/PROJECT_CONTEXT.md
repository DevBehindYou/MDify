# Project Context

## Project Description

MDify is a free, no-sign-up web app that converts files into clean Markdown for AI chat, RAG pipelines and documentation. Users drop up to 20 files, pick an output profile (Standard, Clean, Compact, RAG-ready), then copy the Markdown, download `.md` files or export a `.zip`.

Supported inputs (source: `frontend/lib/formats.js`):

| Pool | Extensions | Limit |
|---|---|---|
| Normal (backendN, N1/N2) | txt, md, markdown, csv, tsv, json, xml, html, htm, pdf, docx, xlsx, xls, pptx, epub | 15 MB |
| OCR (backendO, O1/O2) | jpg, jpeg, png, webp, tif, tiff, bmp, gif | 10 MB; 25 MP and 10,000 px per side; WebP 12 MP |
| Archive (backendZ, Z1/Z2) | zip | 15 MB upload; 2,000 entries; 100 MB uncompressed |

Scanned PDFs: backendN classifies pages; picture-only pages are rendered to PNG and OCR'd on O1/O2 (up to 100 per file), then merged in page order.

## Main Goal

Run MDify reliably on free tiers (Vercel Hobby, Render Free, Supabase Free) with durable background jobs, 48-hour file retention, an admin panel, EU-compliant legal texts, and strong SEO/GEO so it gets found by search and AI answer engines. Target audience (owner's words, 2026-09-27): people and "school kids using free AI" who hit free-plan limits; converting to Markdown lets them "use the AI 70% more per session".

## User Requirements (chronological, owner's wording preserved where it matters)

1. "Analyze the whole MDify-Pro project and project docs, then start working on the project accordingly. Also, I am thinking that we can use MVVM architecture in the project to increase the optimization and performance."
2. "I want the frontend and backend in a different folder, also there is 2 different types of backend 2 Normal and 2 OCR once." → "Create 2 backend folder backendN and backendO". Backend engine chosen: Python FastAPI.
3. UI/UX responsive audit (prompt file `MarkDify-UI-UX-Responsive-Audit-Prompt.md`): preserve the design, fix responsiveness.
4. "Replace the MDify popup with Consent to accept the Terms, privacy policy with add current design, style and theme."
5. Backend integration + load/performance testing (prompt `MarkDify-Backend-Integration-Load-Performance-Test-Prompt.md`): measure, never guess capacity.
6. "Okay change of plan we are going to use Supabase S3 storage and Database in the project, instead of cloudflare."
7. "Only images will go for the OCR servers not PDFs, Keep that in mind." (with `MarkDify-Next-Architecture-Optimization-Instructions.md`: status labels, P0/P1/P2 lists, required docs.)
8. Use `frontend/public/mdify-icon-dark.svg` / `mdify-icon-light.svg` "according to the app light and dark mode"; write Privacy Policy and Terms "in accordance of EU", following the writing guides (no em dashes, no semicolons, banned vocabulary, contractions, active voice).
9. Put `MDify-Blog-Generation-Pipeline` in the repo root, curated to MDify. Developer contact is "DevBehindYou, devbehindyou@gmail.com", not privacy@mdify.com / security@mdify.com.
10. "I like this king of popup window foe the blog so don't change that."
11. "Okay then limit the all image format size to 10MB, it will save the bandwidth and storage."
12. (2026-09-27) "https://mdify-app.vercel.app is correct. Render free tear plan for O1/O2. Legal details: postal address, EU representative, Supabase region, governing law (don't have do something about it don't mention what storage we are using and AI kind we are using specifically). The 4 old blog posts: remove them. … Decision needed on WebP: Make the decision on that one yourself."
13. "i cant see the MDify icon properly, its too small, and put it in the blogs popup as well."
14. "I want all the backend to wake when the user come to the MDify or open the MDify … Check storage space before heavy jobs, yes. for ZIP you whatever you want we can use BackendZ for this. Name is MDify don't confuse yourself." Build order: 1 background jobs, 2 scanned-page PDF, 3 ZIP v1, 4 admin tree view, 5 measure on real servers, 6 picture-area OCR only if needed. "Pasted the Supabase keys in the env files check them."
15. "DONT TOUCH TheHopeTarot-database or supabase." Clarified via question: only the connector account is off-limits; the MDify project may be used through its env keys; the owner pastes SQL.
16. Rewrite `README.md` with the app icon; "don't go technical telling what backend we uses like render, supabase, etc"; SEO/GEO-optimise README and the app, using the provided SOPs (GEO Master SOP, Blog Creation SOP, BlogHumanizerPrompt, AI Text Humanizer) and the keyword-research skill.
17. Engine naming answer: "No engine names anywhere, but mention in small name in Terms & condition, privacy policy. include Cut PDF token costs by 70%" (audience: free-AI users who don't renew subscriptions).
18. "Copy this whole project from `C:\Users\temp\Documents\GitHub\MDify-Pro` to `C:\Users\temp\Documents\GitHub\MDify` overriding the old project. But don't commit it, i will commit by my self."
19. Create this handover.

## Functional Requirements

- Conversion of all formats above; batch of 20; four profiles; copy / `.md` / `.zip` export; last 5 results kept in browser localStorage.
- Consent banner gates conversion until Terms + Privacy are accepted (re-accept when `LEGAL_VERSION` changes).
- Direct browser upload to Supabase Storage via signed URL; job queue; progress polling; signed download links (10 min).
- Wake all backend instances when a visitor opens MDify (Render Free sleeps).
- Storage budget check before new jobs.
- Scanned-page PDF OCR; ZIP project conversion with index + manifest.
- Admin `/mdify-controller`: two keys, KPIs, jobs, files, processes, audit log, content tree, preview/download/ZIP, keep/extend/delete-now, bulk actions.
- 48-hour automatic deletion; delete whole job folder; forget file names after deletion.
- Blog popup (unchanged design) fed by the pipeline.

## Non-Functional Requirements

### Performance
- Fit free tiers: Render Free (512 MB RAM, 0.1 CPU), Vercel Hobby (300 s max function duration, 4.5 MB request/response body), Supabase Free (1 GB storage, 500 MB DB, 50 MB global file limit).
- Measure capacity; never guess (see `docs/testing/CAPACITY_SUMMARY.md`).

### Security
- Secrets server-only; never `NEXT_PUBLIC_` for secrets; never log document content, secrets, signed URLs or admin keys.
- Backends require `X-Internal-Secret`; object paths allow-listed per job.
- All Postgres functions executable only by `service_role` (explicit revokes from anon/authenticated).
- ZIP safety: path traversal, symlinks, encrypted entries, bombs, credential files never read.

### Accessibility
- Keyboard-usable dialogs, aria labels, readable contrast in both themes (checked in browser, not audited formally).

### Reliability
- Durable queue with leases, retries, stale-job sweep; one peer retry in the dispatcher.

### Compatibility
- Web app; must work at 375 px phone width with no horizontal page scroll; light and dark themes.

### Maintainability
- MVVM layering; shared backend code `app/common` byte-identical in N, O, Z (enforced by `tests/test_common.py` in each backend).

### UI/UX
- Preserve the existing wireframe/"aurora" design. Theme-aware icons. Keep the Blog popup design as is.

## Platforms

Web (frontend on Vercel), backend services (Vercel Python for N and Z, Render Docker for O), cloud database/storage (Supabase).

## Technology Stack

| Layer | Technology (versions verified 2026-09-28) |
|---|---|
| Frontend | Next.js ^14.2.35 App Router, React 18, Tailwind CSS 3.4, `next/font` self-hosted fonts, jszip, `output: 'standalone'` |
| Frontend tests | Node 22.16.0 built-in `node --test`; `@electric-sql/pglite` ^0.5.8 (dev) for real-Postgres SQL tests |
| Backends | Python 3.14.6, FastAPI 0.141.1, httpx |
| Documents | MarkItDown 0.1.8 (+ pypdfium2 for PDF page classification/rendering) |
| OCR | Tesseract 5.4.0.20240606 (`tessdata_fast` eng + osd), pytesseract 0.3.13, Pillow 12.3.0 |
| Database/Storage | Supabase Postgres + Storage (REST/PostgREST from Node without SDK), Supabase Cron (pg_cron + pg_net), Edge Function (Deno) |
| Package manager | npm 11.14.1 (a stale `bun.lock` existed in the old root app) |

## Services / APIs

- Supabase Storage REST and PostgREST (`frontend/lib/server/supabaseRest.js`, `backend*/app/common/storage.py`).
- Internal backend API: `/api/v1/health`, `/api/v1/ready`, `/api/v1/internal/convert` (multipart), `/api/v1/internal/process` (JSON, Storage), `/api/v1/internal/pdf/analyze|merge` (N), `/api/v1/internal/archive/process|merge` (Z).
- Frontend API: `/api/convert`, `/api/uploads/create`, `/api/jobs/[id]/start|advance|download`, `/api/jobs/tick`, `/api/wake`, `/api/health`, `/api/admin/*`.

## Database

Supabase Postgres, project ref `ppmbqgecdbrezxedyeur` (MDify). Migrations in `supabase/migrations/` (init, work queue, admin); combined paste file `supabase/MDIFY_SETUP.sql`. **Not yet applied.**

## Authentication

- End users: none (no accounts).
- Backends: shared secret header.
- Admin: `ADMIN_KEY_1` + `ADMIN_KEY_2` → HMAC-signed 30-minute session cookie (`mdify_admin`, HttpOnly, SameSite=Strict, Path=/api/admin).
- Cron tick: `x-mdify-cron-secret` header = `CRON_SECRET`.

## Storage

Private bucket `mdify-pro-files` (exists; 15 MB file limit applied only when the SQL runs). Layout under `jobs/<uuid>/` (see `ARCHITECTURE.md`).

## Deployment

Planned: frontend + N1/N2 + Z1/Z2 on Vercel (Hobby), O1/O2 on Render Free (`render.yaml`), Supabase Free. **Nothing of the new architecture is deployed.** Site URL: https://mdify-app.vercel.app.

## Minimum Supported Versions

UNKNOWN / NOT VERIFIED (modern evergreen browsers assumed; no browserslist configured).

## Known User Preferences

- Plain, direct writing; the owner's SOPs forbid em dashes, semicolons (except "TL;DR") and a banned-word list in public copy and legal text.
- Status labels in reports (VERIFIED / IMPLEMENTED BUT UNTESTED / …).
- The owner commits themselves.
- The owner often says "Stop the process for now." and later "Continue." Stop means stop all running work and servers.
- The owner delegates some decisions ("Make the decision on that one yourself").

## Explicit User Constraints

- Name is **MDify**.
- Only images go to OCR servers (O1/O2).
- Use Supabase (Storage + Postgres); do not move back to Cloudflare R2/D1.
- Never use/touch the Supabase connector account / `TheHopeTarot-database`.
- Legal texts: operator DevBehindYou + devbehindyou@gmail.com only; no postal address, EU representative, storage region or governing-law country; describe providers by category; engines named only in a small credit in Terms and Privacy.
- Public copy (README, app, llms.txt, blog, social card): no engine or hosting names; do include "Cut PDF token costs by 70%".
- Images capped at 10 MB (all formats).
- O1/O2 on Render Free.
- Keep the Blog popup design.
- Don't commit.
- Ask before downloads/installs.

## Things the User Specifically Does NOT Want

- Mentions of Render, Supabase, Vercel, MarkItDown, Tesseract (or "AI kind") in README, public pages, legal texts (except the small engine credit) or blog posts.
- Changes to the Blog popup design.
- The name "MarkDify" anywhere user-facing.
- Contact addresses privacy@mdify.com / security@mdify.com.
- Commits made by the agent.
- Any use of the Supabase connector account.
