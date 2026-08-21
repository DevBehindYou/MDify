"""Format regression suite — every advertised format converts with the
structure we claim. Catches dependency upgrades silently degrading quality.

Binary formats needing a writer lib are skipped (not failed) when the lib is
absent, so the suite still runs in a minimal environment.
"""

from __future__ import annotations

import pytest

from app.services.conversion_service import convert_document
from tests import fixtures


def _convert(name_bytes):
    filename, data = name_bytes
    return filename, convert_document(filename, data)


# ── Text-family: always available ────────────────────────────────────────────
# (fixture, ext, min_words, expect_heading, expect_table, expect_link)
TEXT_CASES = [
    (fixtures.TXT, "txt", 5, True, False, False),
    (fixtures.MD, "md", 4, True, False, False),
    (fixtures.CSV, "csv", 4, False, True, False),
    (fixtures.TSV, "tsv", 2, False, False, False),
    (fixtures.JSON, "json", 1, False, False, False),
    (fixtures.XML, "xml", 1, False, False, False),
    (fixtures.HTML, "html", 3, True, True, True),
    (fixtures.PDF, "pdf", 2, False, False, False),
]


@pytest.mark.parametrize("case", TEXT_CASES, ids=[c[1] for c in TEXT_CASES])
def test_text_formats(case):
    fixture, ext, min_words, want_head, want_table, want_link = case
    _, r = _convert(fixture)
    assert r.format == ext
    assert r.stats.word_count >= min_words, r.content[:200]
    q = r.quality
    if want_head:
        assert q.headings >= 1, r.content[:200]
    if want_table:
        assert q.tables >= 1, r.content[:200]
    if want_link:
        assert q.links >= 1, r.content[:200]


# ── Binary formats: skip if writer lib absent ────────────────────────────────
def test_docx():
    pytest.importorskip("docx")
    _, r = _convert(fixtures.docx_bytes())
    assert r.format == "docx"
    assert r.quality.headings >= 1
    assert r.quality.tables >= 1
    assert r.stats.word_count >= 3


def test_pptx():
    pytest.importorskip("pptx")
    _, r = _convert(fixtures.pptx_bytes())
    assert r.format == "pptx"
    assert r.stats.word_count >= 2


def test_xlsx():
    pytest.importorskip("openpyxl")
    _, r = _convert(fixtures.xlsx_bytes())
    assert r.format == "xlsx"
    assert r.quality.tables >= 1
    assert r.stats.word_count >= 3


def test_png_metadata():
    pytest.importorskip("PIL")
    _, r = _convert(fixtures.png_bytes())
    assert r.format == "png"
    # No OCR on this tier — output is the Pillow metadata table.
    assert r.stats.word_count >= 1
    assert "png" in r.content.lower() or "image" in r.content.lower()
