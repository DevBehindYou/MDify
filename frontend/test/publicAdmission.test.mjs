import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './sql/pgliteDb.mjs';
import { admitPublicRequest, clientHash, admissionResponse, AdmissionError, readBoundedBody } from '../lib/server/publicAdmission.js';

const ENV = { NODE_ENV: 'production', VERCEL: '1', BACKEND_SHARED_SECRET: 'synthetic-test-only' };
const req = (ip = '192.0.2.1') => new Request('https://mdify.test', { headers: { 'x-vercel-forwarded-for': ip } });
const key = (n = 1) => n.toString(16).padStart(64, '0');
const rpc = async (pg, action, hash = key()) => (await pg.query('select public.admit_public_request($1,$2) as r', [action, hash])).rows[0].r;

test('client keys trust only the platform header, canonicalize IPs and rotate daily', () => {
  const hash = clientHash(req(), ENV, 0);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, clientHash(req(), ENV, 10));
  assert.notEqual(hash, clientHash(req(), ENV, 86_400_000));
  assert.notEqual(hash, clientHash(req('192.0.2.2'), ENV, 0));
  assert.equal(clientHash(req('2001:db8:0:0:0:0:0:1'),ENV,0),clientHash(req('2001:db8::1'),ENV,0));
  assert.equal(clientHash(req('192.0.2.1'),{...ENV,VERCEL:'0'},0),clientHash(req('192.0.2.2'),{...ENV,VERCEL:'0'},0));
  const spoof = new Request('https://mdify.test', { headers: { 'x-forwarded-for': '192.0.2.5' } });
  assert.equal(clientHash(spoof,ENV,0),clientHash(req('invalid, list'),ENV,0));
  assert.throws(() => clientHash(req(),{}),AdmissionError);
});

test('shared admission returns safe throttle headers and fails closed on unavailable or malformed state', async () => {
  const denied = async (value) => {
    try { await admitPublicRequest(req(),'upload',{env:ENV,db:{rpc:async()=>value}}); assert.fail(); }
    catch(e) { assert.ok(e instanceof AdmissionError); return admissionResponse(e); }
  };
  const throttled = await denied({allowed:false,status:429,retry_after:6});
  assert.equal(throttled.status,429); assert.equal(throttled.headers.get('Retry-After'),'6');
  for (const bad of [null,[],{}, {allowed:false,status:401,retry_after:1}, {allowed:true,lease_id:null}]) {
    const action = bad?.allowed === true ? 'convert' : 'upload';
    await assert.rejects(admitPublicRequest(req(),action,{env:ENV,db:{rpc:async()=>bad}}),AdmissionError);
  }
  await assert.rejects(admitPublicRequest(req(),'upload',{env:ENV,db:{rpc:async()=>{throw Error('private DB details');}}}),AdmissionError);
  await assert.rejects(admitPublicRequest(req(),'convert',{env:{...ENV,NODE_ENV:'development'}}),AdmissionError);
  await assert.rejects(admitPublicRequest(req(),'convert',{env:{NODE_ENV:'production'}}),AdmissionError);
  assert.ok(await admitPublicRequest(req(),'convert',{env:{NODE_ENV:'development'}}));
});

test('bounded bodies reject dishonest/missing lengths and cancel an oversized stream', async () => {
  let cancelled = false;
  const request = { headers:new Headers(), body:new ReadableStream({ start(c){c.enqueue(new Uint8Array(20));},cancel(){cancelled=true;} }) };
  const bounded = await readBoundedBody(request,10);
  assert.equal(bounded.error.status,413); assert.equal(cancelled,true);
  const tooLong = await readBoundedBody(new Request('https://mdify.test',{method:'POST',headers:{'content-length':'99'},body:'x'}),10);
  assert.equal(tooLong.error.status,413);
  const underreported = await readBoundedBody(new Request('https://mdify.test',{method:'POST',headers:{'content-length':'1'},body:'12345678901'}),10);
  assert.equal(underreported.error.status,413);
  const small = await readBoundedBody(new Request('https://mdify.test',{method:'POST',body:'abc'}),3);
  assert.equal(new TextDecoder().decode(small.bytes),'abc');
});

test('upload and multipart share the client budget; start/advance share processing', async () => {
  const pg = await freshDb();
  try {
    const lease = await rpc(pg,'convert');
    assert.equal(lease.allowed,true);
    await pg.query('select public.release_public_multipart($1)',[lease.lease_id]);
    const freeze=()=>pg.exec("update public.public_request_budgets set updated_at=clock_timestamp()+interval '1 hour'");
    for(let i=0;i<9;i++) {await freeze();assert.equal((await rpc(pg,'upload')).allowed,true);}
    await freeze();
    const denied = await rpc(pg,'convert');
    assert.equal(denied.status,429);
    assert.equal((await pg.query('select count(*)::int as n from public.public_multipart_leases')).rows[0].n,0);
    await rpc(pg,'start'); await freeze(); await rpc(pg,'advance');
    const process = (await pg.query("select tokens from public.public_request_budgets where scope='process' and client_key=$1",[key()])).rows[0];
    assert.ok(Number(process.tokens)>=118 && Number(process.tokens)<119);
    assert.equal((await rpc(pg,'wake')).allowed,true,'wake has its own budget');
  } finally { await pg.close(); }
});

