// CI-only PostgreSQL concurrency checks. Never targets a production database.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SUPABASE_SHIM, MIGRATIONS_DIR } from '../../frontend/test/sql/pgliteDb.mjs';
if (process.env.PGDATABASE !== 'mdify_ci' || !['127.0.0.1','localhost'].includes(process.env.PGHOST)) {
  throw new Error('This destructive fixture setup requires PGDATABASE=mdify_ci on localhost');
}
const run=promisify(execFile);
const sql=async s=>(await run('psql',['--no-psqlrc','-v','ON_ERROR_STOP=1','-At','-c',s],{timeout:30_000})).stdout.trim();
await sql(SUPABASE_SHIM);
for(const name of fs.readdirSync(MIGRATIONS_DIR).filter(n=>n.endsWith('.sql')).sort()) await sql(fs.readFileSync(`${MIGRATIONS_DIR}/${name}`,'utf8'));
const id='00000000-0000-4000-8000-000000000001';const bucket='mdify-pro-files';
await sql(`insert into public.jobs(job_id,status,source_type,source_extension,original_filename) values('${id}','UPLOADING','DOCUMENT','txt','fixture.txt');
insert into public.file_objects(job_id,bucket,object_path,kind,size_bytes) values('${id}','${bucket}','jobs/${id}/input/source.txt','INPUT',12);`);
await Promise.all(Array.from({length:8},()=>sql(`select (public.start_uploaded_job('${id}','${bucket}',12)).work_item_id`)));
assert.equal(await sql(`select count(*) from public.work_items where job_id='${id}'`),'1');
const item=JSON.parse(await sql(`select row_to_json(w) from public.claim_work_items('normal',4,1,'${id}') w`));
const finish=`select public.finish_work_item('${item.work_item_id}',${item.attempt_count},'SUCCEEDED','${bucket}','N1',10,'{"output_bytes":12}'::jsonb,null,null,'[]'::jsonb,
'[{"task_type":"CONVERT","pool":"normal","is_final":true,"output_path":"jobs/${id}/output/result.md"}]'::jsonb)`;
const results=await Promise.all(Array.from({length:8},()=>sql(finish)));
assert.equal(results.filter(s=>s==='stale').length,7);
assert.equal(await sql(`select count(*) from public.work_items where job_id='${id}'`),'2');
const child=JSON.parse(await sql(`select row_to_json(w) from public.claim_work_items('normal',4,1,'${id}') w`));
const terminal=`select public.finish_work_item('${child.work_item_id}',${child.attempt_count},'SUCCEEDED','${bucket}','N1',10,'{"output_bytes":12}'::jsonb)`;
const completed=await Promise.all(Array.from({length:8},()=>sql(terminal)));
assert.equal(completed.filter(s=>s==='COMPLETED').length,1);
assert.equal(await sql(`select count(*) from public.file_objects where job_id='${id}' and kind='OUTPUT'`),'1');
assert.equal(await sql(`select count(*) from public.job_events where job_id='${id}' and event_type='COMPLETED'`),'1');
console.log('PostgreSQL: concurrent starts, child expansion and finalization passed');

const cleanupId='00000000-0000-4000-8000-000000000002';
await sql(`insert into public.jobs(job_id,status,auto_delete_at) values('${cleanupId}','COMPLETED',now()-interval '1 hour');`);
const claims=await Promise.all(Array.from({length:8},()=>sql(`select row_to_json(j) from public.claim_cleanup_batch(1) j`)));
const owners=claims.filter(Boolean).map(JSON.parse);
assert.equal(owners.length,1);
const old=owners[0];
assert.equal(await sql(`select public.begin_job_cleanup('${cleanupId}','${old.cleanup_token}')`),'t');
await sql(`update public.jobs set cleanup_lease_until=now()-interval '1 minute' where job_id='${cleanupId}'`);
const next=JSON.parse(await sql(`select row_to_json(j) from public.claim_cleanup_batch(1) j`));
assert.notEqual(next.cleanup_token,old.cleanup_token);
const stale=await Promise.all(Array.from({length:8},()=>sql(`select public.finish_job_cleanup('${cleanupId}','${old.cleanup_token}')`)));
assert.ok(stale.every(r=>r==='f'));
assert.equal(await sql(`select public.begin_job_cleanup('${cleanupId}','${next.cleanup_token}')`),'t');
assert.equal(await sql(`select public.finish_job_cleanup('${cleanupId}','${next.cleanup_token}')`),'t');
console.log('PostgreSQL: competing cleanup claims and stale owner rejection passed');

const permissionSql=fs.readFileSync(`${MIGRATIONS_DIR}/../tests/verify_permissions.sql`,'utf8').replace(/;\s*$/,'');
const permissionRows=(await sql(`select row_to_json(v) from (${permissionSql}) v`)).split('\n').filter(Boolean).map(JSON.parse);
assert.ok(permissionRows.length>0);
assert.ok(permissionRows.every(r=>r.ok===true),JSON.stringify(permissionRows.filter(r=>!r.ok)));
console.log('PostgreSQL: browser-role isolation, invoker RPCs and append-only audit checks passed');
