import {test,expect,type Page} from '@playwright/test';
import {encodeDeltaChunk} from '../../services/api/offline-dataset-delta.mjs';

const domains=['records','collection','cash','management','notifications'];
const oldVersion='a'.repeat(64),newVersion='b'.repeat(64),asOf='2026-10-14T01:00:00.000Z';
const unchanged={id:'stable',name:'Unchanged',note:'Keep'};
const initial={borrowers:[unchanged,{id:'edited',name:'Before',note:'Before'},{id:'deleted',name:'Deleted'}],dashboard:{total:'10'},payments:[]};
async function fixture(page:Page,uid:string,data:any=initial,seed=true){
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/back-consumers-harness.tsx"></script>'}));
 await page.goto('/');
 await page.evaluate(async({uid,data,seed,domains,oldVersion,asOf})=>{const w=window as any;const repo=w.__offlineTest.ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid},'synthetic');await repo.authorize();w.__syncRepo=repo;w.__syncAccess={origin:location.origin,offline:repo,token:async()=>'synthetic-only',authFailure:()=>{}};if(seed)for(const domain of domains)await repo.saveDataset(domain,{schemaVersion:1,domain,complete:true,sourceVersion:oldVersion,generation:'initial',asOf,businessDate:'2026-10-14',data:domain==='records'?data:{}},await repo.readRevision());},{uid,data,seed,domains,oldVersion,asOf});
}
const start=(page:Page)=>page.evaluate(()=>{const w=window as any;w.__stopPreparation=w.__datasetTest.startOfflinePreparation(w.__syncAccess)});
const state=(page:Page)=>page.evaluate(()=>{const w=window as any;return w.__datasetTest.getOfflinePreparation(w.__syncRepo.scopeName)});
async function settled(page:Page){await expect.poll(async()=>{const s=await state(page);return s.state==='ready'&&!s.updating}).toBe(true)}
const bundle=(domain:string,patches:any[],sourceVersion=newVersion,nextCursor:string|null=null)=>({schemaVersion:2,domain,generation:'changed-generation',startedAt:asOf,asOf,businessDate:'2026-10-14',sourceVersion,patches,nextCursor,complete:nextCursor===null,progress:{completed:nextCursor?1:2,total:2}});
const patches=(data:any)=>Object.entries(data).map(([key,value])=>({key,mode:Array.isArray(value)?'append':'replace',value}));

test('active delta progress excludes retained bundles and long poll focus overlap does not restart completed work',async({page,context})=>{
 await fixture(page,'delta-long-cycle');await page.clock.install();const calls:string[]=[];let release!:()=>void,held=0;
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),domain=url.searchParams.get('domain')??'notifications',body=route.request().postDataJSON();calls.push(domain+':'+(body.cursor??'start'));
  if(domain==='records'){held++;await new Promise<void>(resolve=>release=resolve);const step=body.cursor?Number(body.cursor):0;return route.fulfill({json:{...bundle(domain,[],newVersion,step<3?String(step+1):null),schemaVersion:3,values:{},progress:{completed:step+1,total:4}}})}
  return route.fulfill({json:{...bundle(domain,[],oldVersion),schemaVersion:3,unchanged:true,values:{}}});
 });
 await start(page);await page.clock.runFor(1000);await expect.poll(()=>held).toBe(1);expect((await state(page)).state).toBe('ready');expect((await state(page)).syncActive).toBe(true);expect((await state(page)).progress).toBeLessThan(100);
 for(let step=0;step<4;step++){await page.clock.runFor(18000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));expect(held).toBe(step+1);release();await page.clock.runFor(1000);if(step<3){await expect.poll(()=>held).toBe(step+2);expect((await state(page)).progress).toBeGreaterThan(0);expect((await state(page)).progress).toBeLessThan(100)}}
 await page.clock.runFor(2000);await settled(page);expect((await state(page)).syncActive).toBe(false);expect((await state(page)).progress).toBe(100);expect(calls).toEqual(['records:start','collection:start','cash:start','management:start','notifications:start','records:1','records:2','records:3']);
 // R064: a focus/visibility/online burst within 60 s of a completed check sends no new checks.
 for(let burst=0;burst<3;burst++){await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'))});await page.clock.runFor(1000)}
 // Records completed seconds ago and is not rechecked; the other domains (checked 76 s earlier) may be.
 expect(held).toBe(4);expect(calls.filter(call=>call.startsWith('records:'))).toHaveLength(4);await page.clock.runFor(2000);await settled(page);
 await page.clock.runFor(60000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.clock.runFor(1000);await expect.poll(()=>held).toBe(5);expect((await state(page)).syncActive).toBe(true);expect((await state(page)).progress).toBeLessThan(100);await context.setOffline(true);expect((await state(page)).syncActive).toBe(false);expect(await page.evaluate(async()=>(await(window as any).__syncRepo.readDataset('records')).complete)).toBe(true);release();await page.clock.runFor(1000);expect((await state(page)).syncActive).toBe(false);
 await context.setOffline(false);await page.clock.runFor(1000);await expect.poll(()=>held).toBe(6);for(let step=0;step<4;step++){release();await page.clock.runFor(1000);if(step<3)await expect.poll(()=>held).toBe(7+step)}await page.clock.runFor(2000);await settled(page);expect((await state(page)).syncActive).toBe(false);expect((await state(page)).progress).toBe(100);
});

