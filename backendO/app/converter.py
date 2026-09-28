"""OCR-pool converter: images → Markdown with Tesseract (tessdata_fast).

Pipeline: header-only dimension check → grayscale (JPEG: decoded as such) →
EXIF transpose → scale into the pixel budget + autocontrast → orientation (Tesseract OSD,
verified by OCR word confidence) → Tesseract → normalized text.

Memory is bounded before any pixel is decoded: Pillow reads only the header
to get dimensions, and images over the pixel/side caps are rejected. OCR runs
one job at a time per process (see _OCR_LOCK and OMP_THREAD_LIMIT=1).
"""

from __future__ import annotations

import io
import logging
import os
import re
import threading
import time

from PIL import Image, ImageOps, JpegImagePlugin, UnidentifiedImageError

from app.common.errors import ConversionRejected, EngineUnavailable

PIL_FORMAT_BY_EXT = {
    "jpg": "JPEG",
    "jpeg": "JPEG",
    "png": "PNG",
    "webp": "WEBP",
    "tif": "TIFF",
    "tiff": "TIFF",
    "bmp": "BMP",
    "gif": "GIF",
}
EXTENSIONS = frozenset(PIL_FORMAT_BY_EXT)
# Pillow reports JPEGs that carry extra images (MPF: phone previews, depth
# maps) as "MPO". They are still .jpg files.
_FORMAT_ALIASES = {"MPO": "JPEG"}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


MAX_PIXELS = _env_int("OCR_MAX_PIXELS", 25_000_000)  # decoded size cap (25 MP)
MAX_SIDE = _env_int("OCR_MAX_SIDE", 10_000)
OCR_LANG = os.environ.get("OCR_LANG", "eng")
OCR_PSM = _env_int("OCR_PSM", 3)  # fully automatic page segmentation
OCR_TIMEOUT_S = _env_int("OCR_TIMEOUT_S", 45)  # total OCR budget per image
# Images above this many pixels are downscaled before OCR (speed, memory).
TARGET_PIXELS = _env_int("OCR_TARGET_PIXELS", 12_000_000)
UPSCALE_BELOW = 1000  # small scans OCR better at 2x
# Orientation check runs only when the upright read is weak. Measured on the
# test corpus: upright reads scored 77–96 mean word confidence, reads of
# 90°/180°-rotated pages 29–67.
ORIENTATION_CHECK_BELOW_CONF = float(os.environ.get("OCR_ROTATION_CHECK_BELOW_CONF", "75"))
WEAK_MIN_WORDS = 3
READY_CACHE_S = 300

# Pillow decodes WebP through three full-size buffers: about 15 MB per
# megapixel measured, against 6 for PNG and 2–3 for JPEG. A 25 MP WebP peaked
# at 442 MB, too close to a 512 MB instance, so WebP gets the OCR target size
# as its cap. Larger images are downscaled to that size before OCR anyway.
MAX_PIXELS_BY_FORMAT = {"WEBP": _env_int("OCR_MAX_WEBP_PIXELS", 12_000_000)}

# Pillow's own decompression-bomb guard, aligned with our cap.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

_OCR_LOCK = threading.Lock()
logger = logging.getLogger("mdify.ocr")


def _signature_matches(data: bytes, ext: str) -> bool:
    fmt = PIL_FORMAT_BY_EXT[ext]
    if fmt == "JPEG":
        return data.startswith(b"\xff\xd8\xff")
    if fmt == "PNG":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if fmt == "GIF":
        return data[:6] in (b"GIF87a", b"GIF89a")
    if fmt == "BMP":
        return data.startswith(b"BM")
    if fmt == "WEBP":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if fmt == "TIFF":
        return data[:4] in (b"II*\x00", b"MM\x00*")
    return False


def _open_checked(data: bytes, ext: str) -> Image.Image:
    """Opens lazily (header only) and enforces format and dimension caps."""
    mismatch = ConversionRejected(400, f"File content does not match the .{ext} extension", "magic_mismatch")
    if not _signature_matches(data, ext):
        raise mismatch
    try:
        img = Image.open(io.BytesIO(data))
    except Image.DecompressionBombError:
        raise ConversionRejected(413, "Image dimensions exceed the OCR limit", "dimension_limit") from None
    except (UnidentifiedImageError, OSError):
        raise mismatch from None
    if _FORMAT_ALIASES.get(img.format, img.format) != PIL_FORMAT_BY_EXT[ext]:
        img.close()
        raise mismatch
    width, height = img.size
    max_pixels = MAX_PIXELS_BY_FORMAT.get(img.format, MAX_PIXELS)
    if width * height > max_pixels or max(width, height) > MAX_SIDE:
        img.close()
        if img.format in MAX_PIXELS_BY_FORMAT and width * height > max_pixels:
            detail = (
                f"WebP image is {width}×{height}px; the OCR limit for WebP is "
                f"{max_pixels // 1_000_000} MP. Save it as PNG or JPEG, or resize it"
            )
        else:
            detail = (
                f"Image is {width}×{height}px; the OCR limit is {MAX_PIXELS // 1_000_000} MP "
                f"and {MAX_SIDE}px per side"
            )
        raise ConversionRejected(413, detail, "dimension_limit")
    return img


