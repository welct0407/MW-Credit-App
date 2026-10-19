import {test,expect,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {encodeDeltaChunk} from '../../services/api/offline-dataset-delta.mjs';
import {datasetDigests,digestDifferences} from '../../services/lib/offline-dataset-digest.mjs';

// R078 reconciliation (owner, 19 October 2026): at the first idle moment after 18:00 Bangkok the stored bundles are
// compared with the server's digests; equal data matches without any walk, a corrupted domain is logged and healed.
const domains=['records','collection','cash','management','notifications'],version='a'.repeat(64),asOf='2026-10-14T11:00:00.000Z';
const truth:Record<string,any>={records:{borrowers:[{id:'b1',name:'Alpha'}],dashboard:{total:'10'}},collection:{items:[{id:'c1'}]},cash:{overview:{balance:'5'}},management:{sections:{partners:[{id:'p1'}]}},notifications:{items:[]}};
const sha256=(text:string)=>createHash('sha256').update(text).digest('hex');
const at=(hour:number,minute:number)=>Date.UTC(2026,9,14,hour-7,minute);
async function fixture(page:Page,uid:string,stored:Record<string,any>,lastReconciled=at(6,30)){
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/back-consumers-harness.tsx"></script>'}));
 await page.goto('/');
 await page.evaluate(async({uid,stored,domains,version,asOf,reconciledAt})=>{const w=window as any;const repo=w.__offlineTest.ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid},'synthetic');await repo.authorize();w.__syncRepo=repo;w.__syncAccess={origin:location.origin,offline:repo,token:async()=>'synthetic-only',authFailure:()=>{}};
  for(const domain of domains)await repo.saveDataset(domain,{schemaVersion:1,domain,complete:true,sourceVersion:version,generation:'initial',asOf,businessDate:'2026-10-14',data:stored[domain]},await repo.readRevision());
  await repo.saveReconciledAt(reconciledAt)},{uid,stored,domains,version,asOf,reconciledAt:lastReconciled});
}
async function server(page:Page,unavailable=false){
 const calls:string[]=[];
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url());if(!url.pathname.startsWith('/api/'))return route.fallback();const domain=url.searchParams.get('domain')??'notifications',body=route.request().postDataJSON()??{};
  if(body.reconcile&&unavailable){calls.push(domain+':reconcile:unavailable');return route.fulfill({json:{schemaVersion:3,domain,asOf,businessDate:'2026-10-14',reconcile:true,result:'unavailable',keys:[],patches:[],values:{},complete:true,nextCursor:null}})}
  if(body.reconcile){const keys=digestDifferences(await datasetDigests(truth[domain],sha256),body.digests);calls.push(domain+':reconcile:'+(keys.length?'mismatch':'match'));return route.fulfill({json:{schemaVersion:3,domain,asOf,businessDate:'2026-10-14',reconcile:true,result:keys.length?'mismatch':'match',keys,patches:[],values:{},complete:true,nextCursor:null}})}
  if(body.sourceVersion===version){calls.push(domain+':check');return route.fulfill({json:{schemaVersion:3,domain,asOf,businessDate:'2026-10-14',sourceVersion:version,unchanged:true,patches:[],values:{},complete:true,nextCursor:null,progress:{completed:1,total:1}}})}
  calls.push(domain+':walk'+(body.need?.length?'+need':''));
  const patches=Object.entries(truth[domain]).map(([key,value])=>({key,mode:Array.isArray(value)?'append':'replace',value}));
  return route.fulfill({json:encodeDeltaChunk({schemaVersion:2,domain,generation:'walk',startedAt:asOf,asOf,businessDate:'2026-10-14',sourceVersion:version,patches,complete:true,nextCursor:null,progress:{completed:1,total:1}},body.need??[])});
 });
 return calls;
}
const start=(page:Page)=>page.evaluate(()=>{const w=window as any;w.__stopPreparation=w.__datasetTest.startOfflinePreparation(w.__syncAccess)});
const events=(page:Page)=>page.evaluate(async()=>(await import('/apps/pwa/src/client-events.ts')).clientEvents().filter((event:any)=>event.kind.startsWith('reconcile')).map((event:any)=>event.kind+':'+event.code+(event.message?':'+event.message:'')));
test('at 18:01 Bangkok equal data reconciles once with a match and no walk',async({page})=>{
 await page.clock.install({time:at(18,1)});const calls=await server(page);await fixture(page,'reconcile-equal',truth);await start(page);
 await page.clock.runFor(3000);await expect.poll(()=>calls.filter(call=>call.includes(':reconcile:')).length).toBe(4);
 expect(calls.filter(call=>call.includes(':reconcile:'))).toEqual(['records:reconcile:match','collection:reconcile:match','cash:reconcile:match','management:reconcile:match']);
 expect(calls.some(call=>call.includes(':walk'))).toBe(false);
 await expect.poll(()=>events(page)).toEqual(['reconcile-match:records','reconcile-match:collection','reconcile-match:cash','reconcile-match:management']);
 // The next poll in the same slot does not reconcile again.
 await page.clock.runFor(31000);await expect.poll(()=>calls.filter(call=>call.endsWith(':check')).length).toBeGreaterThanOrEqual(8);await page.clock.runFor(2000);
 expect(calls.filter(call=>call.includes(':reconcile:'))).toHaveLength(4);
});
test('a domain corrupted in IndexedDB is named, logged and healed by a walk',async({page})=>{
 await page.clock.install({time:at(18,1)});const calls=await server(page);await fixture(page,'reconcile-corrupt',{...truth,cash:{overview:{balance:'999'}}});await start(page);
 await page.clock.runFor(3000);await expect.poll(()=>calls).toContain('cash:reconcile:mismatch');
 await expect.poll(()=>events(page)).toContain('reconcile-mismatch:cash:overview');
 await page.clock.runFor(2000);await expect.poll(()=>calls.some(call=>call.startsWith('cash:walk'))).toBe(true);
 await expect.poll(()=>page.evaluate(async()=>(await (window as any).__syncRepo.readDataset('cash')).data.overview.balance)).toBe('5');
 await page.clock.runFor(2000);await expect.poll(()=>calls.filter(call=>call==='cash:reconcile:match').length).toBe(1);
});

