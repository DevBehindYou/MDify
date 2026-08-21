"""Markdown quality engine — validate the output, don't just produce it.

Runs cheap structural checks over the final Markdown and returns a list of
typed issues plus a 0-100 score. The score is a heuristic (penalty per issue),
explicitly not a universal measure — documented as such in the response schema.
"""

from __future__ import annotations

import re

from app.schemas.conversion import QualityIssue

_HEADING = re.compile(r"^(#{1,6})\s*(.*)$")
_EMPTY_HEADING = re.compile(r"^#{1,6}\s*$")
_PIPE_ROW = re.compile(r"^\s*\|.*\|\s*$")
_SEP_ROW = re.compile(r"^\s*\|?[\s:|-]+\|[\s:|-]*$")
_EMPTY_LINK = re.compile(r"(?<!!)\[[^\]]*\]\(\s*\)")
_EMPTY_IMAGE = re.compile(r"!\[[^\]]*\]\(\s*\)")
_HTML_TAG = re.compile(
    r"</?(?:div|span|p|font|table|tr|td|th|section|header|footer|o:p)\b[^>]*>",
    re.IGNORECASE,
)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_FENCE = re.compile(r"^\s*```")

_PENALTY = {"error": 12, "warning": 5, "info": 1}


def analyze_issues(markdown: str) -> tuple[list[QualityIssue], int]:
    issues: list[QualityIssue] = []
    lines = markdown.split("\n")

    seen_headings: dict[str, int] = {}
    prev_level = 0
    in_code = False
    pipe_block: list[int] = []

    def flush_table_block() -> None:
        # A pipe block of >=2 rows should contain a separator row.
        if len(pipe_block) >= 2:
            has_sep = any(_SEP_ROW.match(lines[i]) for i in pipe_block)
            if not has_sep:
                issues.append(
                    QualityIssue(
                        type="malformed_table",
                        severity="warning",
                        message="Table rows without a header separator (|---|).",
                        line=pipe_block[0] + 1,
                    )
                )
        pipe_block.clear()

    for idx, line in enumerate(lines):
        if _FENCE.match(line):
            in_code = not in_code
            flush_table_block()
            continue
        if in_code:
            continue

        if _PIPE_ROW.match(line):
            pipe_block.append(idx)
        else:
            flush_table_block()

        if _EMPTY_HEADING.match(line):
            issues.append(QualityIssue(type="empty_heading", severity="warning",
                                       message="Heading with no text.", line=idx + 1))
        m = _HEADING.match(line)
        if m and m.group(2).strip():
            level = len(m.group(1))
            text = m.group(2).strip().lower()
            if text in seen_headings:
                issues.append(QualityIssue(type="duplicate_heading", severity="info",
                                           message=f"Duplicate heading: {m.group(2).strip()!r}.",
                                           line=idx + 1))
            else:
                seen_headings[text] = idx + 1
            if prev_level and level > prev_level + 1:
                issues.append(QualityIssue(type="heading_hierarchy_jump", severity="warning",
                                           message=f"Heading jumps from H{prev_level} to H{level}.",
                                           line=idx + 1))
            prev_level = level

        if _EMPTY_LINK.search(line):
            issues.append(QualityIssue(type="broken_link", severity="warning",
                                       message="Link with an empty target.", line=idx + 1))
        if _EMPTY_IMAGE.search(line):
            issues.append(QualityIssue(type="orphaned_image", severity="info",
                                       message="Image reference with an empty source.",
                                       line=idx + 1))
        if _HTML_TAG.search(line):
            issues.append(QualityIssue(type="html_artifact", severity="info",
                                       message="Leftover HTML tag in output.",
                                       line=idx + 1))
        if _CONTROL.search(line):
            issues.append(QualityIssue(type="control_characters", severity="warning",
                                       message="Invisible/control characters present.",
                                       line=idx + 1))
    flush_table_block()

    if re.search(r"\n{3,}", markdown):
        issues.append(QualityIssue(type="excessive_whitespace", severity="info",
                                   message="Runs of 3+ blank lines remain.", line=None))

    penalty = sum(_PENALTY.get(i.severity, 5) for i in issues)
    score = max(0, 100 - penalty)
    return issues[:50], score
