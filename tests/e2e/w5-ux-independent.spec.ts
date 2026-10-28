import {test,expect,type Page} from '@playwright/test';
import {chooseLanguage,routeSyntheticPreferences} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
// Wave 5 UX states (APP-UX-RECEIVE-01/03/04/05/06, SETTINGS-01/02/03, NAV-02, APP-OFFLINE-05) on the live-dev shell with synthetic data.
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=6900+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/w5-ux-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing',VITE_NOTIFICATIONS:'enabled'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(60000);
const auth=`let listener;const user={uid:'w5-ux-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(localStorage.getItem('w5-owner')?user:null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){const code=window.__signInFailure;if(code){window.__signInFailure=null;throw Object.assign(new Error('synthetic'),{code})}localStorage.setItem('w5-owner','1');listener(user)};export async function signOut(){localStorage.removeItem('w5-owner');listener(null)};`;
const borrower={id:'w5-B',displayName:'W5 Synthetic Borrower',borrowerDisplayName:'W5 Synthetic Borrower',status:'not_paid',amountDue:'60',amountCollected:'0',amountRemaining:'60',hasActiveLoan:true,outstandingPrincipal:'60',totalProfitEarned:'0'};
const charges=Array.from({length:6},(_,i)=>({id:'w5-C'+i,chargeDate:'2026-10-07',loanDisplayKey:'W5 synthetic loan',amountRemaining:'10',principalRemaining:'10',interestRemaining:'0'}));
const draft={ok:true,mode:'dev-owner-testing',scope:'all',businessDate:'2026-10-08',asOf:'2026-10-08T05:00:00Z',borrower:{id:borrower.id,displayName:borrower.displayName},accounts:[{id:'w5-A',label:'Synthetic receiving account'}]};
const eventId='00000000-0000-4000-8000-0000000000a5';
type State={posts:any[];notificationReads:string[];statusReads:number};
async function setup(page:Page,signIn=true){
 const state:State={posts:[],notificationReads:[],statusReads:0};
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>{const u=new URL(r.request().url()),list=u.pathname.endsWith('/charges');return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:draft.businessDate,timezone:'Asia/Bangkok',asOf:draft.asOf,items:list?charges.map(x=>({...x,loanId:'w5-L',paymentStatus:'ยังไม่ชำระ',paymentDate:null,totalPaid:'0',receivedToday:'0'})):u.pathname.endsWith('/upcoming')?[]:[borrower],borrower,nextCursor:null,horizonEnd:'2027-01-08',reviewRequired:false})})});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',r=>{
  const u=new URL(r.request().url()),path=u.pathname;
  if(path.includes('payment-drafts')){if(path.endsWith('/review')){const b=r.request().postDataJSON();const rows=charges.filter(x=>b.allocations.some((line:any)=>line.chargeId===x.id));return r.fulfill({contentType:'application/json',body:JSON.stringify({...draft,charges:rows,nextCursor:null})})}return r.fulfill({contentType:'application/json',body:JSON.stringify({...draft,charges,nextCursor:null})})}
  if(path==='/api/notifications/status'){state.statusReads++;return r.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,deviceRegistered:false,subscriptionId:null})})}
  if(/^\/api\/notifications\/[a-f0-9-]{36}$/.test(path)){state.notificationReads.push(path);return r.fulfill({contentType:'application/json',body:JSON.stringify({kind:'payment',id:'w5-payment'})})}
  if(path==='/api/dashboard')return r.fulfill({contentType:'application/json',body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})});
  if(r.request().method()==='POST'){state.posts.push(r.request().postDataJSON());return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'w5-payment',code:null,recordedAt:draft.asOf}})})}
  return r.fulfill({contentType:'application/json',body:'{"ok":true,"items":[],"nextCursor":null}'});
 });
 await routeSyntheticPreferences(page);
 await page.goto(base);await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();
 if(signIn){await page.getByRole('button',{name:'Continue with Google',exact:true}).click();await chooseLanguage(page,'EN');}
 return state;
}
async function openReceiving(page:Page){
 await page.getByRole('button',{name:'Collection',exact:true}).filter({visible:true}).click();await page.locator('.collection-tile-main').first().click();
 await page.getByRole('button',{name:'Receive selected charges',exact:true}).click();await expect(page.getByRole('textbox',{name:/^Amount received(?: \*)?$/})).toBeVisible();
}
const notify=(page:Page)=>page.evaluate(id=>new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=event=>resolve(event.data);navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'NOTIFICATION_OPEN',v:1,eventId:id},ports:[channel.port2]}))}),eventId);

