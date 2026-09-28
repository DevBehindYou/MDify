// The shipped migrations on real Postgres (PGlite): the job queue lifecycle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './pgliteDb.mjs';

async function newJob(db, { name = 'a.pdf', size = 1000 } = {}) {
  const { rows } = await db.query(
    "insert into public.jobs (original_filename, status) values ($1, 'UPLOADING') returning job_id",
    [name]
  );
  const jobId = rows[0].job_id;
  await db.query(
    "insert into public.file_objects (job_id, bucket, object_path, kind, size_bytes) values ($1, 'b', $2, 'INPUT', $3)",
    [jobId, `jobs/${jobId}/input/source.pdf`, size]
  );
  await db.query('select public.confirm_upload($1)', [jobId]);
  return jobId;
}

const enqueue = (db, jobId, { task = 'CONVERT', pool = 'normal', final = true, source = 'DOCUMENT' } = {}) =>
  db.query('select * from public.enqueue_root($1, $2, $3, $4, $5, $6, $7, $8)', [
    jobId, task, pool, `jobs/${jobId}/input/source.pdf`, `jobs/${jobId}/output/result.md`, source, 'ROOT_FILE', final,
  ]).then((r) => r.rows[0]);

const claim = (db, pool, capacity, limit = 4, jobId = null, lease = '6 minutes') =>
  db.query('select * from public.claim_work_items($1, $2, $3, $4, $5::interval)', [pool, capacity, limit, jobId, lease])
    .then((r) => r.rows);

const complete = (db, item, outcome, extra = {}) =>
  db.query('select public.complete_work_item($1, $2, $3, $4, $5, $6, $7, $8, $9) as s', [
    item.work_item_id, extra.attempt ?? item.attempt_count, outcome, extra.backend ?? 'N1', extra.ms ?? 10,
    extra.result ?? null, extra.code ?? null, extra.message ?? null, extra.final ?? null,
  ]).then((r) => r.rows[0].s);

const job = (db, jobId) => db.query('select * from public.jobs where job_id = $1', [jobId]).then((r) => r.rows[0]);

test('single document: enqueue, claim, complete', async () => {
  const db = await freshDb();
  const jobId = await newJob(db);
  const root = await enqueue(db, jobId);
  assert.equal(root.status, 'QUEUED');
  assert.equal((await enqueue(db, jobId)).work_item_id, null, 'a second start queues nothing (null row)');

  const [item] = await claim(db, 'normal', 4);
  assert.equal(item.attempt_count, 1);
  assert.equal((await job(db, jobId)).status, 'PROCESSING');
  assert.equal(await complete(db, item, 'SUCCEEDED', { backend: 'N2', ms: 250 }), 'COMPLETED');

  const j = await job(db, jobId);
  assert.equal(j.status, 'COMPLETED');
  assert.equal(j.backend_instance, 'n2');
  assert.equal(j.items_done, 1);
  assert.equal(j.progress, 100);
  assert.equal(Number(j.processing_ms), 250);
  const node = (await db.query('select status from public.content_nodes where job_id = $1', [jobId])).rows[0];
  assert.equal(node.status, 'DONE');
});

test('claims respect pool capacity and alternate between jobs', async () => {
  const db = await freshDb();
  const a = await newJob(db);
  const b = await newJob(db);
  const c = await newJob(db);
  for (const id of [a, b, c]) await enqueue(db, id, { task: 'OCR_IMAGE', pool: 'ocr', source: 'IMAGE' });

  const first = await claim(db, 'ocr', 2);
  assert.equal(first.length, 2);
  assert.equal((await claim(db, 'ocr', 2)).length, 0, 'pool full');
  assert.equal((await claim(db, 'normal', 4)).length, 0, 'other pool has nothing');
  await complete(db, first[0], 'SUCCEEDED', { backend: 'O1' });
  assert.equal((await claim(db, 'ocr', 2)).length, 1, 'one slot freed');

  // Fairness: a job with many items does not starve a job with one.
  const big = await newJob(db);
  const small = await newJob(db);
  const root = await enqueue(db, big, { task: 'PDF_ANALYZE', pool: 'normal', final: false, source: 'PDF' });
  await db.query('select public.add_work_items($1, $2, $3)', [
    big,
    JSON.stringify([]),
    JSON.stringify([1, 2, 3, 4].map((p) => ({ task_type: 'PDF_PAGE_OCR', pool: 'ocr', sequence_index: p }))),
  ]);
  await enqueue(db, small, { task: 'OCR_IMAGE', pool: 'ocr', source: 'IMAGE' });
  // Drain the earlier jobs first.
  for (const it of await db.query("select * from public.work_items where status='RUNNING'").then((r) => r.rows)) {
    await complete(db, it, 'SUCCEEDED');
  }
  const picked = await claim(db, 'ocr', 2, 2);
  assert.deepEqual(new Set(picked.map((i) => i.job_id)), new Set([big, small]));
  assert.ok(root);
});

