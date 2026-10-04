import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { freshDb, MIGRATIONS_DIR } from './sql/pgliteDb.mjs';
import { createPgliteSupabase } from './sql/pgliteSupabase.mjs';
import { createUpload, JobError, resetStorageUsageCacheForTests } from '../lib/server/jobService.js';
const ENV={NORMAL_BACKEND_URLS:'http://n1',OCR_BACKEND_URLS:'http://o1',ARCHIVE_BACKEND_URLS:'http://z1'};
const args={filename:'fixture.txt',size:12,profile:'Standard',env:ENV};
const active="status in ('UPLOADING','QUEUED','PROCESSING','CANCEL_REQUESTED')";
const count=async(pg,table,where='true')=>(await pg.query(`select count(*)::int as n from public.${table} where ${where}`)).rows[0].n;
const fill=async(pg,n)=>pg.exec(`insert into public.jobs(status) select 'UPLOADING' from generate_series(1,${n})`);
async function setup(){resetStorageUsageCacheForTests();const pg=await freshDb();return {pg,db:createPgliteSupabase(pg)};}

test('capacity includes uploads, queued/running jobs and pending cancellation; terminal settlement frees one slot',async()=>{
 const {pg,db}=await setup();try{
  await fill(pg,28);
  await pg.exec("insert into public.jobs(status) values('UPLOADING'),('QUEUED'),('PROCESSING'),('CANCEL_REQUESTED')");
  await assert.rejects(createUpload(db,args),e=>e instanceof JobError&&e.status===503&&e.retryAfter===30);
  assert.equal(await count(pg,'file_objects'),0);
  await pg.exec("update public.jobs set status='PROCESSING' where status='QUEUED'");
  assert.equal(await count(pg,'jobs',active),32);
  await pg.exec("update public.jobs set status='COMPLETED' where job_id=(select job_id from public.jobs where status='PROCESSING' limit 1)");
  const created=await createUpload(db,args);assert.match(created.upload_url,/token=up/);
  assert.equal(await count(pg,'jobs',active),32);assert.equal(await count(pg,'file_objects'),1);
  await assert.rejects(pg.exec("update public.jobs set status='UPLOADING' where status='COMPLETED'"),/handling many jobs/);
 }finally{await pg.close();}
});

test('legacy direct inserts and multi-row batches cannot bypass the ceiling',async()=>{
 const {pg}=await setup();try{
  await assert.rejects(fill(pg,33),/handling many jobs/);assert.equal(await count(pg,'jobs'),0);
  await fill(pg,32);await assert.rejects(fill(pg,1),/handling many jobs/);
  assert.equal(await count(pg,'jobs'),32);
 }finally{await pg.close();}
});

test('job and input metadata roll back together if file insertion fails',async()=>{
 const {pg,db}=await setup();try{
  await pg.exec(`create function public.fixture_reject_file() returns trigger language plpgsql as $$ begin raise exception 'synthetic file failure'; end; $$;
    create trigger fixture_reject_file before insert on public.file_objects for each row execute function public.fixture_reject_file();`);
  db.signedUploadUrl=async()=>assert.fail('failed admission must not sign an upload');
  await assert.rejects(createUpload(db,args),e=>e instanceof JobError&&e.status===503);
  assert.equal(await count(pg,'jobs'),0);assert.equal(await count(pg,'file_objects'),0);
 }finally{await pg.close();}
});

test('unknown signing outcome preserves durable admission for recovery',async()=>{
 const {pg,db}=await setup();try{
  db.signedUploadUrl=async()=>{throw Error('synthetic signing failure');};
  await assert.rejects(createUpload(db,args),/synthetic signing failure/);
  assert.equal(await count(pg,'jobs',"status='UPLOADING'"),1);
  assert.equal(await count(pg,'file_objects',"storage_status='PENDING'"),1);
 }finally{await pg.close();}
});

test('normal stale-upload recovery frees capacity without deleting existing jobs',async()=>{
 const {pg,db}=await setup();try{
  await fill(pg,32);
  await pg.exec("update public.jobs set created_at=now()-interval '3 hours' where job_id=(select job_id from public.jobs limit 1)");
  await db.rpc('sweep_stale_jobs',{});
  assert.equal(await count(pg,'jobs',active),31);
  await createUpload(db,args);assert.equal(await count(pg,'jobs'),33);assert.equal(await count(pg,'jobs',active),32);
 }finally{await pg.close();}
});

test('migration preserves an existing over-cap queue and permits it to finish',async()=>{
 const {pg,db}=await setup();try{
  await pg.exec('drop trigger mdify_active_job_capacity on public.jobs');await fill(pg,40);
  await pg.exec(fs.readFileSync(`${MIGRATIONS_DIR}/20261004010000_mdify_active_jobs.sql`,'utf8'));
  assert.equal(await count(pg,'jobs'),40);
  await assert.rejects(createUpload(db,args),e=>e.status===503);
  await pg.exec("update public.jobs set status='QUEUED' where status='UPLOADING'");
  await pg.exec("update public.jobs set status='COMPLETED' where job_id in(select job_id from public.jobs limit 9)");
  await createUpload(db,args);assert.equal(await count(pg,'jobs',active),32);
 }finally{await pg.close();}
});

test('missing or malformed admission never falls back to inserts or issues a signed URL',async()=>{
 for(const response of [null,{},[],{allowed:true,job_id:'invalid'}]){
  resetStorageUsageCacheForTests();
  const db={bucket:'test',rpc:async(name)=>name==='storage_usage_bytes'?0:response,insert:async()=>assert.fail('fallback insert'),signedUploadUrl:async()=>assert.fail('unauthorized signing')};
  await assert.rejects(createUpload(db,args),e=>e.status===503&&e.retryAfter===30);
 }
 resetStorageUsageCacheForTests();
 const db={bucket:'test',rpc:async(name)=>{if(name==='storage_usage_bytes')return 0;throw Error('private database detail');},signedUploadUrl:async()=>assert.fail()};
 await assert.rejects(createUpload(db,args),e=>e.status===503&&!e.message.includes('private'));
});

test('non-integer declared byte size is refused before database admission',async()=>{
 await assert.rejects(createUpload({rpc:async()=>assert.fail()}, {...args,size:1.5}),e=>e.status===400);
});
