"""Prints Markdown tables from a harness run, for the docs/testing reports.

    backendN/.venv/Scripts/python tests/load/tables.py run-20260926 [section ...]

Sections: health firstuse e2e parallel4 dispatch rps matrix ocrmem failover soak
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

RESULTS = Path(__file__).resolve().parent / "results"


def load(run: str, name: str):
    path = RESULTS / run / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))["result"] if path.exists() else None


def fmt(v, digits=0):
    if v is None:
        return "–"
    if isinstance(v, float):
        return f"{v:,.{digits}f}"
    return f"{v:,}" if isinstance(v, int) else str(v)


def table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    out += ["| " + " | ".join(fmt(c) if not isinstance(c, str) else c for c in row) + " |" for row in rows]
    return "\n".join(out)


def health(run):
    h = load(run, "health")
    rows = []
    for inst in ("N1", "N2", "O1", "O2"):
        eps = {e["path"]: e for e in h[inst]["endpoints"]}
        ready = eps["/api/v1/ready"]
        hl = eps["/api/v1/health"]
        rows.append([inst, ready["body"]["role"], ready["body"]["instance"], ready["status"], ready["body"]["detail"], hl["latency"]["p50"], hl["latency"]["p95"], ready["latency"]["p50"], ready["latency"]["p95"], h[inst]["rss_mb"]])
    return table(["Instance", "Role", "Reported", "/ready", "Engine", "/health p50 ms", "/health p95", "/ready p50 ms", "/ready p95", "RSS MB (idle)"], rows)


def firstuse(run):
    f = load(run, "firstuse")
    rows = [[i, v["file"], v["first"]["backend_ms"], v["first"]["total_ms"], v["warm_backend"].get("p50"), v["warm"].get("p50"), v["rss_before_mb"], v["rss_after_mb"]] for i, v in f.items()]
    return table(["Instance", "File", "First backend ms", "First total ms", "Warm backend p50", "Warm total p50", "RSS before", "RSS after"], rows)


def e2e(run):
    e = load(run, "e2e")
    rows = []
    for r in e["rows"]:
        quality = "–"
        if "ocr_word_recall" in r:
            quality = f"recall {r['ocr_word_recall']:.2f}"
        elif "markers_ok" in r:
            quality = "markers ✓" if r["markers_ok"] else "markers ✗"
        name = r["name"] if len(r["name"]) < 40 else r["name"][:37] + "…"
        rows.append([name, r["class"], r["size"], r["status"], "✓" if r["status_ok"] else "✗", r["instance"] or "–", r["backend_ms"], r["total_ms"], r.get("overhead_ms"), quality])
    return table(["File", "Class", "Bytes", "HTTP", "Expected", "Instance", "Backend ms", "Total ms", "Dispatch overhead ms", "Quality"], rows)


def parallel4(run):
    p = load(run, "parallel4")
    parts = [f"Solo (one job alone): " + ", ".join(f"{k} {v:,.0f} ms" for k, v in p["solo_ms"].items())]
    for i, r in enumerate(p["rounds"]):
        rows = [[j["job"], j["target"], j["instance"], j["status"], round(j["submitted_at"]), round(j["processing_started_at"]), round(j["processing_finished_at"]), round(j["completed_at"])] for j in r["jobs"]]
        parts.append(f"\nRound {i + 1}: all four overlapping = **{r['all_overlap']}**, makespan {r['makespan_ms']:,} ms vs {r['sum_of_solo_ms']:,} ms if run one after another\n")
        parts.append(table(["Job", "Target", "Ran on", "HTTP", "submitted_at", "processing_started_at", "processing_finished_at", "completed_at"], rows))
    return "\n".join(parts)


def dispatch(run):
    d = load(run, "dispatch")
    return table(["Pool", "Jobs", "Distribution", "Routed to wrong pool"], [[k, v["jobs"], ", ".join(f"{a} {b}" for a, b in sorted(v["distribution"].items())), v["wrong_pool"]] for k, v in d.items()])


def rps(run):
    r = load(run, "rps")
    rows = []
    for label, steps in r.items():
        for s in steps:
            rows.append([label, s["target_rps"], s["achieved_rps"], s["requests"], s["errors"], s["latency"]["p50"], s["latency"]["p95"], s["latency"]["p99"], s["latency"]["max"]])
    return table(["Endpoint", "Target RPS", "Achieved", "Requests", "Errors", "p50 ms", "p95 ms", "p99 ms", "max ms"], rows)


def matrix(run):
    parts = []
    for kind in ("normal", "ocr", "mixed"):
        m = load(run, f"matrix-{kind}")
        if not m:
            continue
        rows = []
        for lv in m["levels"]:
            res = lv["resources"]
            rss = " / ".join(f"{n} {res[n]['rss_peak']:.0f}" for n in ("N1", "N2", "O1", "O2") if n in res)
            rows.append([lv["concurrency"], lv["completed"], lv["failed"], f"{(lv['error_rate'] or 0) * 100:.1f}%", lv["jobs_per_min"], lv["latency"].get("p50"), lv["latency"].get("p95"), lv["latency"].get("p99"), lv["latency"].get("max"), ", ".join(f"{a} {b}" for a, b in sorted(lv["distribution"].items())), rss, res.get("min_sys_avail_mb")])
        parts.append(f"\n**{kind}** ({m['duration_s']:.0f} s per level)\n")
        parts.append(table(["Concurrency", "Done", "Failed", "Error rate", "Jobs/min", "p50 ms", "p95 ms", "p99 ms", "max ms", "Distribution", "Peak RSS MB", "Min free RAM MB"], rows))
    return "\n".join(parts)


def ocrmem(run):
    o = load(run, "ocrmem")
    parts = ["RSS checkpoints (MB): " + ", ".join(f"{k} {v}" for k, v in o["rss_checkpoints_mb"].items())]
    parts.append(table(["File", "Dims", "Megapixels", "HTTP", "OCR backend ms", "Peak RSS MB", "Recall"], [[p["file"], f"{p['dims'][0]}×{p['dims'][1]}" if p["dims"] else "–", round(p["dims"][0] * p["dims"][1] / 1e6, 1) if p["dims"] else None, p["status"], p["backend_ms"], p["rss_peak_mb"], p["recall"]] for p in o["single_job_peaks"]]))
    parts.append(table(["Sequential file", "OK", "backend p50", "backend p95", "mean recall"], [[f, v["ok"], v["backend_ms"].get("p50"), v["backend_ms"].get("p95"), v["recall_mean"]] for f, v in o["per_file"].items()]))
    return "\n\n".join(parts)


def failover(run):
    rows = []
    for path in sorted((RESULTS / run).glob("failover-*.json")):
        f = json.loads(path.read_text(encoding="utf-8"))["result"]
        for pool, v in f["pools"].items():
            rows.append([f["scenario"], pool, v["jobs"], v["succeeded"], ", ".join(f"{a} {b}" for a, b in sorted(v["outcomes"].items())), v["latency"].get("p50"), v["latency"].get("p95"), "; ".join(v["errors"])[:80] or "–"])
    return table(["Scenario", "Pool", "Jobs", "Succeeded", "Outcomes", "p50 ms", "p95 ms", "Error shown to user"], rows)


def soak(run):
    s = load(run, "soak")
    if not s:
        return "(no soak run)"
    rows = [[w["t_min"], w["completed"], w["failed"], w["p50"], w["p95"], w["rss"]["N1"], w["rss"]["N2"], w["rss"]["O1"], w["rss"]["O2"]] for w in s["windows"]]
    head = f"RSS before: {s['rss_before']} · after: {s['rss_after']} · temp files before/after: {s['temp_before']} / {s['temp_after']}\n\n"
    return head + table(["t (min)", "Done", "Failed", "p50 ms", "p95 ms", "N1 RSS", "N2 RSS", "O1 RSS", "O2 RSS"], rows)


if __name__ == "__main__":
    run = sys.argv[1]
    sections = sys.argv[2:] or ["health", "firstuse", "e2e", "parallel4", "dispatch", "rps", "matrix", "ocrmem", "failover", "soak"]
    for s in sections:
        print(f"\n### {s}\n")
        try:
            print(globals()[s](run))
        except (TypeError, KeyError, FileNotFoundError) as exc:
            print(f"(unavailable: {exc})")
