"""Storage-backed archive endpoints (app/archive_tasks.py) against a fake
Supabase Storage, with the real MarkItDown for documents."""

import json
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

import app.archive as archive
from app.common.app_factory import create_app
from app.common.config import Settings
from conftest import SECRET
from zips import html_doc, make_zip, png_bytes

HEADERS = {"X-Internal-Secret": SECRET}
PROCESS = "/api/v1/internal/archive/process"
MERGE = "/api/v1/internal/archive/merge"

PROJECT = {
    "README.md": "# Demo\n\nA small project.",
    "src/app.py": "print('hello')\n",
    "docs/guide.html": html_doc("Guide", "Install it"),
    "node_modules/lib/index.js": "module.exports = 1;\n",
}


def upload(storage, entries):
    job = str(uuid.uuid4())
    storage.objects[f"jobs/{job}/input/source.zip"] = make_zip(entries)
    return job


def process_body(job, **extra):
    return {
        "job_id": job,
        "work_item_id": str(uuid.uuid4()),
        "input_path": f"jobs/{job}/input/source.zip",
        "output_path": f"jobs/{job}/output/combined.md",
        "original_filename": "demo-project.zip",
        **extra,
    }


def merge_body(job, split, **extra):
    return {
        "job_id": job,
        "output_path": f"jobs/{job}/output/combined.md",
        "original_filename": "demo-project.zip",
        "partial_paths": split["partial_paths"],
        "source_bytes": split["source_bytes"],
        "ocr": [{k: o[k] for k in ("node_id", "output_path", "logical_path")} for o in split["ocr"]],
        **extra,
    }


def text(storage, path):
    return storage.objects[path].decode("utf-8")


# ── process: no images, finished in one call ───────────────────────────────


def test_archive_without_images_is_finished_in_one_call(client, storage):
    job = upload(storage, PROJECT)
    res = client.post(PROCESS, json=process_body(job), headers=HEADERS)
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["mode"] == "single"
    assert body["primary_output"] == f"jobs/{job}/output/combined.md"
    assert [o["path"].rsplit("/", 1)[-1] for o in body["outputs"]] == ["combined.md", "PROJECT_INDEX.md", "manifest.json"]
    assert body["backend_instance"] == "Z1" and body["engine"] == archive.ENGINE
    assert body["warnings"] == ["archive-skipped:1"]

    combined = text(storage, body["primary_output"])
    assert combined.startswith("# Demo Project")
    assert "## `README.md`" in combined and "## `src/app.py`" in combined
    assert "Install it" in combined  # the HTML went through MarkItDown
    assert "module.exports" not in combined

    index = text(storage, f"jobs/{job}/output/PROJECT_INDEX.md")
    assert "node_modules/lib/index.js" in index
    manifest = json.loads(text(storage, f"jobs/{job}/output/manifest.json"))
    assert manifest["source"]["entries"] == 4

    # The tree for the database: statistics only, never file content.
    nodes = {n["logical_path"]: n for n in body["nodes"]}
    assert set(nodes) == set(PROJECT)
    assert nodes["src/app.py"]["status"] == "DONE" and nodes["src/app.py"]["node_type"] == "CODE_FILE"
    assert nodes["node_modules/lib/index.js"]["status"] == "SKIPPED"
    assert all("content" not in n and "data" not in n for n in body["nodes"])
    assert "hello" not in json.dumps(body)


# ── process + merge: images go to the OCR pool ─────────────────────────────


def test_images_are_handed_to_the_ocr_pool_then_merged(client, storage):
    image = png_bytes()
    job = upload(storage, {**PROJECT, "docs/diagram.png": image})
    res = client.post(PROCESS, json=process_body(job), headers=HEADERS)
    assert res.status_code == 200, res.text
    split = res.json()

    assert split["mode"] == "split"
    assert "outputs" not in split  # nothing final yet
    [ocr] = split["ocr"]
    assert ocr["logical_path"] == "docs/diagram.png" and ocr["filename"] == "diagram.png"
    assert ocr["input_path"] == f"jobs/{job}/materialized/{ocr['node_id']}/source.png"
    assert ocr["output_path"] == f"jobs/{job}/nodes/{ocr['node_id']}/result.md"
    assert storage.objects[ocr["input_path"]] == image
    assert storage.types[ocr["input_path"]] == "image/png"
    assert split["partial_paths"] == [f"jobs/{job}/nodes/archive-1/partial.json"]
    assert not any(k.startswith(f"jobs/{job}/output/") for k in storage.objects)
    image_node = next(n for n in split["nodes"] if n["node_id"] == ocr["node_id"])
    assert image_node["status"] == "PENDING" and image_node["classification"] == "OCR_IMAGE"

    # O1/O2 write the recognised text (raw mode) where the item said.
    storage.objects[ocr["output_path"]] = b"Login -> Dashboard -> Export"

    res = client.post(MERGE, json=merge_body(job, split), headers=HEADERS)
    assert res.status_code == 200, res.text
    merged = res.json()
    assert merged["primary_output"] == f"jobs/{job}/output/combined.md"
    combined = text(storage, merged["primary_output"])
    assert "## `docs/diagram.png`" in combined and "Login -> Dashboard -> Export" in combined
    assert combined.index("## `docs/diagram.png`") < combined.index("## `src/app.py`")
    manifest = json.loads(text(storage, f"jobs/{job}/output/manifest.json"))
    diagram = next(n for n in manifest["nodes"] if n["path"] == "docs/diagram.png")
    assert diagram["status"] == "DONE" and diagram["engine"] == "Tesseract"
    assert merged["warnings"] == ["archive-skipped:1"]


