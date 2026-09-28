# Failover Report

**Run:** `run-20260926-part2` · local host · each scenario sends 20 small documents and
20 small images through the frontend dispatcher (`POST /api/convert`), one at a time.
An instance was made unavailable by stopping its process.

## Rules under test

- Instance = FNV-1a hash of a per-request job id → one of two per pool.
- Exactly one peer retry, only for connection failure or HTTP 502/503/504.
- Never retried: 4xx, 422 (conversion failure), timeouts (504 from the dispatcher's own
  50 s limit, which the peer couldn't finish within the route's 60 s budget anyway).
- A pool with both instances down returns 502 with a user-readable message; no loops.

## Results (MEASURED)

| Scenario | Pool | Jobs | Succeeded | Served by | p50 ms | p95 ms | User-visible error |
|---|---|---|---|---|---|---|---|
| all up (baseline) | normal | 20 | 20 | N1 6, N2 14 | 17 | 33 | – |
| all up (baseline) | ocr | 20 | 20 | O1 11, O2 9 | 250 | 418 | – |
| **N1 down** | normal | 20 | **20** | N2 20 | 16 | 30 | – |
| N1 down | ocr | 20 | 20 | O1 6, O2 14 | 258 | 345 | – |
| **N2 down** | normal | 20 | **20** | N1 20 | 19 | 29 | – |
| N2 down | ocr | 20 | 20 | O1 8, O2 12 | 276 | 423 | – |
| **O1 down** | ocr | 20 | **20** | O2 20 | 242 | 291 | – |
| O1 down | normal | 20 | 20 | N1 11, N2 9 | 16 | 29 | – |
| **O2 down** | ocr | 20 | **20** | O1 20 | 241 | 273 | – |
| O2 down | normal | 20 | 20 | N1 10, N2 10 | 16 | 24 | – |
| **N1 + N2 down** | normal | 20 | 0 | 502 × 20 | 8 | 16 | "The converter is temporarily unavailable. Please retry in a moment." |
| N1 + N2 down | ocr | 20 | 20 | O1 11, O2 9 | 242 | 566 | – |
| **O1 + O2 down** | ocr | 20 | 0 | 502 × 20 | 8 | 9 | same message |
| O1 + O2 down | normal | 20 | 20 | N1 9, N2 11 | 18 | 23 | – |

- **Every single-instance failure was fully masked**: 80/80 jobs served by the peer.
- **Double failures are bounded**: 502 in about 8 ms, no retry loop, and the other pool is unaffected.
- **Detection time / retry delay: about 0 ms locally.** A stopped local process refuses the
  connection immediately, so failover latency equals the peer's normal latency. In the
  cloud a dead instance may instead hang until a TCP or HTTP timeout, and a Render instance
  may be sleeping. Those cases are **NOT TESTED**. The worst case is bounded by the 50 s
  per-attempt timeout, and the dispatcher does not retry after a timeout.

## Also verified by unit tests (`frontend/test/dispatcher.test.mjs`)

Same job id → same instance; the retry goes to the other instance; 400/401/413/422 are
never retried; a timeout is never retried; an empty pool returns 503 without calling
anything; distribution over 50 job ids uses both instances.

## Not tested

- Storage-path failover (`/api/v1/internal/process` returns 503 on a Storage outage, which
  triggers the peer retry). Unit-tested only; there is no Supabase project.
- Supabase Storage / Postgres outages during a job (§18–§19 of the test brief).
- Cloud network behaviour (timeouts, Render cold starts).
