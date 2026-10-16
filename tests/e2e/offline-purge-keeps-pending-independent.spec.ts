import {test,expect} from '@playwright/test';
// APP-OFFLINE-01: an involuntary purge (401/403) keeps unsynced pending:* rows and their inline receipt images; a voluntary sign-out purge still clears everything.
const issuer='https://securetoken.google.com/clever-oasis-508610-n7';
async function harness(page:any){
 await page.route('http://127.0.0.1:4173/',(r:any)=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/back-consumers-harness.tsx"></script>'}));
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>typeof (window as any).__offlineTest)).toBe('object');
}
const seed=async(page:any,uid:string)=>page.evaluate(async({issuer,uid}:{issuer:string;uid:string})=>{
 const api=(window as any).__offlineTest;const repo=api.ownerOfflineRepository({issuer,uid},'synthetic');await repo.authorize();
 const id='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222';
 const bytes=new Uint8Array(4096);for(let i=0;i<bytes.length;i++)bytes[i]=(i*31)%256;
 const digest=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 const image=new Blob([bytes],{type:'image/jpeg'});
 await repo.savePending(id,{domain:'payment',recoveryKind:'payment',command:{schemaVersion:6,requestId:id,borrowerId:'synthetic-borrower',allocations:[],cashAccountId:'synthetic-account',paymentDate:'2026-10-15',amountReceived:'100',paymentMethod:null,notes:null,receiptId:rid},receipt:{id:rid,image,borrowerId:'synthetic-borrower'}});
 await repo.saveSnapshot('synthetic-snapshot',{charges:[]});
 await repo.saveDataset('records',{schemaVersion:1,domain:'records',complete:true,asOf:'2026-10-15T00:00:00Z',data:{}},await repo.readRevision());
 const before=(await repo.list('pending'))[0];
 (window as any).__purgeRepo=repo;
 return {id,rid,identity:before.identity,hash:await digest(before.value.receipt.image),size:before.value.receipt.image.size,snapshot:!!(await repo.snapshot('synthetic-snapshot')),dataset:!!(await repo.readDataset('records'))};
},{issuer,uid});
test('involuntary purge keeps pending rows and receipt images, drops snapshots and datasets, and the same UID resumes',async({page})=>{
 await harness(page);const uid='purge-keeps-pending';
 const seeded=await seed(page,uid);expect(seeded.snapshot).toBe(true);expect(seeded.dataset).toBe(true);
 const after=await page.evaluate(async({issuer,uid,id}:{issuer:string;uid:string;id:string})=>{
  const repo=(window as any).__purgeRepo;await repo.purge({keepPending:true});
  const api=(window as any).__offlineTest;const digest=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  const again=api.ownerOfflineRepository({issuer,uid},'synthetic');const rows=await again.list('pending');
  const authorizedBefore=await again.authorized();await again.authorize();
  const claimed=await again.claimPending(id,'synthetic-owner',true);
  const other=api.ownerOfflineRepository({issuer,uid:'other-uid'},'synthetic');
  return {rows:rows.length,key:rows[0]?.key,identity:rows[0]?.identity,hash:rows[0]?await digest(rows[0].value.receipt.image):null,size:rows[0]?.value.receipt.image.size,state:rows[0]?.sync?.state,snapshot:await again.snapshot('synthetic-snapshot'),dataset:await again.readDataset('records'),authorizedBefore,claimed:!!claimed,otherRows:(await other.list('pending')).length};
 },{issuer,uid,id:seeded.id});
 expect(after).toEqual({rows:1,key:'pending:'+seeded.id,identity:seeded.identity,hash:seeded.hash,size:seeded.size,state:'queued',snapshot:null,dataset:null,authorizedBefore:false,claimed:true,otherRows:0});
 expect(after.size).toBe(4096);
});
test('voluntary purge without options still removes pending rows',async({page})=>{
 await harness(page);const uid='purge-voluntary';
 await seed(page,uid);
 const rows=await page.evaluate(async({issuer,uid}:{issuer:string;uid:string})=>{await (window as any).__purgeRepo.purge();const again=(window as any).__offlineTest.ownerOfflineRepository({issuer,uid},'synthetic');return {pending:(await again.list('pending')).length,snapshot:await again.snapshot('synthetic-snapshot')}},{issuer,uid});
 expect(rows).toEqual({pending:0,snapshot:null});
});
