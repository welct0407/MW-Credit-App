import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {encodeDeltaChunk} from '../../services/api/offline-dataset-delta.mjs';
import {createHash} from 'node:crypto';
const sha256=text=>createHash('sha256').update(text).digest('hex');

// R078 item 2 (client): two data domains in flight, no settle delay inside a walk, fewer durable
// progress writes with a correct resume, and one records check standing in for unchanged peers.
const transpile=file=>ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const source=transpile('offline-dataset.ts'),patchModule=await import('../../services/lib/offline-dataset-digest.mjs');
const origin='https://lm.example.invalid',stamp={asOf:'2026-10-19T01:00:00.000Z',businessDate:'2026-10-19'};
const data=['records','collection','cash','management'],all=[...data,'notifications'];
const version=domain=>domain.length.toString(16).padStart(2,'0').repeat(32);
const changed=domain=>'f'.repeat(62)+domain.length.toString(16).padStart(2,'0');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(predicate,limit=4000){const started=Date.now();while(!predicate()){if(Date.now()-started>limit)throw Error('Timed out');await new Promise(resolve=>setTimeout(resolve,5))}}

/** In-memory repository with the owner-offline.ts write checks that matter here (revision, expected cursor). */
function repository(bundles){
 const rows=new Map(Object.entries(bundles).map(([domain,value])=>['dataset:'+domain,structuredClone(value)])),log=[];
 const progress=domain=>rows.get('dataset-progress:'+domain)??null,saves=[];
 return {log,rows,saves,scopeName:'synthetic-scope',environment:'synthetic',
  syncAuthorized:async()=>true,readRevision:async()=>0,readCacheRevision:async()=>0,
  readReconciledAt:async()=>rows.get('meta:reconciled-at')??null,saveReconciledAt:async at=>{rows.set('meta:reconciled-at',at);log.push(['reconciled',at]);return true},
  readReconcileFlags:async()=>structuredClone(rows.get('meta:reconcile-flags')??[]),saveReconcileFlags:async flags=>{if(flags.length)rows.set('meta:reconcile-flags',structuredClone(flags));else rows.delete('meta:reconcile-flags');log.push(['flags',flags.map(flag=>flag.domain)]);return true},
  readReconcileAttempt:async()=>structuredClone(rows.get('meta:reconcile-tried-at')??null),saveReconcileAttempt:async attempt=>{if(attempt)rows.set('meta:reconcile-tried-at',structuredClone(attempt));else rows.delete('meta:reconcile-tried-at');log.push(['attempt',attempt&&structuredClone(attempt)]);return true},
  readDataset:async domain=>{const row=rows.get('dataset:'+domain);return row?{...structuredClone(row),cacheStale:false}:null},
  readDatasetProgress:async domain=>structuredClone(progress(domain)),
  discardDatasetProgress:async domain=>{rows.delete('dataset-progress:'+domain)},
  saveDatasetProgress:async(domain,value,revision,expected)=>{if(revision!==0||expected!==undefined&&(progress(domain)?.nextCursor??null)!==expected){log.push(['progress-refused',domain]);return false}rows.set('dataset-progress:'+domain,structuredClone(value));log.push(['progress',domain,value.nextCursor]);return true},
  saveDataset:async(domain,value,revision,expected)=>{if(revision!==0||expected!==undefined&&(progress(domain)?.nextCursor??null)!==expected){log.push(['dataset-refused',domain,expected]);return false}rows.set('dataset:'+domain,structuredClone(value));rows.delete('dataset-progress:'+domain);log.push(['dataset',domain]);saves.push([domain,structuredClone(value)]);return true},
  readDatasetMedia:async()=>null,listDatasetMediaKeys:async()=>[],removeDatasetMedia:async()=>{},saveDatasetMedia:async()=>true,
 };
}
const complete=domain=>({schemaVersion:1,protocolVersion:3,domain,complete:true,generation:'old-'+domain,asOf:stamp.asOf,businessDate:stamp.businessDate,sourceVersion:version(domain),data:{items:[{id:'old'}]},contentValues:{}});

