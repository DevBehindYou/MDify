"""Isolated temporary-file handling with guaranteed cleanup.

Uploaded bytes are written to a per-request temp file inside a dedicated
directory, converted, and then removed in a ``finally`` no matter what. We
never keep user documents around after the response is produced.
"""

from __future__ import annotations

import contextlib
import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

# Dedicated subdir keeps our temp files isolated from the rest of /tmp.
_TMP_ROOT = Path(tempfile.gettempdir()) / "mdify-pro"


@contextlib.contextmanager
def temp_upload(content: bytes, suffix: str) -> Iterator[str]:
    """Write ``content`` to an isolated temp file; yield its path; always clean up.

    ``suffix`` should be a sanitized, dotted extension (e.g. ".pdf").
    """
    _TMP_ROOT.mkdir(parents=True, exist_ok=True)
    fd, path = tempfile.mkstemp(suffix=suffix, dir=str(_TMP_ROOT))
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(content)
        yield path
    finally:
        with contextlib.suppress(OSError):
            os.unlink(path)
