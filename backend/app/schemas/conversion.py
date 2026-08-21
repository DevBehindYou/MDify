"""Response schemas — the OpenAPI source of truth for conversion output."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["info", "warning", "error"]


class QualityIssue(BaseModel):
    """One problem found by the Markdown quality engine."""

    type: str = Field(..., description="Stable slug, e.g. 'duplicate_heading'.")
    severity: Severity = "warning"
    message: str
    line: int | None = Field(None, description="1-indexed line, when locatable.")


class QualitySummary(BaseModel):
    """Structural read of the produced Markdown plus a quality score."""

    quality_score: int = Field(
        100,
        ge=0,
        le=100,
        description="Heuristic 0-100. Not a universal measure; see docs for how "
        "it is computed (penalties per detected issue).",
    )
    headings: int = Field(0, description="Number of ATX headings (#..######).")
    tables: int = Field(0, description="Number of Markdown tables detected.")
    links: int = Field(0, description="Number of Markdown links detected.")
    images: int = Field(0, description="Number of Markdown image references.")
    code_blocks: int = Field(0, description="Number of fenced code blocks.")
    structure_warning: bool = Field(
        False,
        description="True when output looks like a low-structure wall of text "
        "(e.g. a scanned/image-only PDF) and may have lost structure.",
    )
    issues: list[QualityIssue] = Field(default_factory=list)


class DocumentStats(BaseModel):
    char_count: int = 0
    word_count: int = 0
    line_count: int = 0
    input_bytes: int = 0
    output_bytes: int = 0
    # Estimate only. ~4 chars/token, cl100k_base-ish. Labelled, never exact.
    tokenizer: str = "cl100k_base (~4 chars/token estimate)"
    estimated_tokens: int = Field(0, description="Estimated tokens of the output.")
    estimated_tokens_source: int = Field(
        0, description="Estimated tokens of the raw extraction (pre-optimization)."
    )
    token_reduction_pct: float = Field(
        0.0,
        description="Estimated %% token reduction vs raw extraction. Estimate; "
        "actual depends on the model tokenizer.",
    )


class ConversionResult(BaseModel):
    filename: str = Field(..., description="Suggested output filename (.md).")
    original_name: str = Field(..., description="Original uploaded filename.")
    content: str = Field(..., description="The converted Markdown.")
    format: str = Field(..., description="Detected input format (extension).")
    profile: str = Field("standard", description="Processing profile applied.")
    stats: DocumentStats
    quality: QualitySummary
    duration_ms: int = Field(..., description="Server-side processing time.")


class ProfileInfo(BaseModel):
    id: str
    label: str
    description: str


class FormatInfo(BaseModel):
    ext: str
    label: str
    category: str


class HealthResponse(BaseModel):
    status: str = "ok"
    markitdown: bool
    version: str


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
