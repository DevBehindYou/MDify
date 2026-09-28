"""Optional fast path for text PDFs (off by default).

MarkItDown 0.1.8 runs a pdfplumber pass over every page to find form/table
pages. When it finds none, it discards that work and parses the whole file
again with pdfminer. On the benchmark corpus (tests/load/pdf_xlsx_bench.py)
that detection pass took 60–70 % of the conversion time of text PDFs.

With PDF_FAST_SAMPLE_PAGES=N (N > 0), only the first N pages go through the
form detector. If none is form-like, the file is parsed once with pdfminer,
giving the same Markdown upstream would. If one is, upstream MarkItDown runs.

Trade-off, measured: a PDF whose only table sits after page N loses its table
formatting (the text is kept). This is why the default is off.

Uses MarkItDown private helpers; if they move in a future version the fast
path disables itself and upstream conversion is used.
"""

from __future__ import annotations

import io
import logging
import os
import re

logger = logging.getLogger("mdify.pdf")

SAMPLE_PAGES = int(os.environ.get("PDF_FAST_SAMPLE_PAGES", "0") or 0)

try:  # pragma: no cover - import guard
    import pdfminer.high_level
    import pdfplumber
    from markitdown.converters._pdf_converter import (
        _extract_form_content_from_words,
        _merge_partial_numbering_lines,
    )

    AVAILABLE = True
except Exception as err:  # noqa: BLE001
    logger.warning("PDF fast path unavailable, using upstream only: %s", err)
    AVAILABLE = False


def _normalize(text: str) -> str:
    # Same whitespace normalization MarkItDown applies to converter output.
    text = "\n".join(line.rstrip() for line in re.split(r"\r?\n", text))
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _sample_has_form_pages(data: bytes, pages: int) -> bool:
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for idx, page in enumerate(pdf.pages):
            if idx >= pages:
                return False
            try:
                if _extract_form_content_from_words(page) is not None:
                    return True
            finally:
                page.close()
    return False


def try_convert(data: bytes, sample_pages: int | None = None) -> str | None:
    """Markdown for a text PDF, or None when upstream conversion should run."""
    pages = SAMPLE_PAGES if sample_pages is None else sample_pages
    if pages <= 0 or not AVAILABLE:
        return None
    try:
        if _sample_has_form_pages(data, pages):
            return None
        return _normalize(_merge_partial_numbering_lines(pdfminer.high_level.extract_text(io.BytesIO(data))))
    except Exception:  # noqa: BLE001 - any surprise: let upstream handle it
        logger.exception("PDF fast path failed; falling back to upstream")
        return None
