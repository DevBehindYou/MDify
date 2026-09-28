"""Normal-pool converter: documents → Markdown with Microsoft MarkItDown.

No OCR and no Tesseract dependency here; images belong to backendO.
"""

from __future__ import annotations

import io
import zipfile

from app import pdf_fast_path
from app.common.errors import ConversionRejected, EngineUnavailable

TEXT_EXTENSIONS = frozenset({"txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm"})
OOXML_MARKERS = {
    "docx": "word/document.xml",
    "pptx": "ppt/presentation.xml",
    "xlsx": "xl/workbook.xml",
}
EXTENSIONS = TEXT_EXTENSIONS | frozenset({"pdf", "docx", "pptx", "xlsx", "xls", "epub"})

MIME_TYPES = {
    "txt": "text/plain",
    "md": "text/markdown",
    "markdown": "text/markdown",
    "csv": "text/csv",
    "tsv": "text/tab-separated-values",
    "json": "application/json",
    "xml": "application/xml",
    "html": "text/html",
    "htm": "text/html",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "epub": "application/epub+zip",
}

OLE_SIGNATURE = bytes.fromhex("D0CF11E0A1B11AE1")

# Zip-bomb guards for OOXML/EPUB containers.
MAX_ZIP_ENTRIES = 10_000
MAX_ZIP_UNCOMPRESSED = 250 * 1024 * 1024

# Below this many characters a PDF almost certainly has no text layer.
MIN_PDF_TEXT_CHARS = 20


def _reject_mismatch(ext: str) -> ConversionRejected:
    return ConversionRejected(400, f"File content does not match the .{ext} extension", "magic_mismatch")


def _validate_zip(data: bytes, ext: str) -> None:
    if not data.startswith(b"PK\x03\x04"):
        raise _reject_mismatch(ext)
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ZIP_ENTRIES or sum(i.file_size for i in infos) > MAX_ZIP_UNCOMPRESSED:
                raise ConversionRejected(413, "Archive expands beyond the allowed size", "zip_limit")
            names = {i.filename for i in infos}
            if ext == "epub":
                if "mimetype" not in names or archive.read("mimetype").strip() != b"application/epub+zip":
                    raise _reject_mismatch(ext)
            elif OOXML_MARKERS[ext] not in names:
                raise _reject_mismatch(ext)
    except zipfile.BadZipFile:
        raise _reject_mismatch(ext) from None


class NormalConverter:
    engine_name = "MarkItDown"
    extensions = EXTENSIONS

    def __init__(self) -> None:
        try:
            from markitdown import MarkItDown, StreamInfo
        except ImportError as err:  # pragma: no cover - deployment error
            self._md = None
            self._stream_info = None
            self._import_error = str(err)
            return
        self._md = MarkItDown(enable_plugins=False)
        self._stream_info = StreamInfo
        self._import_error = ""

    def ready(self) -> tuple[bool, str]:
        if self._md is None:
            return False, f"markitdown not importable: {self._import_error}"
        from importlib.metadata import version

        return True, f"markitdown {version('markitdown')}"

    def validate(self, data: bytes, ext: str) -> None:
        if ext in TEXT_EXTENSIONS:
            if b"\x00" in data[:8192]:
                raise _reject_mismatch(ext)
        elif ext == "pdf":
            if b"%PDF-" not in data[:1024]:
                raise _reject_mismatch(ext)
        elif ext == "xls":
            if not data.startswith(OLE_SIGNATURE):
                raise _reject_mismatch(ext)
        else:
            _validate_zip(data, ext)

    def convert(
        self, data: bytes, ext: str, *, filename: str, title: str, note_low_text: bool = True
    ) -> tuple[str, str | None]:
        """note_low_text=False for a range of pages inside a larger PDF, whose
        scanned pages are read separately (app.pdf_tasks)."""
        if self._md is None:
            raise EngineUnavailable(self._import_error)

        markdown = pdf_fast_path.try_convert(data) if ext == "pdf" else None
        if markdown is None:
            info = self._stream_info(extension=f".{ext}", filename=filename, mimetype=MIME_TYPES.get(ext))
            result = self._md.convert_stream(io.BytesIO(data), stream_info=info)
            markdown = (getattr(result, "markdown", None) or result.text_content or "").strip()

        if ext == "pdf" and note_low_text and len(markdown) < MIN_PDF_TEXT_CHARS:
            note = (
                "> ⚠️ **Little or no extractable text found.** This PDF may be scanned or "
                "image-based, and its pages could not be read as text.\n\n"
            )
            return note + (markdown or "_No text layer present._"), "low-text-pdf"

        if not markdown:
            return "_No extractable text found in this document._", "empty-output"
        return markdown, None
