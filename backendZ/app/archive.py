"""Safe ZIP processing for the archive pool (Z1, Z2).

Pipeline: inspect entries from the central directory (no bytes read yet) →
reject what is unsafe → classify → convert code, text and documents in this
process → hand images to O1/O2 → render one project result.

Everything the upload contains is accounted for: an entry that is skipped
keeps its path and the reason, and appears in PROJECT_INDEX.md and
manifest.json. Nothing is ever extracted to disk.
"""

from __future__ import annotations

import io
import json
import os
import re
import time
import unicodedata
import uuid
import zipfile
from bisect import bisect_right
from dataclasses import asdict, dataclass, field

from app.common.errors import ConversionRejected


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


MB = 1024 * 1024
MAX_ENTRIES = _env_int("MAX_ARCHIVE_ENTRIES", 2000)
MAX_TOTAL_BYTES = _env_int("MAX_ARCHIVE_UNCOMPRESSED_BYTES", 100 * MB)
MAX_ENTRY_BYTES = _env_int("MAX_ENTRY_UNCOMPRESSED_BYTES", 15 * MB)
MAX_IMAGE_BYTES = _env_int("MAX_ARCHIVE_IMAGE_BYTES", 10 * MB)  # the OCR pool's cap
MAX_RATIO = _env_int("MAX_COMPRESSION_RATIO", 100)
MAX_DEPTH = _env_int("MAX_ARCHIVE_DEPTH", 1)  # a ZIP inside the upload, not deeper
MAX_NESTED = _env_int("MAX_NESTED_ARCHIVES", 10)
MAX_OCR_IMAGES = _env_int("MAX_ARCHIVE_OCR_IMAGES", 50)
MAX_OUTPUT_BYTES = _env_int("MAX_ARCHIVE_OUTPUT_BYTES", 40 * MB)
MAX_SNIFF_BYTES = 1 * MB  # unknown extension: treated as text only when small and UTF-8
TIME_BUDGET_S = float(os.environ.get("ARCHIVE_TIME_BUDGET_S", "100"))
PART_BYTES = 4 * MB  # Storage objects and responses stay small

ENGINE = "MDify Archive + MarkItDown"

# Smart project mode: indexed, not converted.
SKIP_DIRS = frozenset({
    "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", "vendor", ".venv", "venv",
    "env", "__pycache__", ".pytest_cache", ".mypy_cache", "coverage", ".next", ".nuxt",
    ".idea", ".vscode", "target", "bin", "obj", ".gradle", ".terraform", "bower_components",
})

# Files that commonly hold credentials: listed, never converted or stored.
SENSITIVE = re.compile(
    r"^(\.env(\..*)?|id_(rsa|dsa|ecdsa|ed25519)|.*\.(pem|key|p12|pfx|kdbx|keystore|jks)"
    r"|\.npmrc|\.pypirc|\.netrc|\.git-credentials|credentials(\.json)?|secrets?\.(json|ya?ml|toml))$",
    re.IGNORECASE,
)

IMAGE_EXT = frozenset({"jpg", "jpeg", "png", "webp", "tif", "tiff", "bmp", "gif"})
DOCUMENT_EXT = frozenset({"pdf", "docx", "xlsx", "xls", "pptx", "epub", "html", "htm", "csv", "tsv"})
MARKDOWN_EXT = frozenset({"md", "markdown", "mdx"})
PLAIN_EXT = frozenset({"txt", "rst", "text", "log", "adoc"})
LANGUAGES = {
    "py": "python", "js": "javascript", "mjs": "javascript", "cjs": "javascript", "jsx": "jsx",
    "ts": "typescript", "tsx": "tsx", "java": "java", "kt": "kotlin", "kts": "kotlin", "scala": "scala",
    "c": "c", "h": "c", "cpp": "cpp", "cc": "cpp", "hpp": "cpp", "cs": "csharp", "go": "go", "rs": "rust",
    "rb": "ruby", "php": "php", "swift": "swift", "m": "objectivec", "dart": "dart", "lua": "lua",
    "pl": "perl", "r": "r", "sh": "bash", "bash": "bash", "zsh": "bash", "ps1": "powershell",
    "bat": "batch", "cmd": "batch", "sql": "sql", "vue": "vue", "svelte": "svelte", "css": "css",
    "scss": "scss", "sass": "sass", "less": "less", "json": "json", "jsonc": "json", "yaml": "yaml",
    "yml": "yaml", "toml": "toml", "ini": "ini", "cfg": "ini", "conf": "ini", "xml": "xml",
    "gradle": "groovy", "groovy": "groovy", "graphql": "graphql", "proto": "protobuf", "tf": "hcl",
    "ex": "elixir", "exs": "elixir", "erl": "erlang", "hs": "haskell", "clj": "clojure",
    "ipynb": "json", "lock": "", "env": "", "gitignore": "", "dockerignore": "",
}
NAMED_LANGUAGES = {
    "dockerfile": "dockerfile", "makefile": "makefile", "gemfile": "ruby", "rakefile": "ruby",
    "procfile": "", "license": "", "licence": "", "readme": "", "changelog": "", "authors": "",
    "notice": "", "copying": "", "codeowners": "", ".gitignore": "", ".dockerignore": "",
    ".editorconfig": "ini", ".gitattributes": "",
}


