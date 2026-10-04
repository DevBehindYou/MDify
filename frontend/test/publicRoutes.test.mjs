// Exercise the shipped handlers. Only adapt Next's extensionless imports for
// Node's test runner; the handler and its admission/dispatch code stay intact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

async function route(name) {
  const url=new URL(`../app/api/${name}/route.js`,import.meta.url);
  const source=fs.readFileSync(url,'utf8').replace(/from '([^']+)'/g,(_,specifier)=>{
    const resolved=specifier==='next/server' ? new URL('../node_modules/next/server.js',import.meta.url) : new URL(specifier+'.js',url);
    return `from '${resolved.href}'`;
  });
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const lease='00000000-0000-4000-8000-000000000001';
const params={params:{id:'00000000-0000-4000-8000-000000000002'}};
async function isolated(run) {
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','BACKEND_SHARED_SECRET','NODE_ENV','VERCEL','NORMAL_BACKEND_URLS'];
  const before=Object.fromEntries(keys.map(k=>[k,process.env[k]])); const oldFetch=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test-only-key',BACKEND_SHARED_SECRET:'test-only-secret',NODE_ENV:'production',VERCEL:'1',NORMAL_BACKEND_URLS:'http://backend.test'});
  try { await run(); }
  finally {globalThis.fetch=oldFetch; for(const k of keys) {if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}}
}
const json=(body,status=200)=>Response.json(body,{status});
const uploadRequest=(body)=>new Request('https://mdify.test',{method:'POST',headers:{'content-type':'application/json','x-vercel-forwarded-for':'192.0.2.1'},body});
function multipart() {
  const form=new FormData(); form.append('file',new File(['synthetic text'],'fixture.txt')); form.append('profile','Standard');
  return new Request('https://mdify.test',{method:'POST',headers:{'x-vercel-forwarded-for':'192.0.2.1'},body:form});
}

test('every public work route denies requests before reading bodies or reaching storage/backends',async()=>isolated(async()=>{
  const actions=[];
  globalThis.fetch=async(url,init)=>{
    assert.equal(url,'https://db.test/rest/v1/rpc/admit_public_request');
    const body=JSON.parse(init.body); actions.push(body.p_action); assert.match(body.p_client_hash,/^[a-f0-9]{64}$/);
    return json({allowed:false,status:429,retry_after:10});
  };
  for(const name of ['uploads/create','convert','jobs/[id]/start','jobs/[id]/advance','wake']) {
    const request={headers:new Headers({'x-vercel-forwarded-for':'192.0.2.1'}),get body(){assert.fail('Rejected body was read');}};
    const response=await (await route(name)).POST(request,params);
    assert.equal(response.status,429,name); assert.equal(response.headers.get('retry-after'),'10');
  }
  assert.deepEqual(actions,['upload','convert','start','advance','wake']);
}));

test('missing admission migration returns a safe 503 without multipart fallback or dispatch',async()=>isolated(async()=>{
  let calls=0; globalThis.fetch=async()=>{calls++;return json({message:'private database failure'},404);};
  const response=await(await route('uploads/create')).POST(uploadRequest('{}'));
  assert.equal(response.status,503); assert.doesNotMatch(await response.text(),/private/); assert.equal(calls,1);
}));

test('upload JSON is bounded and rejects null/arrays before creating any rows',async()=>isolated(async()=>{
  let calls=0; globalThis.fetch=async(url)=>{calls++;assert.match(url,/admit_public_request$/);return json({allowed:true,lease_id:null});};
  for(const body of ['null','[]','{bad']) assert.equal((await(await route('uploads/create')).POST(uploadRequest(body))).status,400);
  assert.equal((await(await route('uploads/create')).POST(uploadRequest('x'.repeat(8193)))).status,413);
  assert.equal(calls,4);
}));

test('multipart validation errors release their lease before returning',async()=>isolated(async()=>{
  const calls=[]; globalThis.fetch=async(url)=>{calls.push(url);return json(url.endsWith('admit_public_request')?{allowed:true,lease_id:lease}:true);};
  const response=await(await route('convert')).POST(uploadRequest('{}'));
  assert.equal(response.status,400); assert.equal(calls.length,2); assert.match(calls[1],/release_public_multipart$/);
}));

test('successful multipart dispatch releases the lease; timeout retains it for expiry',async()=>isolated(async()=>{
  const handler=await route('convert'); let timeout=false; const calls=[];
  globalThis.fetch=async(url)=>{
    calls.push(url);
    if(url.endsWith('admit_public_request'))return json({allowed:true,lease_id:lease});
    if(url.endsWith('release_public_multipart'))return json(true);
    assert.match(url,/internal\/convert$/);
    if(timeout)throw new DOMException('timed out','TimeoutError');
    return json({filename:'fixture.md',content:'synthetic text'});
  };
  assert.equal((await handler.POST(multipart())).status,200); assert.match(calls.at(-1),/release_public_multipart$/);
  calls.length=0; timeout=true;
  assert.equal((await handler.POST(multipart())).status,504); assert.equal(calls.length,2);
  assert.ok(calls.every(url=>!url.endsWith('release_public_multipart')));
}));

test('a successful peer retry conservatively retains the lease for the uncertain first attempt',async()=>isolated(async()=>{
  process.env.NORMAL_BACKEND_URLS='http://backend.test,http://peer.test';
  let attempts=0;let released=false;
  globalThis.fetch=async(url)=>{
    if(url.endsWith('admit_public_request'))return json({allowed:true,lease_id:lease});
    if(url.endsWith('release_public_multipart')){released=true;return json(true);}
    attempts++;return attempts===1?json({detail:'upstream failed'},502):json({filename:'fixture.md',content:'synthetic text'});
  };
  assert.equal((await(await route('convert')).POST(multipart())).status,200);
  assert.equal(attempts,2);assert.equal(released,false);
}));
