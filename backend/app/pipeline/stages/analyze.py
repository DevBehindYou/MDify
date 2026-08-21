"""Analysis stage — document statistics and structural counts.

Cheap regex/counting passes over the final Markdown. Token figures are
explicit estimates (labelled with the tokenizer assumption), never exact.
"""

from __future__ import annotations

import re

from app.schemas.conversion import DocumentStats

_HEADING = re.compile(r"^#{1,6}\s+\S", re.MULTILINE)
_TABLE_ROW = re.compile(r"^\|.*\|\s*$", re.MULTILINE)
_SEP_ROW = re.compile(r"^\|[\s:|-]+\|\s*$", re.MULTILINE)
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]+\)")
_LINK = re.compile(r"(?<!!)\[[^\]]*\]\([^)]+\)")
_CODE_FENCE = re.compile(r"^```", re.MULTILINE)

_CHARS_PER_TOKEN = 4


def est_tokens(text: str) -> int:
    return round(len(text) / _CHARS_PER_TOKEN)


def compute_stats(final_md: str, raw_md: str, input_bytes: int) -> DocumentStats:
    final_tokens = est_tokens(final_md)
    source_tokens = est_tokens(raw_md)
    reduction = 0.0
    if source_tokens > 0:
        reduction = max(0.0, round((source_tokens - final_tokens) / source_tokens * 100, 1))
    return DocumentStats(
        char_count=len(final_md),
        word_count=len(final_md.split()),
        line_count=final_md.count("\n") + (1 if final_md else 0),
        input_bytes=input_bytes,
        output_bytes=len(final_md.encode("utf-8")),
        estimated_tokens=final_tokens,
        estimated_tokens_source=source_tokens,
        token_reduction_pct=reduction,
    )


def analyze_counts(markdown: str) -> dict:
    headings = len(_HEADING.findall(markdown))
    tables = len(_SEP_ROW.findall(markdown))
    if tables == 0 and len(_TABLE_ROW.findall(markdown)) >= 2:
        tables = 1
    images = len(_IMAGE.findall(markdown))
    links = len(_LINK.findall(markdown))
    code_blocks = len(_CODE_FENCE.findall(markdown)) // 2
    word_count = len(markdown.split())
    structure_warning = word_count > 400 and headings == 0 and tables == 0
    return {
        "headings": headings,
        "tables": tables,
        "links": links,
        "images": images,
        "code_blocks": code_blocks,
        "structure_warning": structure_warning,
    }
