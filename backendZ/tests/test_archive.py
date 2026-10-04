"""Archive inspection, safety and output rendering (app/archive.py)."""

import json
import re
import zipfile

import pytest

import app.archive as archive
from app.common.errors import ConversionRejected
from zips import html_doc, make_zip, mark_encrypted, png_bytes, zip_with_infos


def docs(data, ext, filename):
    """Stand-in for MarkItDown so these tests stay fast."""
    return f"# {filename}\n\nconverted {ext} ({len(data)} bytes)"


def run(entries, **kw):
    return archive.process_archive(make_zip(entries), docs, ocr_available=kw.get("ocr", True))


def by_path(entries):
    return {e.path: e for e in entries}


# ── classification and conversion ──────────────────────────────────────────


def test_project_is_classified_and_converted():
    result = by_path(run({
        "README.md": "# Hello\n\nProject readme",
        "src/app.ts": "export const x = 1;\n",
        "src/Dockerfile": "FROM python:3.12\n",
        "docs/guide.html": html_doc("Guide", "Steps"),
        "docs/logo.png": png_bytes(),
        "LICENSE": "MIT License\n",
        "tools/tool.exe": b"MZ\x90\x00" + b"\x00" * 50,
    }))
    assert result["README.md"].node_type == "TEXT_FILE" and result["README.md"].content.startswith("# Hello")
    assert result["src/app.ts"].content == "```typescript\nexport const x = 1;\n```"
    assert result["src/Dockerfile"].language == "dockerfile"
    assert result["docs/guide.html"].node_type == "DOCUMENT" and result["docs/guide.html"].engine == "MarkItDown"
    assert result["docs/logo.png"].status == "PENDING" and result["docs/logo.png"].data
    assert result["LICENSE"].status == "DONE" and result["LICENSE"].node_type == "CODE_FILE"
    assert result["tools/tool.exe"].status == "SKIPPED" and result["tools/tool.exe"].skip_reason == "binary file"


def test_code_fence_outgrows_backticks_inside_the_file():
    text = "x = '''\n```\ninside\n```\n'''\n"
    out = archive.fenced(text, "python")
    assert out.startswith("````python\n") and out.endswith("\n````")


def test_images_without_storage_are_listed_not_recognised():
    result = by_path(run({"a.png": png_bytes()}, ocr=False))
    assert result["a.png"].status == "SKIPPED"
    assert "direct upload" in result["a.png"].skip_reason


def test_image_limit(monkeypatch):
    monkeypatch.setattr(archive, "MAX_OCR_IMAGES", 1)
    entries = run({"a.png": png_bytes(), "b.png": png_bytes()})
    assert [e.status for e in entries] == ["PENDING", "SKIPPED"]


# ── safety ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("name", ["../evil.txt", "a/../../evil.txt", "/etc/passwd", "C:/Windows/win.ini", "..\\evil.txt", "a\x01b.txt"])
def test_unsafe_paths_are_skipped_and_never_used(name):
    [entry] = archive.process_archive(zip_with_infos([(zipfile.ZipInfo(name), b"x")]), docs, ocr_available=True)
    assert entry.status == "SKIPPED"
    assert entry.skip_reason.startswith("unsafe path")
    assert entry.path.startswith("(unsafe) ")


def test_symlinks_encrypted_and_duplicates_are_skipped():
    link = zipfile.ZipInfo("link.txt")
    link.external_attr = (0o120777 << 16)
    data = zip_with_infos([(link, b"/etc/passwd"), (zipfile.ZipInfo("secret.txt"), b"x"),
                           (zipfile.ZipInfo("A.txt"), b"1"), (zipfile.ZipInfo("a.txt"), b"2")])
    entries = by_path(archive.process_archive(mark_encrypted(data, "secret.txt"), docs, ocr_available=True))
    assert entries["link.txt"].skip_reason == "symbolic link"
    assert entries["secret.txt"].skip_reason == "encrypted"
    assert "a.txt (duplicate)" in entries or "A.txt (duplicate)" in entries


