# Review: Unified Content-Aware Architecture (PDF + ZIP)

**Reviewed:** 2026-09-27 against the current repository, the measured results in
`docs/testing/`, and the free-tier limits of the chosen hosts (checked in the providers'
docs on the same day).

## Verdict

The direction is right: analyze first, split into units, route each unit to the right
pool, merge in order, keep large results in Storage. Three things in the package need to
change before building it, and a large part should wait until the core works.

1. **It conflicts with the rule "only images go to O1/O2".** Sections 10 and 31 have
   O1/O2 render PDF pages. Keep the rule: **N1/N2 render a scanned page to PNG** (the
   renderer, pypdfium2, is already installed in backendN through pdfplumber), store the
   PNG, and O1/O2 OCR an image as they do today. O1/O2 never open a PDF.
2. **It is sized for paid infrastructure.** On the free tiers, fan-out multiplies the
   scarcest resources: Render hours, Storage space and egress. The limits below have to be
   part of the design, not tuning knobs added later.
3. **Region-level OCR on mixed pages is the most expensive, least certain part** (image
   region detection, deduplication, position-aware merge). Defer it. Page-level routing
   (native page vs scanned page) delivers most of the value.

## Hosting limits that shape the design

| Host | Limit (provider docs, 2026-09-27) | Consequence |
|---|---|---|
| Render Free (O1, O2) | 512 MB RAM, **0.1 CPU** | OCR is roughly 10× slower than on one full core (ESTIMATED). A 3.7 MP page that takes 2 s locally could take about 20 s. |
| Render Free | Spins down after 15 min idle, about **1 min** to wake | The first OCR request after idle exceeds today's 50 s dispatcher timeout and fails with 504. Async work items turn this into a delay instead of an error. |
| Render Free | **750 instance hours per month per workspace**, counted while awake. At the limit, all free services stop until next month | Two OCR services awake all day would need 1,488 h. Hash routing wakes both. See "O2 as standby" below. |
| Vercel Hobby (frontend, N1, N2) | 2 GB, 1 vCPU, **300 s** max duration, 4.5 MB request and response body, 500 MB Python bundle | Today's route uses 60 s and the dispatcher 50 s. Both can go up to 300 s. Large results must stay in Storage (already the design). |
| Supabase Free | **1 GB Storage**, 500 MB database (read-only when exceeded), **5 GB uncached + 5 GB cached egress** per month, 50 MB global file limit | Every materialized child, node output and export adds to the 1 GB. Every backend download of an input counts as egress. |

## Section-by-section

