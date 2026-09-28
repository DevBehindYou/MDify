"""Supabase Storage access for the processing backends (server-only).

Uses the Storage REST API over httpx instead of an S3 SDK: backendN ships to
Vercel, where its dependencies already measure ~300 MB installed, and an S3
SDK would add ~80 MB more (see project-docs/supabase/REVIEW.md).

Credentials: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, bucket from
SUPABASE_STORAGE_BUCKET (default "mdify-pro-files"). None of these may ever be
sent to a browser.
"""

from __future__ import annotations

import os
import re
from urllib.parse import quote

import httpx

# Backends only touch the fixed object layout of a job (docs/BACKGROUND_JOBS.md).
# Anything else is refused, so a bug or a compromised caller can't read or
# write other files:
#   input/source.<ext>              the upload
#   materialized/<id>/source.<ext>  a rendered PDF page or an extracted image
#   nodes/<id>/result.md            one piece's Markdown (page, image)
#   nodes/<id>/partial.json         an archive's converted entries before merge
#   output/...                      the final results
OBJECT_PATH = re.compile(
    r"^jobs/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/("
    r"input/source\.[a-z0-9]{1,10}"
    r"|materialized/[0-9a-z-]{1,64}/source\.[a-z0-9]{1,10}"
    r"|nodes/[0-9a-z-]{1,64}/(result\.md|partial\.json)"
    r"|output/(result\.md|combined(-[0-9]{3})?\.md|PROJECT_INDEX\.md|manifest\.json)"
    r")$"
)


class StorageError(Exception):
    """transient=True: infrastructure failure worth one retry elsewhere."""

    def __init__(self, message: str, *, transient: bool, status: int | None = None):
        super().__init__(message)
        self.transient = transient
        self.status = status


def check_object_path(path: str) -> str:
    if not OBJECT_PATH.match(path or ""):
        raise StorageError(f"Refusing unexpected object path: {path!r}", transient=False)
    return path


class StorageClient:
    def __init__(self, base_url: str, service_key: str, bucket: str, *, timeout: float = 30.0, transport=None):
        self._base = base_url.rstrip("/") + "/storage/v1"
        self._bucket = bucket
        self._http = httpx.Client(
            timeout=timeout,
            transport=transport,
            headers={"Authorization": f"Bearer {service_key}", "apikey": service_key},
        )

    @classmethod
    def from_env(cls) -> StorageClient | None:
        url = os.environ.get("SUPABASE_URL", "").strip()
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not key:
            return None
        return cls(url, key, os.environ.get("SUPABASE_STORAGE_BUCKET", "mdify-pro-files").strip() or "mdify-pro-files")

    def _url(self, path: str) -> str:
        return f"{self._base}/object/{quote(self._bucket)}/{quote(check_object_path(path))}"

    def download(self, path: str, max_bytes: int) -> bytes:
        try:
            with self._http.stream("GET", self._url(path)) as res:
                if res.status_code in (400, 404):
                    raise StorageError("Input object not found", transient=False, status=res.status_code)
                if res.status_code >= 400:
                    raise StorageError(f"Storage read failed ({res.status_code})", transient=res.status_code >= 500, status=res.status_code)
                chunks, size = [], 0
                for chunk in res.iter_bytes():
                    size += len(chunk)
                    if size > max_bytes:
                        raise StorageError("Input object exceeds the size limit", transient=False, status=413)
                    chunks.append(chunk)
                return b"".join(chunks)
        except httpx.HTTPError as err:
            raise StorageError(f"Storage unreachable: {type(err).__name__}", transient=True) from None

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        # x-upsert: a retried job writes the same deterministic path again.
        try:
            res = self._http.post(
                self._url(path),
                content=data,
                headers={"Content-Type": content_type, "x-upsert": "true", "Cache-Control": "no-store"},
            )
        except httpx.HTTPError as err:
            raise StorageError(f"Storage unreachable: {type(err).__name__}", transient=True) from None
        if res.status_code >= 400:
            raise StorageError(f"Storage write failed ({res.status_code})", transient=res.status_code >= 500, status=res.status_code)
