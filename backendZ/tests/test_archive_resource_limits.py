"""Regression tests for escaped JSON, aggregate reads and final-output expansion."""
import json

import pytest
from fastapi import HTTPException

from app import archive, archive_tasks
from test_archive_tasks import HEADERS, MERGE, PROCESS, merge_body, process_body, upload
from zips import png_bytes


def no_outputs(storage, job):
    assert not any(p.startswith(f"jobs/{job}/output/") for p in storage.objects)


def test_partial_arrays_count_utf8_escapes_and_delimiters(monkeypatch):
    entries = [archive.Entry(path=f"{i}.txt", content='café 日本語 \\"\n' * 7, status="DONE") for i in range(5)]
    record_size = len(json.dumps(entries[0].public(), ensure_ascii=False, separators=(",", ":")).encode())
    # Two records fit exactly; a third needs another array, preserving every character.
    monkeypatch.setattr(archive_tasks, "PARTIAL_BYTES", record_size * 2 + 3)
    parts = archive_tasks.partial_blobs(entries)
    assert len(parts) == 3
    assert all(len(p) <= record_size * 2 + 3 for p in parts)
    restored = [record for p in parts for record in json.loads(p)]
    assert restored == [e.public() for e in entries]


def test_oversized_escaped_record_rejected_before_materialized_writes(client, storage, monkeypatch):
    monkeypatch.setattr(archive_tasks, "PARTIAL_BYTES", 1024)
    job = upload(storage, {"quotes.txt": '"' * 600, "scan.png": png_bytes()})
    before = dict(storage.objects)
    res = client.post(PROCESS, json=process_body(job), headers=HEADERS)
    assert res.status_code == 413
    assert "smaller ZIP" in res.json()["detail"]
    assert storage.objects == before


def test_partial_aggregate_counts_metadata_and_array_overhead(monkeypatch):
    entries = [archive.Entry(path=f"{i}.txt", content="x" * 400, status="DONE") for i in range(3)]
    monkeypatch.setattr(archive_tasks, "PARTIAL_BYTES", 1024)
    monkeypatch.setattr(archive, "MAX_OUTPUT_BYTES", 1500)
    with pytest.raises(HTTPException) as err:
        archive_tasks.partial_blobs(entries)
    assert err.value.status_code == 413


@pytest.mark.parametrize("which", ["partial", "ocr"])
def test_merge_rejects_one_oversized_object(client, storage, monkeypatch, which):
    job = upload(storage, {"notes.txt": "hello", "scan.png": png_bytes()})
    split = client.post(PROCESS, json=process_body(job), headers=HEADERS).json()
    limit = len(storage.objects[split["partial_paths"][0]]) + 1
    monkeypatch.setattr(archive_tasks, "PARTIAL_BYTES", limit)
    path = split["partial_paths"][0] if which == "partial" else split["ocr"][0]["output_path"]
    storage.objects[path] = b"x" * (limit + 1)
    res = client.post(MERGE, json=merge_body(job, split), headers=HEADERS)
    assert res.status_code == 413
    no_outputs(storage, job)


def test_merge_stops_reading_when_aggregate_budget_is_spent(client, storage, monkeypatch):
    job = upload(storage, {f"scan-{i}.png": png_bytes() for i in range(3)})
    split = client.post(PROCESS, json=process_body(job), headers=HEADERS).json()
    partial_size = sum(len(storage.objects[p]) for p in split["partial_paths"])
    for o in split["ocr"]:
        storage.objects[o["output_path"]] = b"x" * 1000
    monkeypatch.setattr(archive, "MAX_OUTPUT_BYTES", partial_size + 1500)
    calls = []
    store = client.app.state.storage
    original = store.download
    def read(path, limit):
        calls.append(path)
        return original(path, limit)
    monkeypatch.setattr(store, "download", read)
    res = client.post(MERGE, json=merge_body(job, split), headers=HEADERS)
    assert res.status_code == 413
    assert split["ocr"][2]["output_path"] not in calls
    no_outputs(storage, job)


def test_final_total_includes_index_and_manifest_before_writing(client, storage, monkeypatch):
    job = upload(storage, {"notes.txt": "hello"})
    result = client.post(PROCESS, json=process_body(job), headers=HEADERS).json()
    total = result["output_bytes"]
    assert total > len(storage.objects[result["primary_output"]])
    monkeypatch.setattr(archive, "MAX_OUTPUT_BYTES", total - 1)
    second = upload(storage, {"notes.txt": "hello"})
    res = client.post(PROCESS, json=process_body(second), headers=HEADERS)
    assert res.status_code == 413
    no_outputs(storage, second)


@pytest.mark.parametrize("generator", ["project_index", "manifest"])
def test_oversized_metadata_is_rejected_before_any_final_upload(client, storage, monkeypatch, generator):
    monkeypatch.setattr(archive_tasks, "METADATA_BYTES", 512)
    monkeypatch.setattr(archive, generator, lambda *args: "日本語" * 60)
    job = upload(storage, {"notes.txt": "hello"})
    res = client.post(PROCESS, json=process_body(job), headers=HEADERS)
    assert res.status_code == 413
    no_outputs(storage, job)


@pytest.mark.parametrize("data", [b"{bad", b"{}", b"[null]", b'[{}]', b'[ {"path":"x","status":"DONE","content":12} ]', b"\xff"])
def test_corrupted_partial_does_not_create_false_success(client, storage, data):
    job = upload(storage, {"scan.png": png_bytes()})
    split = client.post(PROCESS, json=process_body(job), headers=HEADERS).json()
    storage.objects[split["partial_paths"][0]] = data
    res = client.post(MERGE, json=merge_body(job, split), headers=HEADERS)
    assert res.status_code == 409
    no_outputs(storage, job)


def test_repeated_partial_path_is_rejected(client, storage):
    job = upload(storage, {"scan.png": png_bytes()})
    split = client.post(PROCESS, json=process_body(job), headers=HEADERS).json()
    split["partial_paths"] *= 2
    assert client.post(MERGE, json=merge_body(job, split), headers=HEADERS).status_code == 409
    no_outputs(storage, job)


def test_merge_bounds_decoded_entry_count(client, storage, monkeypatch):
    job = upload(storage, {"notes.txt": "hello", "scan.png": png_bytes()})
    split = client.post(PROCESS, json=process_body(job), headers=HEADERS).json()
    monkeypatch.setattr(archive, "MAX_ENTRIES", 1)
    assert client.post(MERGE, json=merge_body(job, split), headers=HEADERS).status_code == 413
    no_outputs(storage, job)


@pytest.mark.parametrize("field,value", [("node_type", []), ("status", []), ("node_id", "invalid"), ("size", "1"), ("depth", -1)])
def test_corrupted_record_fields_return_conflict(client, storage, field, value):
    job = upload(storage, {"scan.png": png_bytes()})
    split = client.post(PROCESS, json=process_body(job), headers=HEADERS).json()
    path = split["partial_paths"][0]
    records = json.loads(storage.objects[path])
    records[0][field] = value
    storage.objects[path] = json.dumps(records).encode()
    assert client.post(MERGE, json=merge_body(job, split), headers=HEADERS).status_code == 409
    no_outputs(storage, job)