# EXIF orientation value -> transpose that makes the image upright
# (the same mapping ImageOps.exif_transpose uses).
_EXIF_ORIENTATION = 0x0112
_UPRIGHT_TRANSPOSE = {
    2: Image.Transpose.FLIP_LEFT_RIGHT,
    3: Image.Transpose.ROTATE_180,
    4: Image.Transpose.FLIP_TOP_BOTTOM,
    5: Image.Transpose.TRANSPOSE,
    6: Image.Transpose.ROTATE_270,
    7: Image.Transpose.TRANSVERSE,
    8: Image.Transpose.ROTATE_90,
}


def _target_size(width: int, height: int) -> tuple[int, int]:
    """Size that fits the pixel budget; small scans are doubled."""
    if width * height > TARGET_PIXELS:
        scale = (TARGET_PIXELS / (width * height)) ** 0.5
        return max(1, int(width * scale)), max(1, int(height * scale))
    if max(width, height) < UPSCALE_BELOW and width * height * 4 <= TARGET_PIXELS:
        return width * 2, height * 2
    return width, height


def _prepare(img: Image.Image) -> Image.Image:
    """First frame, EXIF-upright, grayscale, contrast, sized into the pixel budget.

    Ordered for peak memory: the image becomes grayscale first (JPEGs decode
    straight to it), and no full-size RGB copy is made. The returned image is
    always a new object, so the caller can close ``img``.
    """
    img.seek(0)
    orientation = img.getexif().get(_EXIF_ORIENTATION)
    if isinstance(img, JpegImagePlugin.JpegImageFile):
        # Luminance only. libjpeg also drops whole DCT scales when the image
        # is at least twice the budget per side.
        img.draft("L", _target_size(*img.size))
    gray = img if img.mode == "L" else img.convert("L")
    transpose = _UPRIGHT_TRANSPOSE.get(orientation)
    if transpose is not None:
        gray = gray.transpose(transpose)
    size = _target_size(*gray.size)
    if size[0] * size[1] < gray.size[0] * gray.size[1]:
        # Shrink first so the contrast pass works on fewer pixels.
        return ImageOps.autocontrast(gray.resize(size, Image.Resampling.LANCZOS))
    gray = ImageOps.autocontrast(gray)
    if size != gray.size:
        gray = gray.resize(size, Image.Resampling.LANCZOS)
    return gray