/** Synthetic server: `walks[domain]` is the number of chunks of a changed walk; other domains are unchanged. */
function harness({walks={},failOnce=null,rejectVersions=false,patched=[],cursors=false,v4=null,reconciledAt,clockOffset=0,corrupt=[],failReconcile=new Set(),dropReconcile=new Set(),stored={},attempt,dayChange=null,rejectDates=false,reconcileTruth={},flags,rowDelta=null}={}){
 const navigator={onLine:true};
 const requests=[],flights=new Map(),timers=[],reconciles=[],clientEvents=[];let inflight=0,maxInflight=0;
 const window=new EventTarget(),document=Object.assign(new EventTarget(),{visibilityState:'visible'});
 const repo=repository(Object.fromEntries(all.map(domain=>[domain,corrupt.includes(domain)?{...complete(domain),data:{items:[{id:'old',corrupted:true}]}}:cursors&&domain==='records'?{...complete(domain),changes:{seq:'10',xmin:'500',businessDate:stamp.businessDate},data:{items:[{id:'old'},{id:'gone'}],paymentMonths:[{borrowerId:'b1',month:'2026-10'},{borrowerId:'b2',month:'2026-10'}]}}:patched.includes(domain)?{...complete(domain),localPending:['own-request'],data:{items:[{id:'local',localPending:{requestId:'own-request',at:1}}]}}:stored[domain]??complete(domain)])));
 const reply=(status,json)=>({status,ok:status>=200&&status<300,json:async()=>structuredClone(json),blob:async()=>null});
 async function fetch(url,init){
  const target=new URL(url),domain=target.searchParams.get('domain')??'notifications',body=JSON.parse(init.body??'{}');
  requests.push({domain,cursor:body.cursor,sourceVersion:body.sourceVersion,since:body.since??null,dates:body.dates===true,rowDeltas:body.rowDeltas===true,need:body.need?.length??0,versions:body.versions===true,acceptChanged:body.acceptChanged===true,at:Date.now()});
  inflight++;maxInflight=Math.max(maxInflight,inflight);flights.set(domain,(flights.get(domain)??0)+1);assert.equal(flights.get(domain),1,'one request per domain at a time');
  try{
   await tick();
   if(body.reconcile&&dropReconcile.has(domain)){reconciles.push({domain,result:'dropped'});navigator.onLine=false;throw TypeError('Failed to fetch')}
   if(body.reconcile&&failReconcile.has(domain)){reconciles.push({domain,result:'failed'});return reply(503,{code:'temporary'})}
   if(body.reconcile){const truth=await patchModule.datasetDigests(reconcileTruth[domain]??complete(domain).data,sha256),keys=patchModule.digestDifferences(truth,body.digests);reconciles.push({domain,result:keys.length?'mismatch':'match',keys});
    return reply(200,{schemaVersion:3,domain,...stamp,reconcile:true,result:body.sourceVersion!==version(domain)&&!walks[domain]?'stale':keys.length?'mismatch':'match',keys,patches:[],values:{},complete:true,nextCursor:null})}
   if(rejectVersions&&body.versions)return reply(400,{code:'invalid_request'});
   if(rejectDates&&body.dates)return reply(400,{code:'invalid_request'});
   if(rowDelta&&body.rowDeltas&&body.since&&!body.cursor&&rowDelta.domain===domain)return reply(200,{...encodeDeltaChunk({domain,generation:'v4:40',startedAt:stamp.asOf,...stamp,sourceVersion:changed(domain),delta:true,patches:rowDelta.patches,scope:rowDelta.scope,complete:true,nextCursor:null,progress:{completed:1,total:1},changes:{seq:'40',xmin:'800',businessDate:stamp.businessDate}},body.need??[],{dates:true}),schemaVersion:4});
   // R078 day change: a since request of an earlier business date re-reads in dayChange.chunks responses.
   const dayStamp={asOf:'2026-10-20T01:00:00.000Z',businessDate:'2026-10-20'},dayStep=typeof body.cursor==='string'&&body.cursor.startsWith('day:')?Number(body.cursor.slice(4)):body.since&&body.dates&&dayChange?.domains.includes(domain)?0:null;
   if(dayStep!==null){
    const last=dayStep===dayChange.chunks.length-1,chunk={domain,generation:'day-'+domain,startedAt:dayStamp.asOf,...dayStamp,sourceVersion:changed(domain),patches:dayChange.chunks[dayStep],complete:last,nextCursor:last?null:'day:'+(dayStep+1),progress:{completed:dayStep+1,total:dayChange.chunks.length}};
    return reply(200,dayStep===0?{...encodeDeltaChunk({...chunk,delta:true,dayChange:{from:stamp.businessDate,keep:dayChange.keep,reread:dayChange.reread},changes:{seq:'30',xmin:'700',businessDate:dayStamp.businessDate}},body.need??[],{dates:true}),schemaVersion:4}:encodeDeltaChunk({...chunk,dayChange:{from:stamp.businessDate}},body.need??[],{dates:true}));
   }
   if(v4&&body.since&&domain==='records')return reply(200,{...encodeDeltaChunk({domain,generation:'v4:20',startedAt:stamp.asOf,...stamp,sourceVersion:changed(domain),delta:true,patches:v4.patches,complete:true,nextCursor:null,progress:{completed:1,total:1},changes:{seq:'20',xmin:'600',businessDate:stamp.businessDate}},body.need??[]),schemaVersion:4});
   const step=body.cursor?Number(body.cursor):0;
   if(failOnce&&failOnce.domain===domain&&failOnce.step===step&&!failOnce.done){failOnce.done=true;return reply(503,{code:'temporary'})}
   const versions=body.versions&&!body.cursor?{versions:Object.fromEntries(data.map(name=>[name,walks[name]?changed(name):version(name)]))}:{};
   if(!walks[domain]&&body.sourceVersion===version(domain))return reply(200,{schemaVersion:3,domain,...stamp,sourceVersion:version(domain),unchanged:true,patches:[],values:{},complete:true,nextCursor:null,progress:{completed:1,total:1},...versions});
   const chunks=walks[domain]??1,last=step===chunks-1;
   return reply(200,encodeDeltaChunk({schemaVersion:2,domain,generation:'new-'+domain,startedAt:stamp.asOf,...stamp,sourceVersion:walks[domain]?changed(domain):version(domain),patches:[{key:'items',mode:'append',value:[walks[domain]?{id:domain+'-'+step}:{id:'old'}]}],complete:last,nextCursor:last?null:String(step+1),progress:{completed:step+1,total:chunks},...versions},body.need??[]));
  }finally{inflight--;flights.set(domain,flights.get(domain)-1)}
 }
 const trackedTimeout=(callback,delay)=>{timers.push(delay);return setTimeout(callback,delay)};
 let offset=clockOffset;
 class Clock extends Date{constructor(...args){if(args.length)super(...args);else super(Date.now()+offset)}static now(){return Date.now()+offset}}
 const sandbox={Date:Clock,exports:{},require:name=>name==='./client-events'?{recordClientEvent:event=>clientEvents.push(event)}:name==='./request-activity'?{activitySnapshot:()=>0,subscribeActivity:()=>()=>{}}:name==='./dataset-patch'?patchModule:(()=>{throw Error('Unexpected import '+name)})(),
  window,document,navigator,fetch,setTimeout:trackedTimeout,clearTimeout,URL,crypto:globalThis.crypto,TextEncoder,structuredClone,Intl,CustomEvent,Event,AbortController,console};
 runInNewContext(source,sandbox);
 const events=[];window.addEventListener('mw-offline-dataset-ready',event=>events.push(event.detail.domain+':'+event.detail.changed));
 const stop=sandbox.exports.startOfflinePreparation({origin,offline:repo,token:async()=>'synthetic',authFailure:()=>{}});
 const state=()=>sandbox.exports.getOfflinePreparation(repo.scopeName);
 if(reconciledAt!==undefined)repo.rows.set('meta:reconciled-at',reconciledAt);
 if(attempt!==undefined)repo.rows.set('meta:reconcile-tried-at',attempt);
 if(flags!==undefined)repo.rows.set('meta:reconcile-flags',flags);
 return {navigator,advance:ms=>{offset+=ms},reconcileSlot:sandbox.exports.reconcileSlot,reconciles,clientEvents,requests,repo,events,stop,state,timers,maxInflight:()=>maxInflight,window,subscribe:listener=>sandbox.exports.subscribeOfflinePreparation(listener)};
}
const settled=async h=>{await until(()=>h.state().state==='ready'&&!h.state().domainsPending&&h.state().lastChecked!==null)};

