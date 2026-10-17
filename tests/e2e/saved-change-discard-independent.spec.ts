import {test,expect,type Page} from '@playwright/test';
// Owner decision 2026-10-16 (APP-OFFLINE-02 follow-up): a blocked saved change may be discarded after a confirmation; an attempted row
// without a recorded rejection gets the stronger "result is unknown" warning; read-only access shows no remove button.
const unknownText='This change was already sent and its result is unknown. It may or may not have been applied. Check the payment or record before entering it again. Remove it from this device?';
const knownText='Remove this saved change? It has not been applied.';
async function harness(page:Page){
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/back-consumers-harness.tsx"></script>'}));
 await page.route('**/api/**',r=>r.fulfill({json:{ok:true,kind:'unresolved',items:[],nextCursor:null,item:{id:'synthetic',note:'Original',version:'a'.repeat(64),name:'Synthetic',description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:false,referrerId:null,preferredReceivingAccountId:null}}}));
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>typeof (window as any).__realNoteRepository)).toBe('object');
}
type Seed={id:string;attempted:boolean;rejected:boolean};
const seed=(page:Page,row:Seed)=>page.evaluate(async({id,attempted,rejected}:Seed)=>{const repo=(window as any).__realNoteRepository;await repo.authorize();await repo.savePending(id,{domain:'borrower',borrowerLabel:'SYNTHETIC '+id.slice(0,8),command:{requestId:id,operation:'borrower.update',targetId:'synthetic',expectedVersion:'a'.repeat(64),predecessorRequestId:null,receiptId:null,inputs:{note:'blocked '+id.slice(0,8)}}});const owner='synthetic-owner';await repo.claimPending(id,owner,true);await repo.settlePending(id,owner,{state:'blocked',attempted,code:rejected?'source_conflict':'receipt_unsupported',...(rejected?{outcome:{kind:'recorded',originalOutcome:{status:'rejected',code:'source_conflict'}}}:{})})},row);
const pending=(page:Page)=>page.evaluate(()=>(window as any).__realNoteRepository.list('pending'));
const guard=(page:Page)=>page.evaluate(async()=>{const {signOutGuard}=await import('/apps/pwa/src/sign-out-guard.ts');return signOutGuard((await (window as any).__realNoteRepository.list('pending')).length,false)});
async function openDetails(page:Page,id:string,caseName='queue-list'){
 await page.evaluate(name=>(window as any).selectBackCase(name),caseName);
 const region=page.getByRole('region',{name:'Saved unsynced changes',exact:true});await expect(region).toContainText(id);
 await region.locator('article').filter({hasText:id}).getByRole('button',{name:'View failure details',exact:true}).dispatchEvent('click');
}
test('attempted blocked row without a recorded rejection can be discarded after the unknown-result warning',async({page})=>{
 await harness(page);const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';await seed(page,{id,attempted:true,rejected:false});
 expect(await guard(page)).toEqual({disabled:true,label:'Sign out',note:'1 saved change not synced yet. Sync before signing out.'});
 await openDetails(page,id);
 const remove=page.getByRole('button',{name:'Remove saved change',exact:true});await expect(remove).toBeVisible();
 const messages:string[]=[];
 page.once('dialog',dialog=>{messages.push(dialog.message());void dialog.dismiss()});await remove.dispatchEvent('click');
 expect(messages).toEqual([unknownText]);expect(await pending(page)).toHaveLength(1);await expect(remove).toBeVisible();
 page.once('dialog',dialog=>{messages.push(dialog.message());void dialog.accept()});await remove.dispatchEvent('click');
 await expect(page.getByText('No unsynced changes.',{exact:true})).toBeVisible();expect(messages).toEqual([unknownText,unknownText]);
 expect(await pending(page)).toEqual([]);expect(await guard(page)).toEqual({disabled:false,label:'Sign out'});
});
test('rejected and unattempted blocked rows keep the existing confirmation text',async({page})=>{
 await harness(page);const rejected='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',unattempted='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 await seed(page,{id:rejected,attempted:true,rejected:true});await seed(page,{id:unattempted,attempted:false,rejected:false});
 for(const id of [rejected,unattempted]){
  await openDetails(page,id);const messages:string[]=[];page.once('dialog',dialog=>{messages.push(dialog.message());void dialog.accept()});
  await page.getByRole('button',{name:'Remove saved change',exact:true}).dispatchEvent('click');await expect(page.getByRole('region',{name:'Saved unsynced changes',exact:true})).toBeVisible();
  expect(messages).toEqual([knownText]);
 }
 expect(await pending(page)).toEqual([]);
});
test('read-only access shows the lock text and no remove button for a blocked row',async({page})=>{
 await harness(page);const id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';await seed(page,{id,attempted:true,rejected:false});
 await openDetails(page,id,'queue-list-readonly');
 await expect(page.getByText('Connect to verify this account before accessing saved records.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Remove saved change',exact:true})).toHaveCount(0);
 expect(await pending(page)).toHaveLength(1);
});
