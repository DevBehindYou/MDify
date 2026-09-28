import io
import os
import shutil
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

# Tests must never reach real Storage, even if a library loads the backend's
# .env (as magika does in backendN): load_dotenv never overrides a set variable.
for _name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
    os.environ[_name] = ""

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.common.app_factory import create_app  # noqa: E402
from app.common.config import Settings  # noqa: E402
from app.converter import OcrConverter  # noqa: E402

SECRET = "test-secret"
HAS_TESSERACT = bool(shutil.which("tesseract") or os.environ.get("TESSERACT_CMD"))
if os.environ.get("TESSERACT_CMD"):
    # Module-level skip checks call pytesseract before any converter exists.
    import pytesseract

    pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]


def image_bytes(fmt: str, size=(40, 20), color="white", **save_kwargs) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format=fmt, **save_kwargs)
    return buf.getvalue()


@pytest.fixture
def make_client():
    def build(secret: str = SECRET) -> TestClient:
        settings = Settings(
            role="ocr",
            instance="O1",
            shared_secret=secret,
            max_upload_bytes=10 * 1024 * 1024,
            version="test",
        )
        return TestClient(create_app(settings, OcrConverter()))

    return build


@pytest.fixture
def client(make_client):
    return make_client()


@pytest.fixture
def convert(client):
    def post(name: str, data: bytes, profile: str = "Standard"):
        return client.post(
            "/api/v1/internal/convert",
            files={"file": (name, data)},
            data={"profile": profile, "job_id": "job-o"},
            headers={"X-Internal-Secret": SECRET},
        )

    return post


def ocr_data(lines, conf=95.0):
    """image_to_data-style dict; each inner list is one block of lines."""
    data = {"text": [], "conf": [], "block_num": [], "par_num": [], "line_num": []}
    for block, block_lines in enumerate(lines, start=1):
        for line_no, line in enumerate(block_lines, start=1):
            for word in line.split():
                data["text"].append(word)
                data["conf"].append(conf)
                data["block_num"].append(block)
                data["par_num"].append(1)
                data["line_num"].append(line_no)
    return data


@pytest.fixture
def fake_ocr(monkeypatch):
    """Replaces the Tesseract calls; records every image OCR was given.

    `fake.result(image)` returns the image_to_data dict (default: a confident
    two-block read); `fake.osd` is the OSD rotation to report (None = OSD
    fails, as for images with too little text).
    """
    import pytesseract

    calls = []

    def fake_image_to_data(image, lang=None, config="", timeout=0, output_type=None):
        calls.append({"mode": image.mode, "size": image.size, "lang": lang, "config": config})
        return fake.result(image)

    def fake_image_to_osd(image, config="", output_type=None, timeout=0):
        fake.osd_calls += 1
        if fake.osd is None:
            raise pytesseract.TesseractError(1, "Too few characters. Skipping this page")
        return {"rotate": fake.osd, "orientation_conf": 5.0}

    class Fake:
        osd = 0
        osd_calls = 0

        @staticmethod
        def result(image):
            return ocr_data([["Invoice 42"], ["Total: $10"]])

    fake = Fake()
    monkeypatch.setattr(pytesseract, "image_to_data", fake_image_to_data)
    monkeypatch.setattr(pytesseract, "image_to_osd", fake_image_to_osd)
    monkeypatch.setattr(pytesseract, "get_languages", lambda config="": ["eng", "osd"])
    monkeypatch.setattr(pytesseract, "get_tesseract_version", lambda: "5.4.0-fake")
    return fake, calls
