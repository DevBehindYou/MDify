"""MDify integration / load / failover harness (custom asyncio + httpx).

Talks to the running services and writes raw JSON results to
tests/load/results/<run_id>/<command>.json. Reports under docs/testing/ are
written from these files.

    set PYTHONIOENCODING=utf-8
    backendN/.venv/Scripts/python tests/load/harness.py <command> [options]

Commands: health, firstuse, e2e, parallel4, dispatch, matrix, rps, failover,
ocrmem, soak, security. Run `--help` on any command for options.

Environment (defaults match .claude/launch.json):
    MDIFY_FRONTEND   http://127.0.0.1:3000
    MDIFY_N1..O2     backend base URLs
    MDIFY_SECRET     internal secret; read from frontend/.env.local if unset.
                     Never printed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import random
import re
import statistics
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import httpx
import psutil

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CORPUS = HERE / ".corpus"
RESULTS = HERE / "results"

FRONTEND = os.environ.get("MDIFY_FRONTEND", "http://127.0.0.1:3000")
BACKENDS = {
    "N1": os.environ.get("MDIFY_N1", "http://127.0.0.1:8001"),
    "N2": os.environ.get("MDIFY_N2", "http://127.0.0.1:8003"),
    "O1": os.environ.get("MDIFY_O1", "http://127.0.0.1:8002"),
    "O2": os.environ.get("MDIFY_O2", "http://127.0.0.1:8004"),
}
PORTS = {name: int(url.rsplit(":", 1)[1]) for name, url in BACKENDS.items()} | {"frontend": 3000}
MIN_FREE_MB = 700  # abort a load level below this much available RAM


def secret() -> str:
    value = os.environ.get("MDIFY_SECRET")
    if value:
        return value
    env = (REPO / "frontend" / ".env.local").read_text(encoding="utf-8")
    match = re.search(r"^BACKEND_SHARED_SECRET=(.+)$", env, re.M)
    if not match:
        sys.exit("MDIFY_SECRET not set and frontend/.env.local has no BACKEND_SHARED_SECRET")
    return match.group(1).strip()


# ── corpus ───────────────────────────────────────────────────────────────────


def load_manifest() -> list[dict]:
    manifest = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))
    for entry in manifest:
        entry["data"] = (CORPUS / entry["name"]).read_bytes()
    return manifest


def by_name(manifest: list[dict]) -> dict[str, dict]:
    return {e["name"]: e for e in manifest}


# ── stats ────────────────────────────────────────────────────────────────────


def pct(values: list[float], p: float) -> float | None:
    """Nearest-rank percentile."""
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[max(0, math.ceil(p / 100 * len(ordered)) - 1)], 1)


def summarize(values: list[float]) -> dict:
    if not values:
        return {"n": 0}
    return {
        "n": len(values),
        "p50": pct(values, 50),
        "p95": pct(values, 95),
        "p99": pct(values, 99),
        "max": round(max(values), 1),
        "mean": round(statistics.fmean(values), 1),
    }


WORD_RE = re.compile(r"[a-z0-9]+")


def word_recall(truth: str, text: str) -> float:
    want = WORD_RE.findall(truth.lower())
    have = set(WORD_RE.findall(text.lower()))
    return round(sum(1 for w in want if w in have) / len(want), 3) if want else 0.0


# ── process metrics ──────────────────────────────────────────────────────────

_pid_cache: dict[int, int] = {}


def pid_for_port(port: int) -> int | None:
    if port in _pid_cache and psutil.pid_exists(_pid_cache[port]):
        return _pid_cache[port]
    try:
        for conn in psutil.net_connections(kind="tcp"):
            if conn.laddr and conn.laddr.port == port and conn.status == psutil.CONN_LISTEN and conn.pid:
                _pid_cache[port] = conn.pid
                return conn.pid
    except psutil.AccessDenied:
        out = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True).stdout
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 5 and parts[1].endswith(f":{port}") and parts[3] == "LISTENING":
                _pid_cache[port] = int(parts[4])
                return int(parts[4])
    return None


def rss_mb(name: str) -> float | None:
    pid = pid_for_port(PORTS[name])
    if not pid:
        return None
    try:
        return round(psutil.Process(pid).memory_info().rss / 1024 / 1024, 1)
    except psutil.Error:
        return None


class Sampler:
    """Samples RSS / CPU of every service and system free RAM."""

    def __init__(self, interval: float = 1.0, names=("N1", "N2", "O1", "O2", "frontend")):
        self.interval = interval
        self.names = names
        self.samples: list[dict] = []
        self._task = None
        self.low_memory = False

    async def _run(self):
        procs = {}
        for n in self.names:
            pid = pid_for_port(PORTS[n])
            if pid:
                procs[n] = psutil.Process(pid)
                procs[n].cpu_percent(None)
        while True:
            row = {"t": round(time.time(), 2), "sys_avail_mb": round(psutil.virtual_memory().available / 1048576)}
            for n, p in procs.items():
                try:
                    row[f"{n}_rss"] = round(p.memory_info().rss / 1048576, 1)
                    row[f"{n}_cpu"] = p.cpu_percent(None)
                except psutil.Error:
                    row[f"{n}_rss"] = None
            self.samples.append(row)
            if row["sys_avail_mb"] < MIN_FREE_MB:
                self.low_memory = True
            await asyncio.sleep(self.interval)

    def start(self):
        self._task = asyncio.create_task(self._run())
        return self

    async def stop(self):
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass

    def peaks(self) -> dict:
        out = {"min_sys_avail_mb": min((s["sys_avail_mb"] for s in self.samples), default=None)}
        for n in self.names:
            rss = [s.get(f"{n}_rss") for s in self.samples if s.get(f"{n}_rss") is not None]
            cpu = [s.get(f"{n}_cpu") for s in self.samples if s.get(f"{n}_cpu") is not None]
            if rss:
                out[n] = {"rss_start": rss[0], "rss_peak": max(rss), "rss_end": rss[-1], "cpu_peak": max(cpu, default=None), "cpu_mean": round(statistics.fmean(cpu), 1) if cpu else None}
        return out


# ── requests ─────────────────────────────────────────────────────────────────


def record(entry: dict, res: httpx.Response | None, t0: float, submitted_ms: float, err: str | None = None) -> dict:
    total_ms = (time.perf_counter() - t0) * 1000
    body = {}
    if res is not None:
        try:
            body = res.json()
        except ValueError:
            body = {}
    content = body.get("content") or ""
    rec = {
        "name": entry["name"],
        "class": entry["class"],
        "type": entry["type"],
        "size": entry["size"],
        "status": res.status_code if res is not None else None,
        "instance": body.get("backend_instance"),
        "role": body.get("backend_role"),
        "backend_ms": body.get("duration_ms"),
        "total_ms": round(total_ms, 1),
        "submitted_at_ms": round(submitted_ms),
        "completed_at_ms": round(time.time() * 1000),
        "started_at_ms": body.get("started_at_ms"),
        "finished_at_ms": body.get("finished_at_ms"),
        "chars": len(content),
        "error": err or (body.get("detail") if res is not None and res.status_code >= 400 else None),
    }
    if rec["backend_ms"] is not None:
        rec["overhead_ms"] = round(total_ms - rec["backend_ms"], 1)
    if entry.get("markers") and content:
        rec["markers_ok"] = all(m in content for m in entry["markers"])
    if entry.get("ground_truth") and content:
        rec["ocr_word_recall"] = word_recall(entry["ground_truth"], content)
    return rec


async def via_frontend(client: httpx.AsyncClient, entry: dict, profile: str = "Standard") -> dict:
    t0, submitted = time.perf_counter(), time.time() * 1000
    try:
        res = await client.post(
            f"{FRONTEND}/api/convert",
            files={"file": (entry["name"], entry["data"])},
            data={"profile": profile},
        )
        return record(entry, res, t0, submitted)
    except httpx.HTTPError as exc:
        return record(entry, None, t0, submitted, err=f"{type(exc).__name__}: {exc}")


async def direct(client: httpx.AsyncClient, instance: str, entry: dict, job_id: str | None = None) -> dict:
    t0, submitted = time.perf_counter(), time.time() * 1000
    try:
        res = await client.post(
            f"{BACKENDS[instance]}/api/v1/internal/convert",
            files={"file": (entry["name"], entry["data"])},
            data={"profile": "Standard", "job_id": job_id or str(uuid.uuid4())},
            headers={"X-Internal-Secret": secret()},
        )
        return record(entry, res, t0, submitted)
    except httpx.HTTPError as exc:
        return record(entry, None, t0, submitted, err=f"{type(exc).__name__}: {exc}")


def new_client(concurrency: int = 64) -> httpx.AsyncClient:
    limits = httpx.Limits(max_connections=concurrency + 8, max_keepalive_connections=concurrency + 8)
    return httpx.AsyncClient(timeout=httpx.Timeout(180.0), limits=limits)


def save(run_dir: Path, name: str, data) -> Path:
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / f"{name}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


# ── commands ─────────────────────────────────────────────────────────────────


async def cmd_health(args) -> dict:
    out = {}
    async with new_client() as client:
        for name, base in BACKENDS.items():
            rows = []
            for path in ("/api/v1/health", "/api/v1/ready"):
                lat = []
                body = status = None
                for _ in range(args.repeat):
                    t0 = time.perf_counter()
                    res = await client.get(base + path)
                    lat.append((time.perf_counter() - t0) * 1000)
                    status, body = res.status_code, res.json()
                rows.append({"path": path, "status": status, "latency": summarize(lat), "body": body})
            out[name] = {"endpoints": rows, "rss_mb": rss_mb(name)}
        t0 = time.perf_counter()
        res = await client.get(FRONTEND + "/api/health")
        out["frontend"] = {"status": res.status_code, "latency_ms": round((time.perf_counter() - t0) * 1000, 1), "body": res.json(), "rss_mb": rss_mb("frontend")}
    return out


async def cmd_firstuse(args) -> dict:
    """First conversion per backend vs the next warm ones (run right after start)."""
    m = by_name(load_manifest())
    plan = {"N1": "medium.pdf", "N2": "medium.docx", "O1": "ocr-small.png", "O2": "ocr-small.png"}
    out = {}
    async with new_client() as client:
        for inst, fname in plan.items():
            rss_before = rss_mb(inst)
            runs = [await direct(client, inst, m[fname]) for _ in range(1 + args.warm)]
            out[inst] = {
                "file": fname,
                "rss_before_mb": rss_before,
                "rss_after_mb": rss_mb(inst),
                "first": {k: runs[0][k] for k in ("status", "backend_ms", "total_ms")},
                "warm": summarize([r["total_ms"] for r in runs[1:]]),
                "warm_backend": summarize([r["backend_ms"] for r in runs[1:] if r["backend_ms"] is not None]),
            }
    return out


async def cmd_e2e(args) -> dict:
    manifest = load_manifest()
    rows = []
    sampler = Sampler(0.25).start()
    async with new_client() as client:
        for entry in manifest:
            rec = await via_frontend(client, entry)
            expect = entry["expect_status"]
            ok_status = rec["status"] in (expect if isinstance(expect, list) else [expect])
            pool_ok = entry["pool"] is None or rec["role"] in (None, entry["pool"])
            rec.update({"expect_status": expect, "status_ok": ok_status, "pool_ok": pool_ok, "dims": entry.get("dims")})
            rows.append(rec)
            print(f"  {rec['status']} {'OK ' if ok_status else 'BAD'} {rec['instance'] or '-':>3} {rec['total_ms']:>8.0f}ms  {entry['name'][:50]}".encode("ascii", "replace").decode())
    await sampler.stop()
    return {"rows": rows, "peaks": sampler.peaks()}


async def cmd_parallel4(args) -> dict:
    """One job per instance, submitted together, direct to each backend."""
    m = by_name(load_manifest())
    plan = [("A", "N1", args.normal_file), ("B", "N2", args.normal_file), ("C", "O1", args.ocr_file), ("D", "O2", args.ocr_file)]
    async with new_client() as client:
        # Sequential reference: each job alone.
        solo = {}
        for label, inst, fname in plan:
            solo[label] = (await direct(client, inst, m[fname]))["total_ms"]
        rounds = []
        for _ in range(args.rounds):
            t0 = time.time() * 1000
            recs = await asyncio.gather(*(direct(client, inst, m[f]) for _, inst, f in plan))
            jobs = []
            for (label, inst, fname), rec in zip(plan, recs):
                jobs.append({
                    "job": label, "target": inst, "file": fname, "status": rec["status"], "instance": rec["instance"],
                    "submitted_at": rec["submitted_at_ms"] - t0,
                    "processing_started_at": (rec["started_at_ms"] or t0) - t0,
                    "processing_finished_at": (rec["finished_at_ms"] or t0) - t0,
                    "completed_at": rec["completed_at_ms"] - t0,
                    "backend_ms": rec["backend_ms"], "total_ms": rec["total_ms"],
                })
            starts = [j["processing_started_at"] for j in jobs]
            ends = [j["processing_finished_at"] for j in jobs]
            rounds.append({
                "jobs": jobs,
                "all_overlap": max(starts) < min(ends),
                "makespan_ms": round(max(j["completed_at"] for j in jobs)),
                "sum_of_solo_ms": round(sum(solo.values())),
            })
    return {"solo_ms": solo, "rounds": rounds}


async def cmd_dispatch(args) -> dict:
    m = by_name(load_manifest())
    out = {}
    async with new_client(16) as client:
        for pool, fname in (("normal", "small.txt"), ("ocr", "ocr-small.png")):
            sem = asyncio.Semaphore(args.concurrency)

            async def one(entry=m[fname]):
                async with sem:
                    return await via_frontend(client, entry)

            recs = await asyncio.gather(*(one() for _ in range(args.jobs)))
            dist: dict[str, int] = {}
            for r in recs:
                dist[r["instance"] or f"status-{r['status']}"] = dist.get(r["instance"] or f"status-{r['status']}", 0) + 1
            out[pool] = {"jobs": args.jobs, "distribution": dist, "wrong_pool": sum(1 for r in recs if r["role"] and r["role"] != pool)}
    return out


def workload(manifest: list[dict], kind: str):
    m = by_name(manifest)
    normal = [("medium.pdf", 30), ("medium.docx", 20), ("medium.pptx", 15), ("medium.xlsx", 15), ("medium.html", 10), ("small.txt", 4), ("small.csv", 3), ("small.json", 3)]
    ocr = [("ocr-small.png", 20), ("ocr-small.jpg", 15), ("ocr-small.webp", 15), ("ocr-medium.png", 50)]
    table = {"normal": normal, "ocr": ocr, "mixed": [(n, w) for n, w in normal] + [(n, w) for n, w in ocr]}[kind]
    names = [n for n, _ in table]
    weights = [w for _, w in table]
    rnd = random.Random(7)
    return lambda: m[rnd.choices(names, weights)[0]]


async def run_level(client, pick, concurrency: int, duration: float) -> dict:
    records: list[dict] = []
    stop_at = time.perf_counter() + duration
    sampler = Sampler(1.0).start()

    async def worker():
        while time.perf_counter() < stop_at and not sampler.low_memory:
            records.append(await via_frontend(client, pick()))

    t0 = time.perf_counter()
    await asyncio.gather(*(worker() for _ in range(concurrency)))
    elapsed = time.perf_counter() - t0
    await sampler.stop()
    ok = [r for r in records if r["status"] == 200]
    dist: dict[str, int] = {}
    for r in ok:
        dist[r["instance"]] = dist.get(r["instance"], 0) + 1
    by_type: dict[str, list[float]] = {}
    for r in ok:
        by_type.setdefault(r["type"], []).append(r["total_ms"])
    return {
        "concurrency": concurrency,
        "elapsed_s": round(elapsed, 1),
        "completed": len(ok),
        "failed": len(records) - len(ok),
        "errors": sorted({f"{r['status']}: {str(r['error'])[:80]}" for r in records if r["status"] != 200})[:5],
        "error_rate": round((len(records) - len(ok)) / len(records), 4) if records else None,
        "jobs_per_s": round(len(ok) / elapsed, 2),
        "jobs_per_min": round(len(ok) / elapsed * 60, 1),
        "latency": summarize([r["total_ms"] for r in ok]),
        "backend_latency": summarize([r["backend_ms"] for r in ok if r["backend_ms"] is not None]),
        "overhead": summarize([r["overhead_ms"] for r in ok if "overhead_ms" in r]),
        "by_type_p50": {t: pct(v, 50) for t, v in by_type.items()},
        "by_type_p95": {t: pct(v, 95) for t, v in by_type.items()},
        "distribution": dist,
        "resources": sampler.peaks(),
        "aborted_low_memory": sampler.low_memory,
    }


async def cmd_matrix(args) -> dict:
    manifest = load_manifest()
    out = {"kind": args.kind, "duration_s": args.duration, "levels": []}
    async with new_client(max(args.levels)) as client:
        for c in args.levels:
            print(f"  {args.kind} c={c} ...", flush=True)
            level = await run_level(client, workload(manifest, args.kind), c, args.duration)
            out["levels"].append(level)
            print(f"    done={level['completed']} fail={level['failed']} p50={level['latency'].get('p50')} p95={level['latency'].get('p95')} jpm={level['jobs_per_min']}", flush=True)
            if level["aborted_low_memory"] or (level["error_rate"] or 0) > 0.2:
                print("    stopping ramp: memory or error threshold", flush=True)
                break
            await asyncio.sleep(args.cooldown)
    return out


async def cmd_rps(args) -> dict:
    targets = {
        "frontend /api/health": FRONTEND + "/api/health",
        "N1 /api/v1/health": BACKENDS["N1"] + "/api/v1/health",
        "N1 /api/v1/ready": BACKENDS["N1"] + "/api/v1/ready",
        "O1 /api/v1/health": BACKENDS["O1"] + "/api/v1/health",
        "O1 /api/v1/ready": BACKENDS["O1"] + "/api/v1/ready",
    }
    out = {}
    async with new_client(256) as client:
        for label, url in targets.items():
            if args.only and not any(o in label for o in args.only):
                continue
            steps = []
            for rate in args.rates:
                lat: list[float] = []
                errors = 0
                tasks = []

                async def hit():
                    nonlocal errors
                    t0 = time.perf_counter()
                    try:
                        res = await client.get(url)
                        if res.status_code != 200:
                            errors += 1
                    except httpx.HTTPError:
                        errors += 1
                    lat.append((time.perf_counter() - t0) * 1000)

                start = time.perf_counter()
                n = int(rate * args.seconds)
                for i in range(n):  # open loop: fixed send schedule
                    delay = start + i / rate - time.perf_counter()
                    if delay > 0:
                        await asyncio.sleep(delay)
                    tasks.append(asyncio.create_task(hit()))
                await asyncio.gather(*tasks)
                elapsed = time.perf_counter() - start
                step = {"target_rps": rate, "achieved_rps": round(n / elapsed, 1), "requests": n, "errors": errors, "error_rate": round(errors / n, 4), "latency": summarize(lat)}
                steps.append(step)
                print(f"  {label:<22} {rate:>4} rps -> achieved {step['achieved_rps']:>6} p95={step['latency']['p95']}ms err={errors}", flush=True)
                if step["error_rate"] > 0.05 or (step["latency"]["p95"] or 0) > args.max_p95:
                    break
            out[label] = steps
    return out


async def cmd_failover(args) -> dict:
    m = by_name(load_manifest())
    recs = []
    async with new_client(8) as client:
        for i in range(args.jobs):
            recs.append(await via_frontend(client, m["small.txt"]))
            recs.append(await via_frontend(client, m["ocr-small.png"]))
    summary = {}
    for pool, fname in (("normal", "small.txt"), ("ocr", "ocr-small.png")):
        rows = [r for r in recs if r["name"] == fname]
        dist: dict[str, int] = {}
        for r in rows:
            key = r["instance"] or f"HTTP {r['status']}"
            dist[key] = dist.get(key, 0) + 1
        summary[pool] = {
            "jobs": len(rows),
            "succeeded": sum(1 for r in rows if r["status"] == 200),
            "outcomes": dist,
            "errors": sorted({str(r["error"]) for r in rows if r["status"] != 200}),
            "latency": summarize([r["total_ms"] for r in rows]),
            "overhead": summarize([r["overhead_ms"] for r in rows if "overhead_ms" in r]),
        }
    return {"scenario": args.label, "pools": summary}


async def cmd_ocrmem(args) -> dict:
    m = by_name(load_manifest())
    seq = ["ocr-small.png", "ocr-medium.png", "ocr-small.jpg", "ocr-large.png", "ocr-small.webp"]
    checkpoints = {"before": rss_mb(args.instance)}
    peaks = []
    per_file: dict[str, list[dict]] = {}
    async with new_client(4) as client:
        # Near-limit image alone, with fast RSS sampling, for peak memory.
        for fname in ("ocr-near-limit.png", "ocr-near-limit.jpg", "ocr-large.png", "ocr-medium.png", "ocr-small.png"):
            sampler = Sampler(0.05, names=(args.instance,)).start()
            rec = await direct(client, args.instance, m[fname])
            await sampler.stop()
            peaks.append({"file": fname, "dims": m[fname].get("dims"), "status": rec["status"], "backend_ms": rec["backend_ms"], "rss_peak_mb": sampler.peaks().get(args.instance, {}).get("rss_peak"), "recall": rec.get("ocr_word_recall")})
        for i in range(1, args.jobs + 1):
            fname = seq[i % len(seq)]
            rec = await direct(client, args.instance, m[fname])
            per_file.setdefault(fname, []).append(rec)
            if i in (10, 50, args.jobs):
                checkpoints[f"after_{i}"] = rss_mb(args.instance)
    return {
        "instance": args.instance,
        "rss_checkpoints_mb": checkpoints,
        "single_job_peaks": peaks,
        "per_file": {f: {"ok": sum(r["status"] == 200 for r in rs), "backend_ms": summarize([r["backend_ms"] for r in rs if r["backend_ms"]]), "recall_mean": round(statistics.fmean([r.get("ocr_word_recall", 0) for r in rs]), 3)} for f, rs in per_file.items()},
    }


def temp_snapshot() -> dict:
    tmp = Path(tempfile.gettempdir())
    files = [p for p in tmp.iterdir() if p.is_file()]
    return {"count": len(files), "bytes": sum(p.stat().st_size for p in files if p.exists())}


async def cmd_soak(args) -> dict:
    manifest = load_manifest()
    pick = workload(manifest, "mixed")
    tmp_before = temp_snapshot()
    rss_before = {n: rss_mb(n) for n in ("N1", "N2", "O1", "O2")}
    windows = []
    sampler = Sampler(5.0).start()
    end = time.perf_counter() + args.minutes * 60
    async with new_client(args.concurrency) as client:
        while time.perf_counter() < end:
            window_end = min(end, time.perf_counter() + args.window)
            recs: list[dict] = []

            async def worker():
                while time.perf_counter() < window_end:
                    recs.append(await via_frontend(client, pick()))

            await asyncio.gather(*(worker() for _ in range(args.concurrency)))
            ok = [r for r in recs if r["status"] == 200]
            windows.append({"t_min": round((args.minutes * 60 - (end - time.perf_counter())) / 60, 1), "completed": len(ok), "failed": len(recs) - len(ok), "p50": pct([r["total_ms"] for r in ok], 50), "p95": pct([r["total_ms"] for r in ok], 95), "rss": {n: rss_mb(n) for n in ("N1", "N2", "O1", "O2")}})
            print(f"  t={windows[-1]['t_min']}min done={len(ok)} fail={len(recs) - len(ok)} p95={windows[-1]['p95']} rss={windows[-1]['rss']}", flush=True)
    await sampler.stop()
    await asyncio.sleep(3)
    return {"minutes": args.minutes, "concurrency": args.concurrency, "rss_before": rss_before, "rss_after": {n: rss_mb(n) for n in ("N1", "N2", "O1", "O2")}, "temp_before": tmp_before, "temp_after": temp_snapshot(), "windows": windows, "resources": sampler.peaks()}


async def cmd_security(args) -> dict:
    m = by_name(load_manifest())
    s = secret()
    out = {}
    async with new_client() as client:
        async def post(base, name, data, headers=None):
            res = await client.post(base + "/api/v1/internal/convert", files={"file": (name, data)}, headers=headers or {})
            return res.status_code

        for inst in BACKENDS:
            base = BACKENDS[inst]
            fname = "small.txt" if inst.startswith("N") else "ocr-small.png"
            out[inst] = {
                "missing_secret": await post(base, fname, m[fname]["data"]),
                "wrong_secret": await post(base, fname, m[fname]["data"], {"X-Internal-Secret": "wrong"}),
                "docs": (await client.get(base + "/docs")).status_code,
                "openapi": (await client.get(base + "/openapi.json")).status_code,
                "cors_preflight_allow_origin": (await client.options(base + "/api/v1/internal/convert", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})).headers.get("access-control-allow-origin"),
            }
        fe = await client.options(FRONTEND + "/api/convert", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
        out["frontend_cors_allow_origin"] = fe.headers.get("access-control-allow-origin")
        names = {}
        for evil in ("../../etc/passwd.txt", "..\\..\\windows\\win.ini.txt", "<script>alert(1)</script>.txt", "a" * 300 + ".txt", "null\x00byte.txt"):
            rec = await via_frontend(client, {**m["small.txt"], "name": evil})
            body_name = None
            if rec["status"] == 200:
                res = await client.post(FRONTEND + "/api/convert", files={"file": (evil, b"x")})
                body_name = res.json().get("original_name")
            names[evil[:40]] = {"status": rec["status"], "original_name": body_name}
        out["filenames"] = names
        for fname in ("magic-mismatch.pdf", "corrupt.png", "bomb.docx", "unsupported.exe", "corrupt.docx"):
            rec = await via_frontend(client, m[fname])
            out[fname] = {"status": rec["status"], "error": rec["error"], "total_ms": rec["total_ms"]}
    bundle = REPO / "frontend" / ".next" / "static"
    leaked = []
    for path in bundle.rglob("*.js"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for needle in (s, "BACKEND_SHARED_SECRET", "NORMAL_BACKEND_URLS", "OCR_BACKEND_URLS", "127.0.0.1:800"):
            if needle in text:
                leaked.append({"file": path.name, "needle": "<secret value>" if needle == s else needle})
    out["client_bundle_leaks"] = leaked
    out["client_bundle_files_scanned"] = sum(1 for _ in bundle.rglob("*.js"))
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run-id", default=time.strftime("run-%Y%m%d-%H%M%S"))
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("health"); p.add_argument("--repeat", type=int, default=5)
    p = sub.add_parser("firstuse"); p.add_argument("--warm", type=int, default=5)
    sub.add_parser("e2e")
    p = sub.add_parser("parallel4"); p.add_argument("--rounds", type=int, default=3); p.add_argument("--normal-file", default="medium.pdf"); p.add_argument("--ocr-file", default="ocr-medium.png")
    p = sub.add_parser("dispatch"); p.add_argument("--jobs", type=int, default=100); p.add_argument("--concurrency", type=int, default=4)
    p = sub.add_parser("matrix"); p.add_argument("--kind", choices=["normal", "ocr", "mixed"], required=True); p.add_argument("--levels", type=int, nargs="+", default=[2, 4, 8, 16]); p.add_argument("--duration", type=float, default=45); p.add_argument("--cooldown", type=float, default=5)
    p = sub.add_parser("rps"); p.add_argument("--rates", type=float, nargs="+", default=[1, 2, 5, 10, 20, 50, 100, 200]); p.add_argument("--seconds", type=float, default=10); p.add_argument("--max-p95", type=float, default=2000); p.add_argument("--only", nargs="+", default=None, help="run only targets whose label contains one of these")
    p = sub.add_parser("failover"); p.add_argument("--label", required=True); p.add_argument("--jobs", type=int, default=20)
    p = sub.add_parser("ocrmem"); p.add_argument("--instance", default="O1"); p.add_argument("--jobs", type=int, default=50)
    p = sub.add_parser("soak"); p.add_argument("--minutes", type=float, default=20); p.add_argument("--concurrency", type=int, default=4); p.add_argument("--window", type=float, default=60)
    sub.add_parser("security")
    args = parser.parse_args()

    fn = globals()[f"cmd_{args.cmd}"]
    started = time.strftime("%Y-%m-%dT%H:%M:%S")
    result = asyncio.run(fn(args))
    name = args.cmd if args.cmd not in ("matrix", "failover") else f"{args.cmd}-{getattr(args, 'kind', None) or re.sub(r'[^a-z0-9]+', '-', args.label.lower())}"
    path = save(RESULTS / args.run_id, name, {"command": args.cmd, "started": started, "args": {k: v for k, v in vars(args).items() if k != "cmd"}, "result": result})
    print(f"saved {path.relative_to(REPO)}")


if __name__ == "__main__":
    main()
