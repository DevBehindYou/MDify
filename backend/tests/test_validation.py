"""Tests for the upload trust boundary."""

from __future__ import annotations

import pytest

from app.core.errors import AppError, ErrorCode
from app.security.validation import sanitize_filename, validate_upload

MAX = 25 * 1024 * 1024

# Minimal valid magic-byte payloads for a few formats.
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
PDF = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n" + b"0" * 32
ZIP = b"PK\x03\x04" + b"\x00" * 32


def test_sanitize_strips_path_traversal():
    stem, ext = sanitize_filename("../../etc/passwd.pdf")
    assert "/" not in stem and "\\" not in stem
    assert ext == "pdf"


def test_sanitize_windows_path():
    stem, ext = sanitize_filename(r"C:\secret\report.DOCX")
    assert stem == "report"
    assert ext == "docx"


def test_empty_file_rejected():
    with pytest.raises(AppError) as exc:
        validate_upload("a.txt", b"", MAX)
    assert exc.value.code is ErrorCode.INVALID_FILE


def test_oversize_rejected():
    with pytest.raises(AppError) as exc:
        validate_upload("a.txt", b"x" * 10, max_size=5)
    assert exc.value.code is ErrorCode.FILE_TOO_LARGE


def test_unsupported_extension_rejected():
    with pytest.raises(AppError) as exc:
        validate_upload("virus.exe", b"MZ\x00\x00", MAX)
    assert exc.value.code is ErrorCode.UNSUPPORTED_FORMAT


def test_missing_extension_rejected():
    with pytest.raises(AppError) as exc:
        validate_upload("noext", b"hello", MAX)
    assert exc.value.code is ErrorCode.UNSUPPORTED_FORMAT


def test_extension_content_mismatch_rejected():
    # Claims to be a PDF but is plain text — magic bytes don't match.
    with pytest.raises(AppError) as exc:
        validate_upload("fake.pdf", b"just some text, not a pdf", MAX)
    assert exc.value.code is ErrorCode.INVALID_FILE


def test_valid_png_accepted():
    result = validate_upload("photo.png", PNG, MAX)
    assert result.ext == "png"
    assert result.suffix == ".png"


def test_valid_pdf_accepted():
    result = validate_upload("doc.pdf", PDF, MAX)
    assert result.ext == "pdf"


def test_valid_docx_zip_accepted():
    result = validate_upload("report.docx", ZIP, MAX)
    assert result.ext == "docx"


def test_valid_text_accepted():
    result = validate_upload("notes.txt", b"# Title\nplain text", MAX)
    assert result.ext == "txt"


def test_binary_text_rejected():
    # NUL bytes → not readable text.
    with pytest.raises(AppError) as exc:
        validate_upload("notes.txt", b"\x00\x01\x02binary\x00", MAX)
    assert exc.value.code is ErrorCode.INVALID_FILE
