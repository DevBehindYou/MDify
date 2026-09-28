"""OCR pool through /api/v1/internal/process with a fake Supabase Storage.
The shared Storage pipeline is covered in depth in backendN's tests."""

import uuid
from urllib.parse import unquote

import httpx
from fastapi.testclient import TestClient

from app.common.app_factory import create_app
from app.common.config import Settings
from app.common.storage import StorageClient
from app.converter import OcrConverter
from conftest import SECRET, image_bytes


def test_image_is_read_from_and_written_to_storage(fake_ocr):
    objects = {}
    jid = str(uuid.uuid4())
    src, out = f"jobs/{jid}/input/source.png", f"jobs/{jid}/output/result.md"
    objects[src] = image_bytes("PNG")

    def handler(request: httpx.Request) -> httpx.Response:
        key = unquote(request.url.path).split("/object/mdify-pro-files/", 1)[1]
        if request.method == "GET":
            return httpx.Response(200, content=objects[key]) if key in objects else httpx.Response(404)
        objects[key] = request.content
        return httpx.Response(200, json={})

    settings = Settings(role="ocr", instance="O2", shared_secret=SECRET, max_upload_bytes=10 * 1024 * 1024, version="test")
    storage = StorageClient("http://supabase.test", "svc", "mdify-pro-files", transport=httpx.MockTransport(handler))
    client = TestClient(create_app(settings, OcrConverter(), storage=storage))

    res = client.post(
        "/api/v1/internal/process",
        json={"job_id": jid, "input_path": src, "output_path": out, "original_filename": "scan.png"},
        headers={"X-Internal-Secret": SECRET},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["backend_instance"] == "O2" and body["status"] == "COMPLETED"
    assert "Invoice 42" in objects[out].decode()
    assert "content" not in body


def test_documents_are_refused_by_ocr_pool_even_from_storage(fake_ocr):
    jid = str(uuid.uuid4())
    settings = Settings(role="ocr", instance="O1", shared_secret=SECRET, max_upload_bytes=1024, version="test")
    storage = StorageClient("http://supabase.test", "svc", "mdify-pro-files", transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    client = TestClient(create_app(settings, OcrConverter(), storage=storage))
    res = client.post(
        "/api/v1/internal/process",
        json={"job_id": jid, "input_path": f"jobs/{jid}/input/source.pdf", "output_path": f"jobs/{jid}/output/result.md", "original_filename": "report.pdf"},
        headers={"X-Internal-Secret": SECRET},
    )
    assert res.status_code == 400  # rejected before any Storage call