| Section | Assessment | Change |
|---|---|---|
| 3 Content graph | Good | Keep. One `content_nodes` tree per root job. |
| 4 Schema (`content_nodes`, `work_items`, root counters) | Good | Add as a second migration next to the existing one. Counters on `jobs` should be updated by one RPC per completed item, not by the frontend. |
| 5 Durable scheduling, `FOR UPDATE SKIP LOCKED` | Good | The same pattern already exists in `claim_cleanup_batch`. Ticks: a completed item triggers the next tick (backend calls the frontend), plus a Supabase Cron sweep each minute for stuck or missed items. |
| 6 Backpressure | Good, numbers missing | Start with `MAX_INFLIGHT_OCR = 2` (one per instance, each process OCRs one image at a time), `MAX_INFLIGHT_NORMAL = 4`, `MAX_CHILDREN_PER_ROOT = 4`, `MAX_ROOTS_INFLIGHT = 3`. Re-measure on the real hosts. |
| 7–9 PDF analyzer, native pages | Good | Classify with pdfplumber/pdfminer (already installed): characters per page, image coverage. Native pages go through the existing converter in one pass. Splitting a text PDF into per-page work items would only add overhead. |
| 10 Scanned page | Change | N1/N2 render the page to PNG at about 12 MP or less (the OCR target), store it, create an `IMAGE_OCR` item. O1/O2 stay image-only. Reuse the existing 0/90/180/270 orientation tests. |
| 11–12 Mixed page, region OCR | Defer | v1: treat MIXED as native, and flag pages whose images cover more than about 50 % of the page for a full-page OCR item. Region OCR with dedup comes later, if real documents need it. |
| 14 Ordered merge | Good | Merge by `(page_number, sequence_index)` once all items are terminal. |
| 15–18 ZIP inspector, path security, classifier | Good | Do not pass ZIPs to MarkItDown's own `ZipConverter`: it has no size, count or depth limits. Also: skip encrypted entries, detect symlinks through `external_attr`, reject case-insensitive and Unicode-normalized path collisions, never recurse into Office files (DOCX/XLSX/PPTX are ZIPs). |
| 19 Code preservation | Good | Fenced blocks with a language from the extension. |
| 20 Smart project mode | Good | Default on. Index skipped directories in `PROJECT_INDEX.md`. |
| 21 Nested archives | Limit | Depth 1 in v1 (a ZIP inside the upload), depth 2 at most later. |
| 22 Materialization | Good, make it strict | Materialize only images (they must cross to O1/O2). Text, code and documents are converted inside the archive job on N1/N2. |
| 23–25 Outputs | Trim for v1 | `PROJECT_INDEX.md`, `manifest.json`, `combined.md` (split into parts above 4 MB). Skip `converted-project.zip` in v1: the browser already builds ZIPs with JSZip. |
| 26 Project merger | Good | Stream parts to Storage. Merge once. |
| 27 Storage layout | Good | `backend*/app/common/storage.py` allowlists only `input/source.*` and `output/result.md`. Extend the allowlist to the new prefixes. |
| 28 Retention | Change | The cleanup function deletes the paths listed in `file_objects`. Either register every derived object there or delete by listing the `jobs/<id>/` prefix. Prefix deletion is simpler and can't miss a child. |
| 29 API contract | Good | Matches the current Storage design (preview only, signed URLs). |
| 30 Progress | Good | Derive from counters. The UI keeps its current look and gains only the state labels. |
| 31 Backend roles | Change | As above: rendering on N1/N2, OCR of images only on O1/O2. |
| 32–33 Failure isolation, retry | Good | Matches the current dispatcher rules (one peer retry, never on 4xx/422). With work items, a sleeping instance becomes a delayed retry. |
| 34–35 Admin, KPIs | Good | Depends on `/mdify-controller`, which is NOT IMPLEMENTED and waits for the Supabase keys. |
| 37–39 Tests | Good | Most fixtures exist in `tests/load/corpus.py`. Add scanned and mixed PDFs and project ZIPs. |

## Additions the package does not cover

- **O2 as standby, not an equal peer.** On Render Free, route OCR to O1 first and use O2
  only when O1 fails or is busy with a long queue. O2 then sleeps most of the time,
  which roughly halves the monthly hours. Do not add keep-alive pings: they burn hours.
- **Storage budget guard.** Before accepting an archive or scanned PDF, check current
  bucket usage. Refuse new heavy jobs above about 800 MB of the 1 GB quota with a clear
  "busy, try later" message.
- **Egress awareness.** Each OCR child costs one download by O1/O2 and one result upload.
  Keep images at the 10 MB cap and render pages at 12 MP or less.
- **Waking instances in the UI.** The frontend health route never contacts O1/O2, so
  "Server Ready" can show while both are asleep. The existing "Waking" state in the
  header could be driven by a lightweight O1 check, but only when the user queues an
  image, not on every page load.
- **Name.** The package says "MarkDify" throughout. The product is MDify.

## Recommended order

| Step | Scope | Size | Depends on |
|---|---|---|---|
| 1 | Async jobs on `work_items`: claim RPC, tick endpoint, Cron sweep, route and dispatcher to 300 s | M | Supabase keys |
| 2 | PDF page analyzer and scanned-page path (render on N, OCR on O, ordered merge) | M | 1 |
| 3 | ZIP v1: safe inspector, classifier, in-process text/code/docs, image children, `PROJECT_INDEX.md`, `manifest.json`, `combined.md` | L | 1 |
| 4 | Admin tree view and the new KPIs | M | `/mdify-controller` base |
| 5 | Measure on the real hosts, then set the in-flight limits | S | 1–3 deployed |
| 6 | Region OCR for mixed pages, nested depth 2, `converted-project.zip` | L | evidence from real documents |

**Definition of done** (from the package, kept): one real mixed PDF and one real complex
project ZIP pass end to end on the deployed N1/N2/O1/O2 with Supabase-backed outputs.
Nothing in this review is implemented yet. Status of every item: **NOT IMPLEMENTED**.