test('W5 signed-out shell names the product, offers language on the card and explains a failed sign-in',async({page})=>{
 await setup(page,false);const mobile=page.viewportSize()!.width<=1050;
 await expect(page.getByRole('heading',{level:1})).toHaveText('MW Credit');await expect(page.locator('.brand-logo')).toHaveAttribute('alt','MW Credit');
 await expect(page.getByRole('button',{name:/^Refresh /})).toHaveCount(0);await expect(page.getByRole('button',{name:'Open navigation',exact:true})).toHaveCount(0);
 const card=page.locator('.access-blocked .access-language');if(mobile)await expect(card).toBeVisible();else await expect(card).toBeHidden();
 await chooseLanguage(page,'ไทย');await expect(page.getByRole('heading',{level:1})).toHaveText('MW สินเชื่อ');await expect(page.locator('.brand-logo')).toHaveAttribute('alt','MW สินเชื่อ');await expect(page.getByRole('heading',{name:'ลงชื่อเข้าใช้เพื่อดำเนินการต่อ',exact:true})).toBeVisible();await chooseLanguage(page,'EN');
 await page.evaluate(()=>{(window as any).__signInFailure='auth/popup-blocked'});const google=page.getByRole('button',{name:'Continue with Google',exact:true});await google.click();
 await expect(page.getByRole('alert')).toHaveText('The sign-in window was closed or blocked. Allow pop-ups for this site and try again.');await expect(google).toBeEnabled();
 await page.evaluate(()=>{(window as any).__signInFailure='auth/internal-error'});await google.click();await expect(page.getByRole('alert')).toHaveText('Sign-in did not complete. Try again. auth/internal-error');
 await google.click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByRole('heading',{level:1})).toHaveText('Dashboard');await expect(page.getByRole('button',{name:/^Refresh /})).toBeVisible();
});

test('W5 receiving shows a labelled Review, a hint for Auto-assign, captions in review and says offline before saving',async({page,context})=>{
 const state=await setup(page);await openReceiving(page);
 const review=page.getByRole('button',{name:'Review payment',exact:true});await expect(review).toHaveText('Review');const box=(await review.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(90);
 await expect(page.getByRole('button',{name:'Clear draft',exact:true})).toHaveText('Clear draft');
 const auto=page.getByRole('button',{name:'Auto-assign',exact:true});await expect(auto).toBeDisabled();await expect(auto).toHaveAccessibleDescription('Enter the amount received to use Auto-assign.');
 expect(await auto.evaluate(e=>({color:getComputedStyle(e).color,opacity:getComputedStyle(e).opacity}))).toEqual({color:'rgb(89, 89, 89)',opacity:'1'});
 await page.getByRole('textbox',{name:/^Amount received(?: \*)?$/}).fill('10');await expect(auto).toBeEnabled();await expect(page.locator('#auto-assign-help')).toHaveCount(0);
 await page.locator('.payment-allocation-row input[type=checkbox]').first().check();await page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/}).selectOption('w5-A');await review.click();
 const screen=page.locator('.selected-payment');await expect(page.getByRole('button',{name:'Confirm payment',exact:true})).toBeVisible();
 // R072: Edit and the confirm action share top, bottom and height (no baseline offset on iPhone).
 const aligned=async(name:string)=>{const edit=(await screen.getByRole('button',{name:'Edit',exact:true}).boundingBox())!,action=(await screen.getByRole('button',{name,exact:true}).boundingBox())!;expect(Math.abs(edit.y-action.y)).toBeLessThan(0.5);expect(Math.abs(edit.height-action.height)).toBeLessThan(0.5);expect(edit.height).toBeGreaterThanOrEqual(44)};await aligned('Confirm payment');
 expect((await screen.innerText()).split('W5 Synthetic Borrower').length-1).toBe(1);for(const caption of ['Receiving account: Synthetic receiving account','Payment date: 08-Oct','Payment method: Bank Transfer'])await expect(screen).toContainText(caption);
 await context.setOffline(true);
 await expect(page.locator('.offline-mode-status')).toHaveText('You are offline. Payments and changes are saved on this device and sync when you reconnect.');await expect(page.locator('.offline-mode-status')).toHaveCSS('font-size','14px');
 await expect(screen.getByText(/^Offline: this payment will be saved on this device/)).toBeVisible();const save=page.getByRole('button',{name:'Save for sync',exact:true});await expect(save).toBeEnabled();await aligned('Save for sync');await expect(page.getByRole('button',{name:'Confirm payment',exact:true})).toHaveCount(0);
 await context.setOffline(false);await expect(page.getByRole('button',{name:'Confirm payment',exact:true})).toBeEnabled();await expect(page.locator('.offline-mode-status')).toHaveCount(0);expect(state.posts).toEqual([]);
 await context.setOffline(true);await save.click();await expect(screen.getByText('Saved on this device. Will sync when connected.',{exact:true})).toBeVisible();
 const reference=screen.locator('details.request-reference');await expect(reference.locator('code')).toBeHidden();await reference.locator('summary').click();await expect(reference.locator('code')).toHaveText(/^[a-f0-9-]{36}$/);
 await page.getByRole('button',{name:'Open saved changes',exact:true}).click();await expect(page.getByRole('region',{name:'Saved unsynced changes',exact:true})).toBeVisible();expect(state.posts).toEqual([]);
 await context.setOffline(false);
});