def test_credentials_are_listed_but_never_converted():
    result = by_path(run({".env": "API_KEY=abc", "deploy/id_rsa": "-----BEGIN", "certs/site.pem": "x", "app.py": "print(1)"}))
    for path in (".env", "deploy/id_rsa", "certs/site.pem"):
        assert result[path].status == "SKIPPED" and result[path].content is None, path
        assert "credentials" in result[path].skip_reason
    assert result["app.py"].status == "DONE"
    assert "| `.env` | Sensitive | Skipped |" in archive.project_index("p.zip", list(result.values()), {})


def test_dependency_folders_are_indexed_not_converted():
    result = by_path(run({"node_modules/lib/index.js": "x", ".git/config": "x", "src/index.js": "y"}))
    assert result["node_modules/lib/index.js"].skip_reason.startswith("dependency or build folder")
    assert result[".git/config"].status == "SKIPPED"
    assert result["src/index.js"].status == "DONE"


def test_compression_bomb_entry_is_skipped():
    bomb = b"\x00" * (3 * 1024 * 1024)  # compresses ~1000:1
    result = by_path(run({"zeros.txt": bomb, "ok.txt": "fine"}))
    assert result["zeros.txt"].skip_reason == "suspicious compression ratio"
    assert result["ok.txt"].status == "DONE"


def test_total_expansion_limit(monkeypatch):
    monkeypatch.setattr(archive, "MAX_TOTAL_BYTES", 10)
    entries = run({"a.txt": "12345678", "b.txt": "12345678"})
    assert [e.status for e in entries] == ["DONE", "SKIPPED"]
    assert "expands beyond" in entries[1].skip_reason


def test_too_many_files_is_rejected_up_front(monkeypatch):
    monkeypatch.setattr(archive, "MAX_ENTRIES", 3)
    with pytest.raises(ConversionRejected) as err:
        run({f"f{i}.txt": "x" for i in range(4)})
    assert err.value.status_code == 413


def test_nested_zip_one_level_deep_only():
    inner2 = make_zip({"deep.txt": "too deep"})
    inner = make_zip({"lib/util.py": "def f(): pass\n", "more.zip": inner2})
    result = by_path(run({"vendor.zip": inner, "main.py": "import lib\n"}))
    assert result["vendor.zip"].node_type == "NESTED_ARCHIVE" and result["vendor.zip"].status == "DONE"
    assert result["vendor.zip/lib/util.py"].depth == 1 and result["vendor.zip/lib/util.py"].status == "DONE"
    assert result["vendor.zip/more.zip"].skip_reason == "nested archive too deep"


def test_not_a_zip_is_rejected():
    with pytest.raises(ConversionRejected) as err:
        archive.process_archive(b"%PDF-1.4", docs, ocr_available=True)
    assert err.value.status_code == 400


def test_a_document_that_fails_does_not_fail_the_archive():
    def broken(data, ext, filename):
        raise ValueError("corrupt")

    entries = by_path(archive.process_archive(make_zip({"bad.docx": b"PK..", "ok.txt": "fine"}), broken, ocr_available=True))
    assert entries["bad.docx"].status == "FAILED"
    assert entries["ok.txt"].status == "DONE"


def test_time_budget(monkeypatch):
    monkeypatch.setattr(archive, "TIME_BUDGET_S", -1)
    entries = run({"a.txt": "x"})
    assert entries[0].skip_reason == "time limit reached"


# ── outputs ────────────────────────────────────────────────────────────────


