# Performance Report

**Run:** `run-20260926` · local host (2 cores / 4 threads, 7.7 GB). Environment details: `BACKEND_INTEGRATION_REPORT.md`.
Labels: **MEASURED** (this run), **ESTIMATED** (derived, stated as such), **NOT TESTED**.

## Run status

`run-20260926` was **interrupted at 19:12** when all four backends were stopped from the
preview pane. Everything measured before that point is valid and reported here. The
affected results were discarded (`matrix-normal` is kept only as
`matrix-normal.INVALID-backends-stopped.json`).

Everything the interruption skipped was re-run in `run-20260926-part2` (load matrix,
OCR memory, failover, 20-minute soak, ZIP) and `run-20260927` (OCR memory after the fix,
10 MB image cap). Those results are in `LOAD_TEST_REPORT.md`, `OCR_BENCHMARK_REPORT.md`,
`FAILOVER_REPORT.md` and `CAPACITY_SUMMARY.md`.

## Conversion time by file (MEASURED, single job, via dispatcher)

| Workload | Backend ms | Notes |
|----------|-----------:|-------|
| Small documents (txt/csv/json/xml/html/pdf/docx/pptx/xlsx/epub, ≤ 30 KB) | 8–25 | |
| medium.docx / pptx (25 slides) / epub / html / csv (20k rows) | 27–146 | |
| medium.xlsx (3k rows) | 1,520 | pandas/openpyxl |
| **medium.pdf (20 pages, 92 KB)** | **3,326** | ≈ 166 ms/page |
| large.xlsx (20k rows) | 9,822 | |
| **large.pdf (150 pages, 737 KB)** | **26,845** | ≈ 179 ms/page |
| large.txt (14 MB) | 552 | + 519 ms dispatch overhead for the 14 MB body |
| OCR small (900×260, all 5 formats) | 238–303 | |
| OCR medium page (1700×2200, 3.7 MP) | 2,521 | |
| OCR large (3400×4400, 15 MP) | 3,758 | |
| OCR near limit (5000×4990, 24.95 MP) | 3,235 | |

Dispatch overhead (receive at the frontend, forward, relay the response) is
**9–30 ms** for files under 1 MB (MEASURED).

## Finding 1 — PDFs are parsed twice (MEASURED, root cause found)

`markitdown/converters/_pdf_converter.py` lines 552–572 (v0.1.8):
1. Runs a full **pdfplumber** pass over every page to detect form/table pages.
2. If no page is form-like (true for ordinary text PDFs), it **discards** that
   text and re-parses the whole file with **pdfminer**.

Timing on the same files, one process, no other load:

| File | MarkItDown total | pdfminer only | pdfplumber pass (wasted for text PDFs) |
|------|-----------------:|--------------:|---------------------------------------:|
| medium.pdf (20 p) | 3,413 ms | 728 ms | 2,352 ms |
| large.pdf (150 p) | 28,755 ms | 7,215 ms | 22,602 ms |

About **75–80 %** of PDF conversion time goes to work whose output is thrown
away for text PDFs. PDF is the heaviest normal-pool format and 30 % of the
expected normal mix, so this is the **primary normal-pool bottleneck**.

## Finding 2 — O1/O2 readiness check starts two processes per call (MEASURED)

`/api/v1/ready` on O1/O2: p50 **51 ms** vs **4 ms** on N1/N2. Each call runs
`tesseract --version` and `tesseract --list-langs`. Render polls the health path
continuously, so this is steady background CPU on a pool that is CPU-bound.

## Finding 3 — Large results can't come back through the sync path (MEASURED sizes)

The Markdown output was 14.0 MB for the 14 MB text file and 1.7 MB for the
0.7 MB XLSX. Vercel caps function request **and** response bodies at 4.5 MB
(platform limit). Large files therefore can't be uploaded through, or returned
through, `/api/convert` in production. The Supabase Storage direct-upload and
signed-download flow is required, not optional.

## Finding 4 — 150-page PDF would exceed the frontend's time budget

`large.pdf` took **26.8 s** alone and **~40 s+** under 4-way contention
(ESTIMATED from the 1.4–1.8× parallel slowdown measured for `medium.pdf`). The
dispatcher gives up after 50 s and the route has `maxDuration = 60`. Bigger
PDFs, or slower Vercel CPUs, will time out. That needs the async job flow
(start → 202 → poll), which becomes possible once job state lives in Postgres.

