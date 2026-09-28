# OCR Benchmark Report (O1 / O2)

**Runs:** `run-20260926` (before the rotation fix), `run-20260926-part2` (after), and
`run-20260927` (memory fix and the 10 MB image cap) ·
**Host:** local, i3-1005G1 2 cores / 4 threads, all services on one machine (see
`BACKEND_INTEGRATION_REPORT.md`) · **Engine:** Tesseract 5.4.0, `tessdata_fast`
`eng` + `osd`, `--oem 1 --psm 3`, `OMP_THREAD_LIMIT=1`, one OCR job at a time per process.
All numbers are MEASURED on this host unless labeled otherwise. Render: NOT TESTED.

## Only images reach the OCR pool

Routing is by extension (`jpg jpeg png webp tif tiff bmp gif` → O1/O2). PDFs,
including scanned ones, go to N1/N2. The OCR backend itself also refuses documents
(`400 Unsupported file format for the ocr pool`), on both the multipart and the Storage
path. In 100 dispatcher test jobs per pool, 0 were routed to the wrong pool.

## Orientation fix (P0)

Before: a page rotated 90° counter-clockwise produced **0.00** word recall.

Pipeline now: 10 MB byte cap → header-only dimension guard (25 MP, 10,000 px per side) →
grayscale (JPEGs decode straight to grayscale) → EXIF transpose → downscale above 12 MP
(`OCR_TARGET_PIXELS`) or 2× upscale below 1000 px, with autocontrast → Tesseract →
**if the upright read is weak** (mean word confidence < 75), Tesseract OSD proposes a
rotation. The proposal is kept only if it reads with clearly higher confidence
(+5 points). If OSD can't decide, the other three orientations are tried within the same
45 s budget.

Why the confidence gate (MEASURED): upright reads scored 77–96 mean confidence, and reads of
90°/180°-rotated pages scored 29–67. On an upright text page, OSD alone once proposed a
wrong 180° rotation (confidence 0.09). Trusting OSD blindly would have flipped a
correct page.

| Fixture | 0° | 90° | 180° | 270° |
|---|---|---|---|---|
| Receipt, 2 lines (900×260) | 1.00 | 1.00 (auto-rotated 90) | 1.00 (auto-rotated 180) | 1.00 (read natively) |
| Text page, 25 lines (1200×1500) | 1.00 | 1.00 (auto-rotated 90) | 1.00 (auto-rotated 180) | 1.00 (read natively) |
| Tiny (300×90) | 1.00 | 1.00 (auto-rotated 90) | 1.00 (auto-rotated 180) | 1.00 (read natively) |

Values are word recall against the rendered ground truth. Tesseract reads 90°-clockwise text
itself through its vertical-text detection, so 270° needs no rotation. Regression tests:
`backendO/tests/test_orientation.py` (8 real-OCR cases at 0/90/180/270 plus unit
tests of the decision logic). **Status: VERIFIED locally.**

Cost: upright images pay nothing extra (the gate skips OSD). Rotated images pay OSD plus
a second OCR pass; `ocr-rotated.png` took 832 ms vs about 250 ms for an upright image of
similar size.

## Accuracy on the corpus (end-to-end through the dispatcher, after the fix)

| Image | Dims | Recall | Backend ms |
|---|---|---|---|
| ocr-small.png / .jpg / .webp / .bmp / .tiff | 900×260 | 1.00 each | 250–358 |
| ocr-medium.png (text page) | 1700×2200 (3.7 MP) | 1.00 | 2,009 |
| ocr-large.png | 3400×4400 (15 MP) | 1.00 | 4,179 |
| ocr-near-limit.png | 5000×4990 (24.95 MP) | 1.00 | 3,272 |
| ocr-over-limit.png | 5100×5000 (25.5 MP) | – (413, rejected before decode) | – |
| ocr-lowres.png | 300×90 | 1.00 | 154 |
| ocr-rotated.png (90°) | 400×1200 | **1.00** (was 0.00) | 832 |
| ocr-noisy.png (4 % salt-and-pepper, blur) | 1200×400 | 0.90 | 311 |
| ocr-multilingual.png (FR/DE accents) | 1200×300 | 0.33 | 206 |

The multilingual result is expected with only the English model installed. Adding
language models is a product decision (image size, speed).

## Throughput (OCR-only load matrix, 45 s per level, through the dispatcher)

| Concurrency | Done | Failed | Jobs/min | p50 ms | p95 ms | p99 ms | O1 / O2 split | Peak RSS O1 / O2 MB |
|---|---|---|---|---|---|---|---|---|
| 2 | 49 | 0 | 62 | 2,091 | 4,123 | 4,376 | 23 / 26 | 73 / 68 |
| 4 | 61 | 0 | 76 | 2,470 | 7,946 | 10,778 | 26 / 35 | 105 / 95 |
| 8 | 73 | 0 | 87 | 5,171 | 9,855 | 10,518 | 35 / 38 | 85 / 95 |
| 16 | 83 | 0 | **90** | 9,651 | 17,912 | 20,903 | 36 / 47 | 110 / 99 |

