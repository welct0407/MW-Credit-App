import {chooseLanguage,signOut} from './live-controls';
import {test,expect} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=6100+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/independent-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(60000);
async function openSavedPayments(page:any){
 if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click();
 await page.getByRole('button',{name:'Saved payment drafts',exact:true}).click();
}
const auth=`let listener;const user={uid:'phase4-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(localStorage.getItem('mock-owner')?user:null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){localStorage.setItem('mock-owner','1');listener(user)};export async function signOut(){localStorage.removeItem('mock-owner');listener(null)};`;
const borrower={id:'ordinary-synthetic-B',displayName:'Synthetic borrower / ผู้กู้จำลอง',status:'not_paid',amountDue:'60',amountCollected:'0',amountRemaining:'60'};
const rows=Array.from({length:3},(_,i)=>({id:'charge'+i,chargeDate:'2026-10-07',loanDisplayKey:'Synthetic loan',amountRemaining:String((i+1)*10)}));
const future={id:'future',chargeDate:'2026-10-09',loanDisplayKey:'Future loan',amountRemaining:'7'};
const draft={ok:true,mode:'dev-owner-testing',businessDate:'2026-10-08',asOf:'2026-10-08T05:00:00Z',borrower:{id:borrower.id,displayName:borrower.displayName},charges:rows,accounts:[{id:'account',label:'Synthetic receiving account'}],nextCursor:null};
async function setup(page:any,posts:any[],lost=false){page.on('dialog',(dialog:any)=>void dialog.accept().catch(()=>{}));
 await page.route('**/deps/firebase_app.js*',(r:any)=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));
 await page.route('**/deps/firebase_auth.js*',(r:any)=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',(r:any)=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:draft.businessDate,timezone:'Asia/Bangkok',asOf:draft.asOf,items:r.request().url().includes('/charges')||r.request().url().includes('/upcoming')?[]:[borrower],borrower,nextCursor:null,horizonEnd:'2027-01-08',reviewRequired:false})}));
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async(r:any)=>{
  const url=new URL(r.request().url()),path=url.pathname;
  if(path.includes('payment-drafts')){let charges=url.searchParams.get('scope')==='all'?[...rows,future]:rows;if(url.searchParams.get('scope')==='future')charges=[future];if(path.endsWith('/review')){const b=r.request().postDataJSON();charges=[...rows,future].filter(x=>b.selectedChargeIds.includes(x.id));}return r.fulfill({contentType:'application/json',body:JSON.stringify({...draft,charges,total:charges.reduce((n,x)=>n+Number(x.amountRemaining),0).toString()})})}
  if(path.includes('/payments'))return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,items:[],nextCursor:null})});
  if(r.request().method()==='POST'){posts.push(r.request().postDataJSON());if(lost)return r.abort('failed');return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-payment',code:null,recordedAt:draft.asOf}})})}
  if(path.endsWith('/result'))return r.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});
  return r.fulfill({contentType:'application/json',body:'{"ok":true,"kind":"unresolved","safeToUseNewRequestId":false}'});
 });
 await page.goto(base);if(await page.getByRole('button',{name:/Google/}).count())await page.getByRole('button',{name:/Google/}).click();await chooseLanguage(page,'EN');await page.getByRole('button',{name:'Collection',exact:true}).click();await page.locator('.collection-borrower').first().click();await page.getByRole('button',{name:'Receive selected charges',exact:true}).click();
}
test('P4-16 ordinary v5 future Single Full and Receive All at 320px',async({page})=>{
 const posts:any[]=[];await page.setViewportSize({width:320,height:850});await setup(page,posts);
 await expect(page.locator('.payment-charge-choice input')).toHaveCount(4);await page.locator('.payment-charge-choice').filter({hasText:'Future loan'}).getByRole('checkbox').check();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('ไทย\nreceipt');
 await page.getByRole('button',{name:'Review payment',exact:true}).click();await page.getByRole('button',{name:'Confirm payment online',exact:true}).click();await expect(page.getByRole('heading',{name:'Collection borrowers',exact:true})).toBeVisible();expect(posts[0]).toMatchObject({schemaVersion:5,allocationMethod:'Single Full',selectedChargeIds:['future'],amountReceived:'7',notes:'ไทย\nreceipt'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.reload();await page.getByRole('button',{name:'Collection',exact:true}).click();await page.locator('.collection-borrower').first().click();await page.getByRole('button',{name:'Receive selected charges',exact:true}).click();await page.getByRole('checkbox',{name:'Select all due charges',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Select all due charges',exact:true})).toBeChecked();await page.getByRole('button',{name:'Review payment',exact:true}).click();await page.getByRole('button',{name:'Confirm payment online',exact:true}).click();await expect.poll(()=>posts.length).toBe(2);expect(posts[1]).toMatchObject({schemaVersion:5,allocationMethod:'Receive All',selectedChargeIds:['charge0','charge1','charge2'],amountReceived:'60'});
});
test('P4-11/12 saved draft reconnect never auto posts; P4-13 reload Unknown exact retry',async({page,context})=>{
 const posts:any[]=[];await setup(page,posts,true);await page.locator('.payment-charge-choice input').first().check();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('draft kept ไทย');await expect.poll(()=>page.evaluate(async()=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'phase4-owner'});return (await repo.list('draft'))[0]?.value.notes})).toBe('draft kept ไทย');
 await context.setOffline(true);await expect(page.getByText('Saved on this device — may be outdated')).toBeVisible();await page.getByRole('button',{name:/Synthetic borrower/}).click();await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('draft kept ไทย');await expect(page.getByRole('button',{name:'Review payment',exact:true})).toBeDisabled();expect(posts).toHaveLength(0);
 await context.setOffline(false);await page.reload();await page.getByRole('button',{name:'Collection',exact:true}).click();await page.locator('.collection-borrower').first().click();await page.getByRole('button',{name:'Receive selected charges',exact:true}).click();await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('draft kept ไทย');expect(posts).toHaveLength(0);
 await page.getByRole('button',{name:'Review payment',exact:true}).click();await page.getByRole('button',{name:'Confirm payment online',exact:true}).click();await expect(page.getByRole('heading',{name:'Outcome unknown'})).toBeVisible();expect(posts).toHaveLength(1);
 await page.reload();await openSavedPayments(page);await page.getByRole('button',{name:/Synthetic borrower/}).click();await expect(page.getByRole('heading',{name:'Outcome unknown'})).toBeVisible();await page.getByRole('button',{name:'Check status',exact:true}).click();await page.getByRole('button',{name:'Retry same command',exact:true}).click();await expect.poll(()=>posts.length).toBe(2);expect(posts[1]).toEqual(posts[0]);
});



test('P4-13 failed pending storage freezes original command before any dispatch',async({page})=>{
 const posts:any[]=[];await setup(page,posts,true);await page.locator('.payment-charge-choice input').first().check();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('frozen original');await page.getByRole('button',{name:'Review payment',exact:true}).click();
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;(window as any).originalPut=original;IDBObjectStore.prototype.put=function(value:any,...rest:any[]){if(value.kind==='pending')throw new DOMException('Synthetic quota','QuotaExceededError');return original.call(this,value,...rest)}});
 await page.getByRole('button',{name:'Confirm payment online',exact:true}).click();await expect(page.getByRole('heading',{name:'Outcome unknown'})).toBeVisible();expect(posts).toHaveLength(0);await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveCount(0);
 await page.evaluate(()=>{IDBObjectStore.prototype.put=(window as any).originalPut});await page.getByRole('button',{name:'Check status',exact:true}).click();await page.getByRole('button',{name:'Retry same command',exact:true}).click();await expect.poll(()=>posts.length).toBe(1);expect(posts[0]).toMatchObject({notes:'frozen original',selectedChargeIds:['charge0'],amountReceived:'10'});
});
test('P4-10 delayed old-owner draft response cannot refill storage after sign-out',async({page})=>{
 const posts:any[]=[];await setup(page,posts);await page.getByRole('button',{name:'Back to Collection',exact:true}).click();let release:(()=>void)|undefined,done:(()=>void)|undefined;const completed=new Promise<void>(resolve=>done=resolve);
 await page.route('https://mw-credit-app-command-dev-test.run.app/api/payment-drafts/**',async r=>{await new Promise<void>(resolve=>release=resolve);await r.fulfill({contentType:'application/json',body:JSON.stringify(draft)}).catch(()=>{});done!()});
 await page.getByRole('button',{name:'Receive selected charges',exact:true}).click();await expect.poll(()=>!!release).toBe(true);await signOut(page);await expect(page.getByRole('button',{name:/Google/})).toBeVisible();release!();await completed;
 const saved=await page.evaluate(async()=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'phase4-owner'});return {snapshots:(await repo.list('snapshot')).length,drafts:(await repo.list('draft')).length,pending:(await repo.list('pending')).length,authorized:await repo.authorized()}});expect(saved).toEqual({snapshots:0,drafts:0,pending:0,authorized:false});expect(posts).toHaveLength(0);
});


