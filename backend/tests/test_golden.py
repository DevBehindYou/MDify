"""Golden-output tests for stable text-family conversions.

Stores expected Markdown per fixture; conversion output must match byte-for-byte
(after normalization the pipeline already applies). This catches unintended
output drift from dependency upgrades.

Regenerate intentionally with:  MDIFY_REGEN=1 pytest tests/test_golden.py
Review the diff before committing regenerated goldens.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.services.conversion_service import convert_document
from tests import fixtures

GOLDEN_DIR = Path(__file__).parent / "golden"
REGEN = os.getenv("MDIFY_REGEN") == "1"

# Deterministic text-family fixtures only (binary converters can vary by lib).
CASES = [
    ("txt", fixtures.TXT),
    ("md", fixtures.MD),
    ("csv", fixtures.CSV),
    ("json", fixtures.JSON),
    ("xml", fixtures.XML),
    ("html", fixtures.HTML),
]


@pytest.mark.parametrize("ext,fixture", CASES, ids=[c[0] for c in CASES])
def test_golden(ext, fixture):
    filename, data = fixture
    result = convert_document(filename, data)  # standard profile
    golden = GOLDEN_DIR / f"{ext}.md"

    if REGEN or not golden.exists():
        GOLDEN_DIR.mkdir(exist_ok=True)
        golden.write_text(result.content, encoding="utf-8")
        if not REGEN:
            pytest.skip(f"created golden {golden.name} (first run)")
        return

    expected = golden.read_text(encoding="utf-8")
    assert result.content == expected, (
        f"{ext} output drifted from golden. If intentional, "
        f"run MDIFY_REGEN=1 pytest and review the diff."
    )
