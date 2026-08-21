# MDify Pro

> Upload documents → get clean, RAG-ready **Markdown**. A production-grade rebuild of MDify.

MDify Pro turns PDFs, Office documents, web pages, data files, and images into structured
Markdown that LLM pipelines and humans can actually use. It is a **separate, independent
product** from the original MDify — its own codebase, deployments, and release lifecycle —
built on Microsoft's [MarkItDown](https://github.com/microsoft/markitdown) engine.

- **Frontend:** Next.js 14 + TypeScript + Tailwind (MVVM) → **Vercel**
- **Backend:** FastAPI + MarkItDown, layered architecture → **Render**
- No account. No watermark. Free and open source.

---

## Architecture

```
Browser ──HTTPS──►  Next.js (Vercel)  ──proxy rewrite──►  FastAPI (Render)
                    View / ViewModel                      API ▸ Service ▸ Pipeline ▸ Converter
```

**Frontend — MVVM.** The View (`app/`, `components/`) is purely presentational. ViewModels
(`features/conversion/*` hooks) own all state and orchestration. The Model/Repository
(`lib/api/client.ts`) is the only code that touches the network. Components never call
`fetch` directly.

**Backend — layered.** A request flows through clear seams, each independently testable:

```
API route (app/api/v1)
   ▸ Conversion service (app/services)        ← the one orchestration point
       ▸ Security validation (app/security)   ← trust boundary: magic-byte sniff, size, sanitize
       ▸ Converter registry → MarkItDown adapter (app/converters)   ← swappable engine seam
       ▸ Pipeline (app/pipeline): normalize → analyze (stats + quality)
```

This shape means future work (OCR/layout engine, RAG chunking, a public API, a separate
conversion worker) slots in behind an existing seam without a rewrite.

---

## Supported formats

Smoke-tested end-to-end in this build:

| Format | Ext | Tables | Notes |
|---|---|---|---|
| PDF | `.pdf` | ⚠ text-native | Scanned/image PDFs surface a "low structure" warning (OCR is a later phase) |
| Word | `.docx` | ✓ | Strong structure preservation |
| PowerPoint | `.pptx` | ✓ | Slides + notes |
| Excel | `.xlsx` | ✓ | Rows → Markdown tables |
| HTML | `.html` `.htm` | ✓ | |
| CSV / TSV | `.csv` `.tsv` | ✓ | |
| JSON / XML | `.json` `.xml` | — | |
| Text / Markdown | `.txt` `.md` | — | |
| Image | `.png` `.jpg` … | — | Metadata extraction (no OCR on free tier) |

Also accepted (MarkItDown extras installed): `.xls` (legacy Excel), `.epub`, and the image
family `.jpg .jpeg .gif .bmp .tiff .webp`.

Every conversion returns document **stats** (word/char/line counts, estimated tokens) and a
**quality summary** (headings, tables, links, images, and a structure-loss warning). Token
counts are estimates (~4 chars/token) and vary by model tokenizer.

---

## Local development

**Backend** (Python 3.11+):

```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate   # or: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- Health: `http://localhost:8000/api/v1/health`
- API docs (OpenAPI/Swagger): `http://localhost:8000/docs`

**Frontend** (Node 20+):

```bash
cd frontend
npm install
cp .env.example .env.local   # set BACKEND_URL=http://localhost:8000
npm run dev                  # http://localhost:3000
```

---

## Testing & CI

```bash
# backend
cd backend && ruff check . && pytest -q

# frontend
cd frontend && npm run typecheck && npm run lint && npm run build
```

GitHub Actions (`.github/workflows/ci.yml`) runs both on every push/PR to `main`.

---

## Deployment (two independent services)

**Backend → Render.** Uses `render.yaml` (Blueprint). Free tier by default; health check
at `/api/v1/health`. After the frontend is live, set the backend env var
`FRONTEND_URL=https://<your-frontend>.vercel.app` for CORS.

**Frontend → Vercel.** Create a Vercel project with **Root Directory = `frontend`**. Set env
vars:

```
BACKEND_URL=https://mdify-pro-api.onrender.com
NEXT_PUBLIC_SITE_URL=https://<your-frontend>.vercel.app
```

### Cold starts (free tier)
Render's free plan sleeps after inactivity and takes ~20–60s to wake. The frontend handles
this honestly — a direct wake ping, a live backend-status indicator, and a countdown — rather
than an infinite spinner. To keep it warm during active hours, point an uptime pinger at
`/api/v1/ready`.

---

## Roadmap

MDify Pro is built to grow phase-by-phase, each phase deployable and useful on its own:

1. **Foundation + core conversion + hardening** ← *this release*
2. Parallel batch, ZIP export, document-intelligence panel, session-local recent files
3. Public `/api/v1` with API keys + OpenAPI (the RAG/developer audience)
4. Optional accounts: history, preferences (free anonymous flow stays untouched)
5. AI/RAG: OCR/layout toggle for hard PDFs, RAG chunking, quality scoring
6. Monetization: open-core freemium (Free / Pro / API / Enterprise)
7. Platform: CLI/PyPI, GitHub Action, cloud import, self-host

---

## License

MIT — see [LICENSE](LICENSE). Built by [DevBehindYou](https://github.com/DevBehindYou),
powered by Microsoft MarkItDown.
