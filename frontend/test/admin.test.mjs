// /mdify-controller server side: the two-key session (lib/server/adminAuth.js)
// and the admin data and actions (lib/server/adminService.js) against the
// real migrations on PGlite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './sql/pgliteDb.mjs';
import { createPgliteSupabase } from './sql/pgliteSupabase.mjs';
import {
  adminKeys,
  checkKeys,
  clearLoginFailures,
  issueSession,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  loginRetryAfterMs,
  noteLoginFailure,
  readSession,
  resetLoginThrottleForTests,
  SESSION_TTL_S,
  sessionCookie,
} from '../lib/server/adminAuth.js';
import {
  AdminError,
  bulkAction,
  deleteJob,
  deleteNow,
  jobDetail,
  listAudit,
  listFiles,
  listJobs,
  overview,
  processes,
  setRetention,
  signFile,
} from '../lib/server/adminService.js';

const K1 = 'first-admin-key-0123456789abcdef';
const K2 = 'second-admin-key-0123456789abcdef';
const KEYS = [K1, K2];
const SESSION = { sid: '11111111-2222-3333-4444-555555555555' };

// ── Session ────────────────────────────────────────────────────────────────

test('admin is off unless both keys are set, long enough and different', () => {
  assert.equal(adminKeys({}), null);
  assert.equal(adminKeys({ ADMIN_KEY_1: K1 }), null);
  assert.equal(adminKeys({ ADMIN_KEY_1: 'short', ADMIN_KEY_2: K2 }), null);
  assert.equal(adminKeys({ ADMIN_KEY_1: K1, ADMIN_KEY_2: K1 }), null);
  assert.deepEqual(adminKeys({ ADMIN_KEY_1: K1, ADMIN_KEY_2: K2 }), KEYS);
});

test('both keys must match, in their own fields', () => {
  assert.equal(checkKeys(K1, K2, KEYS), true);
  assert.equal(checkKeys(K1, 'wrong', KEYS), false);
  assert.equal(checkKeys('wrong', K2, KEYS), false);
  assert.equal(checkKeys(K2, K1, KEYS), false);
  assert.equal(checkKeys(undefined, null, KEYS), false);
});

test('sessions are signed, expire and end when a key changes', () => {
  const now = Date.UTC(2026, 8, 27, 12);
  const s = issueSession(KEYS, now);
  assert.equal(readSession(s.token, KEYS, now + 1000).sid, s.sid);
  assert.equal(readSession(s.token, KEYS, now + SESSION_TTL_S * 1000 + 1), null, 'expired');
  assert.equal(readSession(s.token, [K1, `${K2}x`], now), null, 'key rotated');

  const [body, sig] = s.token.split('.');
  const forged = Buffer.from(JSON.stringify({ sid: 'x', iat: 0, exp: 9_999_999_999 })).toString('base64url');
  assert.equal(readSession(`${forged}.${sig}`, KEYS, now), null, 'payload changed');
  assert.equal(readSession(`${body}.${sig}x`, KEYS, now), null);
  assert.equal(readSession(`${body}.${sig}.x`, KEYS, now), null);
  assert.equal(readSession('', KEYS, now), null);
  assert.equal(readSession('garbage', KEYS, now), null);
});

test('session cookie is HttpOnly, SameSite=Strict and limited to the admin API', () => {
  const cookie = sessionCookie('abc', { secure: true });
  for (const part of ['mdify_admin=abc', 'Path=/api/admin', 'HttpOnly', 'SameSite=Strict', `Max-Age=${SESSION_TTL_S}`, 'Secure']) {
    assert.ok(cookie.split('; ').includes(part), part);
  }
  assert.ok(!sessionCookie('abc', { secure: false }).includes('Secure'));
});

test('repeated wrong logins from one client wait for the window', () => {
  resetLoginThrottleForTests();
  const now = 1_000_000;
  for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i += 1) noteLoginFailure('1.2.3.4', now + i);
  assert.equal(loginRetryAfterMs('1.2.3.4', now + 10), 0);
  noteLoginFailure('1.2.3.4', now + 10);
  assert.ok(loginRetryAfterMs('1.2.3.4', now + 20) > 0);
  assert.equal(loginRetryAfterMs('5.6.7.8', now + 20), 0, 'other clients unaffected');
  assert.equal(loginRetryAfterMs('1.2.3.4', now + LOGIN_WINDOW_MS + 20), 0, 'window passed');
  noteLoginFailure('9.9.9.9', now);
  clearLoginFailures('9.9.9.9');
  assert.equal(loginRetryAfterMs('9.9.9.9', now), 0);
});

// ── Data and actions ───────────────────────────────────────────────────────

async function setup() {
  const pg = await freshDb();
  const db = createPgliteSupabase(pg);
  return { pg, db };
}

