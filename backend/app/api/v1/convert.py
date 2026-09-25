"""Conversion endpoint: POST /api/v1/convert (single file, multipart)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, File, Form, Request, UploadFile
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.core.errors import AppError, ErrorCode
from app.core.ratelimit import limiter
from app.schemas.conversion import ConversionResult, ErrorResponse
from app.services.conversion_service import convert_document

router = APIRouter()

# Conversion uses blocking libraries (MarkItDown, PDF/Office parsing, etc.).
# Keep those off the asyncio event loop and bound parallel work per process.
_conversion_slots = asyncio.Semaphore(settings.max_concurrent_conversions)


@router.post(
    "/convert",
    response_model=ConversionResult,
    responses={
        413: {"model": ErrorResponse},
        415: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
    },
)
@limiter.limit(settings.rate_limit_convert)
async def convert(
    request: Request,  # noqa: ARG001 - required by slowapi's limiter (accessed by name)
    file: UploadFile = File(...),
    profile: str = Form("standard"),
) -> ConversionResult:
    try:
        content = await file.read()
    except Exception as exc:  # pragma: no cover - client stream aborted
        raise AppError(
            ErrorCode.UPLOAD_FAILED,
            "The upload could not be read. Please try again.",
            status_code=400,
        ) from exc

    # convert_document is intentionally synchronous because the underlying
    # parsing/conversion libraries are blocking. Run it in a worker thread so
    # health checks and unrelated requests remain responsive.
    async with _conversion_slots:
        return await run_in_threadpool(
            convert_document,
            file.filename,
            content,
            profile,
        )
"