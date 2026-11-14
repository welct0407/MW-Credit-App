import {test,expect,type Page} from './fixtures/test';
// R156 part 2 (owner, 14 November 2026: "there should be a way to drop the not-yet-synced changes in the client, either
// through a button, or through a full sync"). Archie's D1–D7: Discard on every saved change and in its details, confirmed in
// a dialog (Cancel first and focused, the destructive choice last); a change never sent is discarded at once, online or
// offline; a sent one is checked with the server first (applied: kept as applied; rejected or never recorded: discarded;
// unreadable or offline: kept); a change being sent cannot be discarded; later note changes chained to it and the matching
// form draft go with it; Full sync with saved changes offers Send (today's behaviour) or Discard all. Invented data only.
type Status='rejected'|'unresolved'|'applied'|'unavailable';
async function harness(page:Page,status:{value:Status}={value:'unresolved'},log:string[]=[]){
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/back-consumers-harness.tsx"></script>'}));
 await page.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;log.push(r.request().method()+' '+path);
  if(path.startsWith('/api/operations/')||path.startsWith('/api/payment-commands/')){
   if(status.value==='unavailable')return r.fulfill({status:503,json:{ok:false,code:'command_unavailable'}});
   return r.fulfill({json:status.value==='unresolved'?{ok:true,kind:'unresolved',safeToUseNewRequestId:false}:{ok:true,kind:'recorded',originalOutcome:{status:status.value,code:status.value==='rejected'?'source_conflict':null}}});
  }
  return r.fulfill({json:{ok:true,items:[],nextCursor:null}})});
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>typeof (window as any).__realNoteRepository)).toBe('object');
}
type Seed={id:string;state?:'queued'|'blocked'|'syncing';attempted?:boolean;rejected?:boolean;predecessor?:string;receipt?:boolean;label?:string;target?:string};
const seed=(page:Page,row:Seed)=>page.evaluate(async({id,state='queued',attempted=false,rejected=false,predecessor,receipt=false,label,target='synthetic'}:Seed)=>{
 const repo=(window as any).__realNoteRepository;await repo.authorize();
 const value:any={domain:'borrower',borrowerLabel:label??'SYNTHETIC '+id.slice(0,8),command:{requestId:id,operation:'borrower.update',targetId:target,expectedVersion:'a'.repeat(64),predecessorRequestId:null,receiptId:null,inputs:{note:'saved '+id.slice(0,8)}}};
 if(predecessor)value.notePredecessor={requestId:predecessor,inputs:{note:'before'}};
 if(receipt){const image=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4])],{type:'image/png'});value.domain='payment';value.borrowerLabel=label??'SYNTHETIC payment';value.command={schemaVersion:7,requestId:id,borrowerId:'synthetic',receiptId:'9e9e9e9e-9e9e-4e9e-8e9e-9e9e9e9e9e9e'};value.receipt={id:'9e9e9e9e-9e9e-4e9e-8e9e-9e9e9e9e9e9e',image,borrowerId:'synthetic'}}
 await repo.savePending(id,value);
 if(state==='syncing'){await repo.claimPending(id,'synthetic-other-tab',true);return}
 if(state!=='queued'||attempted){const owner='synthetic-owner';await repo.claimPending(id,owner,true);if(attempted)await repo.markPendingDispatched(id,owner);
  await repo.settlePending(id,owner,{state,attempted,...(rejected?{code:'source_conflict',outcome:{kind:'recorded',originalOutcome:{status:'rejected',code:'source_conflict'}}}:state==='queued'?{code:'outcome_unknown'}:{code:'receipt_unsupported'})})}
},row);
const pending=(page:Page)=>page.evaluate(async()=>(await (window as any).__realNoteRepository.list('pending')).map((row:any)=>row.key.slice('pending:'.length)));
const drafts=(page:Page)=>page.evaluate(async()=>(await (window as any).__realNoteRepository.list('draft')).map((row:any)=>row.key));
const guard=(page:Page)=>page.evaluate(async()=>{const {signOutGuard}=await import('/apps/pwa/src/sign-out-guard.ts');return signOutGuard((await (window as any).__realNoteRepository.list('pending')).length,false)});
const open=async(page:Page,caseName='queue-list')=>{await page.evaluate(name=>(window as any).selectBackCase(name),caseName);const region=page.getByRole('region',{name:'Saved unsynced changes',exact:true});await expect(region.getByRole('heading',{name:'Saved changes'})).toBeVisible();return region};
const card=(page:Page,id:string)=>page.locator(`article[data-request-id="${id}"]`);
const dialog=(page:Page)=>page.getByRole('dialog');
const ids={a:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',c:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'};

