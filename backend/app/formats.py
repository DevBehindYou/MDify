"""Single source of truth for the formats MDify Pro accepts.

Both the security validator and the converter registry read from here, so the
supported-format matrix can never drift between "what we validate" and "what
we actually convert". The frontend mirrors this list in ``lib/config.ts``.
"""

from __future__ import annotations

from enum import Enum


class Category(str, Enum):
    DOCUMENT = "document"  # binary office / pdf / ebook
    IMAGE = "image"
    TEXT = "text"  # plain-text family, validated by decodability not magic bytes


# ext (no dot) -> (human label, category)
SUPPORTED: dict[str, tuple[str, Category]] = {
    "pdf": ("PDF", Category.DOCUMENT),
    "docx": ("Word", Category.DOCUMENT),
    "pptx": ("PowerPoint", Category.DOCUMENT),
    "xlsx": ("Excel", Category.DOCUMENT),
    "xls": ("Excel (legacy)", Category.DOCUMENT),
    "epub": ("EPUB", Category.DOCUMENT),
    "html": ("HTML", Category.TEXT),
    "htm": ("HTML", Category.TEXT),
    "txt": ("Text", Category.TEXT),
    "md": ("Markdown", Category.TEXT),
    "csv": ("CSV", Category.TEXT),
    "tsv": ("TSV", Category.TEXT),
    "json": ("JSON", Category.TEXT),
    "xml": ("XML", Category.TEXT),
    "jpg": ("Image", Category.IMAGE),
    "jpeg": ("Image", Category.IMAGE),
    "png": ("Image", Category.IMAGE),
    "gif": ("Image", Category.IMAGE),
    "bmp": ("Image", Category.IMAGE),
    "tiff": ("Image", Category.IMAGE),
    "tif": ("Image", Category.IMAGE),
    "webp": ("Image", Category.IMAGE),
}

ALLOWED_EXTENSIONS = set(SUPPORTED.keys())


def category_of(ext: str) -> Category | None:
    entry = SUPPORTED.get(ext.lower())
    return entry[1] if entry else None


def label_of(ext: str) -> str:
    entry = SUPPORTED.get(ext.lower())
    return entry[0] if entry else "File"