Workload: 50 % small receipts (png/jpg/webp), 50 % 3.7 MP text pages. Each process OCRs
one image at a time, so above 2 concurrent requests the extra jobs queue inside O1/O2.
Throughput flattens at about **90 jobs/min on this 2-core host**, and latency grows
linearly with the queue. Per-job single-image latency: 250 ms (small) to 2.0 s
(3.7 MP page).

## Memory (MEASURED, O1 process RSS)

| Checkpoint | RSS MB |
|---|---|
| Before first OCR job | 61.0 |
| After 10 jobs | 64.6 |
| After 50 jobs | 64.7 |

No growth trend over 50 sequential jobs. Longer run: see the soak section of
`LOAD_TEST_REPORT.md`.

### Peak memory per image (run-20260927)

Measured with `tests/load/ocr_cap_bench.py`: one job at a time, RSS of the uvicorn
process **plus its `tesseract` child processes**, sampled every 20 ms. Each file is
the largest of its format that fits the caps. Idle baseline is about 57 MB.

| File | Size | Megapixels | Peak total MB | uvicorn peak | tesseract peak | Recall |
|---|---|---|---|---|---|---|
| PNG text page | 0.7 MB | 24.95 | 205 | 205 | 76 | 1.00 |
| JPEG text page | 2.1 MB | 24.95 | **149** | 112 | 76 | 1.00 |
| TIFF (LZW) | 1.6 MB | 24.95 | 210 | 210 | 76 | 1.00 |
| GIF | 0.5 MB | 24.95 | 150 | 137 | 76 | 1.00 |
| **WebP** | 0.8 MB | 24.95 | **423–442** | 423–442 | 76 | 1.00 |
| WebP | 0.6 MB | 16.0 | 287 | 287 | 75 | 1.00 |
| WebP | 0.5 MB | 12.0 | 242 | 242 | 74 | 1.00 |
| BMP 24-bit | 10.0 MB | 3.49 | 120 | 83 | 45 | 1.00 |
| BMP 8-bit gray | 10.0 MB | 10.48 | 151 | 85 | 69 | 1.00 |
| TIFF uncompressed | 10.0 MB | 3.49 | 120 | 80 | 45 | 1.00 |

Tesseract runs after decoding, so "peak total" is the highest combined sample, not the
sum of the two columns.

**Effect of the 10 MB image cap (MEASURED).** Only uncompressed formats reach the byte
cap before the pixel cap. The files the old 15 MB cap allowed now get 413 before decoding:

| File | Old cap (15 MB) peak | New cap (10 MB) |
|---|---|---|
| BMP 24-bit, 15.0 MB (5.24 MP) | 129 MB | 413, 68 MB (request read only) |
| BMP 8-bit, 15.0 MB (15.7 MP) | 160 MB | 413, 74 MB (request read only) |

The largest BMP that still fits peaks at 120–151 MB, so the byte cap saves about 9 MB of
peak memory for those formats. Its real value is bandwidth and storage: images now
move and sit in Storage at no more than 10 MB each. **Worst-case memory is set by pixels
and format, not by file size.** A 25 MP PNG is under 1 MB.

**WebP is the outlier.** Pillow decodes WebP through libwebp's animation decoder, which
keeps the decoder's frame, a bytes copy and the image itself (4 bytes per pixel each)
alive at once. That is about 15 MB per megapixel, against about 6 MB for PNG and
2–3 MB for JPEG. A sub-1 MB, 25 MP WebP therefore peaks at 423–442 MB.

Before the `_prepare` rewrite, the 25 MP PNG peaked at **302 MB** (run-20260926-part2,
uvicorn only). Converting to grayscale first and dropping the full-size EXIF copy
brought it to 204 MB and the 15 MP page from 213 to 150 MB, with recall unchanged
(1.00) and backend time down from 5.1 s to 3.0 s.

**Decision (2026-09-27): WebP is capped at 12 MP** (`OCR_MAX_WEBP_PIXELS`), other formats
keep 25 MP. Re-measured on O1 with the cap (`run-20260927-webpcap`):

| File | Result | Peak MB |
|---|---|---|
| WebP 25 MP | 413 before decoding, "the OCR limit for WebP is 12 MP. Save it as PNG or JPEG, or resize it" | 61 |
| WebP 16 MP | 413, same message | 62 |
| WebP 12 MP | 200, recall 1.00 | **243** |
| PNG 25 MP | 200, recall 1.00 | 204 |
| JPEG 25 MP | 200, recall 1.00 | 148 |

The worst allowed image now peaks at 243 MB, well inside Render Free's 512 MB.

## Readiness endpoint

`/api/v1/ready` on O1 was **51 ms** p50 because it started two `tesseract` processes per
call. It is now cached for 5 minutes after a healthy probe: **4–7 ms** p50 at 1–100 RPS.