/** A finished job with its input, output and intermediate objects in Storage. */
async function seedJob(pg, db, { status = 'COMPLETED', name = 'quarterly-report.pdf', source = 'PDF' } = {}) {
  const { rows } = await pg.query(
    `insert into public.jobs (original_filename, status, source_type, upload_completed_at, auto_delete_at)
     values ($1, $2, $3, now(), now() + interval '48 hours') returning job_id`,
    [name, status, source]
  );
  const id = rows[0].job_id;
  const input = `jobs/${id}/input/source.pdf`;
  const output = `jobs/${id}/output/result.md`;
  const files = await pg.query(
    `insert into public.file_objects (job_id, bucket, object_path, kind, size_bytes, storage_status)
     values ($1, 'mdify-pro-files', $2, 'INPUT', 1000, 'ACTIVE'), ($1, 'mdify-pro-files', $3, 'OUTPUT', 200, 'ACTIVE')
     returning file_id, kind`,
    [id, input, output]
  );
  await pg.query(
    "insert into public.content_nodes (job_id, node_type, logical_path, status) values ($1, 'ROOT_FILE', $2, 'DONE')",
    [id, name]
  );
  for (const p of [input, output, `jobs/${id}/nodes/page-2/result.md`, `jobs/${id}/materialized/page-2/source.png`]) {
    db.objects.set(p, 'x');
  }
  const fileId = Object.fromEntries(files.rows.map((f) => [f.kind, f.file_id]));
  return { id, input, output, fileId };
}

const auditActions = (pg) => pg.query('select action, job_id from public.audit_logs order by created_at').then((r) => r.rows);

test('overview and job list', async () => {
  const { pg, db } = await setup();
  const { id } = await seedJob(pg, db);
  await pg.query("insert into storage.objects (bucket_id, name, metadata) values ('mdify-pro-files', 'x', '{\"size\": 1200}')");

  const o = await overview(db, { env: { STORAGE_BUDGET_BYTES: '5000' } });
  assert.equal(o.storage.used_bytes, 1200);
  assert.equal(o.storage.budget_bytes, 5000);
  assert.ok(o.kpis.jobs && o.kpis.storage);

  const page = await listJobs(db, { limit: 10 });
  assert.equal(page.jobs.length, 1);
  assert.equal(page.jobs[0].job_id, id);
  assert.equal(page.next, null);
  await assert.rejects(listJobs(db, { status: 'DROP TABLE' }), AdminError);
  await assert.rejects(listJobs(db, { beforeId: 'nope' }), AdminError);
});

test('job detail has the tree and the registered files', async () => {
  const { pg, db } = await setup();
  const { id } = await seedJob(pg, db);
  const detail = await jobDetail(db, id);
  assert.equal(detail.job.job_id, id);
  assert.equal(detail.nodes.length, 1);
  assert.deepEqual(detail.files.map((f) => f.kind).sort(), ['INPUT', 'OUTPUT']);
  await assert.rejects(jobDetail(db, crypto.randomUUID()), (err) => err.status === 404);
  await assert.rejects(jobDetail(db, '../etc'), (err) => err.status === 404);
});

test('signed links only for files registered to that job, and audited', async () => {
  const { pg, db } = await setup();
  const a = await seedJob(pg, db);
  const b = await seedJob(pg, db);
  const link = await signFile(db, SESSION, a.id, a.fileId.OUTPUT);
  assert.ok(link.url.includes(`jobs/${a.id}/output/result.md`));
  assert.equal(link.name, `${a.id.slice(0, 8)}-result.md`);
  await assert.rejects(signFile(db, SESSION, a.id, b.fileId.OUTPUT), (err) => err.status === 404, 'file of another job');
  const preview = await signFile(db, SESSION, a.id, a.fileId.OUTPUT, { purpose: 'preview' });
  assert.ok(!preview.url.includes('download='));
  assert.deepEqual((await auditActions(pg)).map((r) => r.action), ['ADMIN_FILE_DOWNLOAD']);
});

test('retention actions are validated and audited', async () => {
  const { pg, db } = await setup();
  const { id } = await seedJob(pg, db);
  assert.equal((await setRetention(db, SESSION, id, 'KEEP')).result, 'ok');
  await setRetention(db, SESSION, id, 'EXTEND', 24);
  await assert.rejects(setRetention(db, SESSION, id, 'EXTEND', 0), AdminError);
  await assert.rejects(setRetention(db, SESSION, id, 'FOREVER'), AdminError);
  const job = (await pg.query('select retention_mode from public.jobs where job_id = $1', [id])).rows[0];
  assert.equal(job.retention_mode, 'EXTEND');
  const log = await auditActions(pg);
  assert.deepEqual(log.map((r) => r.action), ['ADMIN_RETENTION_KEEP', 'ADMIN_RETENTION_EXTEND']);
  assert.ok(log.every((r) => r.job_id === id));
});