test('delta reuses complete data, transfers only edits and derived changes, polls visibly and preserves pending conflicts',async({page,context})=>{
 await fixture(page,'delta-edits');await page.clock.install();
 let version=oldVersion,data:any=initial;const calls:any[]=[],transferred:any[]=[];
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url());if(url.pathname.startsWith('/api/operations')){if(route.request().method()==='GET')return route.fulfill({json:{kind:'unresolved'}});return route.fulfill({status:409,json:{code:'version_conflict'}})}
  const domain=url.searchParams.get('domain')??'notifications',body=route.request().postDataJSON();calls.push({domain,...body});expect(route.request().method()).toBe('POST');expect(url.searchParams.get('protocol')).toBe('3');
  if(domain!=='records'||body.sourceVersion===version)return route.fulfill({json:{...bundle(domain,[],domain==='records'?version:oldVersion),schemaVersion:3,unchanged:true,values:{}}});
  const response=encodeDeltaChunk(bundle(domain,patches(data),version),body.need);transferred.push(...Object.values(response.values));return route.fulfill({json:response});
 });
 const command={requestId:'90000000-0000-4000-8000-000000000001',operation:'borrower.update',targetId:'edited',expectedVersion:oldVersion,predecessorRequestId:null,receiptId:null,inputs:{note:'My offline note'}};
 await page.evaluate(async command=>{const w=window as any;await w.__syncRepo.savePending(command.requestId,{domain:'borrower',command});await w.__syncRepo.saveDraft('charge:unfinished',{notes:'My unfinished form'});},command);
 await start(page);await page.clock.runFor(2000);await settled(page);expect(calls).toHaveLength(5);expect(transferred).toEqual([]);
 data={borrowers:[unchanged,{id:'edited',name:'Other owner',note:'Remote'}],dashboard:{total:'20'},payments:[]};version=newVersion;
 await page.clock.fastForward(5*60*1000);await page.clock.runFor(2000);await settled(page);
 expect(transferred).toEqual(expect.arrayContaining([{id:'edited',name:'Other owner',note:'Remote'},{total:'20'}]));expect(transferred).toHaveLength(2);
 const saved=await page.evaluate(async()=>{const w=window as any;return{bundle:await w.__syncRepo.readDataset('records'),pending:await w.__syncRepo.list('pending'),draft:await w.__syncRepo.list('draft')}});
 expect(saved.bundle.data.borrowers.map((row:any)=>row.id)).toEqual(['stable','edited']);expect(saved.bundle.data.dashboard.total).toBe('20');expect(saved.pending[0].value.command).toEqual(command);expect(saved.draft[0].value.notes).toBe('My unfinished form');
 await page.evaluate(()=>{const w=window as any;return w.__offlineTest.syncSavedRequests(w.__syncAccess)});expect(await page.evaluate(async()=>(await(window as any).__syncRepo.list('pending'))[0].sync.state)).toBe('blocked');expect(await page.evaluate(async()=>(await(window as any).__syncRepo.list('pending'))[0].value.command)).toEqual(command);
 await page.clock.runFor(2000);await settled(page);const before=calls.length;
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'}));await page.clock.fastForward(5*60*1000);await page.clock.runFor(1000);expect(calls).toHaveLength(before);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'))});await page.clock.runFor(2000);await settled(page);expect(calls.length).toBeGreaterThan(before);
 const beforeReconnect=calls.length;await page.clock.runFor(60000);await context.setOffline(true);await context.setOffline(false);await page.clock.runFor(2000);await settled(page);expect(calls.length).toBeGreaterThan(beforeReconnect);
});

