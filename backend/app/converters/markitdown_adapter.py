"""MarkItDown adapter — the core conversion engine.

Wraps Microsoft's MarkItDown behind the ``Converter`` protocol and preserves
the legacy image-metadata fallback (when MarkItDown yields no text for an
image on the free tier, we still return useful Pillow-derived metadata).
"""

from __future__ import annotations

from pathlib import Path

from app.converters.base import ConversionInput, ConversionOutput
from app.core.errors import conversion_failed
from app.core.logging import get_logger
from app.formats import Category
from app.security.validation import ValidatedUpload

logger = get_logger(__name__)

# ── Optional heavy deps, loaded once and guarded ────────────────────────────
try:
    from markitdown import MarkItDown

    _md = MarkItDown()
    MARKITDOWN_AVAILABLE = True
except Exception:  # pragma: no cover - import-time environment guard
    _md = None
    MARKITDOWN_AVAILABLE = False

try:
    from PIL import Image as PILImage

    PILLOW_AVAILABLE = True
except Exception:  # pragma: no cover
    PILLOW_AVAILABLE = False


def _image_metadata_markdown(image_path: str) -> str:
    """Return Markdown describing an image's metadata (free-tier fallback)."""
    if not PILLOW_AVAILABLE:
        return ""
    try:
        with PILImage.open(image_path) as img:
            width, height = img.size
            fmt = img.format or Path(image_path).suffix.lstrip(".").upper()
            name = Path(image_path).name
            lines = [
                f"# Image: {name}\n",
                "| Property | Value |",
                "|----------|-------|",
                f"| **Format** | {fmt} |",
                f"| **Dimensions** | {width} × {height} px |",
                f"| **Color mode** | {img.mode} |",
            ]
            for key, val in (img.info or {}).items():
                if isinstance(val, (str, int, float)) and key != "exif":
                    lines.append(f"| **{key}** | {val} |")
            lines += [
                "",
                "> **Note:** OCR is not enabled on this tier, so only image "
                "metadata could be extracted.",
                "",
            ]
            return "\n".join(lines)
    except Exception:
        return ""


class MarkItDownConverter:
    name = "markitdown"

    def supports(self, upload: ValidatedUpload) -> bool:  # noqa: ARG002
        # MarkItDown is our universal engine for every allowlisted format.
        return MARKITDOWN_AVAILABLE

    def convert(self, data: ConversionInput) -> ConversionOutput:
        if not MARKITDOWN_AVAILABLE or _md is None:
            raise conversion_failed(
                "The conversion engine is not available. Please try again later."
            )

        is_image = data.upload.category is Category.IMAGE
        text = ""
        try:
            result = _md.convert(data.path)
            text = (result.text_content or "").strip()
        except Exception as exc:
            logger.warning(
                "markitdown failed ext=%s: %s", data.upload.ext, type(exc).__name__
            )
            if not is_image:
                # Deliberately generic: never leak library internals to clients.
                raise conversion_failed(
                    "This document could not be converted. It may be corrupted, "
                    "password-protected, or use an unsupported internal structure."
                ) from exc

        # Images with no extractable text still get useful metadata output.
        if is_image and not text:
            text = _image_metadata_markdown(data.path)

        if not text:
            raise conversion_failed("No content could be extracted from this file.")

        return ConversionOutput(markdown=text)
