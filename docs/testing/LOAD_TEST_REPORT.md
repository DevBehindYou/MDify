# Load Test Report

**Runs:** `run-20260926-part2` (load matrix, RPS, soak, failover, ZIP) and `run-20260927`
(OCR memory after the `_prepare` fix and the 10 MB image cap) · **Harness:**
`tests/load/harness.py`, `tests/load/ocr_cap_bench.py`, `tests/load/zip_bench.mjs` ·
**Raw data:** `tests/load/results/<run>/*.json` (regenerate with the harness).

Labels: **MEASURED** (this host), **ESTIMATED** (derived, reasoning given), **NOT TESTED**.

## Environment and the main caveat

Everything ran on one laptop: Intel i3-1005G1, **2 cores / 4 threads**, 7.7 GB RAM,
Windows 11. N1, N2, O1, O2, the Next.js production server and the load generator all
shared those two cores. In production, N1/N2 run as Vercel functions and O1/O2 as
separate Render services, so none of them compete with each other or with the load
generator. **Every number below describes this host. Cloud capacity is NOT TESTED**
because nothing is deployed.

The host itself was under memory pressure: the lowest available system memory during
the soak was **183 MB**. The harness aborts a level below 700 MB free. No level aborted,
but the soak came close.

## Workloads

All jobs went through the frontend dispatcher (`POST /api/convert`), the same path the
browser uses today.

| Workload | Mix (weights) |
|---|---|
| normal | medium.pdf 30 (20 pages), medium.docx 20, medium.pptx 15 (25 slides), medium.xlsx 15 (3k rows), medium.html 10, small txt/csv/json 10 |
| ocr | ocr-medium.png 50 (3.7 MP text page), ocr-small png/jpg/webp 50 (receipts) |
| mixed | both tables together, about half documents and half images |

Each level ran for 45 s with a 5 s cool-down. Concurrency means requests in flight at once.

## Load matrix (MEASURED)

### Normal pool (N1 + N2)

| Concurrency | Done | Failed | Jobs/min | p50 s | p95 s | p99 s | Split N1 / N2 |
|---|---|---|---|---|---|---|---|
| 2 | 24 | 0 | 29 | 4.3 | 10.1 | 10.7 | 10 / 14 |
| 4 | 26 | 0 | 34 | 9.0 | 13.9 | 14.2 | 16 / 10 |
| 8 | 44 | 0 | 52 | 6.3 | 23.8 | 28.9 | 20 / 24 |
| 16 | 52 | **1** (1.9 %) | 56 | 14.2 | 34.7 | 43.0 | 23 / 29 |

The failure at 16 was a `504 Conversion timed out` (dispatcher 50 s budget). PDFs drive
the tail: medium.pdf alone is 3.3 s when idle and 7.8 s p50 at concurrency 2 under load.

### OCR pool (O1 + O2)

| Concurrency | Done | Failed | Jobs/min | p50 s | p95 s | p99 s | Split O1 / O2 |
|---|---|---|---|---|---|---|---|
| 2 | 49 | 0 | 62 | 2.1 | 4.1 | 4.4 | 23 / 26 |
| 4 | 61 | 0 | 76 | 2.5 | 7.9 | 10.8 | 26 / 35 |
| 8 | 73 | 0 | 87 | 5.2 | 9.9 | 10.5 | 35 / 38 |
| 16 | 83 | 0 | **90** | 9.7 | 17.9 | 20.9 | 36 / 47 |

Each OCR process handles one image at a time, so extra requests queue inside O1/O2.
Throughput flattens at about 90 jobs/min, and latency grows with the queue.

### Mixed

| Concurrency | Done | Failed | Jobs/min | p50 s | p95 s | p99 s |
|---|---|---|---|---|---|---|
| 2 | 35 | 0 | 44 | 2.2 | 7.3 | 8.4 |
| 4 | 54 | 0 | **68** | 2.7 | 10.9 | 17.7 |
| 8 | 58 | 0 | 66 | 3.7 | 21.4 | 36.6 |
| 16 | 59 | **2** (3.3 %) | 56 | 5.2 | 47.2 | 47.9 |

Mixed throughput peaks at concurrency 4. Beyond that, N1/N2 and O1/O2 fight over the same
two cores, so throughput drops and the tail grows until jobs hit the 50 s timeout.

## Soak (MEASURED, 20 minutes, mixed, concurrency 4)