test('interrupted delta retains old complete bundle and resumes durable cursor after reload',async({page})=>{
 await fixture(page,'delta-reload');let allowFinish=false;const cursors:(string|null)[]=[];
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),domain=url.searchParams.get('domain')??'notifications',body=route.request().postDataJSON();if(domain!=='records')return route.fulfill({json:{...bundle(domain,[],oldVersion),schemaVersion:3,unchanged:true,values:{}}});cursors.push(body.cursor);
  if(body.cursor==='second'&&!allowFinish)return route.abort('failed');const response=encodeDeltaChunk(body.cursor==='second'?bundle(domain,[{key:'dashboard',mode:'replace',value:{total:'99'}}]):bundle(domain,[{key:'borrowers',mode:'append',value:[unchanged]}],newVersion,'second'),body.need);return route.fulfill({json:response});
 });
 await start(page);await expect.poll(()=>page.evaluate(async()=>(await(window as any).__syncRepo.readDatasetProgress('records'))?.nextCursor)).toBe('second');
 await expect.poll(async()=>(await state(page)).updateFailed).toBe(true);expect((await state(page)).state).toBe('ready');
 expect(await page.evaluate(async()=>(await(window as any).__syncRepo.readDataset('records')).sourceVersion)).toBe(oldVersion);await page.evaluate(()=>(window as any).__stopPreparation());
 allowFinish=true;cursors.length=0;await fixture(page,'delta-reload',initial,false);await start(page);
 await expect.poll(()=>page.evaluate(async()=>(await(window as any).__syncRepo.readDataset('records')).sourceVersion)).toBe(newVersion);await settled(page);
 expect(cursors[0]).toBe('second');expect(cursors.every(cursor=>cursor==='second')).toBe(true);expect(await page.evaluate(async()=>(await(window as any).__syncRepo.readDataset('records')).data)).toEqual({borrowers:[unchanged],dashboard:{total:'99'}});expect(await page.evaluate(()=>(window as any).__syncRepo.readDatasetProgress('records'))).toBeNull();
});

test('dataset commit rejects stale in-flight foreground cache and retries current read',async({page})=>{
 await fixture(page,'delta-cache');let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let requests=0;
 await page.route('**/api/borrower-records/edited',async route=>{requests++;if(requests===1)await gate;return route.fulfill({json:{item:{id:'edited',name:requests===1?'Stale':'Current'}}})});
 await page.evaluate(()=>{const w=window as any;w.__readResult=w.__cacheTest.readCachedJson(w.__syncAccess,'/api/borrower-records/edited')});await expect.poll(()=>requests).toBe(1);
 await page.evaluate(async({asOf,newVersion})=>{const repo=(window as any).__syncRepo;await repo.saveDataset('records',{schemaVersion:1,domain:'records',complete:true,generation:'new',sourceVersion:newVersion,asOf,businessDate:'2026-10-14',data:{borrowers:[{id:'edited',name:'Current'}]}},await repo.readRevision())},{asOf,newVersion});release();
 expect(await page.evaluate(async()=>(await(window as any).__readResult).data.item.name)).toBe('Current');expect(requests).toBe(2);expect(await page.evaluate(async()=>{const w=window as any;return(await w.__syncRepo.readCachedResponse('json:'+location.origin+'/api/borrower-records/edited')).data.item.name})).toBe('Current');
});

