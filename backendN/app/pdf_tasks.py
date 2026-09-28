"""Scanned-page PDF support for the normal pool (N1, N2).

POST /api/v1/internal/pdf/analyze
    Classifies every page with pdfium (fast, no layout analysis). A PDF with
    no scanned pages is converted in one pass, exactly like /process. Otherwise:
    runs of text pages are converted with MarkItDown and stored as pieces,
    scanned pages are rendered to grayscale PNG for O1/O2 (which only ever see
    images), and the orchestrator merges everything once the pages are read.

POST /api/v1/internal/pdf/merge
    Joins the pieces in page order and applies the profile once. A page whose
    text recognition failed becomes a visible note instead of failing the file.

Both endpoints take object paths under the job's prefix, never file bytes.
"""

from __future__ import annotations

import io
import logging
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from app.common.app_factory import ProcessRequest, paths_belong_to_job
from app.common.errors import ConversionRejected
from app.common.files import sanitize_filename, split_name, title_from_stem
from app.common.profiles import PROFILES, finalize_markdown
from app.common.security import require_internal_secret
from app.common.storage import StorageError

logger = logging.getLogger("mdify.pdf")


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


# A page is "scanned" when it has almost no text layer but a large image.
MIN_PAGE_CHARS = _env_int("PDF_MIN_PAGE_CHARS", 20)
MIN_SCAN_IMAGE_COVERAGE = float(os.environ.get("PDF_MIN_SCAN_IMAGE_COVERAGE", "0.3"))
# Rendering for OCR: 200 dpi, capped at the OCR target size (12 MP).
RENDER_DPI = _env_int("PDF_RENDER_DPI", 200)
RENDER_MAX_PIXELS = _env_int("PDF_RENDER_MAX_PIXELS", 12_000_000)
# Render Free OCR is slow; beyond this many scanned pages the rest is skipped
# with a note in the result (PDF_MAX_OCR_PAGES).
MAX_OCR_PAGES = _env_int("PDF_MAX_OCR_PAGES", 100)
UPLOAD_WORKERS = 4
ENGINE_HYBRID = "MarkItDown + Tesseract"


@dataclass
class PageInfo:
    number: int  # 1-based
    chars: int
    image_coverage: float

    @property
    def kind(self) -> str:
        if self.chars < MIN_PAGE_CHARS and self.image_coverage >= MIN_SCAN_IMAGE_COVERAGE:
            return "scan"
        if self.chars == 0 and self.image_coverage < 0.05:
            return "empty"
        return "native"


def classify_pages(pdf) -> list[PageInfo]:
    import pypdfium2 as pdfium

    pages = []
    for index in range(len(pdf)):
        page = pdf[index]
        try:
            width, height = page.get_size()
            area = max(width * height, 1.0)
            textpage = page.get_textpage()
            chars = textpage.count_chars()
            textpage.close()
            covered = 0.0
            for obj in page.get_objects(filter=(pdfium.raw.FPDF_PAGEOBJ_IMAGE,), max_depth=4):
                left, bottom, right, top = obj.get_bounds()
                w = max(0.0, min(right, width) - max(left, 0.0))
                h = max(0.0, min(top, height) - max(bottom, 0.0))
                covered += w * h
            pages.append(PageInfo(index + 1, chars, min(1.0, covered / area)))
        finally:
            page.close()
    return pages


def page_runs(pages: list[PageInfo]) -> list[tuple[str, int, int]]:
    """Groups consecutive pages: [('native', 1, 3), ('scan', 4, 4), ...].

    Empty pages join the neighbouring native run; every scanned page is its
    own unit, because each goes to O1/O2 on its own.
    """
    runs: list[tuple[str, int, int]] = []
    for p in pages:
        kind = "native" if p.kind == "empty" else p.kind
        if kind == "native" and runs and runs[-1][0] == "native" and runs[-1][2] == p.number - 1:
            runs[-1] = ("native", runs[-1][1], p.number)
        else:
            runs.append((kind, p.number, p.number))
    return runs


def render_page_png(pdf, number: int) -> bytes:
    page = pdf[number - 1]
    try:
        width, height = page.get_size()
        scale = RENDER_DPI / 72
        if width * height * scale * scale > RENDER_MAX_PIXELS:
            scale = (RENDER_MAX_PIXELS / (width * height)) ** 0.5
        bitmap = page.render(scale=scale, grayscale=True)
        image = bitmap.to_pil()
        buf = io.BytesIO()
        image.save(buf, "PNG", optimize=False)
        return buf.getvalue()
    finally:
        page.close()


