"""Storage-backed archive tasks for the archive pool (Z1, Z2).

POST /api/v1/internal/archive/process
    Downloads the ZIP, inspects and converts it (app.archive). Images are
    stored under materialized/<node>/ for O1/O2. Without images the project
    result is written right away ("single"); otherwise the converted entries
    are saved as partial.json parts and the orchestrator runs the OCR items,
    then PROJECT_MERGE ("split").

POST /api/v1/internal/archive/merge
    Loads the parts and every image's recognised text, then writes
    PROJECT_INDEX.md, manifest.json and combined.md (split into parts when
    large) under output/.

Only object paths travel in requests and responses, never file content.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from app import archive
from app.common.app_factory import ProcessRequest, paths_belong_to_job
from app.common.errors import ConversionRejected, EngineUnavailable
from app.common.files import sanitize_filename, split_name, title_from_stem
from app.common.profiles import PROFILES, finalize_markdown
from app.common.security import require_internal_secret
from app.common.storage import StorageError

logger = logging.getLogger("mdify.archive")

WORKERS = 4
PARTIAL_BYTES = archive.PART_BYTES
METADATA_BYTES = archive.PART_BYTES
MAX_PARTIAL_PARTS = 100
IMAGE_MIME = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp",
    "gif": "image/gif", "bmp": "image/bmp", "tif": "image/tiff", "tiff": "image/tiff",
}


class OcrRef(BaseModel):
    node_id: str = Field(max_length=64)
    output_path: str = Field(max_length=200)
    logical_path: str | None = Field(default=None, max_length=2000)


class MergeRequest(BaseModel):
    job_id: uuid.UUID
    work_item_id: uuid.UUID | None = None
    output_path: str = Field(max_length=200)
    original_filename: str = Field(max_length=1024)
    profile: str = "Standard"
    partial_paths: list[str] = Field(min_length=1, max_length=MAX_PARTIAL_PARTS)
    ocr: list[OcrRef] = Field(default_factory=list, max_length=archive.MAX_OCR_IMAGES)
    source_bytes: int | None = None


def db_nodes(entries: list[archive.Entry]) -> list[dict]:
    """content_nodes rows (without file content) for the job's tree."""
    return [
        {
            "node_id": e.node_id,
            "node_type": e.node_type,
            "classification": e.classification,
            "logical_path": e.path[:2000],
            "archive_depth": e.depth,
            "size_bytes": e.size,
            "sequence_index": i,
            "status": e.status,
            "skip_reason": e.skip_reason,
            "metadata": {"engine": e.engine} if e.engine else {},
        }
        for i, e in enumerate(entries)
    ]


def _out_dir(job_id: str) -> str:
    return f"jobs/{job_id}/output/"


def resource_limit() -> HTTPException:
    return HTTPException(status_code=413, detail="Archive results exceed the processing limit. Split this archive into smaller ZIP files.")


