import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startUploadedJob,waitForJob} from '../lib/models/conversionService.js';

test('a throttled upload start retries the same job and respects Retry-After',async()=>{
  const calls=[]; const delays=[];
  const result=await startUploadedJob('synthetic-job',{fetchImpl:async(url)=>{
    calls.push(url);
    return calls.length===1 ? Response.json({detail:'busy'},{status:429,headers:{'Retry-After':'6'}}):Response.json({status:'QUEUED'});
  },sleepImpl:async(ms)=>delays.push(ms)});
  assert.equal(result.status,'QUEUED'); assert.deepEqual(delays,[6000]);
  assert.deepEqual(calls,['/api/jobs/synthetic-job/start','/api/jobs/synthetic-job/start']);
});

test('start retries are bounded, preserve aborts and do not retry a validation failure',async()=>{
  let calls=0;
  await assert.rejects(startUploadedJob('job',{fetchImpl:async()=>{calls++;return Response.json({detail:'wrong size'},{status:413});}}),e=>e.status===413);
  assert.equal(calls,1);
  await assert.rejects(startUploadedJob('job',{fetchImpl:async()=>{throw new DOMException('cancelled','AbortError');}}),e=>e.name==='AbortError');
  calls=0;
  await assert.rejects(startUploadedJob('job',{fetchImpl:async()=>{calls++;return Response.json({detail:'busy'},{status:503});},sleepImpl:async()=>{}}),e=>e.status===503);
  assert.equal(calls,9);
});

test('advance respects the shared throttle delay and then retrieves the durable result',async()=>{
  let calls=0; const sleeps=[];
  const result=await waitForJob('job',{status:'PROCESSING',progress:10},{fetchImpl:async()=>{
    calls++;return calls===1?Response.json({detail:'busy'},{status:503,headers:{'Retry-After':'12'}}):Response.json({status:'COMPLETED',result:{filename:'fixture.md'}});
  },sleepImpl:async(ms)=>sleeps.push(ms)});
  assert.equal(result.status,'COMPLETED');assert.deepEqual(sleeps,[500,12000]);
});
