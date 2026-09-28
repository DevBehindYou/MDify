import os
import sys
from pathlib import Path

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

from app.common.app_factory import create_app  # noqa: E402
from app.common.config import Settings  # noqa: E402
from app.converter import NormalConverter  # noqa: E402

SECRET = "test-secret"


@pytest.fixture(scope="session")
def converter():
    # MarkItDown setup is the slow part; share one instance across tests.
    return NormalConverter()


@pytest.fixture
def make_client(converter):
    def build(secret: str = SECRET, max_upload_bytes: int = 15 * 1024 * 1024) -> TestClient:
        settings = Settings(
            role="normal",
            instance="N1",
            shared_secret=secret,
            max_upload_bytes=max_upload_bytes,
            version="test",
        )
        return TestClient(create_app(settings, converter))

    return build


@pytest.fixture
def client(make_client):
    return make_client()


@pytest.fixture
def convert(client):
    def post(name: str, data: bytes, profile: str = "Standard", secret: str = SECRET):
        return client.post(
            "/api/v1/internal/convert",
            files={"file": (name, data)},
            data={"profile": profile, "job_id": "job-1"},
            headers={"X-Internal-Secret": secret},
        )

    return post