def test_merge_marks_images_whose_text_never_arrived(client, storage):
    job = upload(storage, {"a.png": png_bytes(), "notes.txt": "hi"})
    split = client.post(PROCESS, json=process_body(job), headers=HEADERS).json()
    res = client.post(MERGE, json=merge_body(job, split), headers=HEADERS)
    assert res.status_code == 200, res.text
    assert res.json()["warnings"] == ["archive-failed:1"]
    assert "| `a.png` | Image | Failed |" in text(storage, f"jobs/{job}/output/PROJECT_INDEX.md")


def test_merge_without_its_parts_asks_for_a_restart(client, storage):
    job = upload(storage, {"a.png": png_bytes()})
    split = client.post(PROCESS, json=process_body(job), headers=HEADERS).json()
    del storage.objects[split["partial_paths"][0]]
    res = client.post(MERGE, json=merge_body(job, split), headers=HEADERS)
    assert res.status_code == 409


def test_large_results_are_written_in_parts(client, storage, monkeypatch):
    monkeypatch.setattr(archive, "PART_BYTES", 400)
    job = upload(storage, {f"src/f{i}.py": f"x = {i}\n" * 20 for i in range(6)})
    body = client.post(PROCESS, json=process_body(job), headers=HEADERS).json()
    names = [o["path"].rsplit("/", 1)[-1] for o in body["outputs"]]
    assert names[0] == "combined-001.md" and "combined-002.md" in names
    assert body["primary_output"].endswith("/combined-001.md")
    assert names[-2:] == ["PROJECT_INDEX.md", "manifest.json"]


# ── refusals ───────────────────────────────────────────────────────────────


def test_paths_of_another_job_are_refused(client, storage):
    job = upload(storage, PROJECT)
    other = str(uuid.uuid4())
    res = client.post(PROCESS, json=process_body(job, output_path=f"jobs/{other}/output/combined.md"), headers=HEADERS)
    assert res.status_code == 400
    split = {"partial_paths": [f"jobs/{other}/nodes/archive-1/partial.json"], "source_bytes": 1, "ocr": []}
    assert client.post(MERGE, json=merge_body(job, split), headers=HEADERS).status_code == 400


def test_internal_secret_is_required(client, storage):
    job = upload(storage, PROJECT)
    assert client.post(PROCESS, json=process_body(job)).status_code == 401
    assert client.post(PROCESS, json=process_body(job), headers={"X-Internal-Secret": "wrong"}).status_code == 401
    split = {"partial_paths": [], "source_bytes": 1, "ocr": []}
    assert client.post(MERGE, json=merge_body(job, split)).status_code == 401


def test_missing_upload_is_a_conflict(client):
    job = str(uuid.uuid4())
    assert client.post(PROCESS, json=process_body(job), headers=HEADERS).status_code == 409


def test_file_that_is_not_a_zip_is_rejected(client, storage):
    job = str(uuid.uuid4())
    storage.objects[f"jobs/{job}/input/source.zip"] = b"%PDF-1.4 not a zip"
    res = client.post(PROCESS, json=process_body(job), headers=HEADERS)
    assert res.status_code == 400
    assert "zip" in res.json()["detail"].lower()


def test_without_storage_the_endpoints_are_unavailable(converter):
    settings = Settings(role="archive", instance="Z1", shared_secret=SECRET, max_upload_bytes=1024, version="test")
    app = create_app(settings, converter)
    from app import archive_tasks

    archive_tasks.register(app)
    job = str(uuid.uuid4())
    assert TestClient(app).post(PROCESS, json=process_body(job), headers=HEADERS).status_code == 503


# ── multipart fallback (local development, no Storage) ─────────────────────


def test_multipart_convert_lists_images_without_recognising_them(client):
    data = make_zip({**PROJECT, "shot.png": png_bytes()})
    res = client.post(
        "/api/v1/internal/convert",
        files={"file": ("demo.zip", data, "application/zip")},
        headers=HEADERS,
    )
    assert res.status_code == 200, res.text
    content = res.json()["content"]
    assert "## `src/app.py`" in content and "shot.png" in content
    assert res.json()["warning"] == "archive-skipped:2"


@pytest.mark.parametrize("name", ["evil.zip", "../evil.zip"])
def test_multipart_convert_rejects_non_zip(client, name):
    res = client.post(
        "/api/v1/internal/convert",
        files={"file": (name, b"not a zip at all", "application/zip")},
        headers=HEADERS,
    )
    assert res.status_code == 400
