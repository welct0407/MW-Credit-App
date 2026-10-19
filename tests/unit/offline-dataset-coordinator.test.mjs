import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {encodeDeltaChunk} from '../../services/api/offline-dataset-delta.mjs';

// R078 item 2 (client): two data domains in flight, no settle delay inside a walk, fewer durable
// progress writes with a correct resume, and one records check standing in for unchanged peers.
const transpile=file=>ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const source=transpile('offline-dataset.ts'),patchModule=(()=>{const sandbox={exports:{}};runInNewContext(transpile('dataset-patch.ts'),sandbox);return sandbox.exports})();
const origin='https://lm.example.invalid',stamp={asOf:'2026-10-19T01:00:00.000Z',businessDate:'2026-10-19'};
const data=['records','collection','cash','management'],all=[...data,'notifications'];
const version=domain=>domain.length.toString(16).padStart(2,'0').repeat(32);
const changed=domain=>'f'.repeat(62)+domain.length.toString(16).padStart(2,'0');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(predicate,limit=4000){const started=Date.now();while(!predicate()){if(Date.now()-started>limit)throw Error('Timed out');await new Promise(resolve=>setTimeout(resolve,5))}}

/** In-memory repository with the owner-offline.ts write checks that matter here (revision, expected cursor). */
function repository(bundles){
 const rows=new Map(Object.entries(bundles).map(([domain,value])=>['dataset:'+domain,structuredClone(value)])),log=[];
 const progress=domain=>rows.get('dataset-progress:'+domain)??null;
 return {log,rows,scopeName:'synthetic-scope',environment:'synthetic',
  syncAuthorized:async()=>true,readRevision:async()=>0,
  readDataset:async domain=>{const row=rows.get('dataset:'+domain);return row?{...structuredClone(row),cacheStale:false}:null},
  readDatasetProgress:async domain=>structuredClone(progress(domain)),
  discardDatasetProgress:async domain=>{rows.delete('dataset-progress:'+domain)},
  saveDatasetProgress:async(domain,value,revision,expected)=>{if(revision!==0||expected!==undefined&&(progress(domain)?.nextCursor??null)!==expected){log.push(['progress-refused',domain]);return false}rows.set('dataset-progress:'+domain,structuredClone(value));log.push(['progress',domain,value.nextCursor]);return true},
  saveDataset:async(domain,value,revision,expected)=>{if(revision!==0||expected!==undefined&&(progress(domain)?.nextCursor??null)!==expected){log.push(['dataset-refused',domain,expected]);return false}rows.set('dataset:'+domain,structuredClone(value));rows.delete('dataset-progress:'+domain);log.push(['dataset',domain]);return true},
  readDatasetMedia:async()=>null,listDatasetMediaKeys:async()=>[],removeDatasetMedia:async()=>{},saveDatasetMedia:async()=>true,
 };
}
const complete=domain=>({schemaVersion:1,protocolVersion:3,domain,complete:true,generation:'old-'+domain,asOf:stamp.asOf,businessDate:stamp.businessDate,sourceVersion:version(domain),data:{items:[{id:'old'}]},contentValues:{}});