test('1 a failed change with a recorded rejection is discarded from its card; sign-out is no longer blocked',async({page})=>{
 const status={value:'rejected' as Status};await harness(page,status);await seed(page,{id:ids.a,state:'blocked',attempted:true,rejected:true,label:'SYNTHETIC borrower one'});
 expect((await guard(page)).disabled).toBe(true);
 await open(page);const discard=card(page,ids.a).getByRole('button',{name:'Discard SYNTHETIC borrower one',exact:true});await expect(discard).toBeEnabled();
 await discard.click();
 // D7: a modal dialog named by its title; Cancel first and focused, the destructive choice last.
 const box=dialog(page);await expect(box).toBeVisible();await expect(box).toHaveAccessibleName('Discard this saved change?');
 // UX-DISC-04: a recorded rejection says plainly that it was not applied.
 await expect(box).toContainText(/SYNTHETIC borrower one, saved .+\. It was not applied\./);
 await expect(box.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
 expect(await box.getByRole('button').allTextContents()).toEqual(['Cancel','Discard']);
 await box.getByRole('button',{name:'Discard',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Discarded. Nothing was applied.'})).toBeVisible();
 await expect(card(page,ids.a)).toHaveCount(0);await expect(page.getByText('No unsynced changes.',{exact:true})).toBeVisible();
 expect(await pending(page)).toEqual([]);expect(await guard(page)).toEqual({disabled:false,label:'Sign out'});
 await expect(page.getByRole('heading',{name:'Saved changes'})).toBeFocused();
});

test('2 a change never sent is discarded offline without any request',async({page,context})=>{
 const log:string[]=[];await harness(page,{value:'unresolved'},log);await seed(page,{id:ids.a,label:'SYNTHETIC offline'});
 await open(page);await context.setOffline(true);log.length=0;
 await card(page,ids.a).getByRole('button',{name:'Discard SYNTHETIC offline',exact:true}).click();
 await expect(dialog(page)).toContainText(/SYNTHETIC offline, saved .+\. It was not sent and will not be applied\./);
 await dialog(page).getByRole('button',{name:'Discard',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Discarded. Nothing was applied.'})).toBeVisible();
 expect(await pending(page)).toEqual([]);expect(log).toEqual([]);
 await context.setOffline(false);
});

test('3 a sent change the server applied is settled as applied, not discarded',async({page})=>{
 const outcomes:any[]=[];await harness(page,{value:'applied'});await seed(page,{id:ids.a,attempted:true,label:'SYNTHETIC applied'});
 await page.exposeFunction('__outcome',(detail:any)=>outcomes.push(detail));await page.evaluate(()=>window.addEventListener('mw-offline-sync-outcome',event=>(window as any).__outcome((event as CustomEvent).detail)));
 await open(page);await card(page,ids.a).getByRole('button',{name:'Discard SYNTHETIC applied',exact:true}).click();
 await dialog(page).getByRole('button',{name:'Discard',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'This change was already applied, so it was not discarded.'})).toBeVisible();
 expect(await pending(page)).toEqual([]);await expect.poll(()=>outcomes.map(item=>[item.requestId,item.kind])).toEqual([[ids.a,'synced']]);
});

test('4 a sent change whose status cannot be read (503, then offline) is kept',async({page,context})=>{
 const status={value:'unavailable' as Status};await harness(page,status);await seed(page,{id:ids.a,attempted:true,label:'SYNTHETIC unknown'});
 await open(page);const discard=card(page,ids.a).getByRole('button',{name:'Discard SYNTHETIC unknown',exact:true});
 for(const offline of [false,true]){
  await context.setOffline(offline);await discard.click();await dialog(page).getByRole('button',{name:'Discard',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Could not check this change with the server. It is kept. Connect and try again.'})).toBeVisible();
  expect(await pending(page)).toEqual([ids.a]);await expect(discard).toBeFocused();
 }
 await context.setOffline(false);
});

test('5 a change being sent (another tab holds its lease) cannot be discarded',async({page})=>{
 await harness(page);await seed(page,{id:ids.a,state:'syncing',label:'SYNTHETIC sending'});await seed(page,{id:ids.b,label:'SYNTHETIC waiting'});
 await open(page);
 await expect(card(page,ids.a).getByRole('button',{name:'Discard SYNTHETIC sending',exact:true})).toBeDisabled();
 await expect(card(page,ids.b).getByRole('button',{name:'Discard SYNTHETIC waiting',exact:true})).toBeEnabled();
 // The repository refuses it too (D2), whatever the page shows.
 expect(await page.evaluate(async id=>(await (window as any).__realNoteRepository.discardPending(id)).result,ids.a)).toBe('leased');
 expect((await pending(page)).sort()).toEqual([ids.a,ids.b]);
});

test('6 discarding a note change removes the later note changes chained to it; the dialog names them',async({page})=>{
 await harness(page);await seed(page,{id:ids.a,label:'SYNTHETIC first note'});await seed(page,{id:ids.b,predecessor:ids.a,label:'SYNTHETIC second note'});await seed(page,{id:ids.c,label:'SYNTHETIC other'});
 await open(page);await card(page,ids.a).getByRole('button',{name:'Discard SYNTHETIC first note',exact:true}).click();
 await expect(dialog(page)).toContainText('1 later note change that depends on it is discarded too.');
 await dialog(page).getByRole('button',{name:'Discard',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Discarded. Nothing was applied. Also discarded 1 later note change.'})).toBeVisible();
 expect(await pending(page)).toEqual([ids.c]);
 await expect(card(page,ids.c).getByRole('button').first()).toBeFocused();
});

test('7 the matching form draft is removed with the saved change',async({page})=>{
 await harness(page);await seed(page,{id:ids.a,label:'SYNTHETIC with draft'});
 await page.evaluate(async()=>{const repo=(window as any).__realNoteRepository;await repo.saveDraft('borrower:synthetic',{domain:'borrower',label:'SYNTHETIC',draft:{id:'synthetic',fields:{name:'Edited'}}});await repo.saveDraft('borrower:someone-else',{domain:'borrower',label:'OTHER',draft:{id:'someone-else',fields:{name:'Other'}}})});
 await open(page);await card(page,ids.a).getByRole('button',{name:'Discard SYNTHETIC with draft',exact:true}).click();await dialog(page).getByRole('button',{name:'Discard',exact:true}).click();
 await expect.poll(()=>pending(page)).toEqual([]);await expect.poll(()=>drafts(page)).toEqual(['draft:borrower:someone-else']);
});

test('8 Cancel leaves everything and returns focus to the Discard button; the details view offers Discard too',async({page})=>{
 await harness(page,{value:'rejected'});await seed(page,{id:ids.a,state:'blocked',attempted:true,rejected:true,label:'SYNTHETIC keep'});
 await open(page);const discard=card(page,ids.a).getByRole('button',{name:'Discard SYNTHETIC keep',exact:true});
 await discard.click();await dialog(page).getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(dialog(page)).toHaveCount(0);await expect(discard).toBeFocused();expect(await pending(page)).toEqual([ids.a]);
 await discard.click();await page.keyboard.press('Escape');await expect(dialog(page)).toHaveCount(0);await expect(discard).toBeFocused();expect(await pending(page)).toEqual([ids.a]);
 // In the failure details: the old "Remove saved change" is replaced by Discard with the same check.
 await card(page,ids.a).getByRole('button',{name:'View failure details',exact:true}).click();
 await expect(page.getByRole('button',{name:'Remove saved change',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Discard SYNTHETIC keep',exact:true}).click();await dialog(page).getByRole('button',{name:'Discard',exact:true}).click();
 await expect(page.getByText('No unsynced changes.',{exact:true})).toBeVisible();expect(await pending(page)).toEqual([]);
});

test('9 Full sync with saved changes offers Send (today) or Discard all (summary, empty queue and drafts, full walk)',async({page})=>{
 const status={value:'unresolved' as Status};await harness(page,status);
 await seed(page,{id:ids.a,label:'SYNTHETIC one'});await seed(page,{id:ids.b,attempted:true,label:'SYNTHETIC two'});
 await page.evaluate(async()=>{const repo=(window as any).__realNoteRepository;await repo.saveDraft('loan:draft-one',{domain:'loan',label:'L',draft:{principal:'1'}})});
 await page.evaluate(()=>{(window as any).__prepare=[];window.addEventListener('mw-offline-prepare',event=>(window as any).__prepare.push((event as CustomEvent).detail))});
 const region=await open(page);const full=region.getByRole('button',{name:'Full sync',exact:true});
 await full.click();const box=dialog(page);await expect(box).toHaveAccessibleName('2 saved changes are not synced');
 await expect(box).toContainText('Send tries to apply them first; any that fail stay saved here. Discard removes them, and 1 unfinished draft, from this device; changes already applied are kept.');
 expect(await box.getByRole('button').allTextContents()).toEqual(['Cancel','Send saved changes, then re-download','Discard unsynced changes and re-download']);
 await expect(box.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
 await box.getByRole('button',{name:'Cancel',exact:true}).click();await expect(full).toBeFocused();expect((await pending(page)).length).toBe(2);
 expect(await page.evaluate(()=>(window as any).__prepare)).toEqual([]);
 await full.click();await dialog(page).getByRole('button',{name:'Discard unsynced changes and re-download',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Discarded 2 saved changes. Removed 1 draft.'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Saved changes'})).toBeFocused();
 expect(await pending(page)).toEqual([]);expect(await drafts(page)).toEqual([]);
 await expect.poll(()=>page.evaluate(()=>(window as any).__prepare)).toEqual([{all:true,full:true}]);
});

test('9b Full sync with saved changes: Send keeps today\'s order (saved changes first, then the full walk)',async({page})=>{
 const log:string[]=[];await harness(page,{value:'unresolved'},log);await seed(page,{id:ids.a,label:'SYNTHETIC send'});
 await page.evaluate(()=>{(window as any).__prepare=[];window.addEventListener('mw-offline-prepare',event=>(window as any).__prepare.push((event as CustomEvent).detail))});
 const region=await open(page);log.length=0;await region.getByRole('button',{name:'Full sync',exact:true}).click();
 await dialog(page).getByRole('button',{name:'Send saved changes, then re-download',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__prepare)).toEqual([{all:true,full:true}]);
 expect(log.some(entry=>entry==='POST /api/operations'),'the saved change was sent').toBe(true);
});

test('10 Full sync without saved changes keeps the single confirmation',async({page})=>{
 await harness(page);await page.evaluate(async()=>(window as any).__realNoteRepository.authorize());const region=await open(page);const messages:string[]=[];
 page.once('dialog',value=>{messages.push(value.message());void value.dismiss()});await region.getByRole('button',{name:'Full sync',exact:true}).click();
 await expect.poll(()=>messages).toEqual(['Re-download all data? Saved data stays usable; this takes about 20 seconds.']);await expect(dialog(page)).toHaveCount(0);
});

test('11 a saved payment with its slip photo is discarded (never sent) and the dialog says the photo goes',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await harness(page);await seed(page,{id:ids.a,receipt:true,label:'SYNTHETIC slip'});
 await open(page);await card(page,ids.a).getByRole('button',{name:'Discard SYNTHETIC slip',exact:true}).click();
 await expect(dialog(page)).toContainText('The attached slip photo is removed from this device.');
 await dialog(page).getByRole('button',{name:'Discard',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Discarded. Nothing was applied.'})).toBeVisible();
 expect(await pending(page)).toEqual([]);expect(errors).toEqual([]);
});

test('read-only access lists saved changes without Discard',async({page})=>{
 await harness(page);await seed(page,{id:ids.a,state:'blocked',attempted:true,rejected:true,label:'SYNTHETIC locked'});
 await open(page,'queue-list-readonly');await expect(card(page,ids.a)).toBeVisible();
 await expect(page.getByRole('button',{name:/^Discard/})).toHaveCount(0);expect(await pending(page)).toEqual([ids.a]);
});

test('Thai copy of the Discard dialog and result',async({page})=>{
 await harness(page);await seed(page,{id:ids.a,label:'ผู้กู้ทดสอบ'});
 await page.evaluate(()=>{(window as any).__typographyThai=true;(window as any).selectBackCase('queue-list')});
 await card(page,ids.a).getByRole('button',{name:'ทิ้งรายการนี้ ผู้กู้ทดสอบ',exact:true}).click();
 await expect(dialog(page)).toHaveAccessibleName('ทิ้งรายการที่บันทึกนี้หรือไม่');await expect(dialog(page)).toContainText(/ผู้กู้ทดสอบ บันทึกเมื่อ .+ รายการนี้ยังไม่ได้ส่งและจะไม่ถูกนำไปใช้/);
 await dialog(page).getByRole('button',{name:'ทิ้งรายการนี้',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'ทิ้งแล้ว ไม่มีการนำไปใช้'})).toBeVisible();
});


test('the saved change card wraps on a phone: every button stays within the screen',async({page})=>{
 await page.setViewportSize({width:320,height:700});await harness(page);await seed(page,{id:ids.a,state:'blocked',attempted:true,rejected:true,label:'SYNTHETIC narrow borrower name'});await open(page);
 for(const button of await card(page,ids.a).getByRole('button').all()){const box=(await button.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);expect(box.height).toBeGreaterThanOrEqual(44)}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

// Chase R156 review 1: a change found applied goes alone; the later note changes chained to it stay queued (now valid).
test('an applied change found while discarding goes alone; the note change chained to it stays',async({page})=>{
 await harness(page,{value:'applied'});await seed(page,{id:ids.a,state:'blocked',attempted:true,label:'SYNTHETIC applied first'});await seed(page,{id:ids.b,predecessor:ids.a,label:'SYNTHETIC later note'});
 await open(page);await card(page,ids.a).getByRole('button',{name:'Discard SYNTHETIC applied first',exact:true}).click();await dialog(page).getByRole('button',{name:'Discard',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'This change was already applied, so it was not discarded.'})).toBeVisible();
 expect(await pending(page)).toEqual([ids.b]);
});
// Chase R156 review 3: Discard all keeps the draft of a change it had to keep (not checked) and removes the others.
test('Discard all keeps the draft of a change that could not be checked and removes the other drafts',async({page})=>{
 await harness(page,{value:'unavailable'});await seed(page,{id:ids.a,attempted:true,label:'SYNTHETIC unchecked'});await seed(page,{id:ids.b,label:'SYNTHETIC never sent',target:'other-borrower'});
 await page.evaluate(async()=>{const repo=(window as any).__realNoteRepository;await repo.saveDraft('borrower:synthetic',{domain:'borrower',label:'S',draft:{id:'synthetic',fields:{name:'Edited'}}});await repo.saveDraft('loan:draft-one',{domain:'loan',label:'L',draft:{principal:'1'}})});
 const region=await open(page);await region.getByRole('button',{name:'Full sync',exact:true}).click();await dialog(page).getByRole('button',{name:'Discard unsynced changes and re-download',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Discarded 1 saved change. Kept 1 (could not be checked). Removed 1 draft.'})).toBeVisible();
 expect(await pending(page)).toEqual([ids.a]);expect(await drafts(page)).toEqual(['draft:borrower:synthetic']);
});
// UX-FSYNC-04: on a narrow phone the three choices stack full width, Cancel first.
test('the Full sync choices stack full width below 480px',async({page})=>{
 await page.setViewportSize({width:360,height:740});await harness(page);await seed(page,{id:ids.a,label:'SYNTHETIC narrow'});
 const region=await open(page);await region.getByRole('button',{name:'Full sync',exact:true}).click();
 await expect(dialog(page)).toBeVisible();const buttons=dialog(page).getByRole('button');await expect(buttons).toHaveCount(3);expect(await buttons.allTextContents()).toEqual(['Cancel','Send saved changes, then re-download','Discard unsynced changes and re-download']);
 const boxes=await Promise.all((await buttons.all()).map(button=>button.boundingBox()));
 for(let i=1;i<boxes.length;i++){expect(boxes[i]!.y).toBeGreaterThan(boxes[i-1]!.y);expect(Math.abs(boxes[i]!.width-boxes[0]!.width)).toBeLessThan(2)}
 expect(boxes[0]!.width).toBeGreaterThan(250);
});
