"""Upload validation — the trust boundary.

We never trust the client-supplied filename or Content-Type. Every upload is:

  1. size-checked (reject empties and oversize before any work),
  2. extension-allowlisted,
  3. filename-sanitized (path-traversal / control chars stripped),
  4. content-sniffed by magic bytes for binary/image formats so a file's real
     type must be consistent with its claimed extension.

Magic-byte detection is implemented in pure Python (no libmagic system
dependency) which keeps the image reproducible on Render's native runtime.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from app.core.errors import (
    file_too_large,
    invalid_file,
    unsupported_format,
)
from app.formats import ALLOWED_EXTENSIONS, Category, category_of

_SAFE_STEM = re.compile(r"[^A-Za-z0-9._ -]+")


@dataclass(frozen=True)
class ValidatedUpload:
    original_name: str
    safe_stem: str  # sanitized base name, no extension
    ext: str  # lowercase, no dot
    suffix: str  # dotted, e.g. ".pdf"
    category: Category


def sanitize_filename(name: str) -> tuple[str, str]:
    """Return (safe_stem, ext_without_dot) from an untrusted filename.

    Strips any directory components (path traversal) and unusual characters.
    """
    base = Path(name.replace("\\", "/")).name  # drop any path, incl. Windows
    stem = Path(base).stem
    ext = Path(base).suffix.lstrip(".").lower()
    safe = _SAFE_STEM.sub("_", stem).strip(" ._") or "document"
    return safe[:120], ext


# ── Magic-byte signatures ───────────────────────────────────────────────────
# Each entry: predicate(content: bytes) -> bool


def _startswith(*prefixes: bytes):
    return lambda b: any(b.startswith(p) for p in prefixes)


def _is_zip(b: bytes) -> bool:
    # OOXML (docx/pptx/xlsx) and EPUB are all ZIP containers.
    return b[:4] in (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")


def _is_webp(b: bytes) -> bool:
    return b[:4] == b"RIFF" and b[8:12] == b"WEBP"


_SIGNATURES = {
    "pdf": _startswith(b"%PDF"),
    "png": _startswith(b"\x89PNG\r\n\x1a\n"),
    "jpg": _startswith(b"\xff\xd8\xff"),
    "jpeg": _startswith(b"\xff\xd8\xff"),
    "gif": _startswith(b"GIF87a", b"GIF89a"),
    "bmp": _startswith(b"BM"),
    "tiff": _startswith(b"II*\x00", b"MM\x00*"),
    "tif": _startswith(b"II*\x00", b"MM\x00*"),
    "webp": _is_webp,
    "docx": _is_zip,
    "pptx": _is_zip,
    "xlsx": _is_zip,
    "epub": _is_zip,
    # Legacy Excel is an OLE2 compound file.
    "xls": _startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
}


def _looks_like_text(content: bytes) -> bool:
    """True if the bytes decode cleanly and are not full of NULs/control bytes."""
    if b"\x00" in content[:8192]:
        return False
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            content[:8192].decode(encoding)
            return True
        except (UnicodeDecodeError, LookupError):
            continue
    return False


def validate_upload(
    filename: str | None,
    content: bytes,
    max_size: int,
) -> ValidatedUpload:
    """Run all checks and return a ``ValidatedUpload`` or raise ``AppError``."""
    if not filename:
        raise invalid_file("No filename was provided.")
    if not content:
        raise invalid_file("The uploaded file is empty.")
    if len(content) > max_size:
        mb = max_size // (1024 * 1024)
        got = len(content) / (1024 * 1024)
        raise file_too_large(
            f"File is {got:.1f} MB. The maximum is {mb} MB."
        )

    safe_stem, ext = sanitize_filename(filename)
    if not ext:
        raise unsupported_format("The file has no extension, so its type is unknown.")
    if ext not in ALLOWED_EXTENSIONS:
        raise unsupported_format(f"'.{ext}' files are not supported.")

    category = category_of(ext)
    assert category is not None  # guaranteed by the allowlist check above

    # Content must be consistent with the claimed extension.
    if category in (Category.DOCUMENT, Category.IMAGE):
        signature = _SIGNATURES.get(ext)
        if signature is not None and not signature(content):
            raise invalid_file(
                f"The file does not look like a valid .{ext} file "
                "(its contents don't match its extension)."
            )
    else:  # TEXT family
        if not _looks_like_text(content):
            raise invalid_file(
                f"The file does not look like readable text for a .{ext} file."
            )

    return ValidatedUpload(
        original_name=filename,
        safe_stem=safe_stem,
        ext=ext,
        suffix=f".{ext}",
        category=category,
    )
