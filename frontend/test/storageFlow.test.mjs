// Storage-backed flow: jobService + jobQueue against the real migrations
// (PGlite), with fake backends, plus the browser transport with a fake fetch.
// Real Supabase is exercised separately by tests/integration.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './sql/pgliteDb.mjs';
import { createPgliteSupabase } from './sql/pgliteSupabase.mjs';
import { supabaseConfig } from '../lib/server/supabaseRest.js';
import {
  advanceJob,
  createUpload,
  downloadUrl,
  inputPath,
  JobError,
  resetStorageUsageCacheForTests,
  startJob,
} from '../lib/server/jobService.js';
import { convertFile, resetTransportForTests, waitForJob } from '../lib/models/conversionService.js';

const ENV = {
  NORMAL_BACKEND_URLS: 'http://n1,http://n2',
  OCR_BACKEND_URLS: 'http://o1,http://o2',
  ARCHIVE_BACKEND_URLS: 'http://z1',
};

async function setup() {
  resetStorageUsageCacheForTests();
  const pg = await freshDb();
  return { pg, db: createPgliteSupabase(pg) };
}

/** Fake backend pools: `handlers[path](body, host)` → [status, json]. */
function backends(handlers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const body = JSON.parse(init.body);
    calls.push({ host: u.host, path: u.pathname, body, secret: init.headers['X-Internal-Secret'] });
    const handler = handlers[u.pathname];
    if (!handler) return new Response(JSON.stringify({ detail: 'no route' }), { status: 404 });
    const [status, json] = await handler(body, u.host, calls);
    return new Response(JSON.stringify(json), { status });
  };
  return { calls, fetchImpl };
}

const stats = (body, extra = {}) => ({
  filename: 'x.md', original_name: body.original_filename, char_count: 10, word_count: 2, tokens_est: 3,
  engine: 'MarkItDown', backend_role: 'normal', backend_instance: 'N1', duration_ms: 12, output_bytes: 10,
  preview: 'SECRET DOCUMENT TEXT', ...extra,
});

const start = (db, jobId, handlers) => {
  const pools = backends(handlers);
  return { pools, run: () => startJob(db, jobId, { secret: 's', env: ENV, fetchImpl: pools.fetchImpl }) };
};

test('supabaseConfig needs url and service key', () => {
  assert.equal(supabaseConfig({}), null);
  assert.deepEqual(supabaseConfig({ SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'k' }), {
    url: 'https://x.supabase.co',
    key: 'k',
    bucket: 'mdify-pro-files',
  });
});

test('createUpload makes an UPLOADING job with its source type and a signed URL', async () => {
  const { pg, db } = await setup();
  const res = await createUpload(db, { filename: '../Report Q3.pdf', size: 1000, profile: 'RAG-ready', env: ENV });
  assert.equal(res.object_path, inputPath(res.job_id, 'pdf'));
  assert.match(res.upload_url, /^https:\/\/storage\.test\/upload\/mdify-pro-files\/jobs\/.+\/input\/source\.pdf\?token=up$/);
  const job = (await pg.query('select * from public.jobs')).rows[0];
  assert.deepEqual(
    { status: job.status, workload: job.workload_type, source: job.source_type, profile: job.profile, name: job.original_filename },
    { status: 'UPLOADING', workload: 'NORMAL', source: 'PDF', profile: 'rag_ready', name: 'Report Q3.pdf' }
  );
});

test('createUpload rejects before writing: format, size, empty, missing pool, storage budget', async () => {
  const { pg, db } = await setup();
  const reject = (args, status, re) =>
    assert.rejects(createUpload(db, { profile: 'Standard', env: ENV, ...args }), (e) => e instanceof JobError && e.status === status && (!re || re.test(e.message)));
  await reject({ filename: 'a.exe', size: 10 }, 400);
  await reject({ filename: 'a.pdf', size: 16 * 1024 * 1024 }, 413);
  await reject({ filename: 'photo.jpg', size: 10 * 1024 * 1024 + 1 }, 413, /Images are limited to 10MB/);
  await reject({ filename: 'a.pdf', size: 0 }, 400);
  await assert.rejects(
    createUpload(db, { filename: 'p.zip', size: 10, env: { ...ENV, ARCHIVE_BACKEND_URLS: '' } }),
    (e) => e.status === 503
  );
  // 790 MB already stored + a 5 MB PDF (x3) passes 800 MB.
  await pg.query(`insert into storage.objects (bucket_id, name, metadata) values ('mdify-pro-files', 'big', '{"size": ${790 * 1024 * 1024}}')`);
  await reject({ filename: 'a.pdf', size: 5 * 1024 * 1024 }, 503, /lot of files/);
  assert.equal((await pg.query('select count(*)::int as n from public.jobs')).rows[0].n, 0);
});

