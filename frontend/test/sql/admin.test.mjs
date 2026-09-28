// Admin database functions (supabase/migrations/20260928000000_mdify_admin.sql)
// on real Postgres (PGlite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './pgliteDb.mjs';

async function newJob(db, { name = 'a.pdf', createdAt = null, status = 'COMPLETED', source = 'PDF' } = {}) {
  const { rows } = await db.query(
    `insert into public.jobs (original_filename, status, source_type, created_at, upload_completed_at)
     values ($1, $2, $3, coalesce($4::timestamptz, now()), coalesce($4::timestamptz, now())) returning job_id`,
    [name, status, source, createdAt]
  );
  const jobId = rows[0].job_id;
  await db.query(
    "insert into public.file_objects (job_id, bucket, object_path, kind, size_bytes, storage_status) values ($1, 'b', $2, 'INPUT', 100, 'ACTIVE'), ($1, 'b', $3, 'OUTPUT', 40, 'ACTIVE')",
    [jobId, `jobs/${jobId}/input/source.pdf`, `jobs/${jobId}/output/result.md`]
  );
  return jobId;
}

const list = (db, args = {}) =>
  db
    .query('select public.admin_list_jobs($1, $2, $3, $4, $5) as j', [
      args.limit ?? 50, args.before ?? null, args.beforeId ?? null, args.status ?? null, args.source ?? null,
    ])
    .then((r) => r.rows[0].j);

const job = (db, id) => db.query('select * from public.jobs where job_id = $1', [id]).then((r) => r.rows[0]);

test('job list pages newest first without gaps or repeats', async () => {
  const db = await freshDb();
  const same = '2026-09-20T10:00:00Z';
  const ids = [];
  for (let i = 0; i < 5; i += 1) ids.push(await newJob(db, { createdAt: i < 3 ? same : `2026-09-2${i}T10:00:00Z` }));

  const seen = [];
  let page = await list(db, { limit: 2 });
  while (page.length) {
    seen.push(...page.map((j) => j.job_id));
    const last = page[page.length - 1];
    page = await list(db, { limit: 2, before: last.created_at, beforeId: last.job_id });
  }
  assert.equal(seen.length, 5);
  assert.equal(new Set(seen).size, 5);
  const first = (await list(db, { limit: 1 }))[0];
  assert.equal(first.job_id, ids[4], 'newest first');
  assert.equal(Number(first.input_bytes), 100);
  assert.equal(Number(first.output_bytes), 40);
});

test('job list filters by status, source and cleanup errors', async () => {
  const db = await freshDb();
  await newJob(db, { status: 'FAILED', source: 'ARCHIVE' });
  const ok = await newJob(db, { status: 'COMPLETED', source: 'PDF' });
  await db.query("update public.jobs set cleanup_state = 'ERROR' where job_id = $1", [ok]);
  assert.equal((await list(db, { status: 'FAILED' })).length, 1);
  assert.equal((await list(db, { source: 'PDF' })).length, 1);
  assert.deepEqual((await list(db, { status: 'CLEANUP_ERROR' })).map((j) => j.job_id), [ok]);
});

test('retention: keep, extend, back to auto; deleted files stay deleted', async () => {
  const db = await freshDb();
  const id = await newJob(db, { createdAt: new Date(Date.now() - 3600_000).toISOString() });
  const setRetention = (mode, hours = null) =>
    db.query('select public.admin_set_retention($1, $2, $3) as r', [id, mode, hours]).then((r) => r.rows[0].r);

  assert.equal(await setRetention('KEEP'), 'ok');
  assert.equal((await job(db, id)).retention_mode, 'KEEP');

  assert.equal(await setRetention('EXTEND', 72), 'ok');
  const extended = await job(db, id);
  assert.equal(extended.retention_mode, 'EXTEND');
  const hours = (new Date(extended.retention_extended_until) - Date.now()) / 3600_000;
  assert.ok(hours > 71.9 && hours <= 72, String(hours));
  await assert.rejects(setRetention('EXTEND', 0));
  await assert.rejects(setRetention('FOREVER'));

  assert.equal(await setRetention('AUTO'), 'ok');
  const auto = await job(db, id);
  assert.equal(auto.retention_mode, 'AUTO');
  assert.equal(auto.retention_extended_until, null);
  const left = (new Date(auto.auto_delete_at) - Date.now()) / 3600_000;
  assert.ok(left > 46.9 && left < 47.1, `48 h after upload, not after now: ${left}`);

  await db.query('select public.mark_job_files_deleted($1)', [id]);
  assert.equal(await setRetention('KEEP'), 'files_deleted');
  assert.equal(
    await db.query('select public.admin_set_retention($1, $2, null) as r', [crypto.randomUUID(), 'KEEP']).then((r) => r.rows[0].r),
    'not_found'
  );
});

test('marking files deleted records it and forgets names', async () => {
  const db = await freshDb();
  const id = await newJob(db, { name: 'salary-review.pdf' });
  await db.query("update public.jobs set cleanup_state = 'PARTIAL', cleanup_last_error = 'x' where job_id = $1", [id]);
  await db.query('select public.mark_job_files_deleted($1)', [id]);
  const j = await job(db, id);
  assert.equal(j.cleanup_state, 'COMPLETE');
  assert.ok(j.files_deleted_at);
  assert.equal(j.cleanup_last_error, null);
  assert.equal(j.original_filename, null);
  const files = (await db.query('select storage_status, deleted_at from public.file_objects where job_id = $1', [id])).rows;
  assert.ok(files.every((f) => f.storage_status === 'DELETED' && f.deleted_at));
});

test('retry cleanup resets attempts only for stuck jobs', async () => {
  const db = await freshDb();
  const stuck = await newJob(db);
  const fine = await newJob(db);
  await db.query("update public.jobs set cleanup_state = 'ERROR', cleanup_attempt_count = 5 where job_id = $1", [stuck]);
  const retry = (id) => db.query('select public.admin_retry_cleanup($1) as r', [id]).then((r) => r.rows[0].r);
  assert.equal(await retry(stuck), 'ok');
  const j = await job(db, stuck);
  assert.equal(j.cleanup_state, 'IDLE');
  assert.equal(j.cleanup_attempt_count, 0);
  assert.equal(await retry(fine), null);
});

test('admin functions are for service_role only', async () => {
  const db = await freshDb();
  for (const fn of [
    'public.admin_list_jobs(integer,timestamptz,uuid,text,text)',
    'public.admin_list_files(integer,timestamptz,uuid,text)',
    'public.admin_list_audit(integer,timestamptz,uuid)',
    'public.admin_set_retention(uuid,text,integer)',
    'public.admin_retry_cleanup(uuid)',
    'public.mark_job_files_deleted(uuid)',
  ]) {
    for (const [role, expected] of [['anon', false], ['authenticated', false], ['service_role', true]]) {
      const { rows } = await db.query('select has_function_privilege($1, $2, $3) as ok', [role, fn, 'execute']);
      assert.equal(rows[0].ok, expected, `${role} on ${fn}`);
    }
  }
});