def sub_pdf(pdf, first: int, last: int) -> bytes:
    import pypdfium2 as pdfium

    part = pdfium.PdfDocument.new()
    try:
        part.import_pages(pdf, pages=list(range(first - 1, last)))
        buf = io.BytesIO()
        part.save(buf)
        return buf.getvalue()
    finally:
        part.close()


class MergePart(BaseModel):
    kind: str = Field(pattern="^(native|ocr)$")
    page_from: int = Field(ge=1)
    page_to: int = Field(ge=1)
    path: str = Field(max_length=200)


class MergeRequest(BaseModel):
    job_id: uuid.UUID
    work_item_id: uuid.UUID | None = None
    output_path: str = Field(max_length=200)
    original_filename: str = Field(max_length=1024)
    profile: str = "Standard"
    parts: list[MergePart] = Field(max_length=5000)
    pages: int | None = None
    source_bytes: int | None = None
    skipped_pages: list[int] = Field(default_factory=list, max_length=5000)


def register(app: FastAPI) -> None:
    settings = app.state.settings
    converter = app.state.converter

    def storage():
        client = app.state.storage
        if client is None:
            raise HTTPException(status_code=503, detail="Storage is not configured on this instance")
        return client

    @app.post("/api/v1/internal/pdf/analyze", dependencies=[Depends(require_internal_secret)])
    def analyze(req: ProcessRequest) -> dict:
        import pypdfium2 as pdfium

        store = storage()
        job_id = str(req.job_id)
        paths_belong_to_job(job_id, req.input_path, req.output_path)
        name = sanitize_filename(req.original_filename)
        started = time.perf_counter()

        try:
            data = store.download(req.input_path, settings.max_upload_bytes)
        except StorageError as err:
            raise HTTPException(status_code=503 if err.transient else 409, detail=str(err)) from None
        try:
            converter.validate(data, "pdf")
            pdf = pdfium.PdfDocument(data)
        except ConversionRejected as err:
            raise HTTPException(status_code=err.status_code, detail=err.detail) from None
        except pdfium.PdfiumError:
            raise HTTPException(status_code=422, detail="This PDF couldn't be read. It may be damaged or password-protected.") from None

        try:
            pages = classify_pages(pdf)
            scans = [p.number for p in pages if p.kind == "scan"]
            if not scans:
                pdf.close()
                pdf = None
                # Plain text PDF: the usual one-pass conversion, same output as /process.
                fields, content = app.state.run(name, req.profile, job_id, lambda: data)
                body = content.encode("utf-8")
                store.upload(req.output_path, body, "text/markdown; charset=utf-8")
                return {
                    **fields,
                    "mode": "single",
                    "pages": len(pages),
                    "output_bytes": len(body),
                    "outputs": [{"path": req.output_path, "kind": "OUTPUT", "bytes": len(body), "name": fields["filename"]}],
                }

            ocr_pages = set(scans[:MAX_OCR_PAGES])
            skipped = scans[MAX_OCR_PAGES:]
            segments, scan_units, uploads = [], [], []
            for kind, first, last in page_runs(pages):
                node_id = str(uuid.uuid4())
                if kind == "native" or first not in ocr_pages:
                    if kind == "scan":
                        continue  # over the OCR page limit: noted in the merge
                    markdown, _warning = converter.convert(
                        sub_pdf(pdf, first, last), "pdf", filename=name, title=name, note_low_text=False
                    )
                    path = f"jobs/{job_id}/nodes/{node_id}/result.md"
                    uploads.append((path, (markdown.strip() + "\n").encode("utf-8"), "text/markdown; charset=utf-8"))
                    segments.append({"node_id": node_id, "page_from": first, "page_to": last, "output_path": path})
                else:
                    png = render_page_png(pdf, first)
                    image_path = f"jobs/{job_id}/materialized/{node_id}/source.png"
                    uploads.append((image_path, png, "image/png"))
                    scan_units.append({
                        "node_id": node_id,
                        "page": first,
                        "input_path": image_path,
                        "output_path": f"jobs/{job_id}/nodes/{node_id}/result.md",
                        "bytes": len(png),
                    })
        except HTTPException:
            raise
        except ConversionRejected as err:
            raise HTTPException(status_code=err.status_code, detail=err.detail) from None
        except StorageError as err:
            raise HTTPException(status_code=503 if err.transient else 502, detail="Could not store the result") from None
        except Exception:
            logger.exception("pdf analyze failed job=%s", job_id)
            raise HTTPException(status_code=422, detail="This PDF couldn't be read. It may be damaged or password-protected.") from None
        finally:
            if pdf is not None:
                pdf.close()

        # pdfium isn't thread-safe, so rendering above is sequential; the
        # uploads are independent and run in parallel.
        try:
            with ThreadPoolExecutor(max_workers=UPLOAD_WORKERS) as pool:
                list(pool.map(lambda u: store.upload(*u), uploads))
        except StorageError as err:
            raise HTTPException(status_code=503 if err.transient else 502, detail="Could not store the page images") from None

        duration_ms = round((time.perf_counter() - started) * 1000)
        logger.info(
            "job=%s pdf analyze pages=%d native_runs=%d scans=%d skipped=%d duration_ms=%d",
            job_id, len(pages), len(segments), len(scan_units), len(skipped), duration_ms,
        )
        return {
            "mode": "split",
            "pages": len(pages),
            "source_bytes": len(data),
            "segments": segments,
            "scans": scan_units,
            "skipped_pages": skipped,
            "engine": ENGINE_HYBRID,
            "backend_role": settings.role,
            "backend_instance": settings.instance,
            "duration_ms": duration_ms,
        }

    @app.post("/api/v1/internal/pdf/merge", dependencies=[Depends(require_internal_secret)])
    def merge(req: MergeRequest) -> dict:
        store = storage()
        job_id = str(req.job_id)
        paths_belong_to_job(job_id, req.output_path, *(p.path for p in req.parts))
        started = time.perf_counter()
        name = sanitize_filename(req.original_filename)
        stem, _ext = split_name(name)
        profile = req.profile if req.profile in PROFILES else "Standard"

        def load(part: MergePart) -> tuple[MergePart, str | None]:
            try:
                return part, store.download(part.path, settings.max_upload_bytes).decode("utf-8", "replace")
            except StorageError as err:
                if err.transient:
                    raise
                return part, None

        try:
            with ThreadPoolExecutor(max_workers=UPLOAD_WORKERS) as pool:
                loaded = list(pool.map(load, sorted(req.parts, key=lambda p: p.page_from)))
        except StorageError:
            raise HTTPException(status_code=503, detail="Storage temporarily unavailable") from None

        blocks, failed_pages = [], []
        for part, text in loaded:
            if part.kind == "ocr":
                label = f"<!-- page {part.page_from}: text recognition -->"
                if text is None or not text.strip():
                    failed_pages.append(part.page_from)
                    blocks.append(f"{label}\n> ⚠️ Page {part.page_from}: no text could be recognised.")
                else:
                    blocks.append(f"{label}\n{text.strip()}")
            elif text is not None and text.strip():
                blocks.append(text.strip())
        if req.skipped_pages:
            listed = ", ".join(str(n) for n in req.skipped_pages[:20]) + ("…" if len(req.skipped_pages) > 20 else "")
            blocks.append(
                f"> ⚠️ {len(req.skipped_pages)} more scanned pages were not read "
                f"(MDify reads up to {MAX_OCR_PAGES} scanned pages per PDF): {listed}."
            )

        content, words, tokens = finalize_markdown(
            "\n\n".join(blocks) or "_No text found in this document._",
            title=title_from_stem(stem),
            original_name=name,
            size_bytes=req.source_bytes or 0,
            engine=ENGINE_HYBRID,
            profile=profile,
        )
        body = content.encode("utf-8")
        try:
            store.upload(req.output_path, body, "text/markdown; charset=utf-8")
        except StorageError as err:
            raise HTTPException(status_code=503 if err.transient else 502, detail="Could not store the conversion result") from None

        duration_ms = round((time.perf_counter() - started) * 1000)
        warnings = [f"ocr-failed-pages:{','.join(map(str, failed_pages))}"] if failed_pages else []
        if req.skipped_pages:
            warnings.append(f"ocr-page-limit:{len(req.skipped_pages)}")
        return {
            "filename": f"{stem}.md",
            "original_name": name,
            "char_count": len(content),
            "word_count": words,
            "tokens_est": tokens,
            "engine": ENGINE_HYBRID,
            "backend_role": settings.role,
            "backend_instance": settings.instance,
            "duration_ms": duration_ms,
            "pages": req.pages,
            "warnings": warnings,
            "output_bytes": len(body),
            "outputs": [{"path": req.output_path, "kind": "OUTPUT", "bytes": len(body), "name": f"{stem}.md"}],
        }
