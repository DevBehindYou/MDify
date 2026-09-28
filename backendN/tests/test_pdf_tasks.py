"""Scanned-page PDF tasks (app/pdf_tasks.py) with real generated PDFs and a
fake Supabase Storage."""

import io
import uuid

import httpx
import pypdfium2 as pdfium
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

import app.pdf_tasks as pdf_tasks
from app.common.app_factory import create_app
from app.common.config import Settings
from app.common.storage import StorageClient
from fixtures import make_pdf
from test_storage_process import BUCKET, SECRET, FakeStorage

HEADERS = {"X-Internal-Secret": SECRET}


def scanned_page_pdf() -> bytes:
    """One image-only page, like a scanner produces: no text layer at all."""
    img = Image.new("L", (1275, 1650), 255)
    ImageDraw.Draw(img).text((100, 100), "Scanned invoice 42", fill=0)
    buf = io.BytesIO()
    img.save(buf, "PDF", resolution=150)
    return buf.getvalue()


def combine(*pdfs: bytes) -> bytes:
    out = pdfium.PdfDocument.new()
    for data in pdfs:
        src = pdfium.PdfDocument(data)
        out.import_pages(src)
        src.close()
    buf = io.BytesIO()
    out.save(buf)
    out.close()
    return buf.getvalue()


MIXED = combine(make_pdf("Native page one"), scanned_page_pdf(), make_pdf("Native page three"))


@pytest.fixture
def storage():
    return FakeStorage()


@pytest.fixture
def client(converter, storage):
    settings = Settings(role="normal", instance="N1", shared_secret=SECRET, max_upload_bytes=15 * 1024 * 1024, version="test")
    store = StorageClient("http://supabase.test", "service-key", BUCKET, transport=httpx.MockTransport(storage.handler))
    app = create_app(settings, converter, storage=store)
    pdf_tasks.register(app)
    return TestClient(app)


def job_paths():
    job = str(uuid.uuid4())
    return job, f"jobs/{job}/input/source.pdf", f"jobs/{job}/output/result.md"


def test_pages_are_classified_and_grouped():
    pdf = pdfium.PdfDocument(MIXED)
    try:
        pages = pdf_tasks.classify_pages(pdf)
    finally:
        pdf.close()
    assert [p.kind for p in pages] == ["native", "scan", "native"]
    assert pages[1].image_coverage > 0.9 and pages[1].chars == 0
    assert pdf_tasks.page_runs(pages) == [("native", 1, 1), ("scan", 2, 2), ("native", 3, 3)]


def test_consecutive_text_pages_form_one_run():
    pages = [pdf_tasks.PageInfo(n, 500, 0.0) for n in (1, 2, 3)] + [pdf_tasks.PageInfo(4, 0, 0.0)]
    assert pdf_tasks.page_runs(pages) == [("native", 1, 4)]


