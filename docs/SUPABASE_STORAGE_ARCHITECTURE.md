# Supabase Storage — as built

Status: **IMPLEMENTED BUT UNTESTED** against a real project (unit-tested with fakes on both
frontend and backends). No MDify Supabase project exists yet.

## Bucket

`mdify-pro-files`, private, `file_size_limit = 15 MB` (created by the migration).
MIME types are not restricted at the bucket level; backends re-validate bytes.

```text
jobs/<job_id>/input/source.<ext>
jobs/<job_id>/output/result.md
jobs/<job_id>/exports/<export_id>.zip   (reserved; ZIP export is client-side today)
```

Original filenames never appear in object paths; they live in `jobs.original_filename`
and are cleared by retention cleanup.

## Flows

| Step | Who | Call | Code |
|------|-----|------|------|
| Signed upload URL (2 h) | Frontend server | `POST /storage/v1/object/upload/sign/<bucket>/<path>` | `frontend/lib/server/supabaseRest.js` |
| Upload bytes | Browser | `PUT <signed url>` (FormData, same shape as `uploadToSignedUrl`) | `frontend/lib/models/conversionService.js` |
| Read input | N1/N2/O1/O2 | `GET /storage/v1/object/<bucket>/<path>` streamed, capped at the role limit (15 MB documents, 10 MB images) | `backend*/app/common/storage.py` |
| Write result | N1/N2/O1/O2 | `POST /storage/v1/object/<bucket>/<path>` with `x-upsert: true` (idempotent retry) | same |
| Signed download (10 min) | Frontend server | `POST /storage/v1/object/sign/<bucket>/<path>` | `supabaseRest.js`, `jobService.js` |
| Delete | Cleanup function | Storage `remove()` | `supabase/functions/cleanup-expired-jobs` |

Backends use the Storage REST API through `httpx` rather than an S3 SDK, to keep the
Vercel bundle small (backendN dependencies measure ~300 MB installed).

TUS resumable upload is **NOT IMPLEMENTED**: `MAX_FILE_SIZE` is 15 MB and a single signed
PUT covers it. Supabase supports TUS with the same signed token (`x-signature` header) if
the limit is raised.

## Failure handling

| Condition | Backend result | Dispatcher |
|-----------|----------------|------------|
| Input object missing | 409 | not retried |
| Storage unreachable / 5xx | 503 | one peer retry |
| Result write fails | 503 (transient) / 502, job never marked COMPLETED | peer retry on 503 |
| Path not in the allowlist / other job's path | 409 / 400 | not retried |