def partial_blobs(entries: list[archive.Entry]) -> list[bytes]:
    """Pack the existing JSON array format by actual encoded bytes, including escapes."""
    parts, current, size, total = [], [], 2, 0
    for entry in entries:
        # Avoid serializing an already oversized content field (JSON can only grow it).
        if entry.content is not None and len(entry.content.encode("utf-8")) > PARTIAL_BYTES - 2:
            raise resource_limit()
        record = json.dumps(entry.public(), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(record) + 2 > PARTIAL_BYTES:
            raise resource_limit()
        added = len(record) + bool(current)
        if current and size + added > PARTIAL_BYTES:
            parts.append(b"[" + b",".join(current) + b"]")
            total += size
            current, size, added = [], 2, len(record)
        current.append(record)
        size += added
        if total + size > archive.MAX_OUTPUT_BYTES or len(parts) >= MAX_PARTIAL_PARTS:
            raise resource_limit()
    parts.append(b"[" + b",".join(current) + b"]")
    return parts


def write_outputs(store, *, job_id: str, name: str, profile: str, source_bytes: int,
                  entries: list[archive.Entry], ocr_texts: dict[str, str | None], settings) -> dict:
    if len(entries) > archive.MAX_ENTRIES:
        raise resource_limit()
    stem, _ext = split_name(name)
    title = title_from_stem(stem)
    content, words, tokens = finalize_markdown(
        archive.combined_body(entries, ocr_texts) or "_No convertible files were found in this archive._",
        title=title,
        original_name=name,
        size_bytes=source_bytes,
        engine=archive.ENGINE,
        profile=profile if profile in PROFILES else "Standard",
    )
    if len(content.encode("utf-8")) > archive.MAX_OUTPUT_BYTES:
        raise resource_limit()
    parts = archive.split_parts(content, title)
    out = _out_dir(job_id)
    files: list[tuple[str, bytes, str, str]] = []
    if len(parts) == 1:
        files.append((f"{out}combined.md", parts[0].encode("utf-8"), "text/markdown; charset=utf-8", f"{stem}.md"))
    else:
        for i, part in enumerate(parts, start=1):
            files.append((f"{out}combined-{i:03d}.md", part.encode("utf-8"), "text/markdown; charset=utf-8", f"{stem}-part-{i:03d}.md"))
    files.append((f"{out}PROJECT_INDEX.md", archive.project_index(name, entries, ocr_texts).encode("utf-8"),
                  "text/markdown; charset=utf-8", "PROJECT_INDEX.md"))
    files.append((f"{out}manifest.json", archive.manifest(job_id, name, source_bytes, entries, ocr_texts).encode("utf-8"),
                  "application/json; charset=utf-8", "manifest.json"))

    # Preflight every final object and their total before the first write. This
    # includes index/manifest bytes and continuation headings, not just source text.
    if (any(len(f[1]) > archive.PART_BYTES for f in files[:-2])
            or any(len(f[1]) > METADATA_BYTES for f in files[-2:])
            or sum(len(f[1]) for f in files) > archive.MAX_OUTPUT_BYTES):
        raise resource_limit()

    try:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            list(pool.map(lambda f: store.upload(f[0], f[1], f[2]), files))
    except StorageError as err:
        raise HTTPException(status_code=503 if err.transient else 502, detail="Could not store the project result") from None

    failed = sum(1 for e in entries if e.status == "FAILED") + sum(1 for v in ocr_texts.values() if v is None)
    skipped = sum(1 for e in entries if e.status == "SKIPPED")
    warnings = [w for w in (f"archive-skipped:{skipped}" if skipped else None, f"archive-failed:{failed}" if failed else None) if w]
    return {
        "filename": f"{stem}.md",
        "original_name": name,
        "char_count": len(content),
        "word_count": words,
        "tokens_est": tokens,
        "engine": archive.ENGINE,
        "backend_role": settings.role,
        "backend_instance": settings.instance,
        "warnings": warnings,
        "output_bytes": sum(len(f[1]) for f in files),
        "outputs": [{"path": f[0], "kind": "OUTPUT", "bytes": len(f[1]), "name": f[3]} for f in files],
        "primary_output": files[0][0],
    }


def register(app: FastAPI) -> None:
    settings = app.state.settings
    converter = app.state.converter

    def storage():
        client = app.state.storage
        if client is None:
            raise HTTPException(status_code=503, detail="Storage is not configured on this instance")
        return client

    @app.post("/api/v1/internal/archive/process", dependencies=[Depends(require_internal_secret)])
    def process(req: ProcessRequest) -> dict:
        store = storage()
        job_id = str(req.job_id)
        paths_belong_to_job(job_id, req.input_path, req.output_path)
        name = sanitize_filename(req.original_filename)
        started = time.perf_counter()
        try:
            data = store.download(req.input_path, settings.max_upload_bytes)
        except StorageError as err:
            raise HTTPException(status_code=503 if err.transient else 409, detail=str(err)) from None

        try:
            entries = archive.process_archive(data, converter.documents, ocr_available=True)
        except ConversionRejected as err:
            raise HTTPException(status_code=err.status_code, detail=err.detail) from None
        except EngineUnavailable:
            raise HTTPException(status_code=503, detail="Conversion engine unavailable") from None
        except Exception:
            logger.exception("archive processing failed job=%s", job_id)
            raise HTTPException(status_code=422, detail="This ZIP file couldn't be processed.") from None

        images = [e for e in entries if e.status == "PENDING"]
        uploads = []
        ocr = []
        for e in images:
            ext = archive._ext(e.path)
            path = f"jobs/{job_id}/materialized/{e.node_id}/source.{ext}"
            uploads.append((path, e.data, IMAGE_MIME.get(ext, "application/octet-stream")))
            ocr.append({
                "node_id": e.node_id,
                "input_path": path,
                "output_path": f"jobs/{job_id}/nodes/{e.node_id}/result.md",
                "logical_path": e.path,
                "filename": sanitize_filename(e.path.rsplit("/", 1)[-1]),
            })
            e.data = None

        nodes = db_nodes(entries)
        duration_ms = lambda: round((time.perf_counter() - started) * 1000)  # noqa: E731
        base = {
            "backend_role": settings.role,
            "backend_instance": settings.instance,
            "source_bytes": len(data),
            "nodes": nodes,
        }
        if not images:
            result = write_outputs(store, job_id=job_id, name=name, profile=req.profile, source_bytes=len(data),
                                   entries=entries, ocr_texts={}, settings=settings)
            logger.info("job=%s archive single entries=%d duration_ms=%d", job_id, len(entries), duration_ms())
            return {**base, **result, "mode": "single", "duration_ms": duration_ms()}

        # Converted entries wait in Storage for the merge, in parts <= 4 MB.
        parts = partial_blobs(entries)
        partial_paths = [f"jobs/{job_id}/nodes/archive-{i}/partial.json" for i in range(1, len(parts) + 1)]
        uploads += [
            (path, chunk, "application/json; charset=utf-8")
            for path, chunk in zip(partial_paths, parts)
        ]
        try:
            with ThreadPoolExecutor(max_workers=WORKERS) as pool:
                list(pool.map(lambda u: store.upload(*u), uploads))
        except StorageError as err:
            raise HTTPException(status_code=503 if err.transient else 502, detail="Could not store the archive contents") from None

        logger.info("job=%s archive split entries=%d images=%d duration_ms=%d", job_id, len(entries), len(images), duration_ms())
        return {
            **base,
            "mode": "split",
            "partial_paths": partial_paths,
            "ocr": ocr,
            "engine": archive.ENGINE,
            "duration_ms": duration_ms(),
        }

    @app.post("/api/v1/internal/archive/merge", dependencies=[Depends(require_internal_secret)])
    def merge(req: MergeRequest) -> dict:
        store = storage()
        job_id = str(req.job_id)
        paths_belong_to_job(job_id, req.output_path, *req.partial_paths, *(o.output_path for o in req.ocr))
        started = time.perf_counter()
        name = sanitize_filename(req.original_filename)

        if (len(set(req.partial_paths)) != len(req.partial_paths)
                or len({o.node_id for o in req.ocr}) != len(req.ocr)
                or len({o.output_path for o in req.ocr}) != len(req.ocr)):
            raise HTTPException(status_code=409, detail="Archive contents are invalid; the job has to start again")
        read_bytes = 0

        def fetch(path: str) -> str | None:
            nonlocal read_bytes
            try:
                data = store.download(path, PARTIAL_BYTES)
            except StorageError as err:
                if err.status == 413:
                    raise resource_limit() from None
                if err.transient:
                    raise
                return None
            # Also check the returned bytes for alternate Storage implementations.
            read_bytes += len(data)
            if len(data) > PARTIAL_BYTES or read_bytes > archive.MAX_OUTPUT_BYTES:
                raise resource_limit()
            try:
                return data.decode("utf-8")
            except UnicodeDecodeError:
                raise HTTPException(status_code=409, detail="Archive contents are invalid; the job has to start again") from None

        fields = set(archive.Entry.__dataclass_fields__) - {"data"}
        entries = []
        try:
            # Read/validate one bounded object at a time. A parallel map previously
            # retained every completed response before checking the aggregate size.
            for path in req.partial_paths:
                text = fetch(path)
                if text is None:
                    raise HTTPException(status_code=409, detail="Archive contents are missing; the job has to start again")
                try:
                    records = json.loads(text)
                    if not isinstance(records, list):
                        raise ValueError()
                    if len(entries) + len(records) > archive.MAX_ENTRIES:
                        raise resource_limit()
                    for record in records:
                        if (not isinstance(record, dict)
                                or any(not isinstance(record.get(k), str) for k in ("path", "node_type", "classification", "node_id"))
                                or record.get("status") not in {"DONE", "SKIPPED", "FAILED", "PENDING"}
                                or any(record.get(k) is not None and not isinstance(record[k], str)
                                       for k in ("engine", "skip_reason", "language", "content"))
                                or any(type(record.get(k)) is not int or record[k] < 0 for k in ("size", "depth"))):
                            raise ValueError()
                        uuid.UUID(record["node_id"])
                        entries.append(archive.Entry(**{k: v for k, v in record.items() if k in fields}))
                except (ValueError, TypeError):
                    raise HTTPException(status_code=409, detail="Archive contents are invalid; the job has to start again") from None
            if len({e.node_id for e in entries}) != len(entries):
                raise HTTPException(status_code=409, detail="Archive contents are invalid; the job has to start again")
            ocr_values = [fetch(o.output_path) for o in req.ocr]
        except StorageError:
            raise HTTPException(status_code=503, detail="Storage temporarily unavailable") from None
        ocr_texts = {o.node_id: text for o, text in zip(req.ocr, ocr_values)}
        result = write_outputs(store, job_id=job_id, name=name, profile=req.profile,
                               source_bytes=req.source_bytes or 0, entries=entries, ocr_texts=ocr_texts, settings=settings)
        return {**result, "duration_ms": round((time.perf_counter() - started) * 1000)}
