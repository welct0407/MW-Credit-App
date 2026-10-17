import {test,expect,type Page} from '@playwright/test';

// R069 refresh UX: UX-REFRESH-06 (lists hold background swaps during touch/scroll),
// UX-REFRESH-07 (Cash keeps an open filter undisturbed) and the failed-domain retry back-off.
const domains=['records','collection','cash','management','notifications'];
const version='a'.repeat(64),asOf='2026-10-14T01:00:00.000Z',businessDate='2026-10-14';
const row=(id:string,displayName:string)=>({id,displayName,status:'not_paid',amountDue:'10',amountCollected:'0',amountRemaining:'10'});
const dashboard=(netProfitMtd:string)=>({operatingIncomeMtd:'100',expensesMtd:'0',netProfitMtd,tommyWithdrawnMtd:'0',lisaWithdrawnMtd:'0',unsettledProfitMtd:'0',cashPoolRemaining:'500'});
const account=(id:string,label:string)=>({id,holderId:'holder',holderLabel:'Holder',label});
const cash=(netProfit:string,accounts:any[])=>({overview:{ok:true,source:'synthetic',businessDate,asOf,dashboard:dashboard(netProfit)},preferences:{ok:true,source:'synthetic',item:{id:'preference',version,language:'English',statementAccountId:null,statementDate:null},accounts,dates:[businessDate]},statements:[]});
async function fixture(page:Page,uid:string,data:Record<string,any>={}){
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/back-consumers-harness.tsx"></script>'}));
 await page.goto('/');
 await page.evaluate(async({uid,data,domains,version,asOf,businessDate})=>{const w=window as any,repo=w.__offlineTest.ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid},'synthetic');await repo.authorize();w.__syncRepo=repo;w.__syncAccess={origin:location.origin,offline:repo,token:async()=>'synthetic-only',authFailure:()=>{}};for(const domain of domains)await repo.saveDataset(domain,{schemaVersion:1,domain,complete:true,sourceVersion:version,generation:'initial',asOf,businessDate,data:data[domain]??{}},await repo.readRevision())},{uid,data,domains,version,asOf,businessDate});
}
/** Commits a new bundle for one domain and announces it the way a completed check does. */
const publish=(page:Page,domain:string,data:any)=>page.evaluate(async({domain,data,asOf,businessDate})=>{const repo=(window as any).__syncRepo;await repo.saveDataset(domain,{schemaVersion:1,domain,complete:true,sourceVersion:null,generation:'g-'+Math.random(),asOf,businessDate,data},await repo.readRevision());window.dispatchEvent(new CustomEvent('mw-offline-dataset-ready',{detail:{scopeName:repo.scopeName,domain,changed:true}}))},{domain,data,asOf,businessDate});
const pointer=(page:Page,selector:string,type:'pointerdown'|'pointerup',pointerId=11)=>page.locator(selector).first().dispatchEvent(type,{pointerId,bubbles:true,isPrimary:true,pointerType:'touch'});

