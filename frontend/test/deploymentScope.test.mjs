import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { shouldSkip } from '../scripts/ignore-build.mjs';
test('real Git history skips unaffected workers but builds changes, renames and unknown history',()=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'mdify-scope-'));
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const commit=()=>{git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-m','fixture');return git('rev-parse','HEAD');};
 const write=(p,v)=>{fs.mkdirSync(path.dirname(path.join(cwd,p)),{recursive:true});fs.writeFileSync(path.join(cwd,p),v);};
 try {git('init');write('backendN/app/main.py','old');write('frontend/app/page.js','old');const a=commit();
  write('frontend/app/page.js','new');const b=commit();assert.equal(shouldSkip({cwd,project:'backendN',previous:a,current:b}),true);assert.equal(shouldSkip({cwd,project:'frontend',previous:a,current:b}),false);
  fs.renameSync(path.join(cwd,'backendN/app/main.py'),path.join(cwd,'backendN/app/new.py'));const c=commit();assert.equal(shouldSkip({cwd,project:'backendN',previous:b,current:c}),false);
  write('backendN/vercel.json','{}');const d=commit();assert.equal(shouldSkip({cwd,project:'backendN',previous:c,current:d}),false);
  for(const previous of [undefined,'--option', 'f'.repeat(40),d])assert.equal(shouldSkip({cwd,project:'backendN',previous,current:d}),false);
 } finally {fs.rmSync(cwd,{recursive:true,force:true});}
});
test('saved worker command handles first previews, multi-commit changes and uncertain history',()=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'mdify-worker-scope-'));
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const command=fs.readFileSync(new URL('../../docs/worker-ignore-command.sh',import.meta.url),'utf8').trim();
 const shell=process.platform==='win32'?path.resolve(git('--exec-path'),'../../../bin/bash.exe'):'sh';
 const run=(previous,env='preview')=>spawnSync(shell,['-c',command],{cwd:path.join(cwd,'backendN'),env:{...process.env,VERCEL_GIT_PREVIOUS_SHA:previous,VERCEL_ENV:env},stdio:'pipe'}).status;
 const commit=()=>{git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-m','fixture');return git('rev-parse','HEAD');};
 try {
  assert.ok(command.length<=256);
  git('init','-b','main');fs.mkdirSync(path.join(cwd,'backendN'));fs.writeFileSync(path.join(cwd,'backendN/a'),'old');fs.writeFileSync(path.join(cwd,'frontend'),'old');const a=commit();
  git('update-ref','refs/heads/production-base',a);git('remote','add','origin',cwd);git('config','remote.origin.fetch','+refs/heads/production-base:refs/remotes/origin/main');
  // A separate origin whose main remains at the production baseline.
  const origin=path.join(cwd,'origin.git');execFileSync('git',['clone','--bare',cwd,origin],{stdio:'pipe'});git('remote','set-url','origin',origin);
  fs.writeFileSync(path.join(cwd,'frontend'),'new');commit();
  assert.equal(run(a),0);assert.equal(run(''),0);assert.equal(run('','production'),1);assert.equal(run('f'.repeat(40)),1);
  fs.writeFileSync(path.join(cwd,'backendN/a'),'changed');commit();fs.writeFileSync(path.join(cwd,'frontend'),'third');commit();
  assert.equal(run(a),1);assert.equal(run(''),1);
  git('remote','set-url','origin',path.join(cwd,'missing.git'));assert.equal(run(''),1);
 } finally {fs.rmSync(cwd,{recursive:true,force:true});}
});
