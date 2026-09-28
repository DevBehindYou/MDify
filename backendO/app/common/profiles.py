"""Profile pipeline: turns engine output into the document the user gets."""

from __future__ import annotations

import re

PROFILES = ("Standard", "Clean", "Compact", "RAG-ready")

_H1_BLOCK = re.compile(r"^(# .+\n\n)")


def ensure_title(markdown: str, title: str) -> str:
    """Guarantees the document opens with an H1 followed by a blank line."""
    body = markdown.strip("\n")
    if body.startswith("# "):
        first, _, rest = body.partition("\n")
        rest = rest.lstrip("\n")
        return f"{first}\n\n{rest}\n" if rest.strip() else f"{first}\n\n"
    return f"# {title}\n\n{body}\n"


def finalize_markdown(
    markdown: str,
    *,
    title: str,
    original_name: str,
    size_bytes: int,
    engine: str,
    profile: str = "Standard",
) -> tuple[str, int, int]:
    """Applies the source line and the chosen profile.

    Returns (content, word_count, estimated_tokens).
    """
    content = ensure_title(markdown, title)

    display_name = original_name.replace("`", "'")
    source_line = f"> **Source:** `{display_name}` ({size_bytes / 1024:.1f} KB) · **Engine:** {engine}\n\n"
    content = _H1_BLOCK.sub(lambda m: m.group(1) + source_line, content, count=1)

    if profile == "Clean":
        content = re.sub(r"^> \*\*Source:\*\*.*\n", "", content, count=1, flags=re.M)
        content = re.sub(r"\n{3,}", "\n\n", content)
    elif profile == "Compact":
        content = re.sub(r"\n\n+", "\n", content).replace("---", "")
    elif profile == "RAG-ready":
        content = f"<!-- rag-profile: heading-aligned chunks | doc: {original_name} -->\n" + re.sub(
            r"(^## [^\n]+)", r"<!-- chunk-boundary -->\n\1", content, flags=re.M
        )

    words = len(content.split())
    return content, words, round(words * 1.33)