/** Synthetic server: `walks[domain]` is the number of chunks of a changed walk; other domains are unchanged. */
function harness({walks={},failOnce=null,rejectVersions=false,patched=[],cursors=false,v4=null}={}){
 const requests=[],flights=new Map(),timers=[];let inflight=0,maxInflight=0;
 const window=new EventTarget(),document=Object.assign(new EventTarget(),{visibilityState:'visible'});
 const repo=repository(Object.fromEntries(all.map(domain=>[domain,cursors&&domain==='records'?{...complete(domain),changes:{seq:'10',xmin:'500',businessDate:stamp.businessDate},data:{items:[{id:'old'},{id:'gone'}],paymentMonths:[{borrowerId:'b1',month:'2026-10'},{borrowerId:'b2',month:'2026-10'}]}}:patched.includes(domain)?{...complete(domain),localPending:['own-request'],data:{items:[{id:'local',localPending:{requestId:'own-request',at:1}}]}}:complete(domain)])));
 const reply=(status,json)=>({status,ok:status>=200&&status<300,json:async()=>structuredClone(json),blob:async()=>null});
 async function fetch(url,init){
  const target=new URL(url),domain=target.searchParams.get('domain')??'notifications',body=JSON.parse(init.body??'{}');
  requests.push({domain,cursor:body.cursor,sourceVersion:body.sourceVersion,since:body.since??null,need:body.need?.length??0,versions:body.versions===true,acceptChanged:body.acceptChanged===true,at:Date.now()});
  inflight++;maxInflight=Math.max(maxInflight,inflight);flights.set(domain,(flights.get(domain)??0)+1);assert.equal(flights.get(domain),1,'one request per domain at a time');
  try{
   await tick();
   if(rejectVersions&&body.versions)return reply(400,{code:'invalid_request'});
   if(v4&&body.since&&domain==='records')return reply(200,{...encodeDeltaChunk({domain,generation:'v4:20',startedAt:stamp.asOf,...stamp,sourceVersion:changed(domain),delta:true,patches:v4.patches,complete:true,nextCursor:null,progress:{completed:1,total:1},changes:{seq:'20',xmin:'600',businessDate:stamp.businessDate}},body.need??[]),schemaVersion:4});
   const step=body.cursor?Number(body.cursor):0;
   if(failOnce&&failOnce.domain===domain&&failOnce.step===step&&!failOnce.done){failOnce.done=true;return reply(503,{code:'temporary'})}
   const versions=body.versions&&!body.cursor?{versions:Object.fromEntries(data.map(name=>[name,walks[name]?changed(name):version(name)]))}:{};
   if(!walks[domain]&&body.sourceVersion===version(domain))return reply(200,{schemaVersion:3,domain,...stamp,sourceVersion:version(domain),unchanged:true,patches:[],values:{},complete:true,nextCursor:null,progress:{completed:1,total:1},...versions});
   const chunks=walks[domain]??1,last=step===chunks-1;
   return reply(200,encodeDeltaChunk({schemaVersion:2,domain,generation:'new-'+domain,startedAt:stamp.asOf,...stamp,sourceVersion:walks[domain]?changed(domain):version(domain),patches:[{key:'items',mode:'append',value:[{id:domain+'-'+step}]}],complete:last,nextCursor:last?null:String(step+1),progress:{completed:step+1,total:chunks},...versions},body.need??[]));
  }finally{inflight--;flights.set(domain,flights.get(domain)-1)}
 }
 const trackedTimeout=(callback,delay)=>{timers.push(delay);return setTimeout(callback,delay)};
 const sandbox={exports:{},require:name=>name==='./request-activity'?{activitySnapshot:()=>0,subscribeActivity:()=>()=>{}}:name==='./dataset-patch'?patchModule:(()=>{throw Error('Unexpected import '+name)})(),
  window,document,navigator:{onLine:true},fetch,setTimeout:trackedTimeout,clearTimeout,URL,crypto:globalThis.crypto,TextEncoder,structuredClone,Intl,CustomEvent,Event,AbortController,console};
 runInNewContext(source,sandbox);
 const events=[];window.addEventListener('mw-offline-dataset-ready',event=>events.push(event.detail.domain+':'+event.detail.changed));
 const stop=sandbox.exports.startOfflinePreparation({origin,offline:repo,token:async()=>'synthetic',authFailure:()=>{}});
 const state=()=>sandbox.exports.getOfflinePreparation(repo.scopeName);
 return {requests,repo,events,stop,state,timers,maxInflight:()=>maxInflight,window};
}
const settled=async h=>{await until(()=>h.state().state==='ready'&&!h.state().domainsPending&&h.state().lastChecked!==null)};

test('an unchanged check is one records request carrying every domain version, plus notifications',async()=>{
 const h=harness();try{
  await settled(h);
  assert.deepEqual(h.requests.map(request=>request.domain).sort(),['notifications','records']);
  assert.equal(h.requests.find(request=>request.domain==='records').versions,true);
  assert.deepEqual([...h.events].sort(),all.map(domain=>domain+':false').sort());
  assert.equal(h.repo.log.length,0,'no bundle or progress is rewritten');
 }finally{h.stop()}
});
test('a changed peer walks while records confirms; two data domains run at once, never one twice',async()=>{
 const h=harness({walks:{records:6,cash:3}});try{
  await settled(h);
  const domainsAsked=new Set(h.requests.map(request=>request.domain));
  assert.deepEqual([...domainsAsked].sort(),['cash','notifications','records'],'unchanged collection/management were confirmed by the records answer');
  assert.ok(h.maxInflight()<=2&&h.maxInflight()>=2,'max in flight '+h.maxInflight());
  assert.equal(h.repo.rows.get('dataset:records').sourceVersion,changed('records'));assert.deepEqual(h.repo.rows.get('dataset:records').data.items.map(item=>item.id),['records-0','records-1','records-2','records-3','records-4','records-5']);
  assert.equal(h.repo.rows.get('dataset:cash').data.items.length,3);
  assert.ok(h.events.includes('records:true')&&h.events.includes('cash:true')&&h.events.includes('collection:false'));
 }finally{h.stop()}
});
test('a walk in progress continues without the settle delay and writes progress for chunk 1, then every 4',async()=>{
 const h=harness({walks:{records:7}});try{
  await settled(h);
  const records=h.requests.filter(request=>request.domain==='records'&&!request.need);
  assert.equal(records.length,7);
  // Each chunk is a manifest plus one content request; no 200 ms timer separates the chunks of a walk.
  assert.equal(h.timers.filter(delay=>delay===200).length<=2,true,'settle timers '+h.timers.filter(delay=>delay===200).length);
  assert.ok(records.at(-1).at-records[0].at<150,'walk took '+(records.at(-1).at-records[0].at)+' ms');
  assert.deepEqual(h.repo.log.filter(entry=>entry[1]==='records'),[['progress','records','1'],['progress','records','5'],['dataset','records']]);
 }finally{h.stop()}
});
test('a failed segment keeps the chunks applied in memory; the retry resumes after them',async()=>{
 const failOnce={domain:'records',step:3};const h=harness({walks:{records:5},failOnce});try{
  await until(()=>failOnce.done&&h.state().failedDomains==='records');
  assert.equal(h.repo.rows.get('dataset-progress:records').nextCursor,'3','the unsaved chunks 2 and 3 were written when the segment failed');
  assert.deepEqual(h.repo.rows.get('dataset-progress:records').data.items.map(item=>item.id),['records-0','records-1','records-2']);
  h.window.dispatchEvent(new Event('focus'));await settled(h);
  const cursors=h.requests.filter(request=>request.domain==='records'&&!request.need).map(request=>request.cursor??'start');
  assert.deepEqual(cursors,['start','1','2','3','3','4']);
  assert.deepEqual(h.repo.rows.get('dataset:records').data.items.map(item=>item.id),['records-0','records-1','records-2','records-3','records-4']);
 }finally{h.stop()}
});
test('a server without the versions field is asked again without it and keeps acceptChanged',async()=>{
 const h=harness({rejectVersions:true});try{
  await settled(h);
  const records=h.requests.filter(request=>request.domain==='records');
  assert.deepEqual(records.map(request=>[request.versions,request.acceptChanged]),[[true,true],[false,true]]);
  assert.deepEqual(h.requests.map(request=>request.domain).sort(),['cash','collection','management','notifications','records','records']);
 }finally{h.stop()}
});

