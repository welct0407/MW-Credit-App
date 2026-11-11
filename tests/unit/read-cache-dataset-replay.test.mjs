import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
// R140 (owner, 11 November 2026): a dataset change missed while a list path was not subscribed (a form or a record was on
// top) is applied once when that path is subscribed again; the dataset-refresh hook follows the same change counter.
const transpile=file=>ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const readCache=transpile('read-cache.ts'),datasetRefresh=transpile('dataset-refresh.ts');
const SCOPE='synthetic-owner';
function fixture(){
 const window=new EventTarget(),data=new Map(),syncing=new Set(),used=[],deferred=new Map(),reads=[];let holding=false;
 const offlineDataset={readOfflineDataset:async(_access,path)=>{reads.push(path);return data.get(path)??null},isOfflineDatasetCursor:()=>false,refreshOfflineDataset:async()=>{},receiptMediaCandidates:()=>[],
  routeDomain:pathname=>pathname.startsWith('/api/management')?'management':pathname.startsWith('/api/cash-')?'cash':'records',
  datasetDomainSyncing:(scope,domain)=>scope===SCOPE&&syncing.has(domain),noteDatasetDomainUsed:domain=>used.push(domain)};
 const hold={deferWhileInteracting:(token,_scope,run)=>{if(holding)deferred.set(token,run);else run()},cancelDeferred:token=>deferred.delete(token)};
 const exports={},dependencies={'./client-events':{recordClientEvent:()=>{}},'./request-activity':{beginRequest:()=>()=>{}},'./offline-dataset':offlineDataset,'./environment':{commandOriginAllowed:()=>false,chatOriginAllowed:()=>false},'./interaction-hold':hold};
 runInNewContext(readCache,{exports,require:name=>dependencies[name],Response,Blob,URL,AbortController,DOMException,structuredClone,setTimeout,clearTimeout,CustomEvent,Event,navigator:{onLine:true},location:{origin:'https://synthetic.invalid'},window});
 const access={origin:'https://synthetic.invalid',offline:{scopeName:SCOPE,environment:'synthetic',syncAuthorized:async()=>true,readDataset:async()=>null}};
 const ready=(domain='records',changed=true,scopeName=SCOPE)=>window.dispatchEvent(new CustomEvent('mw-offline-dataset-ready',{detail:{scopeName,domain,changed}}));
 const subscribe=(path,applied)=>exports.subscribeOfflineDataset(access,path,value=>applied.push(value),undefined,{hold:true});
 return {exports,window,data,syncing,used,reads,deferred,access,ready,subscribe,offlineDataset,setHolding:value=>{holding=value},release:()=>{for(const [token,run] of deferred){deferred.delete(token);run()}}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('a change while unsubscribed is applied once when the path is subscribed again',async()=>{
 const f=fixture(),applied=[];f.data.set('/api/expense-records',{items:['old']});
 let stop=f.subscribe('/api/expense-records',applied);await settle();assert.deepEqual(applied,[],'a first subscription only starts remembering');stop();
 f.data.set('/api/expense-records',{items:['new']});f.ready();
 stop=f.subscribe('/api/expense-records',applied);await settle();assert.deepEqual(applied,[{items:['new']}]);stop();
 stop=f.subscribe('/api/expense-records',applied);await settle();assert.equal(applied.length,1,'the same change is not replayed twice');stop();
 assert.deepEqual(f.used,['records','records','records']);
});
test('a live subscription applies the change itself and is not replayed afterwards',async()=>{
 const f=fixture(),applied=[];f.data.set('/api/borrowers?limit=25&q=',{items:['b1']});
 let stop=f.subscribe('/api/borrowers?limit=25&q=',applied);f.ready();await settle();assert.equal(applied.length,1);stop();
 stop=f.subscribe('/api/borrowers?limit=25&q=',applied);await settle();assert.equal(applied.length,1);stop();
});
test('an unknown path gets no replay',async()=>{
 const f=fixture(),applied=[];f.data.set('/api/loan-records',{items:[]});f.ready();f.ready();
 const stop=f.subscribe('/api/loan-records',applied);await settle();assert.deepEqual(applied,[]);assert.deepEqual(f.reads,[]);stop();
});
test('changed:false, another scope and another domain are ignored',async()=>{
 const f=fixture(),applied=[];f.data.set('/api/expense-records',{items:['x']});
 let stop=f.subscribe('/api/expense-records',applied);stop();
 f.ready('records',false);f.ready('records',true,'other-owner');f.ready('cash');f.ready('management');
 stop=f.subscribe('/api/expense-records',applied);await settle();assert.deepEqual(applied,[]);assert.equal(f.exports.datasetChangeCount(SCOPE,'records'),0);assert.equal(f.exports.datasetChangeCount(SCOPE,'cash'),1);stop();
});
test('no replay while the domain is syncing; its ready event then applies',async()=>{
 const f=fixture(),applied=[];f.data.set('/api/expense-records',{items:['v1']});
 let stop=f.subscribe('/api/expense-records',applied);stop();f.ready();f.syncing.add('records');
 stop=f.subscribe('/api/expense-records',applied);await settle();assert.deepEqual(applied,[]);
 f.syncing.delete('records');f.data.set('/api/expense-records',{items:['v2']});f.ready();await settle();assert.deepEqual(applied,[{items:['v2']}]);stop();
});
test('a change skipped while syncing is applied by the unchanged check that follows',async()=>{
 const f=fixture(),applied=[];f.data.set('/api/expense-records',{items:['missed']});
 let stop=f.subscribe('/api/expense-records',applied);stop();f.ready();f.syncing.add('records');
 stop=f.subscribe('/api/expense-records',applied);await settle();assert.deepEqual(applied,[]);
 f.syncing.delete('records');f.ready('records',false);await settle();assert.deepEqual(applied,[{items:['missed']}]);
 f.ready('records',false);await settle();assert.equal(applied.length,1,'a later unchanged check reads nothing');stop();
});
test('a replay respects the interaction hold',async()=>{
 const f=fixture(),applied=[];f.data.set('/api/expense-records',{items:['held']});
 let stop=f.subscribe('/api/expense-records',applied);stop();f.ready();f.setHolding(true);
 stop=f.subscribe('/api/expense-records',applied);await settle();assert.deepEqual(applied,[]);assert.equal(f.deferred.size,1);
 f.setHolding(false);f.release();assert.deepEqual(applied,[{items:['held']}]);stop();
});
test('the remembered paths are bounded (oldest forgotten first)',async()=>{
 const f=fixture(),applied=[];
 for(let n=0;n<129;n++)f.subscribe('/api/expense-records?cursor=c'+n,applied)();
 f.ready();await settle();
 f.subscribe('/api/expense-records?cursor=c0',applied)();await settle();assert.equal(f.reads.length,0,'the oldest path was forgotten');
 f.subscribe('/api/expense-records?cursor=c128',applied)();await settle();assert.deepEqual(f.reads,['/api/expense-records?cursor=c128']);
});
// The hook runs through a minimal React stand-in: effects run in order when their dependencies change.
function hookHarness(f,initial){
 const refs=[],deps=[],cleanups=[];let props=initial,index=0,refIndex=0;
 const react={useRef:value=>{const at=refIndex++;if(!(at in refs))refs[at]={current:value};return refs[at]},
  useEffect:(effect,list)=>{const at=index++;const before=deps[at];if(before&&list.length===before.length&&list.every((value,i)=>Object.is(value,before[i])))return;cleanups[at]?.();deps[at]=list;cleanups[at]=effect()??undefined}};
 const exports={},dependencies={react,'./read-cache':{datasetChangeCount:f.exports.datasetChangeCount,ownWriteCount:f.exports.ownWriteCount},'./offline-dataset':f.offlineDataset};
 runInNewContext(datasetRefresh,{exports,require:name=>dependencies[name],window:f.window});
 const render=next=>{if(next)props={...props,...next};index=0;refIndex=0;exports.useDatasetRefresh(f.access,props.domain,props.enabled,props.reload,props.options)};
 render();return {render,unmount:()=>{for(const cleanup of cleanups)cleanup?.()}};
}
test('useDatasetRefresh reloads on a change while enabled and once after a missed change when enabled again',()=>{
 const f=fixture();let reloads=0;const reload=()=>reloads++;
 const hook=hookHarness(f,{domain:'records',enabled:true,reload});
 assert.deepEqual(f.used,['records']);
 f.ready('records',false);f.ready('cash');assert.equal(reloads,0);
 f.ready();assert.equal(reloads,1);
 hook.render({enabled:false});f.ready();f.ready();assert.equal(reloads,1,'no reload while a child is on top');
 hook.render({enabled:true});assert.equal(reloads,2,'one reload for the missed changes');
 hook.render({enabled:false});hook.render({enabled:true});assert.equal(reloads,2,'nothing missed, no reload');
 hook.render({enabled:false});f.ready();f.syncing.add('records');hook.render({enabled:true});assert.equal(reloads,2,'skipped while syncing');
 f.syncing.delete('records');f.ready('records',false);assert.equal(reloads,3,'an unchanged check that follows reloads the missed change');
 f.ready('records',false);assert.equal(reloads,3,'nothing missed, an unchanged check does not reload');
 hook.unmount();f.ready();assert.equal(reloads,3);
});
test('useDatasetRefresh reloads after an own write (settled in this tab), also while the domain is syncing; changes:false ignores checks',()=>{
 const f=fixture();let reloads=0;const written=()=>f.window.dispatchEvent(new Event('mw-read-invalidated'));
 const hook=hookHarness(f,{domain:'records',enabled:true,reload:()=>reloads++,options:{changes:false}});
 f.ready();f.ready();assert.equal(reloads,0,'saved-data changes are left to the subscription');
 written();assert.equal(reloads,1,'an own write while shown reloads from the server');
 hook.render({enabled:false});written();f.syncing.add('records');hook.render({enabled:true});assert.equal(reloads,2,'Back after an own write reloads, even while the confirming check runs');
 hook.render({enabled:false});hook.render({enabled:true});assert.equal(reloads,2,'nothing new, no reload');
 hook.unmount();written();assert.equal(reloads,2);
});