test('a Collection list does not reorder while it is touched or scrolled and applies about a second after, within the cap',async({page})=>{
 await fixture(page,'hold-collection',{collection:{items:[row('a','Alpha'),row('b','Bravo')],charges:[]}});
 await page.evaluate(()=>(window as any).selectBackCase('prepared-collection'));
 const names=()=>page.locator('.collection-tile-main strong').allTextContents();
 await expect.poll(names).toEqual(['Alpha','Bravo']);
 const applied=async(expected:string[],from:number)=>{await expect.poll(names,{timeout:15000}).toEqual(expected);return Date.now()-from};
 // A finger rests on the list: a reordering update with a new row waits, then applies about 1 s after release.
 await pointer(page,'.list-panel .section-heading','pointerdown');await publish(page,'collection',{items:[row('b','Bravo'),row('a','Alpha'),row('c','Charlie')],charges:[]});
 await page.waitForTimeout(1500);expect(await names()).toEqual(['Alpha','Bravo']);
 await pointer(page,'.list-panel .section-heading','pointerup');let elapsed=await applied(['Bravo','Alpha','Charlie'],Date.now());
 expect(elapsed).toBeGreaterThanOrEqual(800);expect(elapsed).toBeLessThan(3000);
 // Scrolling the list (or the page it flows with) holds the swap until the scroll has been idle for about 1 s.
 await publish(page,'collection',{items:[row('a','Alpha'),row('b','Bravo'),row('c','Charlie')],charges:[]});await expect.poll(names).toEqual(['Alpha','Bravo','Charlie']);
 await page.evaluate(()=>document.querySelector('.list-panel')!.dispatchEvent(new Event('scroll')));await publish(page,'collection',{items:[row('c','Charlie'),row('b','Bravo'),row('a','Alpha')],charges:[]});
 for(let step=0;step<8;step++){await page.evaluate(step=>step%2?window.dispatchEvent(new Event('scroll')):document.querySelector('.list-panel')!.dispatchEvent(new Event('scroll')),step);await page.waitForTimeout(250);if(step===7)expect(await names()).toEqual(['Alpha','Bravo','Charlie'])}
 elapsed=await applied(['Charlie','Bravo','Alpha'],Date.now());expect(elapsed).toBeGreaterThanOrEqual(600);expect(elapsed).toBeLessThan(3000);
 // Touching another panel does not hold this list.
 await pointer(page,'.detail-panel','pointerdown',12);await publish(page,'collection',{items:[row('a','Alpha'),row('c','Charlie')],charges:[]});
 await expect.poll(names,{timeout:700}).toEqual(['Alpha','Charlie']);await pointer(page,'.detail-panel','pointerup',12);await page.waitForTimeout(1200);
 // Never held forever: a press that does not end still gets the update after about 10 s, and nothing is dropped.
 await pointer(page,'.collection-tile-main','pointerdown',13);const pressed=Date.now();await publish(page,'collection',{items:[row('d','Delta'),row('a','Alpha')],charges:[]});
 elapsed=await applied(['Delta','Alpha'],pressed);expect(elapsed).toBeGreaterThanOrEqual(9000);expect(elapsed).toBeLessThan(12500);
 await pointer(page,'.collection-tile-main','pointerup',13);await page.waitForTimeout(1200);
 // An update still held when the tap opens a borrower (the list re-subscribes while busy) is applied afterwards, not lost.
 await pointer(page,'.list-panel .section-heading','pointerdown',14);await publish(page,'collection',{items:[row('e','Echo'),row('d','Delta')],charges:[]});
 await page.waitForTimeout(300);expect(await names()).toEqual(['Delta','Alpha']);
 await pointer(page,'.list-panel .section-heading','pointerup',14);await page.locator('.collection-tile-main').first().click();
 await applied(['Echo','Delta'],Date.now());
});

test('Cash keeps the account list and overview while a statement filter is open and applies them when it closes',async({page})=>{
 const initial=cash('100',[account('acc-a','Account A')]);
 await fixture(page,'hold-cash',{cash:initial});
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return path==='/api/cash-overview'?route.fulfill({json:initial.overview}):path==='/api/preferences'?route.fulfill({json:initial.preferences}):route.fulfill({json:{ok:true,source:'synthetic',items:[],nextCursor:null}})});
 await page.evaluate(()=>(window as any).selectBackCase('prepared-cash'));
 const select=page.getByRole('combobox',{name:'Account'}),card=page.locator('.cash-dashboard-card');
 await expect(select.locator('option')).toHaveCount(2);await expect(card).toContainText('100');
 // The account picker is open (focused): a background update must not change its options or the overview underneath it.
 await select.focus();await publish(page,'cash',cash('250',[account('acc-a','Account A'),account('acc-b','Account B')]));
 await page.waitForTimeout(1200);await expect(select.locator('option')).toHaveCount(2);await expect(card).not.toContainText('250');
 // Closing the filter applies the newest held values.
 await page.getByRole('button',{name:'Parent rerender'}).focus();
 await expect(select.locator('option')).toHaveCount(3);await expect(card).toContainText('250');
 // With no form open, later updates apply at once.
 await publish(page,'cash',cash('375',[account('acc-a','Account A')]));await expect(card).toContainText('375',{timeout:1500});await expect(select.locator('option')).toHaveCount(2);
});