// R078 item 6: an own write is confirmed in the domains it touches, and a locally patched bundle always walks.
test('an own write confirms records, collection and cash only, not a full cycle',async()=>{
 const h=harness();try{
  await settled(h);h.requests.length=0;
  h.window.dispatchEvent(new Event('mw-read-invalidated'));await until(()=>h.requests.length>0);await settled(h);
  assert.deepEqual([...new Set(h.requests.map(request=>request.domain))],['records'],'collection and cash were confirmed by the records versions answer');
  assert.ok(h.events.includes('cash:false')&&h.events.includes('collection:false'));
 }finally{h.stop()}
});
test('a bundle with a locally applied own write walks instead of accepting an unchanged answer',async()=>{
 const h=harness({patched:['records','collection']});try{
  await settled(h);
  const records=h.requests.find(request=>request.domain==='records'&&!request.need),collection=h.requests.find(request=>request.domain==='collection'&&!request.need);
  assert.equal(records.sourceVersion,null);assert.ok(collection,'the patched peer is not confirmed by the versions answer');assert.equal(collection.sourceVersion,null);
  for(const domain of ['records','collection']){const bundle=h.repo.rows.get('dataset:'+domain);assert.equal(bundle.localPending,undefined);assert.deepEqual(bundle.data.items.map(item=>item.id),[domain+'-0']);assert.equal(bundle.sourceVersion,version(domain))}
  assert.equal(h.requests.some(request=>request.domain==='cash'),false);
 }finally{h.stop()}
});

// R078 protocol v4: a records bundle with a change cursor receives only the changed rows.
test('a v4 records delta upserts and removes rows, stores the new cursor and fingerprint, and never walks',async()=>{
 const patches=[{key:'items',mode:'upsert',value:[{id:'old',name:'changed'},{id:'new'}]},{key:'items',mode:'remove',value:['gone']},{key:'paymentMonths',mode:'remove',by:'borrowerId',value:['b1']},{key:'paymentMonths',mode:'append',value:[{borrowerId:'b1',month:'2026-10',count:2}]}];
 const h=harness({cursors:true,v4:{patches}});try{
  await settled(h);
  const records=h.requests.filter(request=>request.domain==='records');
  assert.deepEqual(JSON.parse(JSON.stringify(records[0].since)),{seq:'10',xmin:'500',businessDate:stamp.businessDate});assert.ok(records.every(request=>!request.cursor),'no walk');
  const bundle=h.repo.rows.get('dataset:records');
  assert.deepEqual(bundle.data.items,[{id:'old',name:'changed'},{id:'new'}]);assert.deepEqual(bundle.data.paymentMonths,[{borrowerId:'b2',month:'2026-10'},{borrowerId:'b1',month:'2026-10',count:2}]);
  assert.deepEqual(bundle.changes,{seq:'20',xmin:'600',businessDate:stamp.businessDate});assert.equal(bundle.sourceVersion,changed('records'));
  assert.ok(h.events.includes('records:true'));assert.equal(h.repo.rows.has('dataset-progress:records'),false);
 }finally{h.stop()}
});
