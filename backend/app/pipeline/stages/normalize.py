"""Content-normalization stage.

Cleans up the raw converter output into tidy Markdown: consistent line
endings, no trailing whitespace, and no runs of blank lines. Pure function,
trivially unit-testable, and the natural home for future cleanup rules
(boilerplate/header-footer removal for RAG mode).
"""

from __future__ import annotations

import re

_TRAILING_WS = re.compile(r"[ \t]+(\n|$)")
_MANY_BLANKS = re.compile(r"\n{3,}")


def normalize_markdown(markdown: str) -> str:
    if not markdown:
        return ""
    # Normalize line endings first.
    text = markdown.replace("\r\n", "\n").replace("\r", "\n")
    # Strip trailing whitespace on each line.
    text = _TRAILING_WS.sub(r"\1", text)
    # Collapse 3+ consecutive newlines down to a single blank line.
    text = _MANY_BLANKS.sub("\n\n", text)
    # Trim leading/trailing blank space, keep a single terminal newline.
    return text.strip() + "\n"