@dataclass
class Entry:
    path: str
    depth: int = 0
    size: int = 0
    node_type: str = "ARCHIVE_ENTRY"
    classification: str = "UNSUPPORTED"
    status: str = "SKIPPED"  # DONE | SKIPPED | FAILED | PENDING (image waiting for OCR)
    engine: str | None = None
    skip_reason: str | None = None
    language: str | None = None
    content: str | None = None
    node_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    data: bytes | None = field(default=None, repr=False)  # image bytes, never serialized

    def public(self) -> dict:
        record = asdict(self)
        record.pop("data", None)
        return record


@dataclass
class State:
    started: float = field(default_factory=time.monotonic)
    total_bytes: int = 0
    entries_seen: int = 0
    nested: int = 0
    output_bytes: int = 0
    images_for_ocr: int = 0
    seen_paths: set = field(default_factory=set)

    def out_of_time(self) -> bool:
        return time.monotonic() - self.started > TIME_BUDGET_S


def normalize(name: str) -> str | None:
    """Canonical relative path, or None when the name tries to escape or is invalid."""
    name = name.replace("\\", "/")
    if name.startswith("/") or re.match(r"^[A-Za-z]:", name):
        return None
    if any(ord(ch) < 32 or ch == "\x7f" for ch in name):
        return None
    parts = [p for p in name.split("/") if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts):
        return None
    return unicodedata.normalize("NFC", "/".join(parts))


def display_path(name: str) -> str:
    """A harmless label for an unsafe name (index only, never used as a path)."""
    cleaned = "".join(ch if 32 <= ord(ch) != 127 else "?" for ch in name.replace("\\", "/"))
    return cleaned[:300]


def _is_symlink(info: zipfile.ZipInfo) -> bool:
    return (info.external_attr >> 16) & 0o170000 == 0o120000


def _ext(path: str) -> str:
    base = path.rsplit("/", 1)[-1]
    return base.rsplit(".", 1)[-1].lower() if "." in base.lstrip(".") else ""


def classify(path: str) -> tuple[str, str, str | None]:
    """(node_type, classification, language) from the name alone."""
    base = path.rsplit("/", 1)[-1]
    lower = base.lower()
    ext = _ext(path)
    if SENSITIVE.match(lower):
        return "BINARY", "SKIP", None
    if ext in IMAGE_EXT:
        return "IMAGE", "OCR_IMAGE", None
    if ext == "zip":
        return "NESTED_ARCHIVE", "ARCHIVE", None
    if ext in DOCUMENT_EXT:
        return "DOCUMENT", "NORMAL_DOCUMENT", None
    if ext in MARKDOWN_EXT or ext in PLAIN_EXT:
        return "TEXT_FILE", "DIRECT_TEXT", None
    if ext in LANGUAGES:
        return "CODE_FILE", "DIRECT_TEXT", LANGUAGES[ext]
    stem = lower.rsplit(".", 1)[0] if "." in lower.lstrip(".") else lower
    if lower in NAMED_LANGUAGES or stem in NAMED_LANGUAGES:
        return "CODE_FILE", "DIRECT_TEXT", NAMED_LANGUAGES.get(lower, NAMED_LANGUAGES.get(stem, ""))
    return "BINARY", "UNSUPPORTED", None


def fenced(text: str, language: str | None) -> str:
    longest = max((len(m) for m in re.findall(r"`{3,}", text)), default=2)
    fence = "`" * max(3, longest + 1)
    return f"{fence}{language or ''}\n{text.rstrip()}\n{fence}"


def _decode_text(data: bytes) -> str | None:
    if b"\x00" in data[:8192]:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return data.decode("utf-8-sig")
        except UnicodeDecodeError:
            return None


