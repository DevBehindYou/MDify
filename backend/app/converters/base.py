"""Converter interface — the adapter seam.

Every conversion engine (MarkItDown today; an OCR/layout engine or a
chunk-aware converter tomorrow) implements ``Converter``. The pipeline talks
only to this protocol, so adding an engine never touches the pipeline or the
API layer — it registers a new adapter.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from app.security.validation import ValidatedUpload


@dataclass
class ConversionInput:
    path: str  # path to the validated temp file
    upload: ValidatedUpload


@dataclass
class ConversionOutput:
    markdown: str


@runtime_checkable
class Converter(Protocol):
    name: str

    def supports(self, upload: ValidatedUpload) -> bool:
        """Whether this converter can handle the given upload."""
        ...

    def convert(self, data: ConversionInput) -> ConversionOutput:
        """Produce Markdown or raise ``AppError`` on failure."""
        ...
