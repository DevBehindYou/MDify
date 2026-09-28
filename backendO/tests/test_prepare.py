"""Image preparation before OCR: EXIF orientation, grayscale, sizing, and
the JPEG variants Pillow reports under another format name."""

import io

import pytest
from PIL import Image

import app.converter as converter
from app.converter import _open_checked, _prepare
from conftest import image_bytes

ORIENTATION = 0x0112


def _jpeg_with_orientation(size, orientation):
    img = Image.new("RGB", size, "white")
    # Black left edge, so the transposed result shows where it went.
    img.paste((0, 0, 0), (0, 0, 4, size[1]))
    exif = Image.Exif()
    exif[ORIENTATION] = orientation
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif, quality=95)
    return buf.getvalue()


def _mpo_bytes(size=(1200, 400)):
    first = Image.new("RGB", size, "white")
    preview = Image.new("RGB", (size[0] // 4, size[1] // 4), "white")
    buf = io.BytesIO()
    first.save(buf, "MPO", save_all=True, append_images=[preview])
    return buf.getvalue()


@pytest.mark.parametrize(
    "orientation, expected_size",
    [(1, (1200, 400)), (3, (1200, 400)), (6, (400, 1200)), (8, (400, 1200))],
)
def test_exif_orientation_is_applied(orientation, expected_size):
    img = _open_checked(_jpeg_with_orientation((1200, 400), orientation), "jpg")
    try:
        out = _prepare(img)
    finally:
        img.close()
    assert out.mode == "L"
    assert out.size == expected_size


def test_orientation_6_moves_left_edge_to_top():
    img = _open_checked(_jpeg_with_orientation((1200, 400), 6), "jpg")
    try:
        out = _prepare(img)
    finally:
        img.close()
    # EXIF 6 means "rotate 90° clockwise to view": the left edge becomes the top.
    assert out.getpixel((out.size[0] // 2, 1)) < 64
    assert out.getpixel((out.size[0] // 2, out.size[1] - 2)) > 192


def test_jpeg_decodes_straight_to_grayscale():
    img = _open_checked(image_bytes("JPEG", size=(1200, 400)), "jpg")
    try:
        _prepare(img)
        assert img.mode == "L"  # draft() switched the decoder to luminance
    finally:
        img.close()


def test_result_outlives_closing_the_source():
    # Grayscale input with no resize still has to come back as a new image.
    img = _open_checked(image_bytes("PNG", size=(1200, 400), color="white"), "png")
    img = img.convert("L")
    out = _prepare(img)
    assert out is not img
    img.close()
    assert out.getpixel((0, 0)) is not None


def test_large_image_is_downscaled_into_budget(monkeypatch):
    monkeypatch.setattr(converter, "TARGET_PIXELS", 100_000)
    img = _open_checked(image_bytes("PNG", size=(1000, 400)), "png")
    try:
        out = _prepare(img)
    finally:
        img.close()
    assert out.size[0] * out.size[1] <= 100_000
    assert out.size[0] > out.size[1]


def test_small_scan_is_upscaled():
    img = _open_checked(image_bytes("PNG", size=(300, 200)), "png")
    try:
        out = _prepare(img)
    finally:
        img.close()
    assert out.size == (600, 400)


def test_multi_image_jpeg_is_accepted_as_jpg():
    data = _mpo_bytes()
    with Image.open(io.BytesIO(data)) as probe:
        assert probe.format == "MPO"  # the case this test guards
    img = _open_checked(data, "jpg")
    try:
        out = _prepare(img)
    finally:
        img.close()
    assert out.mode == "L"
    assert out.size == (1200, 400)


def test_mpo_under_png_extension_is_still_a_mismatch():
    with pytest.raises(converter.ConversionRejected) as err:
        _open_checked(_mpo_bytes(), "png")
    assert err.value.status_code == 400
