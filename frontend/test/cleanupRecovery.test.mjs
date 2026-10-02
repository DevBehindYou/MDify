import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './sql/pgliteDb.mjs';
import { createPgliteSupabase } from './sql/pgliteSupabase.mjs';
import { createCleanupHandler, deleteClaimedFiles } from '../../supabase/functions/cleanup-expired-jobs/cleanup.mjs';
import { deleteNow, setRetention } from '../lib/server/adminService.js';

async function setup(t, status = 'COMPLETED') {
  const pg = await freshDb(); t.after(() => pg.close());
  const db = createPgliteSupabase(pg);
  const job = await db.insert('jobs', { status, original_filename: 'private-report.txt', auto_delete_at: new Date(Date.now() - 60000).toISOString() });
  const path = `jobs/${job.job_id}/input/source.txt`;
  await db.insert('file_objects', { job_id: job.job_id, bucket: db.bucket, object_path: path, kind: 'INPUT', size_bytes: 12, original_filename: 'private-report.txt', storage_status: 'ACTIVE', metadata: { name: 'private-report.txt' } });
  db.objects.set(path, 'synthetic');
  const row = async () => (await db.select('jobs', { job_id: `eq.${job.job_id}` }))[0];
  const claim = () => db.rpc('claim_job_cleanup', { p_job_id: job.job_id });
  const args = j => ({ p_job_id: j.job_id, p_token: j.cleanup_token });
  return { pg, db, job, row, claim, args };
}

test('expired DELETING is reclaimed and the old owner cannot finish or fail it', async t => {
  const { db, row, claim, args, job } = await setup(t);
  const first = await claim();
  assert.equal(await db.rpc('begin_job_cleanup', args(first)), true);
  assert.equal((await db.rpc('claim_cleanup_batch')).length, 0);
  await db.update('jobs', { job_id: `eq.${job.job_id}` }, { cleanup_lease_until: new Date(0).toISOString() });
  const [next] = await db.rpc('claim_cleanup_batch');
  assert.notEqual(next.cleanup_token, first.cleanup_token);
  assert.equal(await db.rpc('finish_job_cleanup', args(first)), false);
  assert.equal(await db.rpc('fail_job_cleanup', args(first)), false);
  assert.equal((await row()).cleanup_token, next.cleanup_token);
  assert.equal(await db.rpc('begin_job_cleanup', args(next)), true);
  assert.equal(await db.rpc('finish_job_cleanup', args(next)), true);
});

test('KEEP invalidates a pending claim and prevents Storage deletion', async t => {
  const { db, row, claim, args, job } = await setup(t);
  const old = await claim();
  await setRetention(db, { sid: 'test' }, job.job_id, 'KEEP');
  assert.equal(await db.rpc('begin_job_cleanup', args(old)), false);
  assert.equal(await db.rpc('finish_job_cleanup', args(old)), false);
  assert.equal((await row()).retention_mode, 'KEEP');
  assert.equal(db.objects.size, 1);
});

test('retention cannot promise to keep files after deletion starts or fails partway', async t => {
  const { db, claim, args, job } = await setup(t);
  const claimed = await claim();
  await db.rpc('begin_job_cleanup', args(claimed));
  await assert.rejects(setRetention(db, {}, job.job_id, 'KEEP'), e => e.status === 409);
  await db.rpc('fail_job_cleanup', args(claimed));
  await assert.rejects(setRetention(db, {}, job.job_id, 'EXTEND', 1), e => e.status === 409);
});

test('attempt cap leaves active owners alone and retires expired ones', async t => {
  const { db, row, claim, args, job } = await setup(t);
  const claimed = await claim(); await db.rpc('begin_job_cleanup', args(claimed));
  await db.update('jobs', { job_id: `eq.${job.job_id}` }, { cleanup_attempt_count: 5 });
  assert.equal((await db.rpc('claim_cleanup_batch')).length, 0);
  assert.equal((await row()).cleanup_state, 'DELETING');
  await db.update('jobs', { job_id: `eq.${job.job_id}` }, { cleanup_lease_until: new Date(0).toISOString() });
  assert.equal((await db.rpc('claim_cleanup_batch')).length, 0);
  assert.equal((await row()).cleanup_state, 'ERROR');
});

test('delete-now settles an idle cancellation immediately, including KEEP jobs', async t => {
  const { db, row, job } = await setup(t, 'UPLOADING');
  await db.update('jobs', { job_id: `eq.${job.job_id}` }, { retention_mode: 'KEEP' });
  assert.equal((await deleteNow(db, { sid: 'test' }, job.job_id)).result, 'deleted');
  assert.equal((await row()).status, 'CANCELLED');
  assert.equal((await row()).files_deleted_at !== null, true);
  assert.equal(db.objects.size, 0);
});