test('a failing domain backs off 30 s, 60 s, 2 min, then every 5 min; success, online and focus reset it',async({page})=>{
 await fixture(page,'backoff');await page.clock.install();let cashOk=false,cashCalls=0;const calls:string[]=[];
 await page.route('**/api/**',route=>{const domain=new URL(route.request().url()).searchParams.get('domain')??'notifications';calls.push(domain);
  if(domain==='cash'){cashCalls++;if(!cashOk)return route.fulfill({status:503,json:{code:'unavailable'}})}
  return route.fulfill({json:{schemaVersion:3,domain,generation:'same',startedAt:asOf,asOf,businessDate,sourceVersion:version,patches:[],values:{},nextCursor:null,complete:true,unchanged:true}});
 });
 const state=()=>page.evaluate(()=>{const w=window as any;return w.__datasetTest.getOfflinePreparation(w.__syncRepo.scopeName)});
 await page.evaluate(()=>{const w=window as any;w.__stopPreparation=w.__datasetTest.startOfflinePreparation(w.__syncAccess)});
 await page.clock.runFor(2000);await expect.poll(()=>cashCalls).toBe(1);await expect.poll(async()=>(await state()).updateFailed).toBe(true);
 // A successful live read (mw-offline-queued) and a background page prepare no longer retry it at once.
 await page.evaluate(()=>{window.dispatchEvent(new Event('mw-offline-queued'));window.dispatchEvent(new CustomEvent('mw-offline-prepare',{detail:{domain:'cash',background:true}}))});
 await page.clock.runFor(1000);expect(cashCalls).toBe(1);
 // 30 s, 60 s, 2 min, then 5 min (cap): the 30-second poll keeps checking the other domains meanwhile.
 for(const [index,delay] of [30000,60000,120000,300000,300000].entries()){
  const polled=calls.filter(domain=>domain==='records').length;
  await page.clock.runFor(delay-3000);expect(cashCalls).toBe(index+1);
  await page.clock.runFor(6000);await expect.poll(()=>cashCalls).toBe(index+2);
  if(delay>30000)expect(calls.filter(domain=>domain==='records').length).toBeGreaterThan(polled);
 }
 // Success resets the back-off: the next failure waits 30 s again.
 cashOk=true;await page.evaluate(()=>window.dispatchEvent(new Event('mw-offline-prepare')));await expect.poll(()=>cashCalls).toBe(7);await expect.poll(async()=>(await state()).updateFailed).toBe(false);
 cashOk=false;await page.clock.runFor(31000);await expect.poll(()=>cashCalls).toBe(8);await expect.poll(async()=>(await state()).updateFailed).toBe(true);
 await page.clock.runFor(27000);expect(cashCalls).toBe(8);await page.clock.runFor(6000);await expect.poll(()=>cashCalls).toBe(9);
 // Now 60 s away: 'online' resets it and retries at once, and the following failure waits 30 s.
 await page.clock.runFor(2000);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.clock.runFor(1000);await expect.poll(()=>cashCalls).toBe(10);
 await page.clock.runFor(26000);expect(cashCalls).toBe(10);await page.clock.runFor(6000);await expect.poll(()=>cashCalls).toBe(11);
 // While hidden nothing is fetched, even once the back-off has passed; returning (focus/visible) refreshes every domain once.
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'}));await page.clock.runFor(120000);expect(cashCalls).toBe(11);
 const before=calls.length;await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))});
 await page.clock.runFor(2000);await expect.poll(()=>cashCalls).toBe(12);await expect.poll(()=>calls.length-before).toBeGreaterThanOrEqual(5);await page.clock.runFor(1000);
 expect(calls.slice(before).filter(domain=>domain==='cash')).toHaveLength(1);expect([...new Set(calls.slice(before))].sort()).toEqual([...domains].sort());
 // Focus reset it too: the next retry is 30 s later.
 await page.clock.runFor(25000);expect(cashCalls).toBe(12);await page.clock.runFor(8000);await expect.poll(()=>cashCalls).toBe(13);
 await page.evaluate(()=>(window as any).__stopPreparation());
});
