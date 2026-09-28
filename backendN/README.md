# backendN — normal conversion pool (N1, N2)

FastAPI + Microsoft MarkItDown. Converts PDF (text layer), DOCX, PPTX, XLSX,
XLS, EPUB, HTML, CSV, TSV, JSON, XML, TXT and Markdown. No OCR — images go to
`backendO`.

## Local

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m pytest
BACKEND_INSTANCE=N1 INTERNAL_SHARED_SECRET=dev-secret .venv/Scripts/python -m uvicorn app.main:app --port 8001
```

## Deploy (Vercel)

Create two Vercel projects from this repository, both with **Root Directory
= `backendN`**. Vercel's Python runtime serves `app` from `app/main.py`;
`vercel.json` sets `maxDuration` and trims the bundle.

| Project | Env |
|---------|-----|
| N1 | `BACKEND_INSTANCE=N1`, `INTERNAL_SHARED_SECRET=<shared>` |
| N2 | `BACKEND_INSTANCE=N2`, `INTERNAL_SHARED_SECRET=<shared>` |

Then list both URLs in the frontend's `NORMAL_BACKEND_URLS`.

Check the function bundle size on the first deploy: the MarkItDown extras
pull pandas, numpy and onnxruntime (~260 MB installed on Windows).

## Shared core

`app/common/` is identical in `backendN`, `backendO` and `backendZ`. Change
all copies together; `tests/test_common.py` fails if any present copy differs.