test('mounted charge changes quietly, keeps editing source and shows remote deletion',async({page})=>{
 const charge={id:'late-charge',loanId:'loan',borrowerId:'borrower',borrowerName:'Synthetic borrower',chargeDate:'2026-10-14',principalDue:'10',interestDue:'2',totalPaid:'0',amountRemaining:'12',notes:'Original note',version:oldVersion,repayments:[],allocations:[]};
 await fixture(page,'delta-screen',{charges:[charge],payments:[]});let current:any={...charge,notes:'Other owner note',version:newVersion};
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url());if(url.pathname==='/api/charge-records/late-charge')return route.fulfill({json:{item:charge}});const domain=url.searchParams.get('domain')??'notifications',body=route.request().postDataJSON();if(domain!=='records')return route.fulfill({json:{...bundle(domain,[],oldVersion),schemaVersion:3,unchanged:true,values:{}}});return route.fulfill({json:encodeDeltaChunk(bundle(domain,patches({charges:current?[current]:[],payments:[]})),body.need)})});
 await page.evaluate(()=>(window as any).selectBackCase('prepared-charge'));await expect(page.locator('main')).toContainText('Original note');await start(page);await expect(page.locator('main')).toContainText('Other owner note');await settled(page);
 await page.getByRole('button',{name:'Edit charge',exact:true}).click();const note=page.getByRole('textbox',{name:'Notes',exact:true});await note.fill('Unsaved typed note');current=null;
 await page.evaluate(()=>window.dispatchEvent(new Event('mw-offline-prepare')));await expect.poll(()=>page.evaluate(async()=>(await(window as any).__syncRepo.readDataset('records')).data.charges.length)).toBe(0);await expect(note).toHaveValue('Unsaved typed note');
 await expect.poll(()=>page.evaluate(async()=>(await(window as any).__syncRepo.list('draft')).length)).toBe(1);const drafts=await page.evaluate(()=>(window as any).__syncRepo.list('draft'));expect(drafts[0].value.draft.source.version).toBe(newVersion);
 await page.getByRole('button',{name:'Back to charge details',exact:true}).first().click();await page.evaluate(()=>{const w=window as any;window.dispatchEvent(new CustomEvent('mw-offline-dataset-ready',{detail:{scopeName:w.__syncRepo.scopeName,domain:'records',changed:true}}))});await expect(page.getByRole('alert')).toContainText('Charge unavailable.');await expect(page.getByRole('button',{name:'Edit charge',exact:true})).toHaveCount(0);
});

test('authenticated reads remain available with a missing or expired offline lease',async({page})=>{
 await fixture(page,'delta-lease-harness',{},false);let requests=0;
 await page.route('**/api/borrower-records/edited',route=>{requests++;return route.fulfill({json:{item:{id:'edited',name:'Authenticated online'}}})});
 for(const expired of [false,true]){
  const result=await page.evaluate(async expired=>{const w=window as any,repo=w.__offlineTest.ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'unleased-'+expired},'synthetic');if(expired){await repo.authorize();await new Promise<void>((resolve,reject)=>{const request=indexedDB.open(repo.scopeName,1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put({key:'lease:owner',kind:'lease',savedAt:Date.now(),value:{verifiedAt:Date.now()-25*60*60*1000}});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(Error('Fixture lease expiration failed'))}})}
   try{const result=await w.__cacheTest.readCachedJson({...w.__syncAccess,offline:repo},'/api/borrower-records/edited');return {name:result.data.item.name,fromCache:result.fromCache}}catch(error){return {error:String(error)}}
  },expired);
  expect(result).toEqual({name:'Authenticated online',fromCache:false});
 }
 expect(requests).toBe(2);
});

