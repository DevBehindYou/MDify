import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, MIGRATIONS_DIR } from './sql/pgliteDb.mjs';
import { createPgliteSupabase } from './sql/pgliteSupabase.mjs';
import { createUpload, JobError, storageBudgetBytes } from '../lib/server/jobService.js';
import fs from 'node:fs';
const MiB = 1024 * 1024;
const env = { NORMAL_BACKEND_URLS: 'http://n1', OCR_BACKEND_URLS: 'http://o1', ARCHIVE_BACKEND_URLS: 'http://z1' };
const input = { filename: 'fixture.txt', size: 12, env };
const bucket = 'mdify-pro-files';
async function fixture(t) { const pg = await freshDb(); t.after(() => pg.close()); return { pg, db: createPgliteSupabase(pg) }; }
const snapshot = db => db.rpc('storage_capacity_snapshot', { p_bucket: bucket });
const count = async (pg, table) => (await pg.query(`select count(*)::int n from public.${table}`)).rows[0].n;
const stored = (pg, name, size) => pg.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)', [bucket, name, { size }]);
const busy = e => e instanceof JobError && e.status === 503 && e.retryAfter === 30;

test('two uploads share unspent capacity before either file arrives', async t => {
  const { pg, db } = await fixture(t);
  const args = { ...input, env: { ...env, STORAGE_BUDGET_BYTES: String(15 * MiB) } };
  await createUpload(db, args);
  db.signedUploadUrl = async () => assert.fail('rejected upload must not be signed');
  await assert.rejects(createUpload(db, args), busy);
  assert.deepEqual(await snapshot(db), { used_bytes: 0, pending_bytes: 15 * MiB, committed_bytes: 15 * MiB });
  assert.equal(await count(pg, 'jobs'), 1);
  assert.equal(await count(pg, 'file_objects'), 1);
  assert.equal(await count(pg, 'job_storage_reservations'), 1);
});

test('actual job bytes replace the forecast without double counting; extra and orphan bytes still count', async t => {
  const { pg, db } = await fixture(t);
  const a = await createUpload(db, { ...input, filename: 'large.pdf', size: 10 * MiB });
  await stored(pg, a.object_path, 10 * MiB);
  await stored(pg, `jobs/${a.job_id}/output/result.md`, 5 * MiB);
  await stored(pg, 'orphan/unregistered.bin', 2 * MiB);
  assert.deepEqual(await snapshot(db), { used_bytes: 17 * MiB, pending_bytes: 15 * MiB, committed_bytes: 32 * MiB });
  await stored(pg, `jobs/${a.job_id}/nodes/expanded.bin`, 20 * MiB);
  assert.deepEqual(await snapshot(db), { used_bytes: 37 * MiB, pending_bytes: 5 * MiB, committed_bytes: 42 * MiB });
});

test('cancelled/deleted jobs keep signed-upload headroom; expired guards release it while retained files count', async t => {
  const { pg, db } = await fixture(t);
  const a = await createUpload(db, input);
  await stored(pg, a.object_path, 12);
  await stored(pg, `jobs/${a.job_id}/output/result.md`, MiB);
  await pg.query("update public.jobs set status='CANCELLED',files_deleted_at=now() where job_id=$1", [a.job_id]);
  await pg.query('delete from storage.objects where name=$1', [a.object_path]);
  assert.equal((await snapshot(db)).committed_bytes, 16 * MiB);
  await stored(pg, a.object_path, 15 * MiB); // a still-valid token can send more than its declaration
  assert.equal((await snapshot(db)).committed_bytes, 16 * MiB);
  await pg.exec("update public.job_storage_reservations set upload_guard_until=now()-interval '1 second'");
  assert.equal((await snapshot(db)).pending_bytes, 0);
  await createUpload(db, input); // prune only the expired terminal reservation
  assert.equal(await count(pg, 'job_storage_reservations'), 1);
  assert.equal((await snapshot(db)).used_bytes, 16 * MiB);
});

test('active and pending cancellation reservations do not expire with the upload token', async t => {
  const { pg, db } = await fixture(t);
  const a = await createUpload(db, input);
  await pg.exec("update public.job_storage_reservations set upload_guard_until=now()-interval '1 day'");
  for (const status of ['UPLOADING','QUEUED','PROCESSING','CANCEL_REQUESTED']) {
    await pg.query('update public.jobs set status=$1 where job_id=$2', [status, a.job_id]);
    assert.equal((await snapshot(db)).pending_bytes, 15 * MiB);
  }

});

test('unknown signing outcome retains its durable storage reservation', async t => {
  const { pg, db } = await fixture(t);
  db.signedUploadUrl = async () => { throw Error('synthetic timeout'); };
  await assert.rejects(createUpload(db, input), /synthetic timeout/);
  assert.equal(await count(pg, 'job_storage_reservations'), 1);
  assert.equal((await snapshot(db)).pending_bytes, 15 * MiB);
});

test('reservation failure rolls back both job and input before signing', async t => {
  const { pg, db } = await fixture(t);
  await pg.exec(`create function fixture_reject_reservation() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end; $$;
    create trigger fixture_reject_reservation before insert on public.job_storage_reservations for each row execute function fixture_reject_reservation();`);
  db.signedUploadUrl = async () => assert.fail('failed transaction must not sign');
  await assert.rejects(createUpload(db, input), busy);
  for (const table of ['jobs','file_objects','job_storage_reservations']) assert.equal(await count(pg, table), 0);
});

