# Capacity Summary

One page for decisions. Details and raw tables: `LOAD_TEST_REPORT.md`,
`OCR_BENCHMARK_REPORT.md`, `PERFORMANCE_REPORT.md`, `FAILOVER_REPORT.md`.

## Environment

All measurements come from one laptop (i3-1005G1, 2 cores / 4 threads, 7.7 GB RAM,
Windows 11). N1, N2, O1, O2, the frontend and the load generator shared those cores.
Production splits them across Vercel and Render, so **production capacity is NOT
TESTED**. Treat the numbers as a lower bound per core, not as cloud figures.

## Current limits in the code

| Limit | Value | Enforced in |
|---|---|---|
| Document size | 15 MB | browser queue, `/api/convert`, Storage upload create, backendN |
| Image size | **10 MB** (all 8 image formats) | same, backendO |
| Image pixels | 25 MP, 10,000 px per side; **WebP 12 MP** (checked from the header, before decoding) | backendO |
| Files per batch | 20 | browser queue |
| OCR jobs per process | 1 at a time | backendO `_OCR_LOCK` |
| Backend attempt timeout | documents 120 s, images 150 s (covers a Render Free wake-up); route budget 300 s (Vercel Hobby maximum) | dispatcher, routes |
| OCR budget per image | 85 s on Render Free (`OCR_TIMEOUT_S`), 45 s default | backendO, `render.yaml` |
| Retry | 1 peer retry on connection error or 502/503/504 only | dispatcher |

## Measured capacity on the test host

| Workload | Best throughput | At | p95 there | First errors |
|---|---|---|---|---|
| Documents (N1 + N2) | 56 jobs/min | concurrency 16 | 34.7 s | 1.9 % timeouts at 16 |
| Documents, comfortable | 34 jobs/min | concurrency 4 | 13.9 s | none |
| Images (O1 + O2) | 90 jobs/min | concurrency 16 | 17.9 s | none up to 16 |
| Mixed | 68 jobs/min | concurrency 4 | 10.9 s | 3.3 % timeouts at 16 |
| Mixed, 20-minute soak | 51 jobs/min | concurrency 4 | 10–20 s | none (1,022 jobs) |
| Health / readiness | 100 RPS, 0 errors | – | ≤ 145 ms (N1 `/ready`: 1.3 s) | not reached (load generator limit) |

**Largest single jobs:** a 150-page PDF takes 27 s alone, an XLSX with 20k rows 10 s,
and a 25 MP image 3 s.

## Memory per instance (MEASURED)

| Instance | Idle | Steady under load | Worst single job |
|---|---|---|---|
| N1 / N2 | 165 MB | 200–221 MB | 337 MB (large PDF / XLSX) |
| O1 / O2 | 57 MB | 61–67 MB | **243 MB** (WebP 12 MP); 205 MB PNG 25 MP. WebP above 12 MP is now rejected (was 442 MB at 25 MP) |
| Frontend | 65 MB | 85–99 MB | 150 MB (14 MB upload through the route) |

The 10 MB image cap lowers peak memory by only about 9 MB, and only for uncompressed
BMP/TIFF. Peak OCR memory depends on pixel count and format: about 2–3 MB per megapixel
for JPEG, 6 MB for PNG and 15 MB for WebP. The cap still helps with upload bandwidth and
Storage size.

## Sizing guidance (ESTIMATED from the measurements)

- **OCR instances: Render Free (512 MB, 0.1 CPU), chosen 2026-09-27.** With the WebP cap
  the worst measured case is 243 MB, so every allowed image fits with more than 250 MB to
  spare. 256 MB would still fail on 25 MP PNG and TIFF.
- **0.1 CPU is the real constraint.** OCR will be several times slower than the local
  numbers (ESTIMATED, not measured on Render). The 85 s OCR budget and 150 s dispatcher
  attempt are set for that. Measure on the deployed services first.
- **750 free instance hours a month** cover the whole workspace. Hash routing wakes both
  O1 and O2. If traffic keeps both awake all month, the hours run out mid-month and both
  stop. Watch the usage page, and see "O2 as standby" in
  `project-docs/unified-content-aware/REVIEW.md`.
- **Two OCR instances handle about 90 images/min on 2 shared cores here.** Render instances
  get their own CPU, but small plans get only a fraction of a core. Measure on the chosen
  plan before promising a number.
- **Documents:** PDF time dominates. The attempt timeout is now 120 s inside a 300 s route
  budget (it was 50 s during the load runs). Very large PDFs still need the async job
  flow (start, then poll), which the Supabase path enables.
- **Vercel:** requests and responses through `/api/convert` are capped at 4.5 MB by the
  platform. The Supabase Storage flow removes that limit. It's implemented but UNTESTED
  until the project exists.

## Decisions (2026-09-27)

1. **WebP capped at 12 MP** (peak 243 MB, measured). Larger images are downscaled to
   12 MP before OCR anyway, so no OCR detail is lost. The error tells users to save as
   PNG or JPEG, or resize.
2. **Render Free for O1/O2.** Next: deploy, then re-run `harness.py matrix --kind ocr`
   and `ocr_cap_bench.py` against the real services.
3. **Admin controls** (`/mdify-controller`) wait for the Supabase keys.