test('document: start converts in the first pass, stores stats only, links the output', async () => {
  const { pg, db } = await setup();
  const { job_id } = await createUpload(db, { filename: 'notes.docx', size: 500, profile: 'Standard', env: ENV });
  const { pools, run } = start(db, job_id, { '/api/v1/internal/process': (b) => [200, stats(b)] });
  const { status, body } = await run();

  assert.equal(status, 200);
  assert.equal(body.status, 'COMPLETED');
  assert.equal(pools.calls.length, 1);
  assert.match(pools.calls[0].host, /^n[12]$/);
  assert.equal(pools.calls[0].secret, 's');
  assert.equal(pools.calls[0].body.input_path, `jobs/${job_id}/input/source.docx`);
  assert.equal(pools.calls[0].body.output_path, `jobs/${job_id}/output/result.md`);
  assert.equal(body.result.content, undefined);
  assert.match(body.result.download_url, /output\/result\.md\?token=dl-600/);

  const item = (await pg.query('select result from public.work_items')).rows[0];
  assert.doesNotMatch(JSON.stringify(item.result), /SECRET DOCUMENT TEXT/, 'no document text in the database');
  const files = (await pg.query("select kind, storage_status from public.file_objects order by kind")).rows;
  assert.deepEqual(files.map((f) => `${f.kind}:${f.storage_status}`), ['INPUT:ACTIVE', 'OUTPUT:ACTIVE']);
  const events = (await pg.query('select event_type from public.job_events order by created_at')).rows.map((e) => e.event_type);
  assert.deepEqual(events, ['QUEUED', 'COMPLETED']);
});

test('image goes to the OCR pool; a 4xx fails the job with its message', async () => {
  const { db } = await setup();
  const { job_id } = await createUpload(db, { filename: 'scan.png', size: 500, profile: 'Standard', env: ENV });
  const { pools, run } = start(db, job_id, {
    '/api/v1/internal/process': () => [413, { detail: 'WebP image is too large' }],
  });
  const { status, body } = await run();
  assert.match(pools.calls[0].host, /^o[12]$/);
  assert.equal(pools.calls.length, 1, '4xx is never retried');
  assert.equal(status, 413);
  assert.equal(body.status, 'FAILED');
  assert.equal(body.detail, 'WebP image is too large');
});

test('transient failure: retried on a later pass, then succeeds', async () => {
  const { db } = await setup();
  const { job_id } = await createUpload(db, { filename: 'a.txt', size: 5, profile: 'Standard', env: ENV });
  let n = 0;
  const handlers = { '/api/v1/internal/process': (b) => (++n <= 2 ? [503, { detail: 'waking' }] : [200, stats(b)]) };
  const { run, pools } = start(db, job_id, handlers);
  const first = await run();
  assert.equal(first.body.status, 'PROCESSING', 'both instances were busy; the item waits for another pass');
  assert.equal(pools.calls.length, 2, 'dispatcher tried the peer once');
  const later = await advanceJob(db, job_id, { secret: 's', env: ENV, fetchImpl: pools.fetchImpl });
  assert.equal(later.status, 'COMPLETED');
});

test('double start reports the current state and queues nothing twice', async () => {
  const { db } = await setup();
  const { job_id } = await createUpload(db, { filename: 'a.txt', size: 5, profile: 'Standard', env: ENV });
  const { run, pools } = start(db, job_id, { '/api/v1/internal/process': (b) => [200, stats(b)] });
  await run();
  const again = await run();
  assert.equal(again.body.status, 'COMPLETED');
  assert.equal(pools.calls.length, 1);
});