| Minute | Done | Failed | p50 s | p95 s | RSS N1 / N2 / O1 / O2 MB |
|---|---|---|---|---|---|
| 2.2 | 141 | 0 | 2.9 | 12.0 | 204 / 204 / 61 / 61 |
| 4.2 | 146 | 0 | 2.6 | 9.6 | 200 / 206 / 62 / 63 |
| 6.3 | 83 | 0 | 3.9 | 19.9 | 200 / 209 / 61 / 61 |
| 8.4 | 89 | 0 | 3.3 | 19.4 | 201 / 221 / 62 / 62 |
| 10.4 | 88 | 0 | 3.1 | 19.0 | 200 / 221 / 63 / 64 |
| 12.5 | 78 | 0 | 5.2 | 20.2 | 209 / 221 / 63 / 63 |
| 14.6 | 111 | 0 | 3.8 | 13.8 | 204 / 214 / 62 / 62 |
| 16.8 | 94 | 0 | 4.0 | 15.7 | 204 / 219 / 63 / 63 |
| 18.8 | 107 | 0 | 4.0 | 14.7 | 207 / 215 / 65 / 67 |
| 20.1 | 85 | 0 | 2.7 | 10.3 | 207 / 218 / 64 / 64 |

- **1,022 jobs, 0 failures.**
- **No memory growth trend.** N1/N2 settle at 200–221 MB after warm-up (peak 216 / 226),
  O1/O2 at 61–67 MB between jobs (peak 95 / 100). The earlier question about N2 keeping
  about 100 MB after large jobs: under steady load it stays flat, so this looks like
  allocator retention, not a leak.
- The throughput dip at minutes 6–12 matches the host running low on free memory
  (183 MB at the lowest point), not a service problem.
- Temp files: 37 before, 38 after (+224 bytes). One stray file in 20 minutes. NOT
  INVESTIGATED further.

## Request rate on health and readiness (MEASURED, 10 s per step)

| Endpoint | Up to 100 RPS | 200 RPS target |
|---|---|---|
| frontend `/api/health` | 0 errors, p95 ≤ 63 ms | 83 RPS achieved, p95 17.6 s |
| N1 `/api/v1/health` | 0 errors, p95 ≤ 145 ms | 92 RPS achieved |
| N1 `/api/v1/ready` | 0 errors, p95 1.3 s at 100 RPS | 68 RPS achieved |
| O1 `/api/v1/health` | 0 errors, p95 ≤ 48 ms | 92 RPS achieved |
| O1 `/api/v1/ready` (cached) | 0 errors, p95 ≤ 22 ms | 82 RPS achieved |

Every endpoint held 100 RPS with no errors. At 200 RPS all of them topped out around
70–90 RPS at once, including the trivial `/health` routes. That points at the single-process
Python load generator on a 2-core host, not the services. **Service limits above 100 RPS
are UNKNOWN.**

## OCR memory per image (MEASURED, run-20260927)

Full table in `OCR_BENCHMARK_REPORT.md`. Summary, uvicorn plus Tesseract, one job:

| Largest file that fits the caps | Peak MB |
|---|---|
| JPEG 25 MP | 149 |
| GIF 25 MP | 150 |
| BMP / uncompressed TIFF at 10 MB | 120–151 |
| PNG 25 MP | 205 |
| TIFF (LZW) 25 MP | 210 |
| **WebP 25 MP** | **423–442** |

No growth over 50 sequential OCR jobs (57 → 60.5 MB).

## ZIP export in the browser (MEASURED, `zip_bench.mjs`, Node JSZip)

| Files | Source MB | STORE ms | DEFLATE ms | DEFLATE size |
|---|---|---|---|---|
| 5 | 2.4 | 30 | 233 | 0.27 MB |
| 25 | 2.7 | 29 | 288 | 0.31 MB |
| 50 | 7.3 | 66 | 600 | 0.83 MB |
| 100 | 14.3 | 149 | 1,027 | 1.63 MB |

The app uses JSZip's default (STORE). With the 20-file queue limit the ZIP step is well
under 100 ms. DEFLATE would shrink Markdown about 9× at roughly 10× the time.

## Failover

See `FAILOVER_REPORT.md`: every single-instance outage was masked by the peer (80/80 jobs),
and a whole-pool outage returned a readable 502 in about 8 ms without affecting the other pool.

## What was not tested

- Anything on Vercel, Render or Supabase (not deployed, no project).
- The Supabase Storage upload and download path under load.
- Concurrency above 16, and cold starts on the cloud.
- OCR with more than one image per process.
