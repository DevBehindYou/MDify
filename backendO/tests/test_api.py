import io

import pytest
import pytesseract
from PIL import Image, ImageDraw, ImageFont

import app.converter as ocr_module
from conftest import HAS_TESSERACT, image_bytes, ocr_data

FORMATS = [
    ("scan.png", "PNG"),
    ("scan.jpg", "JPEG"),
    ("scan.jpeg", "JPEG"),
    ("scan.webp", "WEBP"),
    ("scan.tiff", "TIFF"),
    ("scan.tif", "TIFF"),
    ("scan.bmp", "BMP"),
    ("scan.gif", "GIF"),
]


def test_health_reports_ocr_role(client):
    assert client.get("/api/v1/health").json()["role"] == "ocr"


@pytest.mark.parametrize("name,fmt", FORMATS)
def test_every_image_format_reaches_ocr(convert, fake_ocr, name, fmt):
    _, calls = fake_ocr
    res = convert(name, image_bytes(fmt))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["backend_role"] == "ocr"
    assert body["engine"] == "Tesseract (tessdata_fast)"
    assert "Invoice 42\n\nTotal: $10" in body["content"]
    assert calls[-1]["mode"] == "L"  # grayscale
    assert calls[-1]["config"] == "--oem 1 --psm 3"


def test_small_images_are_upscaled(convert, fake_ocr):
    _, calls = fake_ocr
    convert("tiny.png", image_bytes("PNG", size=(100, 50)))
    assert calls[-1]["size"] == (200, 100)


def test_documents_are_not_accepted_by_ocr_pool(convert):
    res = convert("report.pdf", b"%PDF-1.4")
    assert res.status_code == 400
    assert "ocr pool" in res.json()["detail"]


def test_extension_signature_mismatch_rejected(convert):
    res = convert("photo.png", image_bytes("JPEG"))
    assert res.status_code == 400
    assert "does not match" in res.json()["detail"]


def test_truncated_image_rejected(convert):
    assert convert("photo.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 16).status_code == 400


def test_side_limit_enforced_before_decoding(convert, fake_ocr):
    _, calls = fake_ocr
    res = convert("strip.png", image_bytes("PNG", size=(ocr_module.MAX_SIDE + 1, 1)))
    assert res.status_code == 413
    assert calls == []


def test_pixel_limit_enforced(convert, fake_ocr, monkeypatch):
    monkeypatch.setattr(ocr_module, "MAX_PIXELS", 100)
    res = convert("big.png", image_bytes("PNG", size=(20, 20)))
    assert res.status_code == 413
    assert "OCR limit" in res.json()["detail"]


def test_decompression_bomb_rejected(convert, monkeypatch):
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 10)
    assert convert("bomb.png", image_bytes("PNG", size=(40, 20))).status_code == 413


def test_webp_has_its_own_pixel_cap(convert, fake_ocr, monkeypatch):
    _, calls = fake_ocr
    monkeypatch.setitem(ocr_module.MAX_PIXELS_BY_FORMAT, "WEBP", 100)
    res = convert("photo.webp", image_bytes("WEBP", size=(20, 20)))
    assert res.status_code == 413
    assert "limit for WebP is" in res.json()["detail"]
    assert calls == []
    # Other formats keep the general cap.
    assert convert("photo.png", image_bytes("PNG", size=(20, 20))).status_code == 200


def test_webp_cap_defaults_to_12_mp():
    assert ocr_module.MAX_PIXELS_BY_FORMAT["WEBP"] == 12_000_000


def test_image_over_10_mb_rejected_before_decoding(convert, fake_ocr):
    _, calls = fake_ocr
    data = image_bytes("PNG", size=(40, 20))
    res = convert("huge.png", data + b"\x00" * (10 * 1024 * 1024 + 1 - len(data)))
    assert res.status_code == 413
    assert calls == []


def test_upload_limit_defaults_per_role(monkeypatch):
    from app.common.config import load_settings

    monkeypatch.delenv("MAX_UPLOAD_BYTES", raising=False)
    monkeypatch.delenv("BACKEND_ROLE", raising=False)
    assert load_settings("ocr").max_upload_bytes == 10 * 1024 * 1024
    assert load_settings("normal").max_upload_bytes == 15 * 1024 * 1024
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "1234")
    assert load_settings("ocr").max_upload_bytes == 1234


def test_multi_frame_gif_warns_first_frame_only(convert, fake_ocr):
    buf = io.BytesIO()
    frames = [Image.new("RGB", (30, 30), c) for c in ("white", "black")]
    frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:])
    res = convert("anim.gif", buf.getvalue())
    assert res.status_code == 200
    assert res.json()["warning"] == "first-frame-only"


def test_blank_image_reports_no_text(convert, fake_ocr):
    fake, _ = fake_ocr
    fake.result = lambda image: ocr_data([])
    res = convert("blank.png", image_bytes("PNG"))
    assert res.status_code == 200
    assert res.json()["warning"] == "no-text-detected"


def test_missing_tesseract_is_503_so_dispatcher_fails_over(convert, monkeypatch):
    def missing(*args, **kwargs):
        raise pytesseract.TesseractNotFoundError()

    monkeypatch.setattr(pytesseract, "image_to_data", missing)
    assert convert("scan.png", image_bytes("PNG")).status_code == 503


def test_ocr_timeout_is_422_not_retried(convert, monkeypatch):
    def slow(*args, **kwargs):
        raise RuntimeError("Tesseract process timeout")

    monkeypatch.setattr(pytesseract, "image_to_data", slow)
    assert convert("scan.png", image_bytes("PNG")).status_code == 422


def test_ready_reflects_tesseract_presence(client):
    res = client.get("/api/v1/ready")
    assert res.status_code == (200 if HAS_TESSERACT else 503)


@pytest.mark.skipif(not HAS_TESSERACT, reason="tesseract binary not installed")
def test_real_ocr_reads_rendered_text(convert):
    img = Image.new("RGB", (900, 200), "white")
    ImageDraw.Draw(img).text((30, 60), "HELLO OCR 2026", fill="black", font=ImageFont.load_default(size=64))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    res = convert("hello.png", buf.getvalue())
    assert res.status_code == 200, res.text
    assert "HELLO OCR" in res.json()["content"].upper()
