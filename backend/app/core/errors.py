"""Typed error model shared by the whole backend.

Every failure the system understands maps to a stable ``ErrorCode`` and an
HTTP status. Routes and the pipeline raise ``AppError``; a single exception
handler (see ``app.main``) renders it as:

    { "error": { "code": "FILE_TOO_LARGE", "message": "..." } }

This is what lets the frontend branch on *what* failed instead of parsing a
free-text "Something went wrong." string.
"""

from __future__ import annotations

from enum import Enum


class ErrorCode(str, Enum):
    # Client / input problems
    INVALID_FILE = "INVALID_FILE"
    UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    UPLOAD_FAILED = "UPLOAD_FAILED"

    # Processing problems
    CONVERSION_FAILED = "CONVERSION_FAILED"
    CONVERSION_TIMEOUT = "CONVERSION_TIMEOUT"

    # Infrastructure / policy
    RATE_LIMITED = "RATE_LIMITED"
    STORAGE_ERROR = "STORAGE_ERROR"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


# Codes the frontend derives on its own (never returned by the API body).
# Documented here so the two enums stay conceptually in sync:
#   BACKEND_STARTING   — health probe pending / cold start
#   BACKEND_UNAVAILABLE — health probe failed


class AppError(Exception):
    """An error the system understands and can describe to the client."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        status_code: int = 400,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code

    def to_body(self) -> dict:
        return {"error": {"code": self.code.value, "message": self.message}}


# ── Convenience constructors for the common cases ───────────────────────────

def invalid_file(message: str = "The uploaded file is invalid or empty.") -> AppError:
    return AppError(ErrorCode.INVALID_FILE, message, status_code=400)


def unsupported_format(message: str) -> AppError:
    return AppError(ErrorCode.UNSUPPORTED_FORMAT, message, status_code=415)


def file_too_large(message: str) -> AppError:
    return AppError(ErrorCode.FILE_TOO_LARGE, message, status_code=413)


def conversion_failed(message: str = "The document could not be converted.") -> AppError:
    return AppError(ErrorCode.CONVERSION_FAILED, message, status_code=422)
