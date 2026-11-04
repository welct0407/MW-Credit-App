import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {encodeDeltaChunk} from '../../services/api/offline-dataset-delta.mjs';

// Background receipt prefetch: a definitive refusal (422 receipt_reference_unsupported) is remembered per receipt
// time across restarts; every other failure retries; a changed receipt or a Full sync asks again. The header
// progress follows the data domains only (UX-HOLD-07).
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/offline-dataset.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const patchModule=await import('../../services/lib/offline-dataset-digest.mjs');
const origin='https://lm.example.invalid',all=['records','collection','cash','management','notifications'];
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stamp={asOf:today+'T01:00:00.000Z',businessDate:today};
const version=domain=>domain.length.toString(16).padStart(2,'0').repeat(32);
const receiptAt=today+'T02:00:00.000Z',path='/api/payment-records/P1/receipt?source=manual',key='blob:'+origin+path,marker='dataset-media-refused:'+key;
const payment=(at=receiptAt)=>({id:'P1',borrowerId:'B1',paymentDate:today,receiptReference:'attached',receiptAt:at,agentReceiptPresent:false});
const bundle=(domain,data={items:[]})=>({schemaVersion:1,protocolVersion:3,domain,complete:true,generation:'g-'+domain,...stamp,sourceVersion:version(domain),data,contentValues:{}});
async function until(predicate,limit=4000){const started=Date.now();while(!predicate()){if(Date.now()-started>limit)throw Error('Timed out');await new Promise(resolve=>setTimeout(resolve,5))}}
const quiet=()=>new Promise(resolve=>setTimeout(resolve,400));

/** Durable rows shared by restarts: complete bundles of every domain, the records one with one recent receipt. */
function storage(records=[payment()]){return new Map(all.map(domain=>['dataset:'+domain,bundle(domain,domain==='records'?{payments:records}:{items:[]})]))}
/** clock: the coordinator's time (a refusal marker records when it was written, as owner-offline.ts does). */
function repository(rows,clock=Date.now){
 const refusals=()=>[...rows.keys()].filter(name=>name.startsWith('dataset-media-refused:'));
 return {rows,scopeName:'synthetic-scope',environment:'synthetic',
  syncAuthorized:async()=>true,readRevision:async()=>0,readCacheRevision:async()=>0,
  readReconciledAt:async()=>rows.get('meta:reconciled-at')??null,saveReconciledAt:async at=>{rows.set('meta:reconciled-at',at);return true},
  readReconcileFlags:async()=>[],saveReconcileFlags:async()=>true,readReconcileAttempt:async()=>null,saveReconcileAttempt:async()=>true,
  readDataset:async domain=>{const row=rows.get('dataset:'+domain);return row?{...structuredClone(row),cacheStale:false}:null},
  readDatasetProgress:async()=>null,discardDatasetProgress:async()=>{},saveDatasetProgress:async()=>true,
  saveDataset:async(domain,value)=>{rows.set('dataset:'+domain,structuredClone(value));return true},
  readDatasetMedia:async name=>{const row=rows.get('dataset-media:'+name);return row?{data:row.value,format:'blob',contentType:row.value.type,savedAt:row.savedAt,revision:0}:null},
  listDatasetMediaKeys:async()=>[...rows.keys()].filter(name=>name.startsWith('dataset-media:')).map(name=>name.slice('dataset-media:'.length)),
  removeDatasetMedia:async name=>{rows.delete('dataset-media:'+name)},
  saveDatasetMedia:async(name,value)=>{rows.set('dataset-media:'+name,{value,savedAt:Date.now()});return true},
  readDatasetMediaRefusals:async()=>refusals().map(name=>({key:name.slice('dataset-media-refused:'.length),version:rows.get(name).version,savedAt:rows.get(name).savedAt})),
  saveDatasetMediaRefusal:async(name,at)=>{rows.set('dataset-media-refused:'+name,{version:at,savedAt:clock()});return true},
  removeDatasetMediaRefusal:async name=>{rows.delete('dataset-media-refused:'+name)},
  clearDatasetMediaRefusals:async()=>{for(const name of refusals())rows.delete(name)},
 };
}
/** receipt(): the answer to a receipt request: {status, json}, 'image', 'network' (a lost request) or a promise of one. */
function start(rows,receipt,wrap=repo=>repo){
 let offset=0;class Clock extends Date{constructor(...args){if(args.length)super(...args);else super(Date.now()+offset)}static now(){return Date.now()+offset}}
 const navigator={onLine:true},window=new EventTarget(),document=Object.assign(new EventTarget(),{visibilityState:'visible'});
 const receipts=[],domainsAsked=[],authFailures=[],repo=wrap(repository(rows,Clock.now));
 const reply=(status,json)=>({status,ok:status>=200&&status<300,json:async()=>structuredClone(json),blob:async()=>new Blob([new Uint8Array(8)],{type:'image/png'})});
 async function fetch(url,init){
  const target=new URL(url);await new Promise(resolve=>setTimeout(resolve,0));
  if(target.pathname.endsWith('/receipt')){receipts.push(target.pathname+target.search);const answer=await receipt();if(answer==='network')throw TypeError('Failed to fetch');return answer==='image'?reply(200,null):reply(answer.status,answer.json)}
  const domain=target.searchParams.get('domain')??'notifications',body=JSON.parse(init.body??'{}');domainsAsked.push(domain);
  const stored=rows.get('dataset:'+domain);
  if(body.sourceVersion===version(domain))return reply(200,{schemaVersion:3,domain,...stamp,sourceVersion:version(domain),unchanged:true,patches:[],values:{},complete:true,nextCursor:null,progress:{completed:1,total:1}});
  // A Full sync walk (no source version): the stored data again, in one chunk.
  return reply(200,encodeDeltaChunk({domain,generation:'walk-'+domain,startedAt:stamp.asOf,...stamp,sourceVersion:version(domain),patches:Object.entries(stored.data).map(([name,value])=>({key:name,mode:'replace',value})),complete:true,nextCursor:null,progress:{completed:1,total:1}},body.need??[]));
 }
 const sandbox={exports:{},require:name=>name==='./client-events'?{recordClientEvent:()=>{}}:name==='./request-activity'?{activitySnapshot:()=>0,subscribeActivity:()=>()=>{}}:name==='./dataset-patch'?patchModule:(()=>{throw Error('Unexpected import '+name)})(),
  window,document,navigator,fetch,setTimeout,clearTimeout,URL,crypto:globalThis.crypto,TextEncoder,structuredClone,Intl,CustomEvent,Event,AbortController,Blob,console,Date:Clock};
 runInNewContext(source,sandbox);
 const stop=sandbox.exports.startOfflinePreparation({origin,offline:repo,token:async()=>'synthetic',authFailure:status=>authFailures.push(status)});
 const state=()=>sandbox.exports.getOfflinePreparation(repo.scopeName);
 return {receipts,domainsAsked,authFailures,rows,window,state,stop,advance:ms=>{offset+=ms}};
}
const ready=h=>until(()=>h.state().state==='ready'&&!h.state().domainsPending&&h.state().lastChecked!==null&&!h.state().syncActive);
const unsupported={status:422,json:{ok:false,code:'receipt_reference_unsupported'}};

