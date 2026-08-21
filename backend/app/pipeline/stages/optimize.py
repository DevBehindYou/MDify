"""Optimization stage — apply a profile's transforms to normalized Markdown.

All transforms are pure and fence-aware (never touch fenced code blocks), so
they are safe and unit-testable in isolation. Order matters: strip HTML and
images first, then structural cleanup, then whitespace tightening.
"""

from __future__ import annotations

import re

from app.pipeline.profiles import ProfileConfig

_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
# Only known junk/layout tags — leaves Markdown autolinks (<http…>, <a@b>) alone.
_HTML_TAG = re.compile(
    r"</?(?:div|span|p|br|hr|b|i|u|em|strong|font|small|sup|sub|section|article|"
    r"header|footer|nav|figure|figcaption|table|thead|tbody|tr|td|th|o:p)\b[^>]*>",
    re.IGNORECASE,
)
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_HEADING = re.compile(r"^(#{1,6})(\s+)(\S.*)$")
_TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
_LIST_ITEM = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+")
_MULTISPACE = re.compile(r"[ \t]{2,}")
_FENCE = re.compile(r"^\s*```")


def _fence_aware(text: str, transform):
    """Run `transform(line)->str|None` on non-code lines; None drops the line."""
    out: list[str] = []
    in_code = False
    for line in text.split("\n"):
        if _FENCE.match(line):
            in_code = not in_code
            out.append(line)
            continue
        if in_code:
            out.append(line)
            continue
        res = transform(line)
        if res is not None:
            out.append(res)
    return "\n".join(out)


def _strip_html(text: str) -> str:
    text = _HTML_COMMENT.sub("", text)
    return _fence_aware(text, lambda ln: _HTML_TAG.sub("", ln))


def _drop_images(text: str) -> str:
    def t(ln: str) -> str | None:
        stripped = _IMAGE.sub("", ln)
        # Drop lines that were only an image (now blank), keep inline cases.
        if stripped.strip() == "" and ln.strip() != "":
            return None
        return stripped

    return _fence_aware(text, t)


def _remove_repeated_lines(text: str) -> str:
    counts: dict[str, int] = {}
    in_code = False
    for line in text.split("\n"):
        if _FENCE.match(line):
            in_code = not in_code
            continue
        if in_code:
            continue
        s = line.strip()
        if 3 <= len(s) <= 100 and not (
            _HEADING.match(line) or _TABLE_ROW.match(line) or _LIST_ITEM.match(line)
        ):
            counts[s] = counts.get(s, 0) + 1
    # Repeated short lines across a document are usually page headers/footers.
    repeated = {s for s, n in counts.items() if n >= 3}
    if not repeated:
        return text
    return _fence_aware(text, lambda ln: None if ln.strip() in repeated else ln)


def _normalize_headings(text: str) -> str:
    """Reindex heading levels so the doc starts at #1 and never jumps >1 level."""
    # First pass: collect the ordered set of original levels actually used.
    stack: list[int] = []

    def t(ln: str) -> str:
        m = _HEADING.match(ln)
        if not m:
            return ln
        level = len(m.group(1))
        # Pop deeper-or-equal levels, then this level's depth = stack size + 1.
        while stack and stack[-1] >= level:
            stack.pop()
        stack.append(level)
        new_level = min(len(stack), 6)
        return f"{'#' * new_level}{m.group(2)}{m.group(3)}"

    return _fence_aware(text, t)


def _tighten_whitespace(text: str) -> str:
    return _fence_aware(text, lambda ln: _MULTISPACE.sub(" ", ln).rstrip())


def optimize_markdown(markdown: str, profile: ProfileConfig) -> str:
    text = markdown
    if profile.strip_html:
        text = _strip_html(text)
    if profile.drop_images:
        text = _drop_images(text)
    if profile.remove_repeated_lines:
        text = _remove_repeated_lines(text)
    if profile.normalize_headings:
        text = _normalize_headings(text)
    if profile.tighten_whitespace:
        text = _tighten_whitespace(text)
    # Collapse any blank runs the transforms opened up.
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n" if text.strip() else ""