test('a cancellation stranded without work is settled by the cron helper', async t => {
  const { db, row } = await setup(t, 'CANCEL_REQUESTED');
  assert.equal(await db.rpc('settle_cancelled_jobs'), 1);
  assert.equal((await row()).status, 'CANCELLED');
});

test('cleanup forgets file names and free-form metadata while keeping statistics', async t => {
  const { pg, db, job, row } = await setup(t);
  await pg.query("update public.jobs set warnings = array['private-report.txt'] where job_id = $1", [job.job_id]);
  await db.update('jobs', { job_id: `eq.${job.job_id}` }, { metadata:{ name:'private-report.txt' }, error_message:'private-report.txt' });
  await db.insert('work_items', { job_id:job.job_id, task_type:'CONVERT', pool:'normal', status:'SUCCEEDED', payload:{ original_filename:'private-report.txt' }, result:{ filename:'private-report.txt', warning:'private-report.txt', custom:{ name:'private-report.txt' }, char_count:99, engine:'E' } });
  await db.insert('job_events', { job_id:job.job_id, event_type:'FIXTURE', message:'private-report.txt', details:{ name:'private-report.txt' } });
  await deleteNow(db, { sid: 'test' }, job.job_id);
  const [file] = await db.select('file_objects', { job_id: `eq.${job.job_id}` });
  assert.equal(file.original_filename, null); assert.deepEqual(file.metadata, {});
  assert.equal(file.size_bytes, 12); assert.equal(file.storage_status, 'DELETED');
  assert.equal((await row()).original_filename, null);
  const [work] = await db.select('work_items', { job_id: `eq.${job.job_id}` });
  assert.deepEqual(work.result,{ char_count:99, engine:'E' });
  assert.ok(!JSON.stringify(await row()).includes('private-report.txt'));
  assert.ok(!JSON.stringify(await db.select('job_events', { job_id: `eq.${job.job_id}` })).includes('private-report.txt'));
});

test('new cleanup functions are invoker-only and audit history is append-only', async t => {
  const { pg } = await setup(t);
  for (const sig of ['cleanup_is_due(public.jobs)','claim_job_cleanup(uuid)','begin_job_cleanup(uuid,uuid)','finish_job_cleanup(uuid,uuid)','fail_job_cleanup(uuid,uuid)','settle_cancelled_jobs()']) {
    const [r] = (await pg.query(`select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated',$1,'execute') u, has_function_privilege('service_role',$1,'execute') s, (select prosecdef from pg_proc where oid=$1::regprocedure) d`, [`public.${sig}`])).rows;
    assert.deepEqual(r, { a:false, u:false, s:true, d:false });
  }
  const [r] = (await pg.query("select has_table_privilege('service_role','public.audit_logs','update') u, has_table_privilege('service_role','public.audit_logs','delete') d, has_table_privilege('service_role','public.audit_logs','insert') i")).rows;
  assert.deepEqual(r, { u:false, d:false, i:true });
});

// SDK facade over the same shipped SQL and Storage fixture, with injected errors.
function sdk(db, faults = {}) {
  const checked = async (name, call) => {
    if (faults[name]) return { data:null, error:{ message:'injected failure' } };
    try { return { data:await call(), error:null }; } catch { return { data:null, error:{ message:'fixture error' } }; }
  };
  return {
    rpc: (name, args) => checked(name, () => db.rpc(name, args)),
    from: table => ({
      insert: row => checked('audit', () => db.insert(table, row)),
      select: () => ({ eq: (_, id) => ({ neq: async () => checked('files', async () => (await db.select(table, { job_id:`eq.${id}` })).filter(f => f.storage_status !== 'DELETED')) }) }),
    }),
    storage: { from: () => ({ list:(p,o) => checked('list', () => db.listObjects(p,o)), remove:p => checked('remove', () => faults.removeNoop ? [] : db.removeObjects(p)) }) },
  };
}
const env = name => ({ MDIFY_CRON_SECRET:'fixture-cron', SUPABASE_SERVICE_ROLE_KEY:'fixture-key', SUPABASE_URL:'https://storage.test' })[name];
const request = () => new Request('https://edge.test', { headers:{ 'x-mdify-cron-secret':'fixture-cron' } });

test('unauthorized cleanup never creates a database client', async () => {
  let called = false;
  const handler = createCleanupHandler({ env, createClient:() => { called=true; } });
  assert.equal((await handler(new Request('https://edge.test'))).status, 401);
  assert.equal(called, false);
});