test('global budgets survive changing clients and rejected requests cannot grow client state', async () => {
  const pg = await freshDb();
  try {
    // Freeze refill into the future to exercise the exact capacity deterministically.
    await rpc(pg,'upload',key());
    await pg.exec("update public.public_request_budgets set updated_at=clock_timestamp()+interval '1 hour' where client_key='*'");
    const freeze=()=>pg.exec("update public.public_request_budgets set updated_at=clock_timestamp()+interval '1 hour' where client_key='*'");
    for(let i=2;i<=60;i++) {await freeze();assert.equal((await rpc(pg,'upload',key(i))).allowed,true);}
    await freeze();
    const denied = await rpc(pg,'upload',key(61));
    assert.equal(denied.status,503); assert.ok(denied.retry_after>=1);
    const clients = (await pg.query("select count(*)::int as n from public.public_request_budgets where client_key<>'*'")).rows[0].n;
    assert.equal(clients,60);
    // Refill happens at the database clock rather than a frontend cache.
    await pg.exec("update public.public_request_budgets set updated_at=clock_timestamp()-interval '2 seconds' where client_key='*'");
    assert.equal((await rpc(pg,'upload',key(61))).allowed,true);
  } finally { await pg.close(); }
});

test('multipart leases enforce two slots, recover abandoned requests and isolate releases', async () => {
  const pg = await freshDb();
  try {
    const a=await rpc(pg,'convert',key(1)); const b=await rpc(pg,'convert',key(2));
    assert.equal(a.allowed,true); assert.equal(b.allowed,true);
    const c=await rpc(pg,'convert',key(3)); assert.equal(c.status,503);
    assert.equal((await pg.query('select public.release_public_multipart($1) as r',[crypto.randomUUID()])).rows[0].r,false);
    await pg.query('update public.public_multipart_leases set expires_at=clock_timestamp()-interval \'1 second\' where lease_id=$1',[a.lease_id]);
    const next=await rpc(pg,'convert',key(3)); assert.equal(next.allowed,true);
    assert.equal((await pg.query('select public.release_public_multipart($1) as r',[a.lease_id])).rows[0].r,false);
    assert.equal((await pg.query('select count(*)::int as n from public.public_multipart_leases')).rows[0].n,2);
    await pg.query('select public.release_public_multipart($1)',[b.lease_id]);
    assert.equal((await rpc(pg,'convert',key(4))).allowed,true);
  } finally { await pg.close(); }
});

test('rotating clients while multipart is full still spends the global budget',async()=>{
  const pg=await freshDb();
  try {
    await pg.exec("insert into public.public_request_budgets values('create','*',60,clock_timestamp()+interval '1 hour','infinity'); insert into public.public_multipart_leases(expires_at) values(clock_timestamp()+interval '330 seconds'),(clock_timestamp()+interval '330 seconds');");
    for(let i=1;i<=80;i++) {await pg.exec("update public.public_request_budgets set updated_at=clock_timestamp()+interval '1 hour' where client_key='*'");assert.equal((await rpc(pg,'convert',key(i))).allowed,false);}
    assert.equal((await pg.query("select count(*)::int as n from public.public_request_budgets where client_key<>'*'")).rows[0].n,60);
  } finally {await pg.close();}
});

test('idle pruning removes expired hashes and leases; browser roles cannot read or execute admission', async () => {
  const pg=await freshDb();
  try {
    await rpc(pg,'convert');
    await pg.exec("update public.public_request_budgets set expires_at=clock_timestamp()-interval '1 second' where client_key<>'*'; update public.public_multipart_leases set expires_at=clock_timestamp()-interval '1 second'; select public.prune_public_admission();");
    assert.equal((await pg.query('select count(*)::int as n from public.public_request_budgets')).rows[0].n,1);
    assert.equal((await pg.query('select count(*)::int as n from public.public_multipart_leases')).rows[0].n,0);
    await assert.rejects(rpc(pg,'unknown')); await assert.rejects(rpc(pg,'upload','not-a-hash'));
    for(const role of ['anon','authenticated']) {
      await pg.exec(`set role ${role}`);
      await assert.rejects(pg.exec('select * from public.public_request_budgets'));
      await assert.rejects(rpc(pg,'upload'));
      await pg.exec('reset role');
    }
    await pg.exec('set role service_role'); assert.equal((await rpc(pg,'wake')).allowed,true);
  } finally { await pg.close(); }
});