def open_archive(data: bytes) -> zipfile.ZipFile:
    if not data.startswith(b"PK\x03\x04") and not data.startswith(b"PK\x05\x06"):
        raise ConversionRejected(400, "File content does not match the .zip extension", "magic_mismatch")
    try:
        return zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise ConversionRejected(400, "This ZIP file is damaged or incomplete", "bad_zip") from None


def process_archive(data: bytes, convert_document, *, ocr_available: bool) -> list[Entry]:
    """Inspects and converts. `convert_document(data, ext, filename)` → Markdown.

    Images get status PENDING when `ocr_available` (their bytes stay in
    Entry.data for upload to Storage), otherwise SKIPPED.
    """
    state = State()
    archive = open_archive(data)
    with archive:
        infos = archive.infolist()
        files = [i for i in infos if not i.is_dir()]
        if len(files) > MAX_ENTRIES:
            raise ConversionRejected(
                413, f"This archive has {len(files):,} files; MDify converts archives with up to {MAX_ENTRIES:,}.", "archive_entries"
            )
        entries: list[Entry] = []
        _walk(archive, files, "", 0, state, entries, convert_document, ocr_available)
    entries.sort(key=lambda e: e.path.casefold())
    return entries


def _walk(archive, infos, prefix, depth, state, out, convert_document, ocr_available):
    for info in sorted(infos, key=lambda i: i.filename.casefold()):
        state.entries_seen += 1
        rel = normalize(info.filename)
        if rel is None:
            out.append(Entry(path=prefix + "(unsafe) " + display_path(info.filename), depth=depth, size=info.file_size,
                             skip_reason="unsafe path (absolute, drive or ..)"))
            continue
        path = prefix + rel
        key = path.casefold()
        if key in state.seen_paths:
            out.append(Entry(path=path + " (duplicate)", depth=depth, size=info.file_size, skip_reason="duplicate path"))
            continue
        state.seen_paths.add(key)
        entry = Entry(path=path, depth=depth, size=info.file_size)
        out.append(entry)

        folders = rel.split("/")[:-1]
        if any(part in SKIP_DIRS for part in folders):
            entry.skip_reason = "dependency or build folder (smart project mode)"
            continue
        if _is_symlink(info):
            entry.skip_reason = "symbolic link"
            continue
        if info.flag_bits & 0x1:
            entry.skip_reason = "encrypted"
            continue

        entry.node_type, entry.classification, entry.language = classify(path)
        if entry.classification == "SKIP":
            entry.skip_reason = "may contain credentials, not converted"
            continue
        if entry.classification == "UNSUPPORTED" and info.file_size > MAX_SNIFF_BYTES:
            entry.skip_reason = "unsupported file type"
            continue
        limit = MAX_IMAGE_BYTES if entry.node_type == "IMAGE" else MAX_ENTRY_BYTES
        if info.file_size > limit:
            entry.skip_reason = f"larger than {limit // MB} MB"
            continue
        if info.compress_size and info.file_size > MB and info.file_size / info.compress_size > MAX_RATIO:
            entry.skip_reason = "suspicious compression ratio"
            continue
        if state.total_bytes + info.file_size > MAX_TOTAL_BYTES:
            entry.skip_reason = f"archive expands beyond {MAX_TOTAL_BYTES // MB} MB"
            continue
        if state.out_of_time():
            entry.skip_reason = "time limit reached"
            continue
        state.total_bytes += info.file_size

        try:
            with archive.open(info) as handle:
                raw = handle.read(limit + 1)
        except (zipfile.BadZipFile, RuntimeError, NotImplementedError, OSError, EOFError) as err:
            entry.status, entry.skip_reason = "FAILED", f"could not be read ({type(err).__name__})"
            continue
        if len(raw) > limit:
            entry.skip_reason = f"larger than {limit // MB} MB"
            continue

        if entry.node_type == "IMAGE":
            if not ocr_available:
                entry.skip_reason = "image text recognition needs direct upload"
            elif state.images_for_ocr >= MAX_OCR_IMAGES:
                entry.skip_reason = f"image limit reached ({MAX_OCR_IMAGES} per archive)"
            else:
                state.images_for_ocr += 1
                entry.status, entry.data, entry.skip_reason = "PENDING", raw, None
            continue

        if entry.node_type == "NESTED_ARCHIVE":
            if depth + 1 > MAX_DEPTH:
                entry.skip_reason = "nested archive too deep"
                continue
            if state.nested >= MAX_NESTED:
                entry.skip_reason = f"nested archive limit reached ({MAX_NESTED})"
                continue
            state.nested += 1
            try:
                inner = zipfile.ZipFile(io.BytesIO(raw))
            except zipfile.BadZipFile:
                entry.status, entry.skip_reason = "FAILED", "damaged ZIP"
                continue
            with inner:
                inner_files = [i for i in inner.infolist() if not i.is_dir()]
                if state.entries_seen + len(inner_files) > MAX_ENTRIES:
                    entry.skip_reason = "archive entry limit reached"
                    continue
                entry.status, entry.engine = "DONE", "archive"
                _walk(inner, inner_files, path + "/", depth + 1, state, out, convert_document, ocr_available)
            continue

        text = _convert(entry, raw, convert_document)
        if text is None:
            continue
        size = len(text.encode("utf-8"))
        if state.output_bytes + size > MAX_OUTPUT_BYTES:
            entry.status, entry.skip_reason, entry.engine = "SKIPPED", "output size limit reached", None
            continue
        state.output_bytes += size
        entry.content, entry.status = text, "DONE"


