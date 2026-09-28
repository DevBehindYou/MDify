"""Opt-in PDF fast path: identical output where it applies, upstream otherwise."""

import io

import pytest

from app import pdf_fast_path
from fixtures import make_pdf, make_table_pdf


def upstream(converter, data: bytes) -> str:
    info = converter._stream_info(extension=".pdf", filename="x.pdf", mimetype="application/pdf")
    result = converter._md.convert_stream(io.BytesIO(data), stream_info=info)
    return (result.markdown or "").strip()


def test_disabled_by_default():
    assert pdf_fast_path.SAMPLE_PAGES == 0
    assert pdf_fast_path.try_convert(make_pdf("hello")) is None


def test_text_pdf_matches_upstream(converter):
    data = make_table_pdf(6, table_pages=set())
    fast = pdf_fast_path.try_convert(data, sample_pages=3)
    assert fast is not None
    assert fast == upstream(converter, data)


def test_table_in_sample_defers_to_upstream(converter):
    data = make_table_pdf(6, table_pages={1})
    assert pdf_fast_path.try_convert(data, sample_pages=3) is None
    assert "| " in upstream(converter, data)  # upstream keeps the table


def test_table_after_sample_is_the_documented_tradeoff(converter):
    data = make_table_pdf(6, table_pages={5})
    fast = pdf_fast_path.try_convert(data, sample_pages=3)
    assert fast is not None
    assert "marker-table-5" in fast  # text is kept…
    assert "| " not in fast  # …but table formatting is not
    assert "| " in upstream(converter, data)


@pytest.mark.parametrize("pages", [0, -1])
def test_non_positive_sample_disables(pages):
    assert pdf_fast_path.try_convert(make_table_pdf(2, set()), sample_pages=pages) is None


def test_endpoint_uses_fast_path_when_enabled(convert, monkeypatch):
    monkeypatch.setattr(pdf_fast_path, "SAMPLE_PAGES", 3)
    res = convert("report.pdf", make_table_pdf(4, table_pages=set()))
    assert res.status_code == 200, res.text
    assert "marker-page-3" in res.json()["content"]