test('W5 a notification tap waits while a form is open and opens in place otherwise',async({page})=>{
 const state=await setup(page);await openReceiving(page);
 expect(await notify(page)).toEqual({handled:true});
 await expect(page.getByRole('textbox',{name:/^Amount received(?: \*)?$/})).toBeVisible();const waiting=page.locator('.notification-waiting-status');await expect(waiting).toContainText('A notification is waiting. Finish or leave this form to open it.');expect(state.notificationReads).toEqual([]);
 await waiting.getByRole('button',{name:'Open notification',exact:true}).click();await expect(page.locator('main[data-workspace="notifications"]')).toBeVisible();await expect.poll(()=>state.notificationReads).toEqual(['/api/notifications/'+eventId]);await expect(waiting).toHaveCount(0);
 await page.getByRole('button',{name:'Collection',exact:true}).filter({visible:true}).click();await expect(page.locator('main[data-workspace="collection"]')).toBeVisible();
 expect(await notify(page)).toEqual({handled:true});await expect(page.locator('main[data-workspace="notifications"]')).toBeVisible();await expect.poll(()=>state.notificationReads.length).toBe(2);await expect(waiting).toHaveCount(0);
});

test('W5 Notifications shows its state on open without a tap and never prompts',async({page})=>{
 await page.addInitScript(()=>{(window as any).permissionRequests=0;Notification.requestPermission=async()=>{(window as any).permissionRequests++;return 'default'};Object.defineProperty(Notification,'permission',{configurable:true,get:()=>(window as any).__permission??'default'})});
 const state=await setup(page);if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 await page.getByRole('button',{name:'Notifications',exact:true}).filter({visible:true}).click();
 await expect(page.locator('.notification-state')).toHaveText('On for your account, not on this device.');await expect(page.getByRole('button',{name:'Check notification status',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Enable on this device',exact:true})).toBeVisible();
 expect(state.statusReads).toBeGreaterThanOrEqual(1);expect(await page.evaluate(()=>(window as any).permissionRequests)).toBe(0);
 // A browser-level block wins over the account state.
 await page.evaluate(()=>{(window as any).__permission='denied'});await page.getByRole('button',{name:'Notification history',exact:true}).click();await expect(page.locator('.notification-state')).toHaveText('Blocked by this browser. Allow notifications in site settings.');
});

test('W5 desktop sidebar fits 1280×800 with sign-out separated from language',async({page},info)=>{
 test.skip(info.project.name.startsWith('mobile'),'Desktop sidebar only');await page.setViewportSize({width:1280,height:800});await setup(page);
 const nav=page.locator('.live-desktop-nav');await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
 expect(await nav.evaluate(e=>e.scrollHeight<=e.clientHeight)).toBe(true);
 const gap=await page.evaluate(()=>{const language=document.querySelector('.live-desktop-nav .language')!.getBoundingClientRect(),group=document.querySelector('.live-desktop-nav .live-account-signout-group')!,signOut=group.querySelector('.live-account-signout')!.getBoundingClientRect();return {space:signOut.top-language.bottom,border:getComputedStyle(group).borderTopStyle}});
 expect(gap.space).toBeGreaterThanOrEqual(12);expect(gap.border).toBe('solid');
});
