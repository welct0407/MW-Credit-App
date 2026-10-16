import {test,expect,type Page} from '@playwright/test';
// APP-OFFLINE-04: offline datasets, receipt media, caches and viewed snapshots are deleted after 7 days without a
// successful online check (lease:owner.verifiedAt). Unsynced pending:* rows, drafts, the lease and meta rows stay.
const issuer='https://securetoken.google.com/clever-oasis-508610-n7';
const day=24*60*60*1000;
async function blank(page:Page){
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>'}));
 await page.goto('/');
}
/** Seeds the owner namespace directly in IndexedDB, then lets a fresh repository instance open it. */
const seedAndOpen=(page:Page,uid:string,ageMs:number|null)=>page.evaluate(async({issuer,uid,ageMs})=>{
 const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');
 const {offlineNamespace}=await import('/apps/pwa/src/environment.ts');
 const name=offlineNamespace({issuer,uid},'synthetic'),now=Date.now();
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
  if(ageMs!==null)store.put({key:'lease:owner',kind:'lease',savedAt:now-ageMs,value:{verifiedAt:now-ageMs}});
  store.put({key:'meta:read-revision',kind:'meta',value:0});
  store.put({key:'dataset:records',kind:'dataset',savedAt:now,revision:0,value:{schemaVersion:1,domain:'records',complete:true,asOf:'2026-10-01T00:00:00Z',data:{}}});
  store.put({key:'dataset-progress:collection',kind:'dataset-progress',savedAt:now,revision:0,value:{schemaVersion:1,domain:'collection',complete:false,data:{}}});
  store.put({key:'dataset-media:synthetic-receipt',kind:'dataset-media',savedAt:now,revision:0,value:new Blob([new Uint8Array(16)],{type:'image/jpeg'})});
  store.put({key:'cache:synthetic-read',kind:'cache',savedAt:now,lastUsed:now,size:2,revision:0,value:{data:{},contentType:'application/json',format:'json'}});
  store.put({key:'snapshot:synthetic-snapshot',kind:'snapshot',savedAt:now,value:{charges:[]}});
  store.put({key:'draft:synthetic-draft',kind:'draft',savedAt:now,value:{amount:'1'}});
  store.put({key:'pending:synthetic-pending',kind:'pending',savedAt:now,value:{command:{requestId:'synthetic-pending'}},identity:'{}',sync:{state:'queued',attempted:false}});
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
 db.close();
 const repo=ownerOfflineRepository({issuer,uid},'synthetic');await repo.readRevision();
 const keys=await new Promise<string[]>((resolve,reject)=>{const request=indexedDB.open(name,1);request.onsuccess=()=>{const keys=request.result.transaction('records','readonly').objectStore('records').getAllKeys();keys.onsuccess=()=>{request.result.close();resolve((keys.result as string[]).sort())};keys.onerror=()=>reject(keys.error)};request.onerror=()=>reject(request.error)});
 return keys;
},{issuer,uid,ageMs});
const kept=['draft:synthetic-draft','meta:read-revision','pending:synthetic-pending'];
const offlineData=['cache:synthetic-read','dataset-media:synthetic-receipt','dataset-progress:collection','dataset:records','snapshot:synthetic-snapshot'];
test('offline data older than 7 days without an online check is deleted; pending, drafts, lease and meta stay',async({page})=>{
 await blank(page);
 expect(await seedAndOpen(page,'retention-expired',8*day)).toEqual(['draft:synthetic-draft','lease:owner','meta:read-revision','pending:synthetic-pending']);
});
test('a namespace without any online check loses offline data but keeps pending rows',async({page})=>{
 await blank(page);
 expect(await seedAndOpen(page,'retention-no-lease',null)).toEqual(kept);
});
test('offline data within 7 days of the last online check is kept',async({page})=>{
 await blank(page);
 expect(await seedAndOpen(page,'retention-recent',6*day)).toEqual([...offlineData,...kept,'lease:owner'].sort());
});
test('after the sweep the same owner can verify online and save a fresh dataset',async({page})=>{
 await blank(page);
 await seedAndOpen(page,'retention-resume',8*day);
 const restored=await page.evaluate(async({issuer})=>{
  const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');
  const repo=ownerOfflineRepository({issuer,uid:'retention-resume'},'synthetic');
  const before=await repo.readDataset('records');await repo.authorize();
  const saved=await repo.saveDataset('records',{schemaVersion:1,domain:'records',complete:true,asOf:'2026-10-16T00:00:00Z',data:{}},(await repo.readRevision())!);
  return {before,saved,after:!!(await repo.readDataset('records')),pending:(await repo.list('pending')).length};
 },{issuer});
 expect(restored).toEqual({before:null,saved:true,after:true,pending:1});
});
test('the saved changes screen states the 7-day offline retention',async({page})=>{
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/back-consumers-harness.tsx"></script>'}));
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>typeof (window as any).__realNoteRepository)).toBe('object');
 await page.evaluate(async()=>{await (window as any).__realNoteRepository.authorize();(window as any).selectBackCase('queue-list')});
 const region=page.getByRole('region',{name:'Saved unsynced changes',exact:true});
 await expect(region).toContainText('Offline data is removed after 7 days without an online check; saved changes are kept until they sync.');
});
test('opening the app also sweeps other owners on this device: expired offline data goes, pending rows and recent owners stay',async({page})=>{
 await blank(page);
 // Seed two other owners first (each seed opens its own repository once), then a new page load opens only the current owner.
 await seedAndOpen(page,'retention-other-expired',8*day);
 await page.reload();
 const keys=await page.evaluate(async({issuer,day})=>{
  const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');
  const {offlineNamespace}=await import('/apps/pwa/src/environment.ts');
  const name=(uid:string)=>offlineNamespace({issuer,uid},'synthetic'),now=Date.now();
  const put=(db:string,rows:any[])=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open(db,1);request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});request.onsuccess=()=>{const tx=request.result.transaction('records','readwrite');for(const row of rows)tx.objectStore('records').put(row);tx.oncomplete=()=>{request.result.close();resolve()};tx.onerror=()=>reject(tx.error)};request.onerror=()=>reject(request.error)});
  const rows=(age:number)=>[{key:'lease:owner',kind:'lease',savedAt:now-age,value:{verifiedAt:now-age}},{key:'dataset:records',kind:'dataset',savedAt:now,revision:0,value:{}},{key:'dataset-media:x',kind:'dataset-media',savedAt:now,revision:0,value:new Blob([new Uint8Array(4)],{type:'image/jpeg'})},{key:'pending:p',kind:'pending',savedAt:now,value:{},identity:'{}',sync:{state:'queued',attempted:false}}];
  await put(name('retention-other-stale'),rows(9*day));await put(name('retention-other-recent'),rows(day));
  const read=(db:string)=>new Promise<string[]>((resolve,reject)=>{const request=indexedDB.open(db);request.onsuccess=()=>{const keys=request.result.transaction('records','readonly').objectStore('records').getAllKeys();keys.onsuccess=()=>{request.result.close();resolve((keys.result as string[]).sort())}};request.onerror=()=>reject(request.error)});
  await ownerOfflineRepository({issuer,uid:'retention-current'},'synthetic').readRevision();
  const deadline=Date.now()+5000;let stale=await read(name('retention-other-stale'));
  while(stale.some(key=>key.startsWith('dataset'))&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,50));stale=await read(name('retention-other-stale'))}
  return {stale,recent:await read(name('retention-other-recent')),expired:await read(name('retention-other-expired'))};
 },{issuer,day});
 expect(keys).toEqual({stale:['lease:owner','pending:p'],recent:['dataset-media:x','dataset:records','lease:owner','pending:p'],expired:['draft:synthetic-draft','lease:owner','meta:read-revision','pending:synthetic-pending']});
});
