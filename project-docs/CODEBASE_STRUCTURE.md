# MarkDify — Codebase Structure

How the repository maps onto the target architecture in `ARCHITECTURE.md`.

---

## 1. Repository Layout

```text
frontend/        Next.js 14 (App Router) — Vercel
  app/             routes: / (converter), /usecase, /api/convert (dispatcher), /api/health
  components/      Views (presentational React components)
    converter/       converter-screen views: workspaces, queue rail, dropzone, reader
  viewmodels/      ViewModels (React hooks) — state + commands per screen/feature
  lib/
    formats.js       shared format rules and pool routing (browser + server)
    models/          Model layer: pure state, services, repositories (no React)
    server/          server-only code (dispatcher)
  test/            node:test unit tests (no extra dependencies)

backendN/        Normal pool — FastAPI + MarkItDown — N1, N2 on Vercel
  app/main.py      ASGI entrypoint (Vercel serves `app`)
  app/converter.py MarkItDown engine, magic-byte + zip-bomb validation
  app/common/      shared backend core (mirrored in backendO)
  tests/

backendO/        OCR pool — FastAPI + Tesseract (tessdata_fast) — O1, O2 on Render
  app/main.py      ASGI entrypoint (uvicorn, 1 worker)
  app/converter.py Pillow dimension guard, preprocessing, Tesseract
  app/common/      shared backend core (mirrored from backendN)
  Dockerfile       tesseract-ocr + tessdata_fast eng, OMP_THREAD_LIMIT=1
  tests/

render.yaml      Render Blueprint: O1 and O2 from backendO/
```

Each backend folder deploys on its own, so the shared core `app/common/` is
duplicated byte-for-byte. `tests/test_common.py::test_common_package_in_sync_with_other_backend`
fails when the two copies drift — edit one, copy to the other.

---

## 2. Frontend — MVVM

| Layer | Location | Rules |
|-------|----------|-------|
| Model | `lib/models/*`, `lib/formats.js` | Plain JS. No React, no JSX. Pure reducers, services (`conversionService`), repositories (`sessionRepository`, `themeRepository`), export helpers. Unit-tested with `node:test`. |
| ViewModel | `viewmodels/use*ViewModel.js` | React hooks. Own state and expose stable commands (`useCallback` + latest-value refs). Never touch the DOM directly; the View passes commands such as `openFilePicker`. |
| View | `app/**/page.js`, `components/**` | Render props, call commands. Only view-local UI state (drag hover, "copied" flash). Heavy views are `React.memo`. |

Screen composition: `app/page.js` → `useConverterScreenViewModel` → composes
`useConverterViewModel` (queue/results), `useExportViewModel`,
`useRecentSessionsViewModel`, `useServerStatusViewModel`, `useThemeViewModel`,
`useToastViewModel`, `useKeyboardShortcuts`.

### Performance rules that come with this structure

- Typing in the editor updates only `MarkdownViewer`'s local buffer. The
  preview and stats follow `useDeferredValue`; the edit reaches the ViewModel
  after a 250 ms pause (flushed on document switch/unmount).
- Only the visible layout is mounted after hydration (`useMediaQuery`); the
  Markdown viewer is never rendered twice.
- Modals, sidebar and JSZip load on demand (`next/dynamic`, `import()`).
- No interval polling: server status is checked on mount, on `online` /
  visibility events, on connection failures, and on Retry.
- Queue selection is by id, not array index.

---

## 3. Dispatcher (frontend `/api/convert`)

- Pool by extension: images → OCR (`OCR_BACKEND_URLS`), documents → normal
  (`NORMAL_BACKEND_URLS`). Shared list: `lib/formats.js`.
- Instance by FNV-1a hash of a per-request job id; no process-local state.
- One peer failover on connection failure or HTTP 502/503/504. Never retried:
  4xx, 422, timeouts.
- Sends `X-Internal-Secret` (`BACKEND_SHARED_SECRET`, server-only env).

**Interim:** file bytes still pass through the Vercel function (4.5 MB body
cap on Hobby). The target flow (ARCHITECTURE.md §5) uploads to R2 directly;
only `lib/models/conversionService.js` (browser) and the dispatcher change.

---

## 4. Backend Contract (N1, N2, O1, O2)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/health` | none | liveness, role, instance |
| GET | `/api/v1/ready` | none | 200 only when engine present and secret configured |
| POST | `/api/v1/internal/convert` | `X-Internal-Secret` | multipart `file`, `profile`, `job_id` → Markdown JSON |

Status codes: 400 invalid/unsupported/magic mismatch, 401 bad secret,
413 size or dimension limit, 422 unreadable input or OCR timeout,
503 engine missing or secret not configured (dispatcher fails over).

Response adds `engine`, `backend_role`, `backend_instance`, `duration_ms`,
`job_id` — the fields D1 `jobs` rows will need.