def _convert(entry: Entry, raw: bytes, convert_document) -> str | None:
    ext = _ext(entry.path)
    if entry.node_type == "DOCUMENT":
        try:
            markdown = (convert_document(raw, ext, entry.path.rsplit("/", 1)[-1]) or "").strip()
        except Exception as err:  # noqa: BLE001 - one bad file must not fail the archive
            entry.status, entry.skip_reason = "FAILED", f"could not be converted ({type(err).__name__})"
            return None
        entry.engine = "MarkItDown"
        return markdown or "_No extractable text._"

    text = _decode_text(raw)
    if text is None:
        entry.node_type, entry.classification = "BINARY", "UNSUPPORTED"
        entry.skip_reason = "binary file"
        return None
    if entry.classification == "UNSUPPORTED":  # small unknown file that is valid text
        entry.node_type, entry.classification, entry.language = "CODE_FILE", "DIRECT_TEXT", ""
    entry.engine = "direct"
    if entry.node_type == "TEXT_FILE":
        return text.strip() or "_Empty file._"
    return fenced(text, entry.language)


# ── Output ──────────────────────────────────────────────────────────────────


def _demote(markdown: str, levels: int = 2) -> str:
    """Keeps a document's own headings below the '## path' heading."""
    out, fence = [], None
    for line in markdown.splitlines():
        m = re.match(r"^(`{3,}|~{3,})", line)
        if m:
            fence = None if fence and line.startswith(fence) else (fence or m.group(1))
        if fence is None:
            h = re.match(r"^(#{1,6}) ", line)
            if h:
                line = "#" * min(6, len(h.group(1)) + levels) + line[len(h.group(1)):]
        out.append(line)
    return "\n".join(out)


def combined_body(entries: list[Entry], ocr_texts: dict[str, str | None]) -> str:
    blocks = []
    for e in entries:
        if e.node_type == "IMAGE" and e.node_id in ocr_texts:
            text = ocr_texts[e.node_id]
            body = text.strip() if text and text.strip() else "_No text was recognised in this image._"
            blocks.append(f"## `{e.path}`\n\n{body}")
        elif e.status == "DONE" and e.content is not None:
            body = _demote(e.content) if e.node_type == "DOCUMENT" else e.content
            blocks.append(f"## `{e.path}`\n\n{body}")
    return "\n\n".join(blocks)


def split_parts(content: str, title: str) -> list[str]:
    """Bounds encoded parts, preferring file headings and then line endings.

    A file larger than the part budget continues across parts without losing
    text. Removing continuation titles and concatenating recovers the input.
    """
    data = content.encode("utf-8")
    if len(data) <= PART_BYTES:
        return [content]

    # At least one input byte is consumed per part, so len(data) bounds both
    # numbers in a continuation title. Reserve its UTF-8 size before splitting.
    digits = "9" * len(str(len(data)))
    title_bytes = len(f"# {title} (part {digits} of {digits})\n\n".encode("utf-8"))
    continuation_budget = PART_BYTES - title_bytes
    if continuation_budget < 4:
        raise ValueError("Archive part budget must fit its title and a UTF-8 character")

    headings = [m.start() for m in re.finditer(rb"(?m)^## `", data)]
    parts, start = [], 0
    while start < len(data):
        budget = PART_BYTES if not parts else continuation_budget
        end = min(start + budget, len(data))
        if end < len(data):
            # Do not separate a multibyte code point from its continuation bytes.
            while data[end] & 0xC0 == 0x80:
                end -= 1
            heading_index = bisect_right(headings, end) - 1
            if heading_index >= 0 and headings[heading_index] > start:
                end = headings[heading_index]
            else:
                newline = data.rfind(b"\n", start, end)
                # Avoid a tiny header-only part when one long line follows it.
                if newline >= start + budget // 2:
                    end = newline + 1
        parts.append(data[start:end].decode("utf-8"))
        start = end
    total = len(parts)
    return [p if i == 0 else f"# {title} (part {i + 1} of {total})\n\n{p}" for i, p in enumerate(parts)]