test('delete now removes every object of the job, including intermediate ones', async () => {
  const { pg, db } = await setup();
  const target = await seedJob(pg, db);
  const other = await seedJob(pg, db);
  const result = await deleteNow(db, SESSION, target.id);
  assert.equal(result.result, 'deleted');
  assert.equal(result.removed, 4);
  assert.ok(![...db.objects.keys()].some((p) => p.startsWith(`jobs/${target.id}/`)));
  assert.equal([...db.objects.keys()].filter((p) => p.startsWith(`jobs/${other.id}/`)).length, 4, 'other job untouched');

  const job = (await pg.query('select * from public.jobs where job_id = $1', [target.id])).rows[0];
  assert.ok(job.files_deleted_at);
  assert.equal(job.cleanup_state, 'COMPLETE');
  assert.equal(job.original_filename, null);
  const node = (await pg.query('select logical_path from public.content_nodes where job_id = $1', [target.id])).rows[0];
  assert.equal(node.logical_path, null);
  await assert.rejects(signFile(db, SESSION, target.id, target.fileId.OUTPUT), (err) => err.status === 410);
});

test('delete now cancels a running job first and keeps its files', async () => {
  const { pg, db } = await setup();
  const { id } = await seedJob(pg, db, { status: 'PROCESSING' });
  await pg.query("insert into public.work_items(job_id,task_type,pool,status,lease_until) values($1,'CONVERT','normal','RUNNING',now() + interval '5 minutes')", [id]);
  const result = await deleteNow(db, SESSION, id);
  assert.equal(result.result, 'cancel_requested');
  assert.equal([...db.objects.keys()].filter((p) => p.startsWith(`jobs/${id}/`)).length, 4);
  await assert.rejects(deleteJob(db, SESSION, id), (err) => err.status === 409);
});

test('delete job removes files, then rows; the audit entry stays', async () => {
  const { pg, db } = await setup();
  const { id } = await seedJob(pg, db);
  await deleteJob(db, SESSION, id);
  assert.equal((await pg.query('select count(*)::int as n from public.jobs where job_id = $1', [id])).rows[0].n, 0);
  assert.equal((await pg.query('select count(*)::int as n from public.file_objects where job_id = $1', [id])).rows[0].n, 0);
  assert.equal(db.objects.size, 0);
  assert.deepEqual((await auditActions(pg)).map((r) => [r.action, r.job_id]), [['ADMIN_DELETE_JOB', id]]);
});

test('bulk actions report each job and write one summary entry', async () => {
  const { pg, db } = await setup();
  const a = await seedJob(pg, db);
  const b = await seedJob(pg, db);
  const { results } = await bulkAction(db, SESSION, [a.id, b.id, 'not-a-job'], 'KEEP');
  assert.deepEqual(results.map((r) => r.ok), [true, true, false]);
  assert.equal(results[2].error, 'Unknown job');
  const actions = (await auditActions(pg)).map((r) => r.action);
  assert.deepEqual(actions, ['ADMIN_RETENTION_KEEP', 'ADMIN_RETENTION_KEEP', 'ADMIN_BULK']);
  await assert.rejects(bulkAction(db, SESSION, [], 'KEEP'), AdminError);
  await assert.rejects(bulkAction(db, SESSION, [a.id], 'DROP'), AdminError);
  await assert.rejects(bulkAction(db, SESSION, Array.from({ length: 101 }, () => a.id), 'KEEP'), AdminError);
});

test('file and audit lists page newest first', async () => {
  const { pg, db } = await setup();
  await seedJob(pg, db);
  await seedJob(pg, db);
  const first = await listFiles(db, { limit: 3 });
  assert.equal(first.files.length, 3);
  assert.ok(first.next);
  const second = await listFiles(db, { limit: 3, before: first.next.before, beforeId: first.next.before_id });
  const ids = [...first.files, ...second.files].map((f) => f.file_id);
  assert.equal(ids.length, 4, 'files sharing a timestamp are neither lost nor repeated');
  assert.equal(new Set(ids).size, 4);
  await setRetention(db, SESSION, first.files[0].job_id, 'KEEP');
  const log = await listAudit(db);
  assert.equal(log.entries[0].action, 'ADMIN_RETENTION_KEEP');
});

test('processes report each instance without exposing full URLs', async () => {
  const pools = { normal: ['https://n1.example/secret-path'], ocr: ['https://o1.example', 'https://o2.example'], archive: [] };
  const fetchImpl = async (url) => {
    if (url.startsWith('https://n1.example')) return Response.json({ ready: true, instance: 'N1', engine: 'MarkItDown', detail: 'ok' });
    if (url.startsWith('https://o1.example')) return Response.json({ ready: false, instance: 'O1', detail: 'tesseract missing' }, { status: 503 });
    throw new TypeError('fetch failed');
  };
  const { instances } = await processes({ pools, fetchImpl });
  assert.deepEqual(instances.map((i) => [i.label, i.state]), [['N1', 'ready'], ['O1', 'not_ready'], ['O2', 'unreachable']]);
  assert.equal(instances[0].host, 'n1.example');
  assert.ok(!JSON.stringify(instances).includes('secret-path'));
});
