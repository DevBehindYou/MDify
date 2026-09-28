"""Builds the FastAPI app shared by both backend roles.

Endpoints (identical contract on N1, N2, O1, O2):

    GET  /api/v1/health            liveness + role/instance
    GET  /api/v1/ready             engine readiness (503 when not ready)
    POST /api/v1/internal/process  Storage in → convert → Storage out; the
                                   response carries stats and a bounded
                                   preview, never the full Markdown
    POST /api/v1/internal/convert  multipart file → Markdown JSON (local
                                   development without Storage)

Internal endpoints require X-Internal-Secret.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Protocol

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .config import Settings
from .errors import ConversionRejected, EngineUnavailable
from .files import read_limited, sanitize_filename, split_name, title_from_stem
from .profiles import PROFILES, finalize_markdown
from .security import require_internal_secret
from .storage import StorageClient, StorageError

logger = logging.getLogger("mdify.backend")

PREVIEW_CHARS = 4000  # bounded preview returned with Storage-backed results


class Converter(Protocol):
    engine_name: str
    extensions: frozenset[str]

    def ready(self) -> tuple[bool, str]:
        """(is_ready, detail) — e.g. whether the engine binary is installed."""

    def validate(self, data: bytes, ext: str) -> None:
        """Raises ConversionRejected if the bytes don't match the extension."""

    def convert(self, data: bytes, ext: str, *, filename: str, title: str) -> tuple[str, str | None]:
        """Returns (markdown, warning_code_or_None)."""


class ProcessRequest(BaseModel):
    job_id: uuid.UUID
    work_item_id: uuid.UUID | None = None
    input_path: str = Field(max_length=200)
    output_path: str = Field(max_length=200)
    original_filename: str = Field(max_length=1024)
    profile: str = "Standard"
    # raw: one piece of a larger document (a scanned page, an image inside an
    # archive). Plain engine text, no title or source line: the merge step
    # applies the profile once to the whole result.
    raw: bool = False


def paths_belong_to_job(job_id: str, *paths: str) -> None:
    """Every object a request names must sit under that job's prefix."""
    prefix = f"jobs/{job_id}/"
    for path in paths:
        if not str(path).startswith(prefix):
            raise HTTPException(status_code=400, detail="Object path does not belong to this job")


