"""API-level tests using FastAPI's TestClient."""

from __future__ import annotations

import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_v1():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "markitdown" in body
    assert "version" in body


def test_health_legacy_alias():
    assert client.get("/health").status_code == 200


def test_ready():
    assert client.get("/api/v1/ready").json() == {"ready": True}


def test_convert_text_file():
    files = {"file": ("notes.txt", io.BytesIO(b"# Title\n\nHello."), "text/plain")}
    res = client.post("/api/v1/convert", files=files)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["format"] == "txt"
    assert body["filename"] == "notes.md"
    assert "Hello" in body["content"]
    assert body["stats"]["word_count"] >= 1
    assert "quality" in body


def test_convert_unsupported_returns_typed_error():
    files = {"file": ("x.exe", io.BytesIO(b"MZbinary"), "application/octet-stream")}
    res = client.post("/api/v1/convert", files=files)
    assert res.status_code == 415
    assert res.json()["error"]["code"] == "UNSUPPORTED_FORMAT"


def test_convert_empty_returns_typed_error():
    files = {"file": ("empty.txt", io.BytesIO(b""), "text/plain")}
    res = client.post("/api/v1/convert", files=files)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_FILE"


def test_convert_mismatched_magic_bytes():
    files = {"file": ("fake.pdf", io.BytesIO(b"not a pdf at all"), "application/pdf")}
    res = client.post("/api/v1/convert", files=files)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_FILE"