test('cron deletes and finalizes successfully before reporting bytes', async t => {
  const { db, row } = await setup(t);
  const response = await createCleanupHandler({ env, createClient:() => sdk(db) })(request());
  const summary = await response.json();
  assert.equal(response.status, 200); assert.equal(summary.deleted, 1); assert.equal(summary.bytes_deleted, 12);
  assert.equal((await row()).cleanup_state, 'COMPLETE'); assert.equal(db.objects.size, 0);
});

for (const stage of ['settle_cancelled_jobs','sweep_stale_jobs','claim_cleanup_batch','files','begin_job_cleanup','list','remove','finish_job_cleanup','audit']) {
  test(`cron fails visibly when ${stage} fails`, async t => {
    const { db, row } = await setup(t);
    const response = await createCleanupHandler({ env, createClient:() => sdk(db, { [stage]:true }) })(request());
    const summary = await response.json();
    assert.equal(response.status, 500);
    if (stage !== 'audit') {
      assert.notEqual((await row()).cleanup_state, 'COMPLETE');
      assert.equal((await row()).files_deleted_at, null);
      if (Object.hasOwn(summary,'deleted')) { assert.equal(summary.deleted,0); assert.equal(summary.bytes_deleted,0); }
    }
  });
}

test('a lost lease stops removal and does not report success', async () => {
  const job = { job_id:crypto.randomUUID(), cleanup_token:crypto.randomUUID() };
  let calls=0, removed=0;
  await assert.rejects(deleteClaimedFiles({ job, files:[], list:async () => [{ name:'source.txt', id:'object' }], remove:async () => { removed++; }, guard:async () => ++calls === 1 }), /lease lost/);
  assert.equal(removed,0);
});

test('deep folders fail closed and a registered path cannot delete another job', async () => {
  const job = { job_id:crypto.randomUUID(), cleanup_token:crypto.randomUUID() };
  let removed=0;
  const base = { job, guard:async () => true, remove:async () => { removed++; } };
  await assert.rejects(deleteClaimedFiles({ ...base, files:[], list:async () => [{ name:'folder', id:null }] }), /depth limit/);
  await assert.rejects(deleteClaimedFiles({ ...base, files:[{ object_path:`jobs/${crypto.randomUUID()}/input/source.txt` }], list:async () => [] }), /invalid registered path/);
  assert.equal(removed,0);
});

test('cleanup traverses all pages before removing bounded chunks and deduplicates paths', async () => {
  const job = { job_id:crypto.randomUUID(), cleanup_token:crypto.randomUUID() };
  const prefix = `jobs/${job.job_id}`;
  const entries = Array.from({ length:1501 }, (_, i) => ({ name:`file-${String(i).padStart(4,'0')}.txt`, id:`id-${i}` }));
  const removed=[], offsets=[], operations=[];
  const stored = new Map(entries.map(e => [`${prefix}/${e.name}`,e]));
  const count = await deleteClaimedFiles({ job, files:[{ object_path:`${prefix}/file-0000.txt` }],
    guard:async () => { operations.push('guard'); return true; },
    list:async (p, options) => { assert.equal(operations.at(-1),'guard'); operations.push('list'); assert.equal(p,prefix); assert.deepEqual(options.sortBy,{ column:'name',order:'asc' }); offsets.push(options.offset); return [...stored.values()].slice(options.offset,options.offset+options.limit); },
    remove:async paths => { assert.equal(operations.at(-1),'guard'); operations.push('remove'); assert.ok(paths.length<=100); removed.push(...paths); for(const p of paths) stored.delete(p); },
  });
  assert.deepEqual(offsets,[0,1000,0]); assert.equal(count,1501);
  assert.equal(removed.length,1501); assert.equal(new Set(removed).size,1501);
  assert.equal(operations.at(-1),'guard','renew before finalization');
});

test('Storage acknowledgement without actual removal never marks files deleted', async t => {
  const { db, row } = await setup(t);
  const handler = createCleanupHandler({ env, createClient:() => sdk(db, { removeNoop:true }) });
  const response = await handler(request());
  const summary = await response.json();
  assert.equal(response.status,500); assert.equal(summary.deleted,0); assert.equal(summary.bytes_deleted,0);
  assert.equal((await row()).files_deleted_at,null); assert.equal((await row()).cleanup_state,'PARTIAL');
  assert.equal(db.objects.size,1);
  const retried = await createCleanupHandler({ env, createClient:() => sdk(db) })(request());
  assert.equal(retried.status,200); assert.equal((await retried.json()).deleted,1);
  assert.equal(db.objects.size,0);
});