test('scanned PDF: native segment + OCR pages + ordered merge', async () => {
  const { pg, db } = await setup();
  const { job_id } = await createUpload(db, { filename: 'mixed.pdf', size: 900, profile: 'Clean', env: ENV });
  const node = () => crypto.randomUUID();
  const scans = [2, 4].map((page) => {
    const id = node();
    return { page, node_id: id, input_path: `jobs/${job_id}/materialized/${id}/source.png`, output_path: `jobs/${job_id}/nodes/${id}/result.md` };
  });
  const seg = { node_id: node(), page_from: 1, page_to: 1, output_path: `jobs/${job_id}/nodes/seg/result.md` };
  const handlers = {
    '/api/v1/internal/pdf/analyze': () => [200, { mode: 'split', pages: 4, segments: [seg, { ...seg, node_id: node(), page_from: 3, page_to: 3 }], scans, duration_ms: 40 }],
    '/api/v1/internal/process': (b) => [200, stats(b, { backend_role: 'ocr', backend_instance: 'O1' })],
    '/api/v1/internal/pdf/merge': (b) => [200, stats(b, { engine: 'MarkItDown + Tesseract', pages: 4 })],
  };
  const { run, pools } = start(db, job_id, handlers);
  const first = await run();
  assert.equal(first.body.status, 'PROCESSING');

  let status = first.body;
  for (let i = 0; i < 5 && status.status !== 'COMPLETED'; i += 1) {
    status = await advanceJob(db, job_id, { secret: 's', env: ENV, fetchImpl: pools.fetchImpl });
  }
  assert.equal(status.status, 'COMPLETED');
  assert.equal(status.result.engine, 'MarkItDown + Tesseract');

  const ocr = pools.calls.filter((c) => c.path === '/api/v1/internal/process');
  assert.equal(ocr.length, 2);
  assert.ok(ocr.every((c) => c.body.raw === true && /^o[12]$/.test(c.host)), 'page OCR is raw and image-only');
  const merge = pools.calls.find((c) => c.path === '/api/v1/internal/pdf/merge');
  assert.deepEqual(merge.body.parts.map((p) => `${p.kind}:${p.page_from}`), ['native:1', 'ocr:2', 'native:3', 'ocr:4']);
  assert.equal(merge.body.profile, 'Clean');
  assert.ok(pools.calls.indexOf(merge) > pools.calls.indexOf(ocr[1]), 'merge runs after every page');

  const tree = (await pg.query('select public.get_job_tree($1) as t', [job_id])).rows[0].t;
  assert.equal(tree.nodes.filter((n) => n.node_type === 'PDF_PAGE').length, 2);
  assert.equal(tree.job.items_total, 4);
});

test('ZIP: archive process, image OCR, project merge, several outputs', async () => {
  const { db } = await setup();
  const { job_id } = await createUpload(db, { filename: 'project.zip', size: 900, profile: 'Standard', env: ENV });
  const img = crypto.randomUUID();
  const out = (name) => `jobs/${job_id}/output/${name}`;
  const handlers = {
    '/api/v1/internal/archive/process': () => [200, {
      mode: 'split',
      partial_paths: [`jobs/${job_id}/nodes/archive-1/partial.json`],
      nodes: [
        { node_id: img, node_type: 'IMAGE', classification: 'OCR_IMAGE', logical_path: 'docs/diagram.png', sequence_index: 2 },
        { node_type: 'CODE_FILE', classification: 'DIRECT_TEXT', logical_path: 'src/app.ts', sequence_index: 1, status: 'DONE' },
        { node_type: 'BINARY', classification: 'SKIP', logical_path: 'bin/tool.exe', sequence_index: 3, status: 'SKIPPED', skip_reason: 'binary' },
      ],
      ocr: [{ node_id: img, input_path: `jobs/${job_id}/materialized/${img}/source.png`, output_path: `jobs/${job_id}/nodes/${img}/result.md`, logical_path: 'docs/diagram.png', filename: 'diagram.png' }],
    }],
    '/api/v1/internal/process': (b) => [200, stats(b, { backend_role: 'ocr' })],
    '/api/v1/internal/archive/merge': (b) => [200, stats(b, {
      backend_role: 'archive',
      backend_instance: 'Z1',
      outputs: [
        { path: out('combined.md'), kind: 'OUTPUT', name: 'project.md', bytes: 100 },
        { path: out('PROJECT_INDEX.md'), kind: 'OUTPUT', name: 'PROJECT_INDEX.md', bytes: 50 },
        { path: out('manifest.json'), kind: 'OUTPUT', name: 'manifest.json', bytes: 70 },
      ],
      primary_output: out('combined.md'),
    })],
  };
  const { run, pools } = start(db, job_id, handlers);
  let status = (await run()).body;
  for (let i = 0; i < 5 && status.status !== 'COMPLETED'; i += 1) {
    status = await advanceJob(db, job_id, { secret: 's', env: ENV, fetchImpl: pools.fetchImpl });
  }
  assert.equal(status.status, 'COMPLETED');
  assert.equal(pools.calls[0].host, 'z1');
  assert.deepEqual(status.result.outputs.map((o) => o.name), ['project.md', 'PROJECT_INDEX.md', 'manifest.json']);
  assert.match(status.result.download_url, /combined\.md/);
  assert.equal(status.items.skipped, 1);
  const merge = pools.calls.find((c) => c.path === '/api/v1/internal/archive/merge');
  assert.deepEqual(merge.body.ocr.map((o) => o.logical_path), ['docs/diagram.png']);
});

test('downloadUrl only for completed jobs whose files still exist', async () => {
  const { pg, db } = await setup();
  await assert.rejects(downloadUrl(db, crypto.randomUUID()), (e) => e.status === 404);
  const { rows } = await pg.query(
    "insert into public.jobs (status, source_type) values ('PROCESSING','DOCUMENT'), ('COMPLETED','DOCUMENT') returning job_id"
  );
  await assert.rejects(downloadUrl(db, rows[0].job_id), (e) => e.status === 409);
  await pg.query("update public.jobs set files_deleted_at = now() where job_id = $1", [rows[1].job_id]);
  await assert.rejects(downloadUrl(db, rows[1].job_id), (e) => e.status === 410);
});