test('an unchanged check is one records request carrying every domain version, plus notifications',async()=>{
 const h=harness();try{
  await settled(h);
  assert.deepEqual(h.requests.map(request=>request.domain).sort(),['notifications','records']);
  assert.equal(h.requests.find(request=>request.domain==='records').versions,true);
  assert.deepEqual([...h.events].sort(),all.map(domain=>domain+':false').sort());
  assert.equal(h.repo.log.filter(entry=>entry[0]!=='reconciled').length,0,'no bundle or progress is rewritten');
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
  // Each 400 drops one level: dates (4), then versions (2); acceptChanged stays.
  assert.deepEqual(records.map(request=>[request.dates,request.versions,request.acceptChanged]),[[true,true,true],[false,true,true],[false,false,true]]);
  assert.deepEqual(h.requests.map(request=>request.domain).sort(),['cash','collection','management','notifications','records','records','records']);
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
  for(const domain of ['records','collection']){const bundle=h.repo.rows.get('dataset:'+domain);assert.equal(bundle.localPending,undefined);assert.deepEqual(bundle.data.items.map(item=>item.id),['old']);assert.equal(bundle.data.items[0].localPending,undefined);assert.equal(bundle.sourceVersion,version(domain))}
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

// UX-FULL (owner, 19 October 2026): Full sync forces a walk of every domain.
test('a full sync walks every domain even when every version matches, and progress never goes back',async()=>{
 const h=harness();try{
  await settled(h);h.requests.length=0;
  const progress=[];const unsubscribe=h.subscribe(()=>progress.push(h.state().progress));
  h.window.dispatchEvent(new CustomEvent('mw-offline-prepare',{detail:{all:true,full:true}}));
  await until(()=>h.requests.length>0);await until(()=>!h.state().fullSync&&!h.state().domainsPending&&h.state().state==='ready');unsubscribe();
  const first=Object.fromEntries(all.map(domain=>[domain,h.requests.find(request=>request.domain===domain&&!request.need)]));
  for(const domain of data){assert.ok(first[domain],domain+' walked');assert.equal(first[domain].sourceVersion,null,domain);assert.equal(first[domain].versions,false,domain);assert.equal(first[domain].since,null,domain)}
  assert.ok(first.notifications);
  for(let index=1;index<progress.length;index++)assert.ok(progress[index]>=progress[index-1]||progress[index]===100,'progress '+progress.join(','));
 }finally{h.stop()}
});
test('a full sync requested during a check walks that domain again afterwards',async()=>{
 const h=harness({walks:{records:3}});try{
  await until(()=>h.requests.some(request=>request.domain==='records'));
  h.window.dispatchEvent(new CustomEvent('mw-offline-prepare',{detail:{all:true,full:true}}));
  await until(()=>!h.state().fullSync&&!h.state().domainsPending&&h.state().state==='ready');
  const records=h.requests.filter(request=>request.domain==='records'&&!request.need);
  assert.ok(records.filter(request=>!request.cursor&&request.sourceVersion===null).length>=1,'a forced records walk started from the beginning');
 }finally{h.stop()}
});

// R078 reconciliation: twice a day, idle and quiet; a mismatch heals through the Full sync path.
const bangkok=(day,hour,minute)=>Date.UTC(2026,9,day,hour-7,minute);
test('reconciliation at 18:01 Bangkok runs once, matches equal data without any walk and records each match',async()=>{
 const offset=bangkok(19,18,1)-Date.now();
 const h=harness({reconciledAt:bangkok(19,6,30),clockOffset:offset});try{
  await settled(h);await until(()=>h.repo.log.some(entry=>entry[0]==='reconciled'));
  assert.deepEqual(h.reconciles.map(entry=>entry.domain+':'+entry.result),['records:match','collection:match','cash:match','management:match']);
  assert.equal(h.requests.filter(request=>!request.need&&request.sourceVersion===null).length,0,'no walk');
  assert.deepEqual(h.clientEvents.map(event=>event.kind+':'+event.code),['reconcile-match:records','reconcile-match:collection','reconcile-match:cash','reconcile-match:management']);
  // Later idle moments in the same slot do not reconcile again.
  const before=h.requests.length;h.window.dispatchEvent(new Event('focus'));await until(()=>h.requests.length>before);await settled(h);await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(h.reconciles.length,4);
 }finally{h.stop()}
});
test('before the next slot nothing reconciles; a first complete download only starts the clock',async()=>{
 const early=harness({reconciledAt:bangkok(19,6,30),clockOffset:bangkok(19,17,59)-Date.now()});try{await settled(early);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(early.reconciles.length,0)}finally{early.stop()}
 const first=harness({clockOffset:bangkok(19,18,1)-Date.now()});try{await settled(first);await until(()=>first.repo.rows.has('meta:reconciled-at'));assert.equal(first.reconciles.length,0)}finally{first.stop()}
});
test('a corrupted stored domain is named, logged and healed by a forced walk',async()=>{
 const h=harness({reconciledAt:bangkok(18,18,30),clockOffset:bangkok(19,6,5)-Date.now(),corrupt:['cash']});try{
  await settled(h);await until(()=>h.repo.log.some(entry=>entry[0]==='reconciled'),6000);
  const mismatch=h.clientEvents.find(event=>event.kind==='reconcile-mismatch');assert.deepEqual({code:mismatch.code,message:mismatch.message},{code:'cash',message:'items'});
  assert.ok(h.requests.some(request=>request.domain==='cash'&&!request.need&&request.sourceVersion===null),'the domain walked');
  assert.deepEqual(JSON.parse(JSON.stringify(h.repo.rows.get('dataset:cash').data)),{items:[{id:'old'}]});
  assert.equal(h.reconciles.filter(entry=>entry.domain==='cash').at(-1).result,'match','reconciled again after healing');
 }finally{h.stop()}
});
// Chase on 35bdda2: a failed pass is not retried at every poll, a future stored time does not switch reconciliation off,
// and a heal survives a reload.
const idle=async h=>{const before=h.requests.length;h.window.dispatchEvent(new Event('focus'));await until(()=>h.requests.length>before);await settled(h);await new Promise(resolve=>setTimeout(resolve,150))};
test('a failed pass waits 30 minutes, then asks only the domains it did not finish',async()=>{
 const failReconcile=new Set(['cash']),h=harness({reconciledAt:bangkok(19,6,30),clockOffset:bangkok(19,18,1)-Date.now(),failReconcile});try{
  await settled(h);await until(()=>h.repo.rows.has('meta:reconcile-tried-at'));
  assert.deepEqual(h.reconciles.map(entry=>entry.domain+':'+entry.result),['records:match','collection:match','cash:failed']);
  const tried=h.repo.rows.get('meta:reconcile-tried-at');assert.deepEqual(JSON.parse(JSON.stringify(tried.done)),['records','collection']);assert.equal(tried.slot,bangkok(19,18,0));
  assert.equal(h.repo.rows.get('meta:reconciled-at'),bangkok(19,6,30),'the pass is not recorded as done');
  for(let poll=0;poll<3;poll++)await idle(h);
  assert.equal(h.reconciles.length,3,'no retry inside the back-off');
  failReconcile.clear();h.advance(31*60*1000);await idle(h);await until(()=>h.repo.log.some(entry=>entry[0]==='reconciled'));
  assert.deepEqual(h.reconciles.slice(3).map(entry=>entry.domain+':'+entry.result),['cash:match','management:match'],'finished domains are not asked again');
  assert.equal(h.repo.rows.has('meta:reconcile-tried-at'),false,'a completed pass clears the attempt');
 }finally{h.stop()}
});
test('a reconciled-at or tried-at in the future counts as due, not as done',async()=>{
 const now=bangkok(19,18,1),future=now+2*24*3600*1000;
 const h=harness({reconciledAt:future,clockOffset:now-Date.now(),attempt:{at:future,slot:bangkok(19,18,0),done:['records','collection']}});try{
  await settled(h);await until(()=>h.repo.log.some(entry=>entry[0]==='reconciled'));
  assert.deepEqual(h.reconciles.map(entry=>entry.domain+':'+entry.result),['records:match','collection:match','cash:match','management:match']);
  const saved=h.repo.rows.get('meta:reconciled-at');assert.ok(saved>=now&&saved<future,'the stored time is corrected to now');
 }finally{h.stop()}
});
test('a heal clears the change cursor and is marked needsWalk; after a reload the marked domain walks instead of a v4 delta',async()=>{
 const h=harness({reconciledAt:bangkok(18,18,30),clockOffset:bangkok(19,6,5)-Date.now(),corrupt:['cash']});try{
  await settled(h);await until(()=>h.repo.log.some(entry=>entry[0]==='reconciled'),6000);
  const saves=h.repo.saves.filter(entry=>entry[0]==='cash').map(entry=>entry[1]);
  assert.equal(saves[0].needsWalk,true);assert.equal(saves[0].sourceVersion,null);assert.equal('changes' in saves[0],false);
  assert.equal('needsWalk' in saves.at(-1),false,'the walk commits a bundle without the marker');
 }finally{h.stop()}
 // A reload before the walk: the stored records bundle still has a (stale) cursor and a v4 server would answer a delta.
 const marked={...complete('records'),sourceVersion:null,needsWalk:true,changes:{seq:'10',xmin:'500',businessDate:stamp.businessDate},data:{items:[{id:'old',corrupted:true}]}};
 const r=harness({stored:{records:marked},v4:{patches:[]}});try{
  await settled(r);
  const records=r.requests.filter(request=>request.domain==='records');
  assert.ok(records.length>=1);assert.ok(records.every(request=>request.since===null),'no v4 delta');assert.equal(records[0].sourceVersion,null);
  const bundle=r.repo.rows.get('dataset:records');assert.equal('needsWalk' in bundle,false);assert.deepEqual(JSON.parse(JSON.stringify(bundle.data)),{items:[{id:'old'}]});
 }finally{r.stop()}
});
test('a reconcile request lost to a dropped connection does not start the back-off',async()=>{
 const dropReconcile=new Set(['collection']),h=harness({reconciledAt:bangkok(19,6,30),clockOffset:bangkok(19,18,1)-Date.now(),dropReconcile});try{
  await settled(h);await until(()=>h.reconciles.some(entry=>entry.result==='dropped'));await new Promise(resolve=>setTimeout(resolve,100));
  const tried=h.repo.rows.get('meta:reconcile-tried-at');assert.ok(!tried||tried.at===0,'no back-off time stored');
  assert.deepEqual(h.reconciles.map(entry=>entry.domain+':'+entry.result),['records:match','collection:dropped']);
  // Back online within the same minute: the pass resumes at once, without asking records again.
  dropReconcile.clear();h.navigator.onLine=true;h.window.dispatchEvent(new Event('online'));h.window.dispatchEvent(new Event('focus'));await until(()=>h.repo.log.some(entry=>entry[0]==='reconciled'));
  assert.deepEqual(h.reconciles.slice(2).map(entry=>entry.domain+':'+entry.result),['collection:match','cash:match','management:match']);
 }finally{h.stop()}
});
// R078 day change (client): kept keys move to the new date, the re-read arrives over several chunks, any doubt walks.
const dayBundle=(extra={})=>({...complete('cash'),changes:{seq:'10',xmin:'500',businessDate:stamp.businessDate},data:{items:[{id:'old',businessDate:stamp.businessDate,asOf:stamp.asOf}],overview:{balance:'0',businessDate:stamp.businessDate},...extra}});
const dayChunks=[[{key:'overview',mode:'replace',value:{balance:'1',businessDate:'2026-10-20'}}],[{key:'statementsByKey',mode:'append',value:[{id:'s1',businessDate:'2026-10-20'}]}]];
test('a day change keeps the listed keys with the new business date and applies a re-read of several chunks',async()=>{
 const h=harness({walks:{cash:1},stored:{cash:dayBundle()},dayChange:{domains:['cash'],keep:['items'],reread:['overview','statementsByKey'],chunks:dayChunks}});try{
  await settled(h);
  const cash=h.requests.filter(request=>request.domain==='cash');
  assert.ok(cash[0].since&&cash[0].dates,'a cash check sends its change cursor and dates');
  assert.ok(cash.some(request=>request.cursor==='day:1'),'the re-read continues');assert.ok(cash.every(request=>request.cursor===undefined||request.cursor===null||String(request.cursor).startsWith('day:')),'no walk');
  const bundle=JSON.parse(JSON.stringify(h.repo.rows.get('dataset:cash')));
  assert.deepEqual(bundle.data,{items:[{id:'old',businessDate:'2026-10-20',asOf:stamp.asOf}],overview:{balance:'1',businessDate:'2026-10-20'},statementsByKey:[{id:'s1',businessDate:'2026-10-20'}]});
  assert.equal(bundle.businessDate,'2026-10-20');assert.equal(bundle.sourceVersion,changed('cash'));assert.deepEqual(bundle.changes,{seq:'30',xmin:'700',businessDate:'2026-10-20'});
  assert.equal('dayChange' in bundle,false,'the marker of a re-read in progress is not committed');
  assert.ok(h.repo.saves.every(([domain,value])=>domain!=='cash'||!('dayChange' in value)));
  assert.ok(h.requests.filter(request=>request.domain==='collection').every(request=>!request.since),'collection never sends a cursor');
 }finally{h.stop()}
});
test('a day change walks instead when the bundle holds a key the server did not name or a kept key reads the date',async()=>{
 for(const [label,bundle] of [['unlisted key',dayBundle({legacy:[1]})],['kept key with another date',dayBundle({items:[{id:'old',businessDate:'2026-10-01'}]})]]){
  const h=harness({walks:{cash:1},stored:{cash:bundle},dayChange:{domains:['cash'],keep:['items'],reread:['overview','statementsByKey'],chunks:dayChunks}});try{
   await settled(h);
   const cash=h.requests.filter(request=>request.domain==='cash');
   assert.ok(cash[0].since,label);assert.ok(cash.slice(1).some(request=>!request.since&&!request.need),label+': the next request walks');
   assert.deepEqual(JSON.parse(JSON.stringify(h.repo.rows.get('dataset:cash').data)),{items:[{id:'cash-0'}]},label+': the walk replaced the bundle');
  }finally{h.stop()}
 }
});
test('a server without dates is asked again at level 3: records keeps since, cash sends neither',async()=>{
 const h=harness({cursors:true,rejectDates:true,stored:{cash:dayBundle()}});try{
  await settled(h);
  const later=h.requests.filter(request=>!request.dates);
  assert.ok(h.requests.some(request=>request.dates),'level 4 is tried first');
  assert.ok(later.some(request=>request.domain==='records'&&request.since),'records still sends since');
  assert.ok(later.filter(request=>request.domain==='cash').every(request=>!request.since),'cash sends no cursor below level 4');
 }finally{h.stop()}
});
// UX-RECON-03/04: a mismatch that persists after its single heal is flagged (IndexedDB meta) and announced once.
const flagged=h=>(h.repo.rows.get('meta:reconcile-flags')??[]).map(flag=>flag.domain);
test('a mismatch that persists after its heal is flagged once with a notice; a mismatch the heal resolves writes nothing',async()=>{
 const h=harness({reconciledAt:bangkok(18,18,30),clockOffset:bangkok(19,6,5)-Date.now(),reconcileTruth:{cash:{items:[{id:'server-only'}]}}});try{
  await settled(h);await until(()=>flagged(h).includes('cash'),6000);
  assert.deepEqual(h.reconciles.filter(entry=>entry.domain==='cash').map(entry=>entry.result),['mismatch','mismatch'],'one heal, then flagged');
  assert.equal(h.requests.filter(request=>request.domain==='cash'&&!request.need&&request.sourceVersion===null).length,1,'a single heal walk');
  await until(()=>h.state().dataCheckDomains==='cash');
  const flag=h.repo.rows.get('meta:reconcile-flags')[0];assert.equal(flag.notifiedAt,flag.checkedAt);assert.equal(h.state().dataCheckNotice,flag.checkedAt+'|cash');assert.equal(h.state().dataCheckAt,flag.checkedAt);
 }finally{h.stop()}
 const healed=harness({reconciledAt:bangkok(18,18,30),clockOffset:bangkok(19,6,5)-Date.now(),corrupt:['cash']});try{
  await settled(healed);await until(()=>healed.repo.log.some(entry=>entry[0]==='reconciled'),6000);
  assert.equal(healed.repo.log.some(entry=>entry[0]==='flags'),false);assert.equal(healed.state().dataCheckDomains,'');
 }finally{healed.stop()}
});
test('a stored flag survives a reload without a second notice; a normal poll keeps it and a later match clears it',async()=>{
 const stored=[{domain:'cash',checkedAt:bangkok(19,6,0),notifiedAt:bangkok(19,6,0)}];
 const kept=harness({reconciledAt:bangkok(19,6,30),clockOffset:bangkok(19,7,0)-Date.now(),flags:stored});try{
  await settled(kept);await until(()=>kept.state().dataCheckDomains==='cash');assert.equal(kept.state().dataCheckNotice,'','no notice again after a reload');
  await idle(kept);assert.deepEqual(flagged(kept),['cash'],'a normal poll does not clear it');assert.equal(kept.reconciles.length,0);
 }finally{kept.stop()}
 const cleared=harness({reconciledAt:bangkok(19,6,30),clockOffset:bangkok(19,18,1)-Date.now(),flags:stored});try{
  await settled(cleared);await until(()=>cleared.repo.log.some(entry=>entry[0]==='reconciled'));
  assert.deepEqual(flagged(cleared),[]);assert.equal(cleared.state().dataCheckDomains,'');assert.equal(cleared.state().dataCheckNotice,'');
 }finally{cleared.stop()}
});
test('after a Full sync only the flagged areas are checked, outside the slot, and a match clears them',async()=>{
 const h=harness({reconciledAt:bangkok(19,6,30),clockOffset:bangkok(19,7,0)-Date.now(),flags:[{domain:'management',checkedAt:bangkok(19,6,0),notifiedAt:bangkok(19,6,0)}]});try{
  await settled(h);assert.equal(h.reconciles.length,0,'not due');
  h.window.dispatchEvent(new CustomEvent('mw-offline-prepare',{detail:{all:true,full:true}}));
  await until(()=>flagged(h).length===0,6000);
  assert.deepEqual(h.reconciles.map(entry=>entry.domain+':'+entry.result),['management:match']);
  assert.equal(h.repo.rows.get('meta:reconciled-at'),bangkok(19,6,30),'the slot pass is untouched');assert.equal(h.state().dataCheckDomains,'');
 }finally{h.stop()}
});
// R078 row deltas (level 5): collection and cash send rowDeltas with their change cursor and apply replaceWhere.
const rowBundle=()=>({...complete('collection'),changes:{seq:'10',xmin:'500',businessDate:stamp.businessDate},data:{items:[{id:'old'}],charges:[{id:'c1',borrowerId:'A',loanId:'L1'},{id:'c2',borrowerId:'B',loanId:'L2'}]}});
test('a collection row delta replaces one borrower\'s rows in the walk order and stores the new cursor without walking',async()=>{
 const patches=[{key:'charges',mode:'replaceWhere',field:'borrowerId',values:['B'],value:[{id:'c3',borrowerId:'B',loanId:'L2'},{id:'c0',borrowerId:'B',loanId:'L2'}],sort:'id'}];
 const h=harness({walks:{collection:1},stored:{collection:rowBundle()},rowDelta:{domain:'collection',patches,scope:{borrowers:['B'],loans:[]}}});try{
  await settled(h);
  const collection=h.requests.filter(request=>request.domain==='collection');
  assert.ok(collection[0].rowDeltas&&collection[0].since,'collection sends rowDeltas and its cursor');assert.ok(collection.every(request=>!request.cursor),'no walk');
  assert.ok(h.requests.filter(request=>request.domain==='management').every(request=>!request.rowDeltas),'management never asks for row deltas');
  const bundle=JSON.parse(JSON.stringify(h.repo.rows.get('dataset:collection')));
  assert.deepEqual(bundle.data.charges.map(row=>row.id),['c0','c1','c3']);assert.deepEqual(bundle.changes,{seq:'40',xmin:'800',businessDate:stamp.businessDate});assert.equal(bundle.sourceVersion,changed('collection'));
 }finally{h.stop()}
});
test('a collection row delta whose changed loan is still held under another borrower walks instead',async()=>{
 const patches=[{key:'charges',mode:'replaceWhere',field:'borrowerId',values:['B'],value:[{id:'c2',borrowerId:'B',loanId:'L2'}],sort:'id'}];
 const h=harness({walks:{collection:1},stored:{collection:rowBundle()},rowDelta:{domain:'collection',patches,scope:{borrowers:['B'],loans:['L1']}}});try{
  await settled(h);
  const collection=h.requests.filter(request=>request.domain==='collection');
  assert.ok(collection.slice(1).some(request=>!request.since&&!request.need),'the next request walks');
  assert.deepEqual(JSON.parse(JSON.stringify(h.repo.rows.get('dataset:collection').data)),{items:[{id:'collection-0'}]});
 }finally{h.stop()}
});
