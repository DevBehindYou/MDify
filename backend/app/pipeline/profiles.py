"""Processing profiles — named transformation presets.

A profile is a bundle of optimization flags applied after normalization. This
replaces hard-coded behavior: adding a new profile is a config entry, not a
code branch scattered through the pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProfileConfig:
    id: str
    label: str
    description: str
    strip_html: bool = False
    normalize_headings: bool = False
    remove_repeated_lines: bool = False
    drop_images: bool = False
    tighten_whitespace: bool = False  # beyond the always-on normalize pass


PROFILES: dict[str, ProfileConfig] = {
    "standard": ProfileConfig(
        id="standard",
        label="Standard",
        description="Faithful conversion. Normalized whitespace only, no cleanup.",
    ),
    "clean": ProfileConfig(
        id="clean",
        label="Clean",
        description="Strip leftover HTML artifacts and tighten whitespace.",
        strip_html=True,
        tighten_whitespace=True,
    ),
    "compact": ProfileConfig(
        id="compact",
        label="Compact",
        description="Clean, plus drop images and repeated header/footer lines to "
        "cut tokens. Tables preserved.",
        strip_html=True,
        tighten_whitespace=True,
        remove_repeated_lines=True,
        drop_images=True,
    ),
    "rag_ready": ProfileConfig(
        id="rag_ready",
        label="RAG-ready",
        description="Structured for LLM ingestion: normalized heading hierarchy, "
        "repeated header/footer removal, HTML stripped, tables preserved.",
        strip_html=True,
        tighten_whitespace=True,
        remove_repeated_lines=True,
        normalize_headings=True,
    ),
}

DEFAULT_PROFILE = "standard"


def get_profile(profile_id: str | None) -> ProfileConfig:
    """Return the requested profile, falling back to the default."""
    return PROFILES.get((profile_id or DEFAULT_PROFILE).lower(), PROFILES[DEFAULT_PROFILE])
