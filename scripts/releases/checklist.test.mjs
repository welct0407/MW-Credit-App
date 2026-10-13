import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createChecklist,repository} from './checklist.mjs';
test('create a scoped copy with working links; refuse overwrite, archive and duplicates',async()=>{
 const dir=await fs.mkdtemp(path.join(repository,'outputs/.tmp-checklist-'));
 try{
  const output=path.join(dir,'promotion-checklist.md');
  await createChecklist('R999',output,['Documents/Release_Tracker.md','Documents/Solution_Design.md']);
  const text=await fs.readFile(output,'utf8');assert.match(text,/# R999 promotion record/);
  assert.match(text,/Changed documents, if any:.*Release_Tracker\.md.*Solution_Design\.md/);
  assert.doesNotMatch(text,/Environment_Inventory\.md|Development_Changes\.md|\{\{RELEASE\}\}/);
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
