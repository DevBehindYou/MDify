"""Converter registry — resolves an upload to the engine that handles it.

Today there is one engine (MarkItDown). When a specialized engine is added
(e.g. an OCR/layout converter for scanned PDFs), register it *before*
MarkItDown so a more specific converter wins; MarkItDown stays the universal
fallback. No other layer changes.
"""

from __future__ import annotations

from app.converters.base import Converter
from app.converters.markitdown_adapter import MarkItDownConverter
from app.core.errors import conversion_failed
from app.security.validation import ValidatedUpload

# Order matters: first converter that ``supports`` the upload wins.
_CONVERTERS: list[Converter] = [
    MarkItDownConverter(),
]


def resolve_converter(upload: ValidatedUpload) -> Converter:
    for converter in _CONVERTERS:
        if converter.supports(upload):
            return converter
    raise conversion_failed("No conversion engine is available for this file type.")
