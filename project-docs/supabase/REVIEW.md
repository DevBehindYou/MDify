# Review — MarkDify Supabase Storage & Database Package

Reviewed 2026-09-26 against the repository (`frontend/`, `backendN/`, `backendO/`)
and current Supabase documentation. Package files are in this folder.

**Verdict:** the design is sound and fits the repo: one private bucket, immutable
`jobs/<job_id>/…` paths, Postgres as the job/audit source of truth,
`FOR UPDATE SKIP LOCKED` cleanup claiming, and a single KPI RPC. Before it is
applied, fix one security bug and several gaps that would leave files undeleted
or break inserts. Nothing is provisioned yet. The account's only Supabase
project (`TheHopeTarot-database`) is unrelated and must not be used.

---

## P0 — fix before applying

### 1. `claim_cleanup_batch` is callable by anyone with the anon key

`SUPABASE_SCHEMA.sql` revokes the functions from `public` only. Supabase docs
(lint 0028/0029) say default projects grant `EXECUTE` to `anon` and
`authenticated` through default privileges. Revoking from `public` leaves those
grants in place. The function is `SECURITY DEFINER` and returns full `jobs` rows,
including `original_filename`. Anyone could call `POST /rest/v1/rpc/claim_cleanup_batch`
to read job metadata and mark jobs `CLAIMED`, which blocks cleanup.

```sql
revoke execute on function public.claim_cleanup_batch(integer) from public, anon, authenticated;
revoke execute on function public.get_admin_kpis()            from public, anon, authenticated;
grant  execute on function public.claim_cleanup_batch(integer) to service_role;
grant  execute on function public.get_admin_kpis()            to service_role;
```

Alternative: move the functions to a schema that the Data API does not expose.

### 2. Storing files contradicts the published Privacy Policy

`frontend/components/LegalModal.js` promises that files are processed in memory
and "never written to persistent disk storage", with zero retention. The package
stores inputs and outputs for 48 hours. The package's own retention doc says
"Do not let implementation contradict legal text."

Before the first file is persisted:
- rewrite the Privacy Policy and Terms to state the 48-hour retention
- bump `POLICY_VERSION` in `frontend/lib/models/consentRepository.js`, so every
  visitor accepts the new terms again (the consent banner already does this)

---

## P1 — would break or silently fail

| # | Problem | Consequence | Fix |
|---|---------|-------------|-----|
| 3 | `auto_delete_at` has no default and no trigger | AUTO jobs whose app code forgets it keep a NULL deadline. `claim_cleanup_batch` requires `auto_delete_at is not null`, so they are never deleted | Set it in one DB function `confirm_upload(job_id)`: `upload_completed_at = now()`, `auto_delete_at = now() + 48h`, `status = 'QUEUED'`, guarded by `where status = 'UPLOADING'` |
| 4 | Only terminal jobs are cleanup-eligible | Abandoned uploads (`UPLOADING`) and crashed jobs (`PROCESSING`) keep their objects forever | Add a sweeper. Signed upload URLs expire after 2 hours (Supabase docs), so `UPLOADING` jobs older than 2h become `CANCELLED`. `PROCESSING` jobs older than the maximum processing time become `FAILED` with `error_code = 'STALE'` |
| 5 | A job claimed `CLAIMED` is never re-selected | If the cleanup function crashes mid-batch, those jobs are stuck forever. There is also no attempt cap, although the doc requires one | In the claim `where` clause, also match `cleanup_state = 'CLAIMED' and cleanup_claimed_at < now() - interval '30 minutes'`. Add `and cleanup_attempt_count < 5`; after that the job goes to `ERROR` for admin retry |
| 6 | Enum values differ from the code | Inserts fail the `CHECK` constraints. The app sends profile `Standard/Clean/Compact/RAG-ready`; the schema expects `standard/clean/compact/rag_ready`. Backends report instances `N1…O2`; the schema expects `n1…o2` | Map both in one place: the dispatcher/job repository. The package says to centralize these values |
| 7 | S3 SDK on N1/N2 (Vercel) | backendN dependencies already measure **298 MB installed** (pandas 69, numpy 56, onnxruntime 46). Adding boto3/botocore (~80 MB) risks the Vercel function size limit | N1/N2 read and write through the Storage REST API with `httpx`. S3 is optional on O1/O2 (Docker, no size limit) |