def _clean_text(text: str) -> str:
    text = text.replace("\x0c", "")
    lines = [line.rstrip() for line in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _text_from_data(data: dict) -> tuple[str, float, int]:
    """Rebuilds page text from image_to_data output.

    Returns (text, mean word confidence, word count). Lines break on Tesseract
    line changes; paragraphs and blocks are separated by a blank line.
    """
    lines: list[str] = []
    words: list[str] = []
    confs: list[float] = []
    current = None
    for i, word in enumerate(data["text"]):
        word = (word or "").strip()
        if not word:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        if current is not None and key != current:
            lines.append(" ".join(words))
            if key[:2] != current[:2]:
                lines.append("")
            words = []
        current = key
        words.append(word)
        conf = float(data["conf"][i])
        if conf >= 0:
            confs.append(conf)
    if words:
        lines.append(" ".join(words))
    mean_conf = sum(confs) / len(confs) if confs else 0.0
    return "\n".join(lines), mean_conf, len(confs)


def _rotate_upright(img: Image.Image, clockwise_degrees: int) -> Image.Image:
    # PIL rotates counter-clockwise; Tesseract OSD reports clockwise degrees.
    return img.rotate(-clockwise_degrees, expand=True, fillcolor=255) if clockwise_degrees else img


class OcrConverter:
    engine_name = "Tesseract (tessdata_fast)"
    extensions = EXTENSIONS

    def __init__(self) -> None:
        # Optional explicit binary path, for hosts where tesseract is not on
        # PATH (e.g. a Windows dev machine). The Docker image doesn't need it.
        tesseract_cmd = os.environ.get("TESSERACT_CMD", "").strip()
        if tesseract_cmd:
            import pytesseract

            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        self._ready_cache: tuple[float, tuple[bool, str]] | None = None
        self._has_osd: bool | None = None

    def _probe(self) -> tuple[bool, str]:
        import pytesseract

        try:
            version = pytesseract.get_tesseract_version()
            languages = pytesseract.get_languages(config="")
        except Exception as err:  # binary missing or broken
            return False, f"tesseract unavailable: {err}"
        self._has_osd = "osd" in languages
        if OCR_LANG not in languages:
            return False, f"tesseract {version}: language '{OCR_LANG}' not installed"
        osd = "osd" if self._has_osd else "no osd (rotation fallback only)"
        return True, f"tesseract {version}, lang={OCR_LANG}, {osd}"

    def ready(self) -> tuple[bool, str]:
        # Probing starts two tesseract processes and health checks poll often,
        # so a healthy result is reused for a few minutes.
        now = time.monotonic()
        cached = self._ready_cache
        if cached and cached[1][0] and now - cached[0] < READY_CACHE_S:
            return cached[1]
        result = self._probe()
        self._ready_cache = (now, result)
        return result

    def validate(self, data: bytes, ext: str) -> None:
        _open_checked(data, ext).close()

    # ── OCR steps (called under _OCR_LOCK) ──────────────────────────────────

    def _ocr(self, img: Image.Image, deadline: float) -> tuple[str, float, int]:
        import pytesseract

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError("Tesseract process timeout")
        data = pytesseract.image_to_data(
            img,
            lang=OCR_LANG,
            config=f"--oem 1 --psm {OCR_PSM}",
            timeout=max(1, int(remaining)),
            output_type=pytesseract.Output.DICT,
        )
        return _text_from_data(data)

    def _osd_rotation(self, img: Image.Image) -> int | None:
        """Clockwise degrees that make the page upright, or None if unknown."""
        import pytesseract

        if self._has_osd is None:
            self._probe()
        if not self._has_osd:
            return None
        try:
            osd = pytesseract.image_to_osd(
                img,
                config="--psm 0 -c min_characters_to_try=5",
                output_type=pytesseract.Output.DICT,
                timeout=10,
            )
        except (pytesseract.TesseractError, RuntimeError):
            return None  # too little text, or OSD timed out
        return int(osd.get("rotate", 0)) % 360

    def _recognize(self, img: Image.Image) -> tuple[str, int]:
        """OCR with orientation handling. Returns (text, applied clockwise rotation).

        Upright pages read with high confidence and skip orientation work
        entirely. A weak read triggers OSD; its proposal (or, if OSD can't
        decide, the other three orientations) is kept only if it reads with
        clearly higher confidence.
        """
        deadline = time.monotonic() + OCR_TIMEOUT_S
        best_text, best_conf, best_words = self._ocr(img, deadline)
        best_rotation = 0
        proposed = None
        candidates: list[int] = []

        if best_conf < ORIENTATION_CHECK_BELOW_CONF or best_words < WEAK_MIN_WORDS:
            proposed = self._osd_rotation(img)
            if proposed:
                candidates = [proposed]
            elif proposed is None:
                candidates = [90, 180, 270]

        for rotation in candidates:
            if time.monotonic() >= deadline:
                break
            text, conf, words = self._ocr(_rotate_upright(img, rotation), deadline)
            # A new orientation must be clearly more confident, and must not
            # win on a handful of glyphs where the upright read found words.
            if conf > best_conf + 5 and words >= best_words // 2:
                best_text, best_conf, best_words, best_rotation = text, conf, words, rotation

        logger.info(
            "ocr orientation osd=%s applied=%s mean_conf=%.1f words=%d",
            proposed,
            best_rotation,
            best_conf,
            best_words,
        )
        return best_text, best_rotation

    def convert(self, data: bytes, ext: str, *, filename: str, title: str) -> tuple[str, str | None]:
        import pytesseract

        img = _open_checked(data, ext)
        try:
            frames = getattr(img, "n_frames", 1)
            try:
                prepared = _prepare(img)
            except (OSError, ValueError):
                raise ConversionRejected(422, f"This {ext.upper()} image couldn't be decoded", "decode_failed") from None
        finally:
            img.close()

        with _OCR_LOCK:
            try:
                raw, rotation = self._recognize(prepared)
            except pytesseract.TesseractNotFoundError as err:
                raise EngineUnavailable(str(err)) from None
            except RuntimeError as err:
                if "timeout" in str(err).lower():
                    raise ConversionRejected(422, "OCR took too long for this image", "ocr_timeout") from None
                raise

        text = _clean_text(raw)
        if not text:
            return "_No text detected in this image._", "no-text-detected"
        warnings = []
        if rotation:
            warnings.append(f"auto-rotated-{rotation}")
        if frames > 1:
            warnings.append("first-frame-only")
        return text, ",".join(warnings) or None