test('hybrid PDF: analysis spawns pages, merge waits, then completes', async () => {
  const db = await freshDb();
  const jobId = await newJob(db);
  await enqueue(db, jobId, { task: 'PDF_ANALYZE', pool: 'normal', final: true, source: 'PDF' });
  const [analyze] = await claim(db, 'normal', 4);

  const pages = [3, 5].map((p) => ({ node_id: crypto.randomUUID(), p }));
  const added = await db.query('select public.add_work_items($1, $2, $3) as n', [
    jobId,
    JSON.stringify([
      ...pages.map(({ node_id, p }) => ({ node_id, node_type: 'PDF_PAGE', classification: 'PDF_OCR', page_from: p, page_to: p, sequence_index: p })),
      { node_type: 'PDF_SEGMENT', classification: 'PDF_NATIVE', page_from: 1, page_to: 2, sequence_index: 1, status: 'DONE' },
    ]),
    JSON.stringify([
      ...pages.map(({ node_id, p }) => ({ node_id, task_type: 'PDF_PAGE_OCR', pool: 'ocr', sequence_index: p })),
      { task_type: 'PDF_MERGE', pool: 'normal', status: 'BLOCKED', is_final: true, sequence_index: 999 },
    ]),
  ]);
  assert.equal(added.rows[0].n, 3);
  assert.equal(await complete(db, analyze, 'SUCCEEDED', { final: false }), 'PROCESSING');
  assert.equal((await claim(db, 'normal', 4)).length, 0, 'merge is blocked');

  const ocr = await claim(db, 'ocr', 2);
  assert.equal(ocr.length, 2);
  await complete(db, ocr[0], 'SUCCEEDED', { backend: 'O1' });
  assert.equal((await claim(db, 'normal', 4)).length, 0, 'still one page running');
  await complete(db, ocr[1], 'SUCCEEDED', { backend: 'O2' });

  const [merge] = await claim(db, 'normal', 4);
  assert.equal(merge.task_type, 'PDF_MERGE');
  assert.equal(await complete(db, merge, 'SUCCEEDED', { backend: 'N1' }), 'COMPLETED');
  const j = await job(db, jobId);
  assert.equal(j.items_total, 4);
  assert.equal(j.items_done, 4);
  assert.equal(j.source_type, 'PDF');

  const tree = (await db.query('select public.get_job_tree($1) as t', [jobId])).rows[0].t;
  assert.equal(tree.nodes.length, 4);
  assert.equal(tree.items.length, 4);
  assert.ok(tree.nodes.every((n) => ['DONE'].includes(n.status)), JSON.stringify(tree.nodes.map((n) => n.status)));
});

test('transient failures retry once, then fail the job; late answers are ignored', async () => {
  const db = await freshDb();
  const jobId = await newJob(db);
  await enqueue(db, jobId);
  const [first] = await claim(db, 'normal', 4);
  assert.equal(await complete(db, first, 'RETRY', { code: 'HTTP_503' }), 'PROCESSING');
  const [second] = await claim(db, 'normal', 4);
  assert.equal(second.attempt_count, 2);
  assert.equal(await complete(db, first, 'SUCCEEDED'), 'stale', 'answer from attempt 1 arrives late');
  assert.equal(await complete(db, second, 'RETRY', { code: 'HTTP_503', message: 'busy' }), 'FAILED');
  const j = await job(db, jobId);
  assert.equal(j.error_code, 'HTTP_503');
  assert.equal(j.items_failed, 1);
});

test('expired leases are requeued, then failed after max attempts', async () => {
  const db = await freshDb();
  const jobId = await newJob(db);
  await enqueue(db, jobId);
  await claim(db, 'normal', 4, 4, null, '0 seconds');
  assert.equal((await db.query('select public.requeue_expired_work_items() as n')).rows[0].n, 1);
  assert.equal((await db.query('select status from public.work_items where job_id=$1', [jobId])).rows[0].status, 'QUEUED');
  await claim(db, 'normal', 4, 4, null, '0 seconds');
  await db.query('select public.requeue_expired_work_items()');
  const j = await job(db, jobId);
  assert.equal(j.status, 'FAILED');
  assert.equal(j.error_code, 'LEASE_EXPIRED');
});

test('cancel request stops queued work', async () => {
  const db = await freshDb();
  const jobId = await newJob(db);
  await enqueue(db, jobId);
  await db.query("update public.jobs set status = 'CANCEL_REQUESTED' where job_id = $1", [jobId]);
  assert.equal((await claim(db, 'normal', 4)).length, 0);
  assert.equal((await db.query('select public.settle_job($1) as s', [jobId])).rows[0].s, 'CANCELLED');
  assert.equal((await db.query('select status from public.work_items where job_id=$1', [jobId])).rows[0].status, 'CANCELLED');
});

