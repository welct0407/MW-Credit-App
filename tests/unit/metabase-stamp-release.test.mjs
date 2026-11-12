// R144: the Metabase release stamp (project/scripts/metabase/Stamp-Release.mjs) against a fake reporting API; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {COLLECTION,COLLECTION_NAME,readStamp,stampDescription,check,apply} from '../../project/scripts/metabase/Stamp-Release.mjs';

test('the stamp is one trailing line; the rest of the description is kept',()=>{
 assert.equal(readStamp(null),null);assert.equal(readStamp('Loan reports'),null);
 assert.equal(readStamp('Loan reports\n\nMW release: R143\n'),'R143');
 assert.equal(readStamp('MW release: R143\nmore text'),null,'only a trailing line counts');
 assert.equal(stampDescription(null,'R144'),'MW release: R144');
 assert.equal(stampDescription('Loan reports  \n','R144'),'Loan reports\n\nMW release: R144');
 assert.equal(stampDescription('Loan reports\n\nMW release: R143','R144'),'Loan reports\n\nMW release: R144');
 assert.equal(stampDescription(stampDescription('A','R144'),'R144'),'A\n\nMW release: R144','idempotent');
 for(const bad of ['r144','R14','','R144\n'])assert.throws(()=>stampDescription('A',bad),/--release must look like R144/);
});

function fakeApi(collection){
 const calls=[];
 const api=async(method,route,body)=>{calls.push([method,route,body]);assert.equal(route,'collection/'+COLLECTION);if(method==='PUT')Object.assign(collection,body);return {...collection};};
 return {api,calls};
}
test('--check only reads; --apply writes the line once and reads it back',async()=>{
 const live={id:COLLECTION,name:COLLECTION_NAME,archived:false,description:'Dashboard 32'};
 const {api,calls}=fakeApi(live);
 assert.deepEqual(await check({api}),{collection:10,name:COLLECTION_NAME,stamp:null});
 assert.deepEqual(calls.map(c=>c[0]),['GET']);
 assert.deepEqual(await apply({api,release:'R144'}),{collection:10,stamp:'R144',changed:true,previous:null});
 assert.equal(live.description,'Dashboard 32\n\nMW release: R144');
 assert.deepEqual(calls.map(c=>c[0]),['GET','GET','PUT','GET']);
 assert.deepEqual(await apply({api,release:'R144'}),{collection:10,stamp:'R144',changed:false});
 assert.equal(calls.filter(c=>c[0]==='PUT').length,1,'an unchanged stamp writes nothing');
});
test('a different, renamed or archived collection, or a read-back mismatch, is refused',async()=>{
 for(const live of [{id:11,name:COLLECTION_NAME},{id:10,name:'Other'},{id:10,name:COLLECTION_NAME,archived:true}]){
  const {api,calls}=fakeApi(live);
  await assert.rejects(apply({api,release:'R144'}),/refusing/);assert.equal(calls.filter(c=>c[0]==='PUT').length,0);
 }
 const ignoring=async(method)=>method==='PUT'?{}:{id:10,name:COLLECTION_NAME,description:'x'};
 await assert.rejects(apply({api:ignoring,release:'R144'}),/read-back mismatch/);
});
