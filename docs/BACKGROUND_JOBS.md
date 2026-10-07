# Background jobs (durable work queue)

Status: **VERIFIED on real Postgres (PGlite) with fake backends.** The SQL runs in
`frontend/test/sql/workQueue.test.mjs`; the full flows (document, image, scanned PDF, ZIP) run in
`frontend/test/storageFlow.test.mjs` against the shipped migrations. **LIVE since 2026-09-28**: the
cron tick returns 200 every minute (`{"stale":0,"claimed":0,"outcomes":{}}` while idle); conversions
through the live site have not been run yet.

## Why

A scanned PDF or a ZIP turns into many pieces of work on different servers (N, O, Z). Postgres keeps
the list of pieces, so work survives a closed tab, a server restart or a Render instance waking up,
and no server holds a whole job in memory.

## Model

| Table | Holds |
|-------|-------|
| `jobs` | one upload: status, progress counters (`items_total/done/failed/skipped`), warnings, retention |
| `content_nodes` | the content tree: the upload, PDF page runs, ZIP entries (paths, types, sizes, statuses; never content) |
| `work_items` | the pieces of work: task, pool, status, attempts, lease, input/output object paths, statistics |

Task types and where they run:

| Task | Pool | Does |
|------|------|------|
| `CONVERT` | normal | one document → `output/result.md` |
| `OCR_IMAGE` | ocr | one image → Markdown (raw text for images inside a ZIP) |
| `PDF_ANALYZE` | normal | classifies pages; text-only PDFs finish here, otherwise text runs are converted and scanned pages rendered to PNG |
| `PDF_PAGE_OCR` | ocr | one rendered page → text |
| `PDF_MERGE` | normal | joins runs and pages in page order |
| `ARCHIVE_PROCESS` | archive | inspects and converts a ZIP; without images it finishes here |
| `PROJECT_MERGE` | archive | adds the images' text, writes `combined.md`, `PROJECT_INDEX.md`, `manifest.json` |

Merge items wait as `BLOCKED` until every other item of their job is finished (`settle_job`).

## Scheduling

`claim_work_items(pool, capacity, limit, job?)`, one transaction per pool:

- a per-pool advisory lock, then a capacity check (running items with a live lease);
- fair order: `row_number() over (partition by job_id)`, so a 100-page PDF does not starve a
  one-image job;
- `FOR UPDATE SKIP LOCKED`, a 6-minute lease, `attempt_count + 1`.

`complete_work_item` ignores stale answers (attempt guard). Outcome `RETRY` (HTTP 502/503/504 after the
dispatcher already tried the peer) puts the item back in the queue until `max_attempts`.
`requeue_expired_work_items` returns items whose lease ran out. `sweep_stale_jobs` fails jobs with no
activity and cancels their queued items.

Capacity per pool: `MAX_INFLIGHT_NORMAL` (default 4), `MAX_INFLIGHT_OCR` (default one per OCR instance,
since each OCRs one image at a time), `MAX_INFLIGHT_ARCHIVE` (default one per archive instance).

## Who drives it

- The **browser** calls `POST /api/jobs/:id/advance` while it waits (every 0.5 s, every 3 s while
  queued, backing off on errors, up to 30 minutes). Each call is one scheduling pass for that job.
- **Supabase Cron** calls `POST /api/jobs/tick` every minute with `x-mdify-cron-secret`: it sweeps stale
  jobs, requeues expired leases and runs one pass across all jobs, so work continues when nobody waits.
  The secret comes from Vault (`mdify_cron_secret`) and equals the frontend's `CRON_SECRET`.
- **OCR keep-warm** (separate, no queue work): Supabase Cron calls `public.keepwarm_ping()` every 30
  minutes, 12:00–23:30 UTC. It sends `GET /api/v1/health` to each Render instance whose base URL is in
  Vault (`mdify_keepwarm_url_o1`, `_o2`), and `public.keepwarm_pings` keeps only the status code or
  error. Render Free sleeps after 15 idle minutes, so each ping wakes the instance rather than
  keeping it awake between pings; this uses about 400 of the workspace's 750 free hours a month.

Both run the same code (`frontend/lib/server/jobQueue.js#runTick`).

## Storage layout

```text
jobs/<job_id>/input/source.<ext>                 the upload
jobs/<job_id>/materialized/<node>/source.<ext>   rendered PDF pages, images from a ZIP (for O1/O2)
jobs/<job_id>/nodes/<node>/result.md             one piece's text
jobs/<job_id>/nodes/archive-N/partial.json       converted ZIP entries waiting for the merge
jobs/<job_id>/output/result.md                   documents, images, PDFs
jobs/<job_id>/output/combined(-NNN).md           ZIP result (parts above 4 MB)
jobs/<job_id>/output/PROJECT_INDEX.md, manifest.json
```

Deletion removes the whole `jobs/<job_id>/` folder (cleanup function and admin "Delete files now"),
then `mark_job_files_deleted` clears file names and archive paths from the database.

## Storage budget

Upload admission now checks fresh Storage bytes plus unspent per-job reservations inside
one database transaction, before signing an upload URL. Concurrent deployments share
an 800 MiB ceiling; `STORAGE_BUDGET_BYTES` can lower it. Unavailable or malformed usage
returns 503 with Retry-After instead of failing open.

Each active job reserves the larger of the bucket's single-object ceiling (15 MiB by
default) and its conversion estimate (2× documents/images, 3× PDFs/ZIPs). Actual job
objects replace that estimate, and retained results and orphan objects still count.
Signed-upload headroom remains for three hours even after cancellation or deletion;
active processing reservations remain until the job settles. This conservative guard
can temporarily refuse small uploads while older tokens remain valid.

The conversion multipliers are estimates, not per-write limits. Expanded PDFs/archives,
late worker writes, other buckets, and physical orphan deletion remain separate work.
See [the reservation rollout](RELEASE_STORAGE_RESERVATIONS.md).