def test_index_manifest_and_combined_output():
    entries = run({"src/app.py": "print(1)\n", "docs/logo.png": png_bytes(), "notes.md": "## Notes\nhi", "x.bin": b"\x00\x01"})
    logo = next(e for e in entries if e.path == "docs/logo.png")
    ocr = {logo.node_id: "Logo text"}

    body = archive.combined_body(entries, ocr)
    assert body.index("## `docs/logo.png`") < body.index("## `notes.md`") < body.index("## `src/app.py`")
    assert "Logo text" in body

    index = archive.project_index("proj.zip", entries, ocr)
    assert "- Files found: 4" in index and "- Converted: 3" in index and "- Skipped: 1" in index
    assert "├── " in index or "└── " in index
    assert "| `docs/logo.png` | Image | Converted | OCR |" in index

    data = json.loads(archive.manifest("job-1", "proj.zip", 123, entries, ocr))
    assert data["source"]["entries"] == 4
    node = next(n for n in data["nodes"] if n["path"] == "docs/logo.png")
    assert node["status"] == "DONE" and node["engine"] == "Tesseract"
    assert all("content" not in n and "data" not in n for n in data["nodes"])


def test_document_headings_are_demoted_under_the_file_heading():
    out = archive._demote("# Title\n\n```\n# not a heading\n```\n## Sub")
    assert out.splitlines()[0] == "### Title"
    assert "# not a heading" in out.splitlines()
    assert out.splitlines()[-1] == "#### Sub"


def test_large_results_split_at_file_boundaries(monkeypatch):
    monkeypatch.setattr(archive, "PART_BYTES", 200)
    content = "# P\n\n" + "\n\n".join(f"## `f{i}.txt`\n\n" + "x" * 80 for i in range(6))
    parts = archive.split_parts(content, "P")
    assert len(parts) > 1
    assert all(p.count("## `") >= 1 for p in parts)
    assert parts[1].startswith(f"# P (part 2 of {len(parts)})")
    assert "".join(parts).count("## `") == 6
    assert all(len(p.encode("utf-8")) <= 200 for p in parts)


@pytest.mark.parametrize("body", [
    "x" * 2500,
    "漢字🙂" * 300,
    "a\u0301" * 900,
    "line one\r\nline two\r\n" * 100,
    "```python\n" + "print('漢字🙂')\n" * 180 + "```\n",
])
def test_one_large_file_splits_without_losing_utf8_text(monkeypatch, body):
    monkeypatch.setattr(archive, "PART_BYTES", 256)
    content = "# Project\n\n## `large.txt`\n\n" + body
    parts = archive.split_parts(content, "資料🙂")
    assert len(parts) > 1
    assert all(len(part.encode("utf-8")) <= 256 for part in parts)
    restored = parts[0] + "".join(
        re.sub(r"\A# 資料🙂 \(part \d+ of \d+\)\n\n", "", p) for p in parts[1:]
    )
    assert restored == content


def test_continuation_titles_fit_the_part_budget(monkeypatch):
    monkeypatch.setattr(archive, "PART_BYTES", 200)
    content = "## `one.txt`\n" + "x" * 2000
    parts = archive.split_parts(content, "題" * 20)
    assert all(len(part.encode("utf-8")) <= 200 for part in parts)
    assert parts[1].startswith(f"# {'題' * 20} (part 2 of {len(parts)})\n\n")


def test_real_part_limit_bounds_one_oversized_entry():
    content = "## `large.txt`\n\n" + "漢🙂" * (archive.PART_BYTES // 7 + 100)
    parts = archive.split_parts(content, "Large")
    assert len(parts) == 2
    assert all(len(part.encode("utf-8")) <= archive.PART_BYTES for part in parts)
    prefix = "# Large (part 2 of 2)\n\n"
    assert parts[0] + parts[1].removeprefix(prefix) == content


@pytest.mark.parametrize("content", ["", "a" * 200, "漢" * 66])
def test_small_results_are_unchanged(monkeypatch, content):
    monkeypatch.setattr(archive, "PART_BYTES", 200)
    assert archive.split_parts(content, "P") == [content]


def test_unsafe_entry_names_are_escaped_in_tables():
    entries = [archive.Entry(path="a|b.txt", status="DONE", content="x", engine="direct")]
    assert "`a\\|b.txt`" in archive.project_index("p.zip", entries, {})