test('a 422 receipt_reference_unsupported is remembered across a restart: not asked again on open or focus, state ready',async()=>{
 const rows=storage();let h=start(rows,async()=>unsupported);
 try{await ready(h);assert.deepEqual(h.receipts,[path]);assert.equal(rows.get(marker).version,Date.parse(receiptAt));assert.equal(h.state().progress,100)}finally{h.stop()}
 h=start(rows,async()=>{throw Error('a refused receipt was asked for again')});
 try{
  await ready(h);await quiet();assert.deepEqual(h.receipts,[]);assert.equal(h.state().state,'ready');
  h.window.dispatchEvent(new Event('focus'));await until(()=>h.domainsAsked.includes('records'));await ready(h);await quiet();
  assert.deepEqual(h.receipts,[],'a focus recheck does not enqueue the refused receipt');assert.ok(rows.has(marker));
 }finally{h.stop()}
});
test('503, another 422 code, 404, a lost request and 401 leave no marker; the next open asks again (PROD safety)',async()=>{
 for(const answer of [{status:503,json:{ok:false,code:'receipt_unavailable'}},{status:422,json:{ok:false,code:'invalid_request'}},{status:422,json:null},{status:404,json:{ok:false,code:'receipt_not_found'}},'network',{status:401,json:{ok:false,code:'session_invalid'}}]){
  const rows=storage(),label=JSON.stringify(answer);let h=start(rows,async()=>answer);
  try{
   await until(()=>h.receipts.length===1&&!h.state().syncActive);await quiet();assert.equal(h.receipts.length,1,label+': one request, then the back-off');assert.ok(![...rows.keys()].some(name=>name.startsWith('dataset-media-refused:')),label+': no marker');
   // The failed receipt retries quietly: readiness and the header progress follow the data domains.
   if(answer.status===401)assert.deepEqual(h.authFailures,[401]);else{assert.equal(h.state().state,'ready',label);assert.equal(h.state().dataReady,true,label)}
  }finally{h.stop()}
  h=start(rows,async()=>'image');
  try{await ready(h);assert.deepEqual(h.receipts,[path],label+': asked again after a restart');assert.ok(rows.has('dataset-media:'+key),label+': stored')}finally{h.stop()}
 }
});
test('a replaced receipt (another receipt time) is downloaded normally and its old marker is removed',async()=>{
 const rows=storage();rows.set(marker,{version:Date.parse(receiptAt),savedAt:Date.now()});
 rows.get('dataset:records').data.payments=[payment(today+'T03:00:00.000Z')];
 const h=start(rows,async()=>'image');
 try{await ready(h);assert.deepEqual(h.receipts,[path]);assert.ok(rows.has('dataset-media:'+key));assert.equal(rows.has(marker),false)}finally{h.stop()}
});
test('a marker for a receipt no longer in the window is pruned',async()=>{
 const rows=storage([]);rows.set(marker,{version:Date.parse(receiptAt),savedAt:Date.now()});
 const h=start(rows,async()=>'image');
 try{await ready(h);assert.equal(rows.has(marker),false);assert.deepEqual(h.receipts,[])}finally{h.stop()}
});
test('a Full sync clears the markers and asks once; a second refusal is remembered again',async()=>{
 const rows=storage();rows.set(marker,{version:Date.parse(receiptAt),savedAt:Date.now()});
 const h=start(rows,async()=>unsupported);
 try{
  await ready(h);await quiet();assert.deepEqual(h.receipts,[]);
  h.window.dispatchEvent(new CustomEvent('mw-offline-prepare',{detail:{all:true,full:true}}));
  await until(()=>h.receipts.length===1);await until(()=>!h.state().fullSync);await ready(h);await quiet();
  assert.deepEqual(h.receipts,[path]);assert.equal(rows.get(marker).version,Date.parse(receiptAt));
  h.window.dispatchEvent(new Event('focus'));await until(()=>h.domainsAsked.filter(domain=>domain==='records').length>=3);await ready(h);await quiet();
  assert.deepEqual(h.receipts,[path],'asked once only');
 }finally{h.stop()}
});
test('a marker older than 24 hours (or dated ahead of now) is ignored and removed: the receipt is asked again, a re-refusal writes a fresh marker',async()=>{
 const day=24*60*60*1000;
 for(const savedAt of [Date.now()-day-60*1000,Date.now()+60*60*1000]){
  const rows=storage();rows.set(marker,{version:Date.parse(receiptAt),savedAt});const h=start(rows,async()=>unsupported);
  try{await ready(h);await quiet();assert.deepEqual(h.receipts,[path],'asked again');assert.ok(Math.abs(rows.get(marker).savedAt-Date.now())<5000,'a fresh marker');assert.equal(h.state().state,'ready')}finally{h.stop()}
 }
});
test('in a running session a refusal is asked again once it is a day old, then not again until the next day',async()=>{
 const rows=storage(),h=start(rows,async()=>unsupported);
 try{
  await ready(h);assert.deepEqual(h.receipts,[path]);const first=rows.get(marker).savedAt;
  h.advance(23*60*60*1000);h.window.dispatchEvent(new Event('focus'));await until(()=>h.domainsAsked.filter(domain=>domain==='records').length>=2);await ready(h);await quiet();
  assert.deepEqual(h.receipts,[path],'still refused after 23 hours');
  h.advance(2*60*60*1000);h.window.dispatchEvent(new Event('focus'));await until(()=>h.receipts.length===2);await ready(h);await quiet();
  assert.ok(rows.get(marker).savedAt>first,'a fresh marker');
  h.window.dispatchEvent(new Event('focus'));await until(()=>h.domainsAsked.filter(domain=>domain==='records').length>=4);await ready(h);await quiet();
  assert.equal(h.receipts.length,2,'once a day');
 }finally{h.stop()}
});
test('a failed first read of the markers is tried again at the next sweep (the records check) before the receipt is asked',async()=>{
 const rows=storage();rows.set(marker,{version:Date.parse(receiptAt),savedAt:Date.now()});let reads=0;
 const h=start(rows,async()=>{throw Error('a refused receipt was asked for again')},repo=>{const read=repo.readDatasetMediaRefusals;repo.readDatasetMediaRefusals=async()=>{if(++reads===1)throw Error('IndexedDB unavailable');return read()};return repo});
 try{await ready(h);await quiet();assert.ok(reads>=2,'read again');assert.deepEqual(h.receipts,[]);assert.ok(rows.has(marker),'a failed read removes nothing')}finally{h.stop()}
});
test('a receipt time that does not parse is version 0: a stored blob counts and a recheck does not churn',async()=>{
 const rows=storage([payment(null)]);rows.set('dataset-media:'+key,{value:new Blob([new Uint8Array(8)],{type:'image/png'}),savedAt:1});
 const h=start(rows,async()=>{throw Error('a stored receipt was asked for again')});
 try{
  await ready(h);await quiet();assert.deepEqual(h.receipts,[]);
  h.window.dispatchEvent(new Event('focus'));await until(()=>h.domainsAsked.filter(domain=>domain==='records').length>=2);await ready(h);await quiet();
  assert.deepEqual(h.receipts,[]);assert.equal(h.state().state,'ready');
 }finally{h.stop()}
});
test('a receipt still downloading does not hold the progress: data ready, progress 100, state preparing',async()=>{
 let release;const held=new Promise(resolve=>{release=resolve});
 const rows=storage(),h=start(rows,()=>held.then(()=>'image'));
 try{
  await until(()=>h.receipts.length===1);
  assert.equal(h.state().dataReady,true);assert.equal(h.state().progress,100);assert.equal(h.state().state,'preparing');assert.equal(h.state().syncActive,true);
  release();await ready(h);assert.ok(rows.has('dataset-media:'+key));
 }finally{release();h.stop()}
});