// ── browser transport ──────────────────────────────────────────────────────

beforeEach(() => resetTransportForTests());

const JOB_ID = '123e4567-e89b-42d3-a456-426614174000';

function browserFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${url}`);
    const handler = routes.find(([m, u]) => (init.method || 'GET') === m && url.startsWith(u));
    if (!handler) throw new Error(`unexpected ${url}`);
    return handler[2](init);
  };
  return calls;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('browser: direct upload, start finishes, content fetched from the signed URL', async () => {
  const calls = browserFetch([
    ['POST', '/api/uploads/create', () => json({ job_id: JOB_ID, upload_url: 'https://s/upload?token=t' }, 201)],
    ['PUT', 'https://s/upload', () => json({})],
    ['POST', `/api/jobs/${JOB_ID}/start`, () => json({ status: 'COMPLETED', result: { filename: 'a.md', download_url: 'https://s/dl' } })],
    ['GET', 'https://s/dl', () => new Response('# A\n\nfull body')],
  ]);
  const result = await convertFile(new File(['hello'], 'a.txt'), 'Standard');
  assert.equal(result.content, '# A\n\nfull body');
  assert.equal(result.job_id, JOB_ID);
  assert.deepEqual(calls, ['POST /api/uploads/create', 'PUT https://s/upload?token=t', `POST /api/jobs/${JOB_ID}/start`, 'GET https://s/dl']);
});

test('browser: a multi-part job advances until done and reports rising progress', async () => {
  const answers = [
    json({ status: 'PROCESSING', progress: 30 }),
    json({ detail: 'busy' }, 502),
    json({ status: 'PROCESSING', progress: 70 }),
    json({ status: 'COMPLETED', progress: 100, result: { filename: 'm.md', download_url: 'https://s/dl' } }),
  ];
  browserFetch([
    ['POST', '/api/uploads/create', () => json({ job_id: JOB_ID, upload_url: 'https://s/upload' }, 201)],
    ['PUT', 'https://s/upload', () => json({})],
    ['POST', `/api/jobs/${JOB_ID}/start`, () => json({ status: 'PROCESSING', progress: 5 })],
    ['POST', `/api/jobs/${JOB_ID}/advance`, () => answers.shift()],
    ['GET', 'https://s/dl', () => new Response('# merged')],
  ]);
  const seen = [];
  // Speed up the wait between passes for the test.
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
  try {
    const result = await convertFile(new File(['%PDF'], 'm.pdf'), 'Standard', { onProgress: (p) => seen.push(p) });
    assert.equal(result.content, '# merged');
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.ok(seen.length >= 3);
  assert.ok(seen.every((p, i) => i === 0 || p >= seen[i - 1]), `progress never goes back: ${seen}`);
});

test('browser: waitForJob gives a clear error for a failed job', async () => {
  const status = await waitForJob(JOB_ID, { status: 'FAILED', detail: 'OCR took too long for this image' }, {});
  assert.equal(status.status, 'FAILED');
  await assert.rejects(
    (async () => {
      browserFetch([
        ['POST', '/api/uploads/create', () => json({ job_id: JOB_ID, upload_url: 'https://s/upload' }, 201)],
        ['PUT', 'https://s/upload', () => json({})],
        ['POST', `/api/jobs/${JOB_ID}/start`, () => json({ status: 'FAILED', detail: 'OCR took too long for this image' }, 200)],
      ]);
      await convertFile(new File(['x'], 'a.png'), 'Standard');
    })(),
    (e) => e.name === 'ConversionError' && /OCR took too long/.test(e.message)
  );
});

test('browser falls back to multipart once the server says 501, and remembers it', async () => {
  const calls = browserFetch([
    ['POST', '/api/uploads/create', () => json({}, 501)],
    ['POST', '/api/convert', () => json({ filename: 'a.md', content: '# A' })],
  ]);
  assert.equal((await convertFile(new File(['x'], 'a.txt'), 'Standard')).content, '# A');
  assert.equal((await convertFile(new File(['x'], 'b.txt'), 'Standard')).content, '# A');
  assert.deepEqual(calls, ['POST /api/uploads/create', 'POST /api/convert', 'POST /api/convert']);
});

test('browser surfaces a failed Storage upload', async () => {
  browserFetch([
    ['POST', '/api/uploads/create', () => json({ job_id: JOB_ID, upload_url: 'https://s/upload' }, 201)],
    ['PUT', 'https://s/upload', () => json({}, 403)],
  ]);
  await assert.rejects(convertFile(new File(['x'], 'a.txt'), 'Standard'), (e) => e.name === 'ConversionError' && e.status === 403);
});
