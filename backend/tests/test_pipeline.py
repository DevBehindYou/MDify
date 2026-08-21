"""Tests for the pure pipeline stages and profiles."""

from __future__ import annotations

from app.pipeline.pipeline import process
from app.pipeline.profiles import get_profile
from app.pipeline.stages.analyze import analyze_counts, compute_stats, est_tokens
from app.pipeline.stages.normalize import normalize_markdown
from app.pipeline.stages.optimize import optimize_markdown
from app.pipeline.stages.quality import analyze_issues


# ── normalize ────────────────────────────────────────────────────────────────
def test_normalize_collapses_blank_lines_and_crlf():
    out = normalize_markdown("line1\r\n\r\n\r\n\r\nline2   \n")
    assert "\r" not in out
    assert "\n\n\n" not in out
    assert "line1\n\nline2" in out


# ── stats + tokens ───────────────────────────────────────────────────────────
def test_stats_reduction():
    raw = "word " * 100
    final = "word " * 40
    stats = compute_stats(final, raw, input_bytes=1234)
    assert stats.input_bytes == 1234
    assert stats.estimated_tokens == est_tokens(final)
    assert stats.estimated_tokens_source == est_tokens(raw)
    assert stats.token_reduction_pct > 0
    assert "cl100k" in stats.tokenizer


def test_counts():
    md = "# H1\n\n## H2\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[l](http://x)\n\n![i](y.png)"
    c = analyze_counts(md)
    assert c["headings"] == 2
    assert c["tables"] >= 1
    assert c["links"] == 1
    assert c["images"] == 1
    assert c["structure_warning"] is False


def test_structure_warning_wall_of_text():
    assert analyze_counts("word " * 500)["structure_warning"] is True


# ── optimize / profiles ──────────────────────────────────────────────────────
def test_strip_html():
    cfg = get_profile("clean")
    out = optimize_markdown("Hello <div>x</div> <!-- c --> world", cfg)
    assert "<div>" not in out and "<!--" not in out
    assert "Hello" in out and "world" in out


def test_html_preserved_in_code_fence():
    cfg = get_profile("clean")
    src = "```html\n<div>keep</div>\n```\n"
    out = optimize_markdown(src, cfg)
    assert "<div>keep</div>" in out


def test_compact_drops_images_and_repeats():
    cfg = get_profile("compact")
    src = "Page 7\n\n# Title\n\n![x](a.png)\n\nBody\n\nPage 7\n\nMore\n\nPage 7\n"
    out = optimize_markdown(src, cfg)
    assert "![x]" not in out
    assert "Page 7" not in out
    assert "# Title" in out and "Body" in out


def test_rag_ready_normalizes_heading_jump():
    cfg = get_profile("rag_ready")
    out = optimize_markdown("# A\n\n#### B\n", cfg)
    lines = [ln for ln in out.split("\n") if ln.startswith("#")]
    assert lines[0] == "# A"
    assert lines[1] == "## B"  # H4 pulled up to H2 (no skipped level)


def test_standard_is_faithful():
    cfg = get_profile("standard")
    src = "# T\n\n<div>x</div>\n\n![i](a.png)\n"
    out = optimize_markdown(src, cfg)
    assert "<div>x</div>" in out and "![i]" in out


# ── quality engine ───────────────────────────────────────────────────────────
def test_quality_clean_high_score():
    issues, score = analyze_issues("# Title\n\nGood clean paragraph.\n")
    assert score == 100
    assert issues == []


def test_quality_flags_issues():
    md = "# A\n\n#### B\n\n[bad]()\n\n<div>x</div>\n\n#\n"
    issues, score = analyze_issues(md)
    types = {i.type for i in issues}
    assert "heading_hierarchy_jump" in types
    assert "broken_link" in types
    assert "html_artifact" in types
    assert "empty_heading" in types
    assert score < 100


def test_quality_malformed_table():
    issues, _ = analyze_issues("| a | b |\n| 1 | 2 |\n")  # no separator row
    assert any(i.type == "malformed_table" for i in issues)


# ── end-to-end pipeline ──────────────────────────────────────────────────────
def test_process_rag_ready_end_to_end():
    doc = process("# Hi\r\n\r\n<div>x</div>\r\n\r\nbody\n", "rag_ready", input_bytes=50)
    assert doc.profile == "rag_ready"
    assert "<div>" not in doc.markdown
    assert doc.quality.quality_score >= 0
    assert doc.stats.input_bytes == 50


def test_process_unknown_profile_defaults_standard():
    doc = process("# Hi\n", "nope")
    assert doc.profile == "standard"
