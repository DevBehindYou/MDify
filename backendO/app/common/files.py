"""Filename handling and bounded upload reads."""

from __future__ import annotations

import re
import unicodedata
from typing import BinaryIO

from .errors import ConversionRejected

MAX_NAME_LENGTH = 255
_UNSAFE_CHARS = re.compile(r'[\x00-\x1f\x7f<>:"|?*]')


def sanitize_filename(name: str | None) -> str:
    """Base name only, no control or reserved characters, bounded length."""
    base = re.split(r"[\\/]", name or "")[-1]
    base = unicodedata.normalize("NFC", base)
    base = _UNSAFE_CHARS.sub("", base).strip().strip(".")
    if not base:
        return "upload"
    if len(base) > MAX_NAME_LENGTH:
        stem, dot, ext = base.rpartition(".")
        base = (stem[: MAX_NAME_LENGTH - len(ext) - 1] + dot + ext) if dot else base[:MAX_NAME_LENGTH]
    return base


def split_name(name: str) -> tuple[str, str]:
    """Returns (stem, lowercase extension without dot)."""
    stem, dot, ext = name.rpartition(".")
    if not dot or not stem:
        return name, ""
    return stem, ext.lower()


def title_from_stem(stem: str) -> str:
    spaced = re.sub(r"[-_]", " ", stem)
    return re.sub(r"\b\w", lambda m: m.group(0).upper(), spaced).strip() or "Document"


def read_limited(stream: BinaryIO, limit: int) -> bytes:
    """Reads the whole stream, rejecting it as soon as it exceeds `limit`."""
    data = stream.read(limit + 1)
    if len(data) > limit:
        raise ConversionRejected(413, f"File exceeds the {limit // (1024 * 1024)}MB limit", "too_large")
    if not data:
        raise ConversionRejected(400, "The uploaded file is empty", "empty")
    return data
