"""Storage-backed processing (/api/v1/internal/process) against a fake
Supabase Storage (httpx.MockTransport). Real Supabase: NOT TESTED here."""

import uuid
from urllib.parse import unquote

import httpx
import pytest
from fastapi.testclient import TestClient

from app.common.app_factory import PREVIEW_CHARS, create_app
from app.common.config import Settings
from app.common.storage import StorageClient, StorageError, check_object_path

BUCKET = "mdify-pro-files"
PREFIX = f"/storage/v1/object/{BUCKET}/"
SECRET = "test-secret"


class FakeStorage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.down = False
        self.fail_writes = False
        self.requests: list[tuple[str, str]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            raise httpx.ConnectError("storage down")
        if request.headers.get("authorization") != "Bearer service-key":
            return httpx.Response(401)
        path = unquote(request.url.path)
        assert path.startswith(PREFIX), path
        key = path[len(PREFIX):]
        self.requests.append((request.method, key))
        if request.method == "GET":
            if key not in self.objects:
                return httpx.Response(400, json={"error": "not_found"})
            return httpx.Response(200, content=self.objects[key])
        if request.method == "POST":
            if self.fail_writes:
                return httpx.Response(500)
            assert request.headers["x-upsert"] == "true"
            self.objects[key] = request.content
            return httpx.Response(200, json={"Key": f"{BUCKET}/{key}"})
        return httpx.Response(405)


@pytest.fixture
def storage():
    return FakeStorage()


@pytest.fixture
def client(converter, storage):
    settings = Settings(role="normal", instance="N1", shared_secret=SECRET, max_upload_bytes=15 * 1024 * 1024, version="test")
    store = StorageClient("http://supabase.test", "service-key", BUCKET, transport=httpx.MockTransport(storage.handler))
    return TestClient(create_app(settings, converter, storage=store))


def job(ext: str = "txt"):
    jid = str(uuid.uuid4())
    return jid, f"jobs/{jid}/input/source.{ext}", f"jobs/{jid}/output/result.md"


def process(client, jid, input_path, output_path, name="notes.txt", secret=SECRET):
    return client.post(
        "/api/v1/internal/process",
        json={"job_id": jid, "input_path": input_path, "output_path": output_path, "original_filename": name},
        headers={"X-Internal-Secret": secret},
    )


def test_result_is_stored_and_response_has_no_full_body(client, storage):
    jid, src, out = job()
    storage.objects[src] = b"hello marker-storage"
    res = process(client, jid, src, out)
    assert res.status_code == 200, res.text
    body = res.json()
    assert "content" not in body
    assert body["status"] == "COMPLETED"
    assert body["output_path"] == out
    stored = storage.objects[out].decode()
    assert "marker-storage" in stored
    assert body["output_bytes"] == len(storage.objects[out])
    assert body["preview"] == stored and body["preview_truncated"] is False


def test_large_output_returns_bounded_preview(client, storage):
    jid, src, out = job()
    storage.objects[src] = ("line of text\n" * 20000).encode()
    body = process(client, jid, src, out).json()
    assert body["preview_truncated"] is True
    assert len(body["preview"]) == PREVIEW_CHARS
    assert len(storage.objects[out]) > 200_000  # full Markdown lives in Storage


def test_missing_input_is_not_retryable(client, storage):
    jid, src, out = job()
    assert process(client, jid, src, out).status_code == 409


def test_storage_outage_is_503_for_peer_failover(client, storage):
    jid, src, out = job()
    storage.objects[src] = b"x"
    storage.down = True
    assert process(client, jid, src, out).status_code == 503


def test_output_write_failure_never_reports_completed(client, storage):
    jid, src, out = job()
    storage.objects[src] = b"x"
    storage.fail_writes = True
    res = process(client, jid, src, out)
    assert res.status_code == 503
    assert out not in storage.objects


def test_paths_must_belong_to_the_job(client, storage):
    jid, _, out = job()
    other_src = f"jobs/{uuid.uuid4()}/input/source.txt"
    assert process(client, jid, other_src, out).status_code == 400


def test_unexpected_object_path_is_refused(client, storage):
    jid = str(uuid.uuid4())
    res = process(client, jid, f"jobs/{jid}/input/../../secrets.txt", f"jobs/{jid}/output/result.md")
    assert res.status_code == 409
    assert storage.requests == []


def test_invalid_bytes_from_storage_are_rejected(client, storage):
    jid, src, out = job("pdf")
    storage.objects[src] = b"not really a pdf"
    res = process(client, jid, src, out, name="report.pdf")
    assert res.status_code == 400
    assert out not in storage.objects


def test_requires_secret(client, storage):
    jid, src, out = job()
    assert process(client, jid, src, out, secret="wrong").status_code == 401


def test_storage_not_configured_is_503(converter, monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    settings = Settings(role="normal", instance="N1", shared_secret=SECRET, max_upload_bytes=1024, version="test")
    client = TestClient(create_app(settings, converter))
    jid, src, out = job()
    assert process(client, jid, src, out).status_code == 503
    assert client.get("/api/v1/ready").json()["storage_configured"] is False


@pytest.mark.parametrize(
    "path,ok",
    [
        ("jobs/123e4567-e89b-42d3-a456-426614174000/input/source.pdf", True),
        ("jobs/123e4567-e89b-42d3-a456-426614174000/output/result.md", True),
        ("jobs/123e4567-e89b-42d3-a456-426614174000/exports/x.zip", False),
        ("jobs/not-a-uuid/input/source.pdf", False),
        ("../jobs/123e4567-e89b-42d3-a456-426614174000/input/source.pdf", False),
        ("", False),
    ],
)
def test_object_path_allowlist(path, ok):
    if ok:
        assert check_object_path(path) == path
    else:
        with pytest.raises(StorageError):
            check_object_path(path)
