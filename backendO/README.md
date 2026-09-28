# backendO — OCR pool (O1, O2)

FastAPI + Tesseract with the `tessdata_fast` English model. Converts JPG,
PNG, WebP, TIFF, BMP and GIF (first frame) to Markdown.

Memory guards, applied before any pixel is decoded:

- signature and Pillow format must match the extension
- max 25 MP decoded and 10 000 px per side (`OCR_MAX_PIXELS`, `OCR_MAX_SIDE`)
- one OCR job at a time per process, `OMP_THREAD_LIMIT=1`, one uvicorn worker
- `OCR_TIMEOUT_S` (default 45 s) per image

Scanned-PDF OCR is out of scope until a page-rendering pipeline exists.

## Local

Tests mock Tesseract, so they run anywhere:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m pytest
```

To run real OCR, use the Docker image (or install `tesseract` on PATH):

```bash
docker build -t mdify-ocr .
docker run -p 8002:8000 -e BACKEND_INSTANCE=O1 -e INTERNAL_SHARED_SECRET=dev-secret mdify-ocr
```

## Deploy (Render)

`render.yaml` at the repository root defines `mdify-ocr-o1` and
`mdify-ocr-o2` from this folder's `Dockerfile`. Apply it as a Blueprint, set
`INTERNAL_SHARED_SECRET` on both, and list both URLs in the frontend's
`OCR_BACKEND_URLS`. Health check: `/api/v1/ready` (fails until Tesseract,
the language model and the secret are all present).

## Shared core

`app/common/` is identical in `backendN`, `backendO` and `backendZ`. Change
all copies together; `tests/test_common.py` fails if any present copy differs.