test('missing usage, malformed sizes and unsupported bucket limits fail closed', async t => {
  const { pg, db } = await fixture(t);
  db.signedUploadUrl = async () => assert.fail('unknown capacity must not sign');
  for (const metadata of [null, {}, { size: -1 }, { size: 'invalid' }, { size: '9223372036854775808' }]) {
    await pg.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)', [bucket, 'bad', metadata]);
    await assert.rejects(createUpload(db, input), busy);
    await pg.exec('delete from storage.objects');
  }
  for (const limit of [null, 0, 16 * MiB]) {
    await pg.query('update storage.buckets set file_size_limit=$1 where id=$2', [limit, bucket]);
    await assert.rejects(createUpload(db, input), busy);
  }
  assert.equal(await count(pg, 'jobs'), 0);
});

test('old upload RPC uses the same reservation and fixed ceiling during rollback', async t => {
  const { pg, db } = await fixture(t);
  await stored(pg, 'existing', 785 * MiB);
  const args = { p_bucket: bucket, p_filename: 'f.txt', p_extension: 'txt', p_size: 12, p_mime: null, p_profile: 'standard', p_source_type: 'DOCUMENT', p_workload_type: 'NORMAL' };
  assert.equal((await db.rpc('create_upload_job', args)).allowed, true);
  assert.equal((await db.rpc('create_upload_job', args)).reason, 'storage_capacity');
  assert.equal(await count(pg, 'job_storage_reservations'), 1);
});

test('rollout includes existing jobs without changing statuses and does not renew guards on rerun', async t => {
  const { pg, db } = await fixture(t);
  const a = await createUpload(db, input);
  await pg.exec('delete from public.job_storage_reservations');
  const migration = fs.readFileSync(`${MIGRATIONS_DIR}/20261007000000_mdify_storage_reservations.sql`, 'utf8');
  await pg.exec(migration);
  const first = (await pg.query('select * from public.job_storage_reservations')).rows[0];
  await pg.exec(migration);
  assert.deepEqual((await pg.query('select * from public.job_storage_reservations')).rows[0], first);
  assert.equal((await pg.query('select status from public.jobs where job_id=$1', [a.job_id])).rows[0].status, 'UPLOADING');
});

test('browser roles cannot inspect or mutate reservations and service-role RPC works', async t => {
  const { pg } = await fixture(t);
  const checks = fs.readFileSync(`${MIGRATIONS_DIR}/../tests/verify_permissions.sql`, 'utf8');
  assert.ok((await pg.query(checks)).rows.every(r => r.ok));
  for (const role of ['anon','authenticated']) {
    await pg.exec(`set role ${role}`);
    await assert.rejects(pg.exec('select * from public.job_storage_reservations'), /permission denied/);
    await assert.rejects(pg.exec("select public.storage_capacity_snapshot('mdify-pro-files')"), /permission denied/);
    await pg.exec('reset role');
  }
  // Supabase supplies these Storage read privileges to service_role.
  await pg.exec('grant usage on schema storage to service_role; grant select on storage.buckets,storage.objects to service_role; set role service_role');
  const db = createPgliteSupabase(pg);
  await createUpload(db, input);
  assert.equal((await snapshot(db)).pending_bytes, 15 * MiB);
});

test('environment budgets can lower the shared ceiling but cannot raise it or use malformed numbers', () => {
  assert.equal(storageBudgetBytes({ STORAGE_BUDGET_BYTES: '5000' }), 5000);
  for (const value of ['999999999999','5000junk','0','-1','1.5','']) {
    assert.equal(storageBudgetBytes({ STORAGE_BUDGET_BYTES: value }), 800 * MiB);
  }
});


test('legacy input inserts reserve capacity and refuse when forecast is full', async t => {
  const { pg, db } = await fixture(t);
  await stored(pg, 'existing', 785 * MiB);
  const a = (await pg.query("insert into public.jobs(status,source_type) values('UPLOADING','DOCUMENT') returning job_id")).rows[0].job_id;
  await pg.query("insert into public.file_objects(job_id,bucket,object_path,kind,size_bytes) values($1,$2,$3,'INPUT',12)", [a, bucket, `jobs/${a}/input/source.txt`]);
  assert.equal((await snapshot(db)).committed_bytes, 800 * MiB);
  const b = (await pg.query("insert into public.jobs(status,source_type) values('UPLOADING','DOCUMENT') returning job_id")).rows[0].job_id;
  await assert.rejects(pg.query("insert into public.file_objects(job_id,bucket,object_path,kind,size_bytes) values($1,$2,$3,'INPUT',12)", [b, bucket, `jobs/${b}/input/source.txt`]), /lot of files/);
  assert.equal(await count(pg, 'job_storage_reservations'), 1);
  assert.equal(await count(pg, 'file_objects'), 1);
});


test('hard job deletion preserves token headroom through late upload and expiry', async t => {
  const { pg, db } = await fixture(t);
  const a = await createUpload(db, input);
  await pg.query("update public.jobs set status='CANCELLED',files_deleted_at=now() where job_id=$1", [a.job_id]);
  await pg.query('delete from public.jobs where job_id=$1', [a.job_id]);
  assert.equal(await count(pg, 'jobs'), 0);
  assert.equal((await snapshot(db)).pending_bytes, 15 * MiB);
  await assert.rejects(createUpload(db, { ...input, env: { ...env, STORAGE_BUDGET_BYTES: String(15 * MiB) } }), busy);
  await stored(pg, a.object_path, 15 * MiB);
  assert.equal((await snapshot(db)).committed_bytes, 15 * MiB);
  await pg.exec("update public.job_storage_reservations set upload_guard_until=now()-interval '1 second'");
  assert.equal((await snapshot(db)).pending_bytes, 0);
  await createUpload(db, { ...input, env: { ...env, STORAGE_BUDGET_BYTES: String(30 * MiB) } });
  assert.equal(await count(pg, 'job_storage_reservations'), 1);
  assert.equal((await snapshot(db)).used_bytes, 15 * MiB);
});
