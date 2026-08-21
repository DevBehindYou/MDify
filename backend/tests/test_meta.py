"""API tests for profiles/formats and profile-aware conversion."""

from __future__ import annotations

import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_list_profiles():
    res = client.get("/api/v1/profiles")
    assert res.status_code == 200
    ids = {p["id"] for p in res.json()}
    assert {"standard", "clean", "compact", "rag_ready"} <= ids


def test_list_formats():
    res = client.get("/api/v1/formats")
    assert res.status_code == 200
    exts = {f["ext"] for f in res.json()}
    assert {"pdf", "docx", "png"} <= exts


def test_convert_with_rag_ready_profile():
    body = b"# Title\n\n<div>junk</div>\n\nHello.\n"
    files = {"file": ("n.md", io.BytesIO(body), "text/markdown")}
    res = client.post("/api/v1/convert", files=files, data={"profile": "rag_ready"})
    assert res.status_code == 200, res.text
    j = res.json()
    assert j["profile"] == "rag_ready"
    assert "<div>" not in j["content"]
    assert "quality_score" in j["quality"]
    assert "token_reduction_pct" in j["stats"]


def test_convert_default_profile_standard():
    files = {"file": ("n.txt", io.BytesIO(b"# T\n\nhi\n"), "text/plain")}
    res = client.post("/api/v1/convert", files=files)
    assert res.json()["profile"] == "standard"