// A pass that could not finish (the server's 40 s budget, a 5xx) must not repeat at every 30-second poll: each attempt walks
// a whole domain in one request and holds the offline read slot.
test('an unavailable answer is not retried at every poll',async({page})=>{
 await page.clock.install({time:at(18,1)});const calls=await server(page,true);await fixture(page,'reconcile-unavailable',truth);await start(page);
 await page.clock.runFor(3000);await expect.poll(()=>calls.filter(call=>call.includes(':reconcile:')).length).toBeGreaterThan(0);
 for(let poll=0;poll<5;poll++){await page.clock.runFor(31000);await page.waitForTimeout(500)}
 expect(calls.filter(call=>call.includes(':reconcile:')).length).toBeLessThanOrEqual(4);
});
// A phone clock that was ahead stored a reconciliation time in the future; once the clock is right the pass is due again.
test('a reconciliation time in the future does not suppress the pass',async({page})=>{
 await page.clock.install({time:at(18,1)});const calls=await server(page);await fixture(page,'reconcile-future',truth,at(18,1)+2*24*3600*1000);await start(page);
 await page.clock.runFor(3000);await expect.poll(()=>calls.filter(call=>call.includes(':reconcile:')).length).toBe(4);
});

// R078 one heal per slot: a domain that still differs after its heal is logged again but not walked again; the next slot tries again.
test('a persistent mismatch is logged each time, walked once per slot and tried again in the next slot',async({page})=>{
 await page.clock.install({time:at(18,1)});const calls:string[]=[];
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url());if(!url.pathname.startsWith('/api/'))return route.fallback();const domain=url.searchParams.get('domain')??'notifications',body=route.request().postDataJSON()??{};
  if(body.reconcile){const mismatch=domain==='cash';calls.push(domain+':reconcile:'+(mismatch?'mismatch':'match'));return route.fulfill({json:{schemaVersion:3,domain,asOf,businessDate:'2026-10-14',reconcile:true,result:mismatch?'mismatch':'match',keys:mismatch?['overview']:[],patches:[],values:{},complete:true,nextCursor:null}})}
  if(body.sourceVersion===version){calls.push(domain+':check');return route.fulfill({json:{schemaVersion:3,domain,asOf,businessDate:'2026-10-14',sourceVersion:version,unchanged:true,patches:[],values:{},complete:true,nextCursor:null,progress:{completed:1,total:1}}})}
  calls.push(domain+':walk');
  return route.fulfill({json:encodeDeltaChunk({schemaVersion:2,domain,generation:'walk',startedAt:asOf,asOf,businessDate:'2026-10-14',sourceVersion:version,patches:Object.entries(truth[domain]).map(([key,value])=>({key,mode:Array.isArray(value)?'append':'replace',value})),complete:true,nextCursor:null,progress:{completed:1,total:1}},body.need??[])});
 });
 await fixture(page,'reconcile-persistent',truth);await start(page);
 const settle=async()=>{for(let step=0;step<6;step++){await page.clock.runFor(2000);await page.waitForTimeout(150)}};
 await settle();
 for(let poll=0;poll<4;poll++){await page.clock.runFor(31000);await page.waitForTimeout(400);await settle()}
 expect(calls.filter(call=>call==='cash:walk')).toHaveLength(1);
 expect(await events(page)).toEqual(expect.arrayContaining(['reconcile-mismatch:cash:overview']));
 expect((await events(page)).filter(event=>event==='reconcile-mismatch:cash:overview').length).toBe(2);
 // The next slot (06:00 the next day) asks again and heals again.
 await page.clock.fastForward(12*3600*1000);await page.waitForTimeout(400);await settle();for(let poll=0;poll<2;poll++){await page.clock.runFor(31000);await page.waitForTimeout(400);await settle()}
 expect(calls.filter(call=>call==='cash:walk').length).toBe(2);
 expect((await events(page)).filter(event=>event==='reconcile-mismatch:cash:overview').length).toBeGreaterThanOrEqual(3);
});
// A heal survives a failing walk and a reload: the bundle carries needsWalk and the next start walks it from the beginning.
test('a failed heal walk is repeated after a reload',async({page})=>{
 await page.clock.install({time:at(18,1)});const sent:{domain:string;body:any}[]=[];let failCash=true;
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url());if(!url.pathname.startsWith('/api/'))return route.fallback();const domain=url.searchParams.get('domain')??'notifications',body=route.request().postDataJSON()??{};sent.push({domain,body});
  if(body.reconcile){const keys=digestDifferences(await datasetDigests(truth[domain],sha256),body.digests);return route.fulfill({json:{schemaVersion:3,domain,asOf,businessDate:'2026-10-14',reconcile:true,result:keys.length?'mismatch':'match',keys,patches:[],values:{},complete:true,nextCursor:null}})}
  if(domain==='cash'&&failCash&&body.sourceVersion===null)return route.fulfill({status:503,json:{code:'temporary'}});
  if(body.sourceVersion===version){return route.fulfill({json:{schemaVersion:3,domain,asOf,businessDate:'2026-10-14',sourceVersion:version,unchanged:true,patches:[],values:{},complete:true,nextCursor:null,progress:{completed:1,total:1}}})}
  return route.fulfill({json:encodeDeltaChunk({schemaVersion:2,domain,generation:'walk',startedAt:asOf,asOf,businessDate:'2026-10-14',sourceVersion:version,patches:Object.entries(truth[domain]).map(([key,value])=>({key,mode:Array.isArray(value)?'append':'replace',value})),complete:true,nextCursor:null,progress:{completed:1,total:1}},body.need??[])});
 });
 await fixture(page,'reconcile-reload',{...truth,cash:{overview:{balance:'999'}}});await start(page);
 await page.clock.runFor(3000);await expect.poll(()=>sent.filter(entry=>entry.domain==='cash'&&entry.body.sourceVersion===null).length).toBeGreaterThan(0);
 await expect.poll(()=>page.evaluate(async()=>{const bundle=await (window as any).__syncRepo.readDataset('cash');return [bundle.needsWalk===true,bundle.sourceVersion??null,bundle.changes??null]})).toEqual([true,null,null]);
 // Reload: a new coordinator starts from the stored bundle; the server works again.
 failCash=false;await page.evaluate(()=>(window as any).__stopPreparation());sent.length=0;await start(page);await page.clock.runFor(3000);
 await expect.poll(()=>page.evaluate(async()=>(await (window as any).__syncRepo.readDataset('cash')).data.overview.balance)).toBe('5');
 expect(sent.filter(entry=>entry.domain==='cash'&&!entry.body.reconcile)[0].body.sourceVersion).toBeNull();
 expect(await page.evaluate(async()=>(await (window as any).__syncRepo.readDataset('cash')).needsWalk??false)).toBe(false);
});