---

## P2 — correctness of KPIs and admin actions

| # | Problem | Fix |
|---|---------|-----|
| 8 | `failed_today` filters on `updated_at`. The cleanup run updates old failed jobs, so they get counted again as "failed today" | Set `completed_at` for FAILED too (or add `failed_at`), and filter on that |
| 9 | `active` counts every job that was never hard-deleted, i.e. all history | Define it as `files_deleted_at is null`, or rename it `total_jobs` |
| 10 | The KPI contract (§13) lists N1/N2/O1/O2 job counts, but `get_admin_kpis()` doesn't return them | Add `jsonb_object_agg(backend_instance, n)` for today |
| 11 | The `completed_at`-based KPI filters have no index | Add `jobs(completed_at)`. Fine without it at small scale; check with `EXPLAIN` once there are ~100k rows |
| 12 | The SQL doesn't create or configure the bucket | Create private `markdify-files` with `file_size_limit = 15 MB` and `allowed_mime_types` set, so the storage layer also enforces the app's limits |
| 13 | `DELETE_NOW` has no DB function. The claim only selects expired jobs, and the safety rule forbids deleting active jobs | Add `request_delete_now(job_id)`. For active jobs it sets `CANCEL_REQUESTED`; for terminal jobs it claims immediately |

---

## P3 — simplifications and design notes

- **Upload path.** `MAX_FILE_SIZE` is 15 MB. Supabase TUS needs 6 MB chunks and
  supports signed tokens via `x-signature` (verified in the docs). A standard
  signed upload (`createSignedUploadUrl` + `uploadToSignedUrl`) covers ≤ 15 MB
  with no extra client library. Add TUS only if the size limit goes up.
- **Who writes the database.** The package has all four backends write to
  Postgres, which means the service-role key lives on six hosts. The dispatcher
  already gets `backend_instance`, `duration_ms`, `started_at_ms` and
  `finished_at_ms` from every backend (the timeline fields were added today), so
  it can be the single writer. Backends then only need Storage access. This is
  fewer secrets and no serverless connection fan-out.
- **Sync vs async.** The frontend route has `maxDuration = 60` and waits for the
  conversion. Once jobs live in Postgres, use `POST /api/jobs/:id/start` → `202`
  plus polling (or Supabase Realtime) for long conversions. See
  `docs/testing/PERFORMANCE_REPORT.md` for the measured conversion times that
  decide this.
- **Migration plan scope.** Cloudflare was never provisioned: there is no R2/D1
  code, no Worker and no data in the repo. By the plan's own §2, skip §14
  (historical copy), §16–17 (shadow/dual-write), §19 (provider rollback flags)
  and §21 (decommission). What's left is greenfield Supabase work.
- **Provider abstraction.** The repo has none yet. Add
  `frontend/lib/server/jobRepository.js` + `storageProvider.js` on the server,
  and `app/storage.py` in each backend. Keep Supabase SDK calls out of route
  handlers, as the plan asks.
- `create extension pgcrypto` is unnecessary on Postgres 17 (`gen_random_uuid()`
  is built in). It is harmless.

---

## Recommended order

1. Create a dedicated Supabase project (`markdify`, free tier allows it). This
   needs your go-ahead.
2. Apply the schema with the P0/P1 SQL fixes as a migration; run the RLS/grant
   deny tests.
3. Create the bucket with size/MIME limits.
4. Update the legal text and bump the consent version.
5. Server job repository + storage provider; `POST /api/uploads/create` and
   `POST /api/jobs/:id/start`.
6. Backends read input and write output through Storage.
7. Cleanup Edge Function + Cron, then `/mdify-controller`.