def _tree(paths: list[str]) -> str:
    root: dict = {}
    for p in paths:
        node = root
        for part in p.split("/"):
            node = node.setdefault(part, {})
    lines: list[str] = []

    def walk(node: dict, prefix: str) -> None:
        items = sorted(node.items(), key=lambda kv: (not kv[1], kv[0].casefold()))
        for i, (name, child) in enumerate(items):
            last = i == len(items) - 1
            lines.append(f"{prefix}{'└── ' if last else '├── '}{name}{'/' if child else ''}")
            walk(child, prefix + ("    " if last else "│   "))

    walk(root, "")
    return "\n".join(lines[:5000])


def _cell(text: str | None) -> str:
    return (text or "").replace("|", "\\|").replace("\n", " ")


TYPE_LABEL = {
    "CODE_FILE": "Code", "TEXT_FILE": "Text", "DOCUMENT": "Document", "IMAGE": "Image",
    "NESTED_ARCHIVE": "ZIP", "BINARY": "Binary", "ARCHIVE_ENTRY": "File",
}


def project_index(name: str, entries: list[Entry], ocr_texts: dict[str, str | None]) -> str:
    def status(e: Entry) -> str:
        if e.node_type == "IMAGE" and e.node_id in ocr_texts:
            return "Converted" if ocr_texts[e.node_id] is not None else "Failed"
        return {"DONE": "Converted", "SKIPPED": "Skipped", "FAILED": "Failed", "PENDING": "Failed"}[e.status]

    def engine(e: Entry) -> str:
        if e.node_type == "IMAGE" and e.node_id in ocr_texts:
            return "OCR"
        return {"direct": "Direct", "MarkItDown": "MarkItDown", "archive": "Archive"}.get(e.engine or "", "")

    rows = [(e, status(e)) for e in entries]
    count = lambda s: sum(1 for _, st in rows if st == s)  # noqa: E731
    ocr_count = sum(1 for e, st in rows if e.node_type == "IMAGE" and st == "Converted")
    lines = [
        f"# Project Conversion: {name}",
        "",
        "## Summary",
        "",
        f"- Files found: {len(entries)}",
        f"- Converted: {count('Converted')}",
        f"- Text recognised in images: {ocr_count}",
        f"- Skipped: {count('Skipped')}",
        f"- Failed: {count('Failed')}",
        "",
        "## Tree",
        "",
        "```text",
        _tree([e.path for e in entries]),
        "```",
        "",
        "## Results",
        "",
        "| Path | Type | Status | Engine |",
        "|---|---|---|---|",
    ]
    for e, st in rows:
        kind = "Sensitive" if e.classification == "SKIP" else TYPE_LABEL.get(e.node_type, "File")
        lines.append(f"| `{_cell(e.path)}` | {kind} | {st} | {engine(e)} |")
    skipped = [(e, st) for e, st in rows if st != "Converted"]
    if skipped:
        lines += ["", "## Skipped and failed", "", "| Path | Reason |", "|---|---|"]
        for e, st in skipped:
            reason = e.skip_reason or ("no text could be recognised" if st == "Failed" else "")
            lines.append(f"| `{_cell(e.path)}` | {_cell(reason)} |")
    return "\n".join(lines) + "\n"


def manifest(job_id: str | None, name: str, size: int, entries: list[Entry], ocr_texts: dict[str, str | None]) -> str:
    nodes = []
    for e in entries:
        record = {k: v for k, v in e.public().items() if k not in ("content",)}
        if e.node_type == "IMAGE" and e.node_id in ocr_texts:
            record["status"] = "DONE" if ocr_texts[e.node_id] is not None else "FAILED"
            record["engine"] = "Tesseract"
        nodes.append(record)
    return json.dumps(
        {
            "job_id": job_id,
            "source": {"filename": name, "bytes": size, "entries": len(entries)},
            "limits": {
                "max_entries": MAX_ENTRIES, "max_uncompressed_bytes": MAX_TOTAL_BYTES,
                "max_entry_bytes": MAX_ENTRY_BYTES, "max_depth": MAX_DEPTH, "max_ocr_images": MAX_OCR_IMAGES,
            },
            "nodes": nodes,
        },
        ensure_ascii=False,
        indent=2,
    )
