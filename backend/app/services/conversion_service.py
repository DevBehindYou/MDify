"""Application service — the single orchestration point for a conversion.

Routes call *only* this. It wires together the trust boundary (validation),
isolated temp storage, the converter registry, and the post-extraction
pipeline, and assembles the typed ``ConversionResult``. Keeping this the one
seam is what lets the whole conversion path be lifted into a dedicated Render
worker later (Phase 3) without changing the API layer.
"""

from __future__ import annotations

import time

from app.config import settings
from app.converters.base import ConversionInput
from app.converters.registry import resolve_converter
from app.core.logging import get_logger
from app.pipeline.pipeline import process
from app.schemas.conversion import ConversionResult
from app.security.validation import validate_upload
from app.utils.tempfiles import temp_upload

logger = get_logger(__name__)


def convert_document(
    filename: str | None,
    content: bytes,
    profile: str | None = None,
) -> ConversionResult:
    """Validate, convert, and analyze one uploaded document."""
    started = time.perf_counter()

    upload = validate_upload(filename, content, settings.max_file_size)
    size_bytes = len(content)

    with temp_upload(content, upload.suffix) as path:
        converter = resolve_converter(upload)
        output = converter.convert(ConversionInput(path=path, upload=upload))

    processed = process(output.markdown, profile, input_bytes=size_bytes)
    duration_ms = round((time.perf_counter() - started) * 1000)

    # Privacy-conscious telemetry: format, size, outcome — never contents.
    logger.info(
        "convert ok ext=%s bytes=%d engine=%s profile=%s duration_ms=%d "
        "quality=%d reduction=%.1f structure_warning=%s",
        upload.ext,
        size_bytes,
        converter.name,
        processed.profile,
        duration_ms,
        processed.quality.quality_score,
        processed.stats.token_reduction_pct,
        processed.quality.structure_warning,
    )

    return ConversionResult(
        filename=f"{upload.safe_stem}.md",
        original_name=upload.original_name,
        content=processed.markdown,
        format=upload.ext,
        profile=processed.profile,
        stats=processed.stats,
        quality=processed.quality,
        duration_ms=duration_ms,
    )