## Memory (MEASURED, peak RSS during the E2E corpus run)

| Service | Idle | Peak | After |
|---------|-----:|-----:|------:|
| N1 | 169 MB | 187 MB | 187 MB |
| N2 | 168 MB | **337 MB** (large.pdf / large.xlsx) | 270 MB |
| O1 | 55 MB | 182 MB (15 MP image) | 57 MB |
| O2 | 55 MB | 172 MB (24.95 MP image) | 56 MB |
| Frontend (`next start`) | 65 MB | 150 MB (14 MB upload) | 77 MB |

- OCR memory returns to baseline after each job.
- N2 kept about 100 MB after the large jobs. The 20-minute soak later showed N1/N2
  flat at 200–221 MB under steady load, so this is allocator retention, not a leak
  (`LOAD_TEST_REPORT.md`).
- The table above samples every 250 ms and misses short peaks. The dedicated OCR
  measurement (20 ms sampling, Tesseract included) is in `OCR_BENCHMARK_REPORT.md`:
  205 MB for a 25 MP PNG after the `_prepare` fix (302 MB before), and **442 MB for a
  25 MP WebP**. OCR instances need at least 512 MB (`CAPACITY_SUMMARY.md`).

## Recommendations (ranked, each backed by a measurement above)

| Priority | Change | Evidence | Expected effect | Risk | Verify by | Status (2026-09-27) |
|---|---|---|---|---|---|---|
| **P0** | Direct upload to Supabase Storage + signed download of results | 14 MB in / 14 MB out measured; Vercel 4.5 MB body cap | Removes hard failure for files > 4.5 MB and results > 4.5 MB | Implementation effort | E2E with `large.txt` on a Vercel preview | IMPLEMENTED BUT UNTESTED (needs the Supabase project) |
| **P1** | Custom PDF converter: pdfminer first, pdfplumber only for pages that look like forms/tables (or a cheap pre-check) | 22.6 s of 28.8 s wasted on `large.pdf` | ≈ 3–4× faster text-PDF conversion (ESTIMATED from the table) | Could change output for form PDFs | Re-run `e2e` + marker checks + compare output on a form/table PDF corpus | IMPLEMENTED as opt-in `PDF_FAST_SAMPLE_PAGES`, benchmarked, off by default |
| **P1** | Async job flow (`/api/jobs/:id/start` → 202 → poll) | 26.8 s single 150-page PDF vs 50/60 s limits | No request-time timeouts for long jobs | Needs Postgres job state (Supabase phase) | Timing test with large PDF on Vercel | PARTIALLY: job rows and `/api/jobs/:id/start` exist, start still waits for the result |
| **P2** | Cache the Tesseract version/language check in O1/O2 `/ready` (check once at start, then every N minutes) | `/ready` 51 ms vs 4 ms | Less background CPU on OCR instances | Stale readiness if Tesseract breaks at runtime (rare) | RPS test on `/ready` | DONE: 51 ms to 4–7 ms |
| **P2** | Add OSD rotation detection (ship `osd.traineddata` from `tessdata_fast`, use `--psm 1` or a rotate-and-retry fallback) | Rotated page recall 0.00 | Rotated scans become readable | Slower OCR per image | `e2e` recall on `ocr-rotated.png` | DONE: rotated recall 0.00 to 1.00 |
| **P3** | Consider more language models if non-English users matter | FR/DE accents recall 0.33 with eng only | Better multilingual OCR | Larger image, slower OCR | Recall on multilingual corpus | NOT STARTED (product decision) |
| **P1** | Grayscale-first image preparation (JPEG decoded straight to grayscale, no full-size EXIF copy) | 25 MP PNG peak 302 MB | Lower OCR peak memory | Output could shift slightly (autocontrast now after resizing) | `ocr_cap_bench.py`, recall on the corpus | DONE: 302 to 205 MB, JPEG 149 MB, recall 1.00 |
| **P1** | Decide the WebP pixel cap | 25 MP WebP peaks at 442 MB | 287 MB at 16 MP, 242 MB at 12 MP | Rejects large WebP images | `ocr_cap_bench.py --only webp` | DONE: WebP capped at 12 MP, worst case 243 MB |
