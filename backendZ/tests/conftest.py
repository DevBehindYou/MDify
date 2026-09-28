import os
import sys
from pathlib import Path
from urllib.parse import unquote

import httpx
import pytest
from fastapi.testclient import TestClient

# magika (a MarkItDown dependency) calls load_dotenv() on import, which finds
# the backend's .env with the real Supabase keys. Tests must never reach real
# Storage: empty values win because load_dotenv never overrides a set variable.
for _name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
    os.environ[_name] = ""

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from app import archive_tasks  # noqa: E402
from app.common.app_factory import create_app  # noqa: E402
from app.common.config import Settings  # noqa: E402
from app.common.storage import StorageClient  # noqa: E402
from app.converter import ArchiveConverter  # noqa: E402

SECRET = "test-secret"
BUCKET = "mdify-pro-files"
PREFIX = f"/storage/v1/object/{BUCKET}/"


class FakeStorage:
    """Supabase Storage object endpoints over httpx.MockTransport."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.types: dict[str, str] = {}

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = unquote(request.url.path)
        assert path.startswith(PREFIX), path
        key = path[len(PREFIX):]
        if request.method == "GET":
            if key not in self.objects:
                return httpx.Response(400, json={"error": "not_found"})
            return httpx.Response(200, content=self.objects[key])
        if request.method == "POST":
            self.objects[key] = request.content
            self.types[key] = request.headers.get("content-type", "")
            return httpx.Response(200, json={"Key": f"{BUCKET}/{key}"})
        return httpx.Response(405)


@pytest.fixture(scope="session")
def converter():
    return ArchiveConverter()


@pytest.fixture
def storage():
    return FakeStorage()


@pytest.fixture
def client(converter, storage):
    settings = Settings(role="archive", instance="Z1", shared_secret=SECRET, max_upload_bytes=15 * 1024 * 1024, version="test")
    store = StorageClient("http://supabase.test", "service-key", BUCKET, transport=httpx.MockTransport(storage.handler))
    app = create_app(settings, converter, storage=store)
    archive_tasks.register(app)
    return TestClient(app)
