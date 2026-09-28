"""Orientation handling: unit tests with a fake Tesseract, plus real-OCR
regression fixtures at 0°/90°/180°/270° (skipped without tesseract + osd)."""

import io
import re

import pytest
from PIL import Image, ImageDraw, ImageFont

from app.converter import OcrConverter, _text_from_data
from conftest import HAS_TESSERACT, image_bytes, ocr_data

# ── text reconstruction ─────────────────────────────────────────────────────


def test_text_from_data_rebuilds_lines_and_blocks():
    data = ocr_data([["Invoice 42", "Due today"], ["Total: $10"]], conf=80)
    text, conf, words = _text_from_data(data)
    assert text == "Invoice 42\nDue today\n\nTotal: $10"
    assert conf == 80
    assert words == 6


def test_text_from_data_ignores_empty_and_negative_conf():
    data = {"text": ["", "  ", "word"], "conf": [-1, -1, 90], "block_num": [1, 1, 1], "par_num": [1, 1, 1], "line_num": [1, 1, 1]}
    assert _text_from_data(data) == ("word", 90.0, 1)


# ── orientation decisions (fake Tesseract) ──────────────────────────────────


def _by_width(narrow, wide):
    """Fake OCR result chosen by image shape, to tell orientations apart."""
    return lambda image: narrow if image.size[0] < image.size[1] else wide


def test_confident_upright_read_skips_osd(convert, fake_ocr):
    fake, calls = fake_ocr
    res = convert("scan.png", image_bytes("PNG", size=(1200, 400)))
    assert res.status_code == 200
    assert fake.osd_calls == 0
    assert len(calls) == 1
    assert res.json().get("warning") is None


def test_weak_read_applies_osd_rotation_when_it_reads_better(convert, fake_ocr):
    fake, calls = fake_ocr
    fake.osd = 90
    # Portrait input (rotated page) reads badly; the rotated-upright landscape reads well.
    fake.result = _by_width(ocr_data([["x7 ;; qz"]], conf=30), ocr_data([["Invoice 42 total"]], conf=95))
    res = convert("page.png", image_bytes("PNG", size=(400, 1200)))
    assert res.status_code == 200
    assert fake.osd_calls == 1
    assert len(calls) == 2
    assert "Invoice 42 total" in res.json()["content"]
    assert res.json()["warning"] == "auto-rotated-90"


def test_osd_proposal_is_rejected_when_it_reads_worse(convert, fake_ocr):
    fake, calls = fake_ocr
    fake.osd = 180
    fake.result = lambda image: ocr_data([["faint text here"]], conf=60)
    res = convert("faint.png", image_bytes("PNG", size=(1200, 400)))
    assert res.status_code == 200
    assert len(calls) == 2  # upright + proposed 180
    assert res.json().get("warning") is None


def test_osd_failure_on_weak_read_tries_all_orientations(convert, fake_ocr):
    fake, calls = fake_ocr
    fake.osd = None  # "Too few characters"
    fake.result = lambda image: ocr_data([["??"]], conf=20)
    res = convert("tiny.png", image_bytes("PNG", size=(1200, 400)))
    assert res.status_code == 200
    assert len(calls) == 4  # upright + 90 + 180 + 270


def test_osd_saying_upright_keeps_weak_read(convert, fake_ocr):
    fake, calls = fake_ocr
    fake.osd = 0
    fake.result = lambda image: ocr_data([["noisy but upright"]], conf=60)
    res = convert("noisy.png", image_bytes("PNG", size=(1200, 400)))
    assert res.status_code == 200
    assert len(calls) == 1
    assert "noisy but upright" in res.json()["content"]


def test_ready_probe_is_cached(monkeypatch):
    import pytesseract

    probes = []
    monkeypatch.setattr(pytesseract, "get_tesseract_version", lambda: probes.append(1) or "5.x")
    monkeypatch.setattr(pytesseract, "get_languages", lambda config="": ["eng", "osd"])
    conv = OcrConverter()
    assert conv.ready()[0] and conv.ready()[0] and conv.ready()[0]
    assert len(probes) == 1


# ── real OCR regression fixtures ────────────────────────────────────────────


def _has_osd() -> bool:
    if not HAS_TESSERACT:
        return False
    import pytesseract

    try:
        return "osd" in pytesseract.get_languages(config="")
    except Exception:
        return False


WORD = re.compile(r"[a-z0-9]+")


def _recall(truth: str, text: str) -> float:
    want = WORD.findall(truth.lower())
    have = set(WORD.findall(text.lower()))
    return sum(w in have for w in want) / len(want)


def _page(size, lines, px):
    try:
        font = ImageFont.truetype("arial.ttf", px)
    except OSError:
        font = ImageFont.load_default(size=px)
    img = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(img)
    y = px
    for line in lines:
        draw.text((px, y), line, fill="black", font=font)
        y += int(px * 1.6)
    return img


FIXTURES = {
    "receipt": (["Invoice 4821 total due 1250 USD", "Customer Ada Lovelace London"], (900, 260), 34),
    "page": (["The quick brown fox jumps over the lazy dog near the river bank today."] * 12, (1200, 900), 30),
}


@pytest.mark.skipif(not _has_osd(), reason="tesseract with osd.traineddata not available")
@pytest.mark.parametrize("fixture", sorted(FIXTURES))
@pytest.mark.parametrize("angle", [0, 90, 180, 270])
def test_real_ocr_reads_every_orientation(convert, fixture, angle):
    lines, size, px = FIXTURES[fixture]
    buf = io.BytesIO()
    _page(size, lines, px).rotate(angle, expand=True, fillcolor="white").save(buf, format="PNG")
    res = convert(f"{fixture}-{angle}.png", buf.getvalue())
    assert res.status_code == 200, res.text
    assert _recall(" ".join(lines), res.json()["content"]) >= 0.9