def create_app(settings: Settings, converter: Converter, storage: StorageClient | None = None) -> FastAPI:
    # No interactive docs or schema: these instances are internal compute,
    # not a public API surface.
    app = FastAPI(title=f"MDify backend ({settings.role})", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.converter = converter
    app.state.storage = storage if storage is not None else StorageClient.from_env()

    def run(original_name: str, profile: str, job_id: str, load_bytes, *, raw: bool = False) -> tuple[dict, str]:
        """Shared pipeline. Returns (response fields, full Markdown)."""
        started = time.perf_counter()
        started_at_ms = round(time.time() * 1000)
        stem, ext = split_name(original_name)
        outcome = "error"
        try:
            if ext not in converter.extensions:
                raise ConversionRejected(
                    400,
                    f"Unsupported file format for the {settings.role} pool: .{ext or 'unknown'}",
                    "unsupported",
                )
            if profile not in PROFILES:
                profile = "Standard"
            data = load_bytes()
            converter.validate(data, ext)
            title = title_from_stem(stem)
            markdown, warning = converter.convert(data, ext, filename=original_name, title=title)
            if raw:
                content = markdown.strip() + "\n"
                words = len(content.split())
                tokens = round(words * 1.33)
            else:
                content, words, tokens = finalize_markdown(
                    markdown,
                    title=title,
                    original_name=original_name,
                    size_bytes=len(data),
                    engine=converter.engine_name,
                    profile=profile,
                )
            outcome = "ok"
        except ConversionRejected as err:
            outcome = err.code
            raise HTTPException(status_code=err.status_code, detail=err.detail) from None
        except StorageError as err:
            outcome = "storage_transient" if err.transient else "storage_rejected"
            logger.warning("storage error job=%s: %s", job_id, err)
            if err.transient:
                raise HTTPException(status_code=503, detail="Storage temporarily unavailable") from None
            status = 413 if err.status == 413 else 409
            raise HTTPException(status_code=status, detail=str(err)) from None
        except EngineUnavailable as err:
            outcome = "engine_unavailable"
            logger.error("engine unavailable: %s", err)
            raise HTTPException(status_code=503, detail="Conversion engine unavailable") from None
        except Exception:
            outcome = "failed"
            logger.exception("conversion failed job=%s ext=%s", job_id, ext)
            raise HTTPException(
                status_code=422,
                detail=f"This {ext.upper()} file couldn't be read — it may be corrupted, "
                "password-protected, or in an unexpected format.",
            ) from None
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000)
            # Metadata only — never log document content, paths' contents or keys.
            logger.info(
                "job=%s role=%s instance=%s ext=%s outcome=%s duration_ms=%d",
                job_id or "-",
                settings.role,
                settings.instance,
                ext or "-",
                outcome,
                duration_ms,
            )

        fields = {
            "job_id": job_id or None,
            "filename": f"{stem}.md",
            "original_name": original_name,
            "char_count": len(content),
            "word_count": words,
            "tokens_est": tokens,
            "engine": converter.engine_name,
            "backend_role": settings.role,
            "backend_instance": settings.instance,
            "duration_ms": duration_ms,
            # Epoch ms, for job timelines (processing_started_at / _finished_at).
            "started_at_ms": started_at_ms,
            "finished_at_ms": started_at_ms + duration_ms,
        }
        if warning:
            fields["warning"] = warning
        return fields, content

    # Role-specific task routes (PDF pages, archives) reuse the same pipeline.
    app.state.run = run

    @app.get("/api/v1/health")
    def health() -> dict:
        return {
            "status": "ok",
            "role": settings.role,
            "instance": settings.instance,
            "version": settings.version,
        }

    @app.get("/api/v1/ready")
    def ready() -> JSONResponse:
        ok, detail = converter.ready()
        body = {
            "ready": ok,
            "role": settings.role,
            "instance": settings.instance,
            "engine": converter.engine_name,
            "detail": detail,
            "secret_configured": bool(settings.shared_secret),
            "storage_configured": app.state.storage is not None,
        }
        return JSONResponse(body, status_code=200 if ok and settings.shared_secret else 503)

    @app.post("/api/v1/internal/process", dependencies=[Depends(require_internal_secret)])
    def process(req: ProcessRequest) -> dict:
        # Sync handler: FastAPI runs it in a worker thread, so CPU-bound
        # conversion never blocks the event loop.
        storage = app.state.storage
        if storage is None:
            raise HTTPException(status_code=503, detail="Storage is not configured on this instance")
        job_id = str(req.job_id)
        paths_belong_to_job(job_id, req.input_path, req.output_path)

        fields, content = run(
            sanitize_filename(req.original_filename),
            req.profile,
            job_id,
            lambda: storage.download(req.input_path, settings.max_upload_bytes),
            raw=req.raw,
        )

        write_started = time.perf_counter()
        body = content.encode("utf-8")
        try:
            storage.upload(req.output_path, body, "text/markdown; charset=utf-8")
        except StorageError as err:
            # The conversion worked but the result isn't stored: never report
            # success. Transient → the dispatcher may retry on the peer.
            logger.warning("output write failed job=%s: %s", job_id, err)
            raise HTTPException(
                status_code=503 if err.transient else 502, detail="Could not store the conversion result"
            ) from None

        return {
            **fields,
            "status": "COMPLETED",
            "output_path": req.output_path,
            "output_bytes": len(body),
            "outputs": [{"path": req.output_path, "kind": "OUTPUT", "bytes": len(body), "name": fields["filename"]}],
            "output_write_ms": round((time.perf_counter() - write_started) * 1000),
            "preview": content[:PREVIEW_CHARS],
            "preview_truncated": len(content) > PREVIEW_CHARS,
        }

    @app.post("/api/v1/internal/convert", dependencies=[Depends(require_internal_secret)])
    def convert(
        file: UploadFile = File(...),
        profile: str = Form("Standard"),
        job_id: str = Form(""),
    ) -> dict:
        fields, content = run(
            sanitize_filename(file.filename),
            profile,
            job_id,
            lambda: read_limited(file.file, settings.max_upload_bytes),
        )
        return {**fields, "content": content}

    return app
