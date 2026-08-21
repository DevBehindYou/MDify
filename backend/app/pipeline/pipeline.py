"""Post-extraction pipeline: raw Markdown -> normalized, optimized, analyzed.

Ordered pure stages, each independently testable:
    normalize -> optimize(profile) -> stats + quality
New stages (chunking, embeddings) slot in without touching callers.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.pipeline.profiles import ProfileConfig, get_profile
from app.pipeline.stages.analyze import analyze_counts, compute_stats
from app.pipeline.stages.normalize import normalize_markdown
from app.pipeline.stages.optimize import optimize_markdown
from app.pipeline.stages.quality import analyze_issues
from app.schemas.conversion import DocumentStats, QualitySummary


@dataclass
class ProcessedDocument:
    markdown: str
    stats: DocumentStats
    quality: QualitySummary
    profile: str


def process(
    raw_markdown: str,
    profile: ProfileConfig | str | None = None,
    input_bytes: int = 0,
) -> ProcessedDocument:
    cfg = profile if isinstance(profile, ProfileConfig) else get_profile(profile)

    normalized = normalize_markdown(raw_markdown)
    optimized = optimize_markdown(normalized, cfg)

    stats = compute_stats(optimized, raw_markdown, input_bytes)
    counts = analyze_counts(optimized)
    issues, score = analyze_issues(optimized)
    quality = QualitySummary(quality_score=score, issues=issues, **counts)

    return ProcessedDocument(markdown=optimized, stats=stats, quality=quality, profile=cfg.id)
