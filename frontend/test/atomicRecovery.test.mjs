import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './sql/pgliteDb.mjs';
import { createPgliteSupabase } from './sql/pgliteSupabase.mjs';
import { createUpload, startJob, jobStatus, resetStorageUsageCacheForTests } from '../lib/server/jobService.js';
import { sendToPool } from '../lib/server/dispatcher.js';

const env = { NORMAL_BACKEND_URLS: 'http://backend.test' };
async function fixture(t) {
  const pg = await freshDb(); t.after(() => pg.close());
  const db = createPgliteSupabase(pg); resetStorageUsageCacheForTests();
  const upload = await createUpload(db, { filename: 'fixture.txt', size: 12, env });
  db.objects.set(upload.object_path, { metadata: { size: 12 } });
  return { pg, db, id: upload.job_id, path: upload.object_path };
}
const row = (pg, id) => pg.query('select * from public.jobs where job_id=$1',[id]).then(r=>r.rows[0]);
const claim = (db, id) => db.rpc('claim_work_items', {p_pool:'normal',p_capacity:4,p_job_id:id}).then(r=>r[0]);
const finish = (db, w, extra={}) => db.rpc('finish_work_item', {
  p_work_item_id:w.work_item_id,p_attempt:w.attempt_count,p_outcome:'SUCCEEDED',p_bucket:db.bucket,
  p_backend:'N1',p_duration_ms:10,p_result:{filename:'fixture.md',output_bytes:10,tokens_est:2,engine:'test'},...extra,
});

test('verified upload, activation, root and event commit together; replay creates one root',async t=>{
  const {pg,db,id}=await fixture(t);
  await startJob(db,id,{env,tick:false}); await startJob(db,id,{env,tick:false});
  assert.equal((await row(pg,id)).status,'QUEUED');
  assert.equal((await pg.query('select count(*)::int n from public.work_items')).rows[0].n,1);
  assert.equal((await pg.query("select count(*)::int n from public.job_events where event_type='QUEUED'")).rows[0].n,1);
  assert.equal((await pg.query('select storage_status from public.file_objects')).rows[0].storage_status,'ACTIVE');
});

test('missing or mismatched Storage upload never starts work',async t=>{
  const {pg,db,id,path}=await fixture(t);db.objects.clear();
  await assert.rejects(startJob(db,id,{env,tick:false}),e=>e.status===409);
  db.objects.set(path,{metadata:{size:13}});
  await assert.rejects(startJob(db,id,{env,tick:false}),e=>e.status===413);
  assert.equal((await row(pg,id)).status,'UPLOADING');
  assert.equal((await pg.query('select count(*)::int n from public.work_items')).rows[0].n,0);
});

test('a queued upload stranded by the legacy confirm path is repaired',async t=>{
  const {pg,db,id}=await fixture(t);await db.rpc('confirm_upload',{p_job_id:id});
  await startJob(db,id,{env,tick:false});
  assert.equal((await pg.query('select count(*)::int n from public.work_items')).rows[0].n,1);
});

test('enqueue failure rolls back confirmation and input activation',async t=>{
  const {pg,db,id}=await fixture(t);
  await pg.query("update public.jobs set source_type=null, source_extension=null where job_id=$1",[id]);
  // Inject an enqueue failure after confirmation to verify the transaction rolls back.
  await pg.exec("create function public.reject_enqueue() returns trigger language plpgsql as $$ begin raise exception 'injected enqueue failure'; end; $$; create trigger reject_enqueue before insert on public.work_items for each row execute function public.reject_enqueue();");
  await assert.rejects(db.rpc('start_uploaded_job',{p_job_id:id,p_bucket:db.bucket,p_verified_size:12}),/injected/);
  assert.equal((await row(pg,id)).status,'UPLOADING');
  assert.equal((await pg.query('select storage_status from public.file_objects')).rows[0].storage_status,'PENDING');
});

test('finalization failure rolls back completion; retry registers outputs and event once',async t=>{
  const {pg,db,id}=await fixture(t);await startJob(db,id,{env,tick:false});const w=await claim(db,id);
  await assert.rejects(finish(db,w,{p_result:{outputs:[{path:w.output_path,bytes:-1}]}}),/size_bytes/);
  assert.equal((await row(pg,id)).status,'PROCESSING');
  assert.equal((await pg.query('select status from public.work_items')).rows[0].status,'RUNNING');
  assert.equal(await finish(db,w),'COMPLETED');assert.equal(await finish(db,w),'stale');
  assert.equal((await row(pg,id)).items_done,1);
  assert.equal((await pg.query("select count(*)::int n from public.file_objects where kind='OUTPUT'")).rows[0].n,1);
  assert.equal((await pg.query("select count(*)::int n from public.job_events where event_type='COMPLETED'")).rows[0].n,1);
});

test('expansion replay and stale attempt cannot add children or increment counters',async t=>{
  const {pg,db,id}=await fixture(t);await startJob(db,id,{env,tick:false});const w=await claim(db,id);
  const children={p_items:[{task_type:'CONVERT',pool:'normal',is_final:true,output_path:w.output_path}]};
  assert.equal(await finish(db,w,{...children,p_attempt:0}),'stale');
  await finish(db,w,children);assert.equal(await finish(db,w,children),'stale');
  assert.equal((await pg.query('select count(*)::int n from public.work_items')).rows[0].n,2);
  assert.equal((await row(pg,id)).items_total,2);
});

test('failed child insertion rolls back graph and parent completion',async t=>{
  const {pg,db,id}=await fixture(t);await startJob(db,id,{env,tick:false});const w=await claim(db,id);
  await assert.rejects(finish(db,w,{p_nodes:[{node_type:'INVALID'}],p_items:[{task_type:'CONVERT',pool:'normal'}]}));
  assert.equal((await pg.query('select count(*)::int n from public.content_nodes')).rows[0].n,1);
  assert.equal((await pg.query('select status from public.work_items')).rows[0].status,'RUNNING');
});

test('legacy completed job missing metadata is repaired during result retrieval',async t=>{
  const {pg,db,id}=await fixture(t);await startJob(db,id,{env,tick:false});const w=await claim(db,id);
  await db.rpc('complete_work_item',{p_work_item_id:w.work_item_id,p_attempt:w.attempt_count,p_outcome:'SUCCEEDED',p_result:{filename:'fixture.md',output_bytes:10}});
  await jobStatus(db,id);await jobStatus(db,id);
  assert.equal((await pg.query("select count(*)::int n from public.file_objects where kind='OUTPUT'")).rows[0].n,1);
});

test('atomic RPCs are denied to browser roles',async t=>{
  const {pg}=await fixture(t);
  for(const name of ['start_uploaded_job','finish_work_item','finalize_job_outputs']) {
    const {rows}=await pg.query("select has_function_privilege('anon',oid,'execute') a,has_function_privilege('authenticated',oid,'execute') b,has_function_privilege('service_role',oid,'execute') s from pg_proc where proname=$1",[name]);
    assert.deepEqual(rows,[{a:false,b:false,s:true}]);
  }
});

test('malformed HTTP 200 is an infrastructure failure, never a successful result',async()=>{
  const r=await sendToPool({pool:'normal',urls:['http://backend.test'],jobId:'fixture',path:'/test',secret:'test',makeInit:()=>({}),fetchImpl:async()=>new Response('not json',{status:200})});
  assert.equal(r.status,502);assert.match(r.body.detail,/unreadable/);
});
