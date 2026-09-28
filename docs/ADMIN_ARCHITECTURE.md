# `/mdify-controller` admin

Status: **PARTIALLY VERIFIED.** Server logic, guards and SQL are covered by tests
(`frontend/test/admin.test.mjs`, `frontend/test/sql/admin.test.mjs`); the UI was checked in the
browser (desktop, 375 px, light and dark) signed in, but without data, because the tables are not
applied to the MDify project yet. Full end-to-end check pending `supabase/MDIFY_SETUP.sql`.

## Access

- Two independent keys, `ADMIN_KEY_1` (access) and `ADMIN_KEY_2` (control), server-only env. Both must
  match; each needs at least 24 characters and they must differ, otherwise the controller stays closed.
- Keys are compared as SHA-256 digests with `timingSafeEqual`; both comparisons always run.
- A match issues a 30-minute session: an HMAC-SHA256 signed, expiring token in an `HttpOnly`,
  `SameSite=Strict` cookie (`Secure` in production) scoped to `Path=/api/admin`. The signing key is
  derived from both admin keys, so changing either key ends every session. No key or token reaches
  browser JavaScript.
- Requests that change something also need the `x-mdify-admin: 1` header and, when the browser sends
  `Origin`, the same host (with `SameSite=Strict` this blocks cross-site requests).
- Login throttle: 5 wrong attempts per client per 15 minutes (per server instance, best effort).
- `ADMIN_LOGIN_SUCCESS`, `ADMIN_LOGIN_FAILED` and `ADMIN_LOGOUT` go to `audit_logs` with a pseudonymous
  client tag (a hash, never the address).
- Every `/api/admin` response is `Cache-Control: no-store` and `X-Robots-Tag: noindex`; the page has
  `robots: noindex` and is linked from nowhere.

## Sections

| Tab | Source |
|-----|--------|
| Overview | `get_admin_kpis()` + `storage_usage_bytes()` against the storage budget; refreshes every 30 s |
| Jobs | `admin_list_jobs()` keyset pages on `(created_at, job_id)`, filters by status (incl. cleanup problems) and type; detail panel from `get_job_tree()` + `file_objects` |
| Files | `admin_list_files()` (registered inputs and results; intermediate pieces are deleted with their job) |
| Processes | `/api/v1/ready` of every configured instance (N, O, Z): state, engine, time; only the host is shown |
| Audit log | `admin_list_audit()`, newest first |

The job detail shows the **content tree** (`lib/models/contentTree.js`): folders from ZIP paths (a nested
ZIP is both a file and a folder), PDF pages in page order (text runs and OCR pages), status badges with
skip reasons, plus work items and events.

## Actions (all audited)

| Action | Effect |
|--------|--------|
| Preview | Signed link (10 min) to a result file; the browser shows the first 200,000 characters as plain text |
| Download | Signed link with a `<job>-<file>` name (`ADMIN_FILE_DOWNLOAD`) |
| ZIP | Built in the admin's browser from signed links (up to 200 files / 200 MB): all files of one job, or the results of the selected jobs |
| Keep | `retention_mode = KEEP`: never deleted automatically |
| Extend | +1, 3, 7 or 30 days from now |
| Back to 48 h | 48 hours after upload, or now if that has passed |
| Delete files now | Running jobs are cancelled first; finished jobs: every object under `jobs/<id>/` is removed, then `mark_job_files_deleted()` records it and forgets the names |
| Delete job and files | Files first, then the job's rows (cascade); the audit entry stays |
| Retry cleanup | Resets a job whose cleanup stopped (`PARTIAL` / `ERROR`) |
| Bulk | One of the above for up to 100 selected jobs; each job reports its own outcome, plus one `ADMIN_BULK` entry |

Only files registered to the job in `file_objects` can be signed; a file id from another job is refused.

## Code

| Layer | Files |
|-------|-------|
| SQL | `supabase/migrations/20260928000000_mdify_admin.sql` |
| Server | `frontend/lib/server/adminAuth.js`, `adminService.js`, `adminRoute.js`, `frontend/app/api/admin/**` |
| Model | `frontend/lib/models/adminApi.js`, `contentTree.js`, `adminFormat.js` |
| View model | `frontend/viewmodels/useAdminViewModel.js` |
| Views | `frontend/app/mdify-controller/page.js`, `frontend/components/admin/*` |
