"""app/common is copied into every backend and must stay identical."""

from pathlib import Path

import pytest


def test_common_package_in_sync_with_other_backends():
    here = Path(__file__).resolve().parents[1] / "app" / "common"
    root = here.parents[2]
    others = [root / name / "app" / "common" for name in ("backendN", "backendO", "backendZ") if name != here.parents[1].name]
    present = [there for there in others if there.exists()]
    if not present:
        pytest.skip("no other backend present")
    for there in present:
        backend = there.parents[1].name
        for path in sorted(here.glob("*.py")):
            twin = there / path.name
            assert twin.exists(), f"{twin} missing"
            assert path.read_bytes() == twin.read_bytes(), f"app/common/{path.name} differs from {backend}"
        assert {p.name for p in there.glob("*.py")} == {p.name for p in here.glob("*.py")}, backend
