"""Archive-pool converter (Z1, Z2): ZIP → one project Markdown document.

With Storage (production) the work runs through app.archive_tasks: images
inside the archive go to O1/O2 as separate work items. This converter serves
the multipart /api/v1/internal/convert path used without Storage (local
development): everything except image text recognition happens in one call.
"""

from __future__ import annotations

import io

from app import archive
from app.common.errors import EngineUnavailable

MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "epub": "application/epub+zip",
    "html": "text/html",
    "htm": "text/html",
    "csv": "text/csv",
    "tsv": "text/tab-separated-values",
}


class DocumentEngine:
    """MarkItDown for documents found inside an archive."""

    def __init__(self) -> None:
        try:
            from markitdown import MarkItDown, StreamInfo
        except ImportError as err:  # pragma: no cover - deployment error
            self._md, self._stream_info, self.error = None, None, str(err)
            return
        self._md = MarkItDown(enable_plugins=False)
        self._stream_info = StreamInfo
        self.error = ""

    @property
    def available(self) -> bool:
        return self._md is not None

    def __call__(self, data: bytes, ext: str, filename: str) -> str:
        if self._md is None:
            raise EngineUnavailable(self.error)
        info = self._stream_info(extension=f".{ext}", filename=filename, mimetype=MIME_TYPES.get(ext))
        result = self._md.convert_stream(io.BytesIO(data), stream_info=info)
        return (getattr(result, "markdown", None) or result.text_content or "").strip()


class ArchiveConverter:
    engine_name = archive.ENGINE
    extensions = frozenset({"zip"})

    def __init__(self) -> None:
        self.documents = DocumentEngine()

    def ready(self) -> tuple[bool, str]:
        if not self.documents.available:
            return False, f"markitdown not importable: {self.documents.error}"
        from importlib.metadata import version

        return True, f"markitdown {version('markitdown')}, archive limits {archive.MAX_ENTRIES} files / {archive.MAX_TOTAL_BYTES // archive.MB} MB"

    def validate(self, data: bytes, ext: str) -> None:
        archive.open_archive(data).close()

    def convert(self, data: bytes, ext: str, *, filename: str, title: str) -> tuple[str, str | None]:
        entries = archive.process_archive(data, self.documents, ocr_available=False)
        index = archive.project_index(filename, entries, {})
        body = archive.combined_body(entries, {})
        markdown = index + ("\n---\n\n" + body if body else "")
        skipped = sum(1 for e in entries if e.status != "DONE")
        return markdown, (f"archive-skipped:{skipped}" if skipped else None)
