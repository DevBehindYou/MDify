"""Conversion endpoint: POST /api/v1/convert (single file, multipart)."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, Request, UploadFile

from app.config import settings
from app.core.errors import AppError, ErrorCode
from app.core.ratelimit import limiter
from app.schemas.conversion import ConversionResult, ErrorResponse
from app.services.conversion_service import convert_document

router = APIRouter()


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

    # convert_document raises typed AppError; the global handler renders it.
    return convert_document(file.filename, content, profile=profile)
