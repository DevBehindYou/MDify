import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
test('worker dashboard command scopes Git changes to its root folder',()=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'mdify-worker-scope-'));
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try {git('init');fs.mkdirSync(path.join(cwd,'backendN'));fs.writeFileSync(path.join(cwd,'backendN/a'),'old');fs.writeFileSync(path.join(cwd,'frontend'),'old');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-m','a');const a=git('rev-parse','HEAD');fs.writeFileSync(path.join(cwd,'frontend'),'new');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-m','b');const b=git('rev-parse','HEAD');
 assert.doesNotThrow(()=>execFileSync('git',['diff','--quiet',a,b,'--','.'],{cwd:path.join(cwd,'backendN'),stdio:'pipe'}));
 assert.throws(()=>execFileSync('git',['diff','--quiet','','','--','.'],{cwd:path.join(cwd,'backendN'),stdio:'pipe'}));
 }finally{fs.rmSync(cwd,{recursive:true,force:true});}
});
