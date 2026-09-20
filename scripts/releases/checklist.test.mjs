import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createChecklist,repository,masterPath} from './checklist.mjs';
test('master has unique activities and only three mandatory document rows',async()=>{
 const body=await fs.readFile(masterPath,'utf8');
 const ids=[...body.matchAll(/^\| (P\d+) \|/gm)].map(m=>m[1]);
 assert.equal(ids.length,24);assert.equal(new Set(ids).size,24);
 const docs=body.split('## Documentation impact and closure')[1].split('## Close')[0];
 assert.equal((docs.match(/\| Pending \|/g)||[]).length,3);
 assert.doesNotMatch(docs,/Preserved history|DOC-\d+/);
});
test('create a scoped copy with working links; refuse overwrite, archive and duplicates',async()=>{
 const dir=await fs.mkdtemp(path.join(repository,'outputs/.tmp-checklist-'));
 try{
  const output=path.join(dir,'promotion-checklist.md');
  await createChecklist('R999',output,['Documents/AppSheet_Data_Model_Overview.md']);
  const text=await fs.readFile(output,'utf8');assert.match(text,/# R999 promotion checklist/);
  assert.match(text,/AppSheet_Data_Model_Overview\.md/);assert.doesNotMatch(text,/\{\{RELEASE\}\}/);
  for(const [,url] of text.matchAll(/\]\(([^)]+)\)/g))if(!/^[a-z]+:|^#/i.test(url))await fs.access(path.resolve(dir,decodeURIComponent(url.split('#')[0])));
  await assert.rejects(createChecklist('R999',output),/EEXIST/);
  await assert.rejects(createChecklist('R999',path.join(dir,'bad.md'),['Documents/archive/README.md']),/archive/);
  await assert.rejects(createChecklist('R999',path.join(dir,'duplicate.md'),['Documents/README.md','Documents/README.md']),/Duplicate/);
  await assert.rejects(createChecklist('R999',path.join(repository,'Documents/test.md')),/under outputs/);
 }finally{
  assert.ok(path.resolve(dir).startsWith(path.join(repository,'outputs')+path.sep));
  await fs.rm(dir,{recursive:true});
 }
});