test('stale sweep fails idle jobs and cancels their queued items', async () => {
  const db = await freshDb();
  const jobId = await newJob(db);
  await enqueue(db, jobId);
  await db.query('alter table public.jobs disable trigger trg_jobs_updated_at');
  await db.query("update public.jobs set updated_at = now() - interval '1 hour' where job_id = $1", [jobId]);
  const swept = (await db.query('select * from public.sweep_stale_jobs()')).rows;
  assert.deepEqual(swept.map((r) => r.new_status), ['FAILED']);
  assert.equal((await db.query('select status from public.work_items where job_id=$1', [jobId])).rows[0].status, 'CANCELLED');
});

test('storage usage sums object sizes per bucket', async () => {
  const db = await freshDb();
  await db.query("insert into storage.buckets (id, name) values ('other', 'other') on conflict do nothing");
  await db.query(`insert into storage.objects (bucket_id, name, metadata) values
    ('mdify-pro-files', 'a', '{"size": 1000}'), ('mdify-pro-files', 'b', '{"size": 2500}'), ('other', 'c', '{"size": 99}')`);
  assert.equal(Number((await db.query("select public.storage_usage_bytes('mdify-pro-files') as n")).rows[0].n), 3500);
  const bucket = (await db.query("select file_size_limit from storage.buckets where id = 'mdify-pro-files'")).rows[0];
  assert.equal(Number(bucket.file_size_limit), 15 * 1024 * 1024);
});

test('after deletion, names are forgotten and statistics kept', async () => {
  const db = await freshDb();
  const jobId = await newJob(db, { name: 'client-contracts.zip', size: 5000 });
  await enqueue(db, jobId, { task: 'ARCHIVE_PROCESS', pool: 'archive', source: 'ARCHIVE' });
  const [item] = await claim(db, 'archive', 1);
  await db.query('select public.add_work_items($1, $2, $3)', [
    jobId,
    JSON.stringify([{ node_type: 'CODE_FILE', logical_path: 'acme/secret-plan.py', size_bytes: 42, status: 'DONE' }]),
    JSON.stringify([]),
  ]);
  const result = { filename: 'client-contracts.md', original_name: 'client-contracts.zip', char_count: 99, engine: 'E',
    outputs: [{ path: `jobs/${jobId}/output/combined.md`, name: 'client-contracts.md' }] };
  await complete(db, item, 'SUCCEEDED', { backend: 'Z1', result: JSON.stringify(result) });
  await db.query(`update public.work_items set payload = '{"original_filename": "client-contracts.zip"}' where job_id = $1`, [jobId]);

  await db.query('select public.forget_job_details($1)', [jobId]);

  assert.equal((await job(db, jobId)).original_filename, null);
  const nodes = (await db.query('select logical_path, size_bytes, node_type from public.content_nodes where job_id = $1', [jobId])).rows;
  assert.ok(nodes.length >= 2 && nodes.every((n) => n.logical_path === null), JSON.stringify(nodes));
  assert.ok(nodes.some((n) => n.node_type === 'CODE_FILE' && Number(n.size_bytes) === 42), 'statistics stay');
  const w = (await db.query('select payload, result from public.work_items where job_id = $1', [jobId])).rows[0];
  assert.deepEqual(w.payload, {});
  assert.deepEqual(w.result, { char_count: 99, engine: 'E' });
  assert.ok(!JSON.stringify(await db.query('select public.get_job_tree($1) as t', [jobId]).then((r) => r.rows[0].t)).includes('client-contracts'));
});

test('only service_role can use the queue', async () => {
  const db = await freshDb();
  const fns = [
    'public.enqueue_root(uuid,text,text,text,text,text,text,boolean,jsonb)',
    'public.add_work_items(uuid,jsonb,jsonb)',
    'public.claim_work_items(text,integer,integer,uuid,interval)',
    'public.complete_work_item(uuid,integer,text,text,bigint,jsonb,text,text,boolean)',
    'public.requeue_expired_work_items()',
    'public.storage_usage_bytes(text)',
    'public.get_job_tree(uuid)',
    'public.forget_job_details(uuid)',
    'public.get_admin_kpis()',
  ];
  for (const fn of fns) {
    for (const [role, expected] of [['anon', false], ['authenticated', false], ['service_role', true]]) {
      const { rows } = await db.query('select has_function_privilege($1, $2, $3) as ok', [role, fn, 'execute']);
      assert.equal(rows[0].ok, expected, `${role} on ${fn}`);
    }
  }
  for (const table of ['public.work_items', 'public.content_nodes']) {
    const { rows } = await db.query('select has_table_privilege($1, $2, $3) as ok', ['anon', table, 'select']);
    assert.equal(rows[0].ok, false, table);
  }
  const kpis = (await db.query('select public.get_admin_kpis() as k')).rows[0].k;
  assert.ok('queue' in kpis && 'nodes' in kpis);
});