test('a settled own write mid-traversal keeps the cursor and schedules one trailing recheck',async({page})=>{
 await fixture(page,'delta-own-write');const calls:string[]=[];let release:(()=>void)|null=null,walked=false;
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),domain=url.searchParams.get('domain')??'notifications',body=route.request().postDataJSON();calls.push(domain+':'+(body.cursor??'start')+(body.need?.length?'+need':''));
  expect(body.acceptChanged).toBe(true);
  if(domain==='records'&&!(walked&&body.sourceVersion===newVersion)){const step=body.cursor?Number(body.cursor):0;if(step===1)await new Promise<void>(resolve=>{release=resolve});if(step===3)walked=true;return route.fulfill({json:encodeDeltaChunk({...bundle(domain,step===3?[{key:'dashboard',mode:'replace',value:{total:'77'}}]:[],newVersion,step<3?String(step+1):null),progress:{completed:step+1,total:4}},body.need)})}
  return route.fulfill({json:{...bundle(domain,[],domain==='records'?newVersion:oldVersion),schemaVersion:3,unchanged:true,values:{}}});
 });
 await start(page);await expect.poll(()=>!!release).toBe(true);
 expect(await page.evaluate(async()=>(await(window as any).__syncRepo.readDatasetProgress('records'))?.nextCursor)).toBe('1');
 const id='90000000-0000-4000-8000-000000000002';
 await page.evaluate(async id=>{const repo=(window as any).__syncRepo;await repo.savePending(id,{domain:'borrower',command:{requestId:id,operation:'borrower.update',targetId:'edited',inputs:{}}});await repo.claimPending(id,'own-write');await repo.settlePending(id,'own-write',null)},id);
 expect(await page.evaluate(async()=>(await(window as any).__syncRepo.readDatasetProgress('records'))?.nextCursor)).toBe('1');
 release!();await settled(page);await expect.poll(()=>calls.filter(call=>call==='records:start').length).toBe(2);await settled(page);
 const records=calls.filter(call=>call.startsWith('records:'));
 expect(records).toEqual(['records:start','records:1','records:2','records:3','records:3+need','records:start']);
 expect(calls.filter(call=>call==='collection:start')).toHaveLength(2);
 const saved=await page.evaluate(async()=>(await(window as any).__syncRepo.readDataset('records')));expect(saved.sourceVersion).toBe(newVersion);expect(saved.data.dashboard.total).toBe('77');expect((await state(page)).updateFailed).toBe(false);
});

test('an offline page cursor is served from the complete local bundle while a traversal is active',async({page})=>{
 const rows=Array.from({length:30},(_,i)=>({id:'row-'+String(i).padStart(2,'0'),name:'Borrower '+i,hasActiveLoan:true,createdDate:'2026-01-01'}));
 await fixture(page,'delta-fast-page',{borrowerList:rows,payments:[]});let held=0;
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),domain=url.searchParams.get('domain')??'notifications';if(domain==='records'){held++;await new Promise(()=>{});return}return route.fulfill({json:{...bundle(domain,[],oldVersion),schemaVersion:3,unchanged:true,values:{}}})});
 await start(page);await expect.poll(()=>held).toBe(1);
 const result=await page.evaluate(async asOf=>{const w=window as any,cursor='offline:'+encodeURIComponent(JSON.stringify({scope:'/api/borrowers?limit=25',asOf,offset:25,anchor:'row-24'}));const started=performance.now();const value=await w.__cacheTest.readCachedJson(w.__syncAccess,'/api/borrowers?limit=25&cursor='+encodeURIComponent(cursor));return {elapsed:performance.now()-started,ids:value.data.items.map((row:any)=>row.id),fromCache:value.fromCache}},asOf);
 expect(result.fromCache).toBe(true);expect(result.ids).toEqual(rows.slice(25).map(row=>row.id));expect(result.elapsed).toBeLessThan(1000);expect(held).toBe(1);
 await page.evaluate(()=>(window as any).__stopPreparation());
});