def test_text_pdf_is_converted_in_one_pass(client, storage):
    job, src, out = job_paths()
    storage.objects[src] = make_pdf("Quarterly numbers")
    res = client.post("/api/v1/internal/pdf/analyze", headers=HEADERS, json={
        "job_id": job, "input_path": src, "output_path": out, "original_filename": "q3.pdf",
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["mode"] == "single"
    assert body["outputs"][0]["path"] == out
    text = storage.objects[out].decode()
    assert text.startswith("# Q3") and "Quarterly numbers" in text


def test_mixed_pdf_splits_into_text_pieces_and_page_images(client, storage):
    job, src, out = job_paths()
    storage.objects[src] = MIXED
    res = client.post("/api/v1/internal/pdf/analyze", headers=HEADERS, json={
        "job_id": job, "input_path": src, "output_path": out, "original_filename": "mixed.pdf",
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["mode"] == "split"
    assert body["pages"] == 3
    assert [(s["page_from"], s["page_to"]) for s in body["segments"]] == [(1, 1), (3, 3)]
    assert [s["page"] for s in body["scans"]] == [2]
    assert out not in storage.objects, "nothing final is written before the merge"

    scan = body["scans"][0]
    png = Image.open(io.BytesIO(storage.objects[scan["input_path"]]))
    assert png.mode == "L" and png.format == "PNG"
    assert png.size[0] * png.size[1] <= pdf_tasks.RENDER_MAX_PIXELS
    assert scan["input_path"].startswith(f"jobs/{job}/materialized/")

    first = storage.objects[body["segments"][0]["output_path"]].decode()
    assert "Native page one" in first and "Little or no extractable text" not in first


def test_scanned_pages_over_the_limit_are_skipped_with_a_note(client, storage, monkeypatch):
    monkeypatch.setattr(pdf_tasks, "MAX_OCR_PAGES", 0)
    job, src, out = job_paths()
    storage.objects[src] = MIXED
    body = client.post("/api/v1/internal/pdf/analyze", headers=HEADERS, json={
        "job_id": job, "input_path": src, "output_path": out, "original_filename": "mixed.pdf",
    }).json()
    assert body["scans"] == []
    assert body["skipped_pages"] == [2]


def test_merge_orders_pieces_applies_profile_and_notes_failed_pages(client, storage):
    job, _src, out = job_paths()
    p1, p2, p3 = (f"jobs/{job}/nodes/{n}/result.md" for n in ("a", "b", "c"))
    storage.objects[p1] = b"Native text one\n"
    storage.objects[p3] = b"Native text three\n"
    # p2 (the OCR page) is missing: its recognition failed.
    res = client.post("/api/v1/internal/pdf/merge", headers=HEADERS, json={
        "job_id": job, "output_path": out, "original_filename": "mixed.pdf", "profile": "Clean",
        "pages": 3, "source_bytes": 4096,
        "parts": [
            {"kind": "native", "page_from": 3, "page_to": 3, "path": p3},
            {"kind": "native", "page_from": 1, "page_to": 1, "path": p1},
            {"kind": "ocr", "page_from": 2, "page_to": 2, "path": p2},
        ],
    })
    assert res.status_code == 200, res.text
    text = storage.objects[out].decode()
    assert text.index("Native text one") < text.index("Page 2: no text could be recognised") < text.index("Native text three")
    assert text.startswith("# Mixed")
    assert "**Source:**" not in text, "Clean profile drops the source line"
    assert res.json()["warnings"] == ["ocr-failed-pages:2"]
    assert res.json()["engine"] == "MarkItDown + Tesseract"


def test_paths_outside_the_job_are_refused(client, storage):
    job, src, _out = job_paths()
    other = f"jobs/{uuid.uuid4()}/output/result.md"
    res = client.post("/api/v1/internal/pdf/analyze", headers=HEADERS, json={
        "job_id": job, "input_path": src, "output_path": other, "original_filename": "a.pdf",
    })
    assert res.status_code == 400
    res = client.post("/api/v1/internal/pdf/merge", headers=HEADERS, json={
        "job_id": job, "output_path": f"jobs/{job}/output/result.md", "original_filename": "a.pdf",
        "parts": [{"kind": "native", "page_from": 1, "page_to": 1, "path": other}],
    })
    assert res.status_code == 400


def test_bad_pdf_is_a_client_error_not_a_crash(client, storage):
    job, src, out = job_paths()
    storage.objects[src] = b"%PDF-1.4\n garbage"
    res = client.post("/api/v1/internal/pdf/analyze", headers=HEADERS, json={
        "job_id": job, "input_path": src, "output_path": out, "original_filename": "a.pdf",
    })
    assert res.status_code == 422


def test_requires_the_internal_secret(client):
    job, src, out = job_paths()
    res = client.post("/api/v1/internal/pdf/analyze", json={
        "job_id": job, "input_path": src, "output_path": out, "original_filename": "a.pdf",
    })
    assert res.status_code == 401


def test_raw_process_returns_plain_text(client, storage):
    job, _src, _out = job_paths()
    src = f"jobs/{job}/input/source.txt"
    out = f"jobs/{job}/nodes/n1/result.md"
    storage.objects[src] = b"just words"
    res = client.post("/api/v1/internal/process", headers=HEADERS, json={
        "job_id": job, "input_path": src, "output_path": out, "original_filename": "a.txt", "raw": True,
    })
    assert res.status_code == 200, res.text
    assert storage.objects[out].decode() == "just words\n"
