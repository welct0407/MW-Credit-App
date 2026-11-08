import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
// A fresh module per test (each import of a new data URL is a new module instance).
let instance=0;
const load=async()=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/request-activity.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText+'\n//'+instance++).toString('base64'));

// R133: requests name their kind so the header says what it waits for; the total count is unchanged for offline preparation.
test('a request defaults to a read; the total and the kind follow begin and end',async()=>{
 const activity=await load();
 assert.equal(activity.activitySnapshot(),0);assert.equal(activity.activityKindSnapshot(),null);
 const done=activity.beginRequest();assert.equal(activity.activitySnapshot(),1);assert.equal(activity.activityKindSnapshot(),'read');
 done();assert.equal(activity.activitySnapshot(),0);assert.equal(activity.activityKindSnapshot(),null);
});
test('a save outranks a receipt reading, which outranks a read; each ends on its own',async()=>{
 const activity=await load();
 const read=activity.beginRequest('read'),receipt=activity.beginRequest('receipt');assert.equal(activity.activityKindSnapshot(),'receipt');
 const save=activity.beginRequest('save');assert.equal(activity.activityKindSnapshot(),'save');assert.equal(activity.activitySnapshot(),3);
 save();assert.equal(activity.activityKindSnapshot(),'receipt');receipt();assert.equal(activity.activityKindSnapshot(),'read');read();assert.equal(activity.activityKindSnapshot(),null);
});
test('ending twice counts once; listeners hear each change; the kind snapshot is a primitive',async()=>{
 const activity=await load();let calls=0;const stop=activity.subscribeActivity(()=>{calls++});
 const save=activity.beginRequest('save');save();save();assert.equal(calls,2);assert.equal(activity.activitySnapshot(),0);
 const other=activity.beginRequest('save');assert.equal(typeof activity.activityKindSnapshot(),'string');assert.equal(activity.activityKindSnapshot(),activity.activityKindSnapshot());
 stop();other();assert.equal(calls,3,'no call after unsubscribe');
});
test('an unknown kind counts as a read',async()=>{
 const activity=await load();const done=activity.beginRequest('other');assert.equal(activity.activityKindSnapshot(),'read');done();assert.equal(activity.activityKindSnapshot(),null);
});