test('a missing bundle page read fails as soon as the domain sync fails instead of waiting',async({page})=>{
 await fixture(page,'delta-fast-fail',initial,false);
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{code:'command_unavailable'}}));
 await start(page);
 const result=await page.evaluate(async()=>{const w=window as any,cursor='offline:'+encodeURIComponent(JSON.stringify({scope:'/api/borrowers?limit=25',asOf:'x',offset:25,anchor:'none'}));const started=performance.now();try{await w.__cacheTest.readCachedJson(w.__syncAccess,'/api/borrowers?limit=25&cursor='+encodeURIComponent(cursor));return {elapsed:performance.now()-started,ok:true}}catch(error){return {elapsed:performance.now()-started,ok:false,message:String(error)}}});
 expect(result.ok).toBe(false);expect(result.elapsed).toBeLessThan(10000);
});

test('legacy 409 no longer marks the domain failed, a legacy 400 drops acceptChanged, and a torn completion commits then rechecks once',async({page})=>{
 await fixture(page,'delta-torn');const bodies:any[]=[];let mode:'legacy-400'|'legacy-409'|'torn'='legacy-400';
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),domain=url.searchParams.get('domain')??'notifications',body=route.request().postDataJSON();
  if(domain!=='records')return route.fulfill({json:{...bundle(domain,[],oldVersion),schemaVersion:3,unchanged:true,values:{}}});
  bodies.push({mode,...body});
  if(mode==='legacy-400'){if(body.acceptChanged!==undefined)return route.fulfill({status:400,json:{error:'invalid_request',code:'invalid_request'}});mode='legacy-409'}
  if(mode==='legacy-409')return route.fulfill({status:409,json:{error:'dataset_changed',code:'dataset_changed'}});
  if(body.sourceVersion===newVersion)return route.fulfill({json:{...bundle(domain,[],newVersion),schemaVersion:3,unchanged:true,values:{}}});
  const torn=body.sourceVersion===oldVersion;
  return route.fulfill({json:{...encodeDeltaChunk(bundle(domain,[{key:'dashboard',mode:'replace',value:{total:torn?'42':'43'}}],torn?null:newVersion),body.need),...(torn?{changed:true}:{})}});
 });
 await start(page);await settled(page);
 expect(bodies.map(body=>body.mode)).toEqual(['legacy-400','legacy-400','legacy-409']);expect(bodies[0].acceptChanged).toBe(true);expect(bodies[1].acceptChanged).toBeUndefined();
 expect((await state(page)).updateFailed).toBe(false);expect((await state(page)).state).toBe('ready');
 expect(await page.evaluate(async()=>(await(window as any).__syncRepo.readDataset('records')).sourceVersion)).toBe(oldVersion);
 mode='torn';await page.evaluate(()=>window.dispatchEvent(new Event('mw-offline-prepare')));
 await expect.poll(()=>page.evaluate(async()=>(await(window as any).__syncRepo.readDataset('records')).data.dashboard?.total)).toBe('42');
 await expect.poll(()=>page.evaluate(async()=>(await(window as any).__syncRepo.readDataset('records')).sourceVersion)).toBe(newVersion);await settled(page);
 const torn=bodies.filter(body=>body.mode==='torn'&&!body.need.length);expect(torn.map(body=>body.sourceVersion)).toEqual([oldVersion,null]);
 expect(await page.evaluate(async()=>(await(window as any).__syncRepo.readDataset('records')).data.dashboard.total)).toBe('43');expect((await state(page)).updateFailed).toBe(false);
 await page.waitForTimeout(1500);expect(bodies.filter(body=>body.mode==='torn'&&!body.need.length)).toHaveLength(2);
});
