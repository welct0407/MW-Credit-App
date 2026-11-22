// R182 (owner request of 22 November 2026): the Collection payment history. The history button is a toggle (PH-TGL-01 to
// 04) and the list is two-line rows under month headings with exception-only status (PH-UX-01 to 07, 09). Owner-testing
// command access against synthetic routes; nothing is posted.
import {test,expect,type Page} from './fixtures/test';
import {chooseLanguage,chooseLanguagePreservingForm,routeSyntheticPreferences} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=9100+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/payment-history-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(60000);
const auth=`let listener;const user={uid:'payment-history-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(localStorage.getItem('ph-owner')?user:null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){localStorage.setItem('ph-owner','1');listener(user)};export async function signOut(){localStorage.removeItem('ph-owner');listener(null)};`;
const borrower={id:'ph-B',displayName:'Synthetic Fon',borrowerDisplayName:'Synthetic Fon',status:'not_paid',amountDue:'520',amountCollected:'0',amountRemaining:'520',hasActiveLoan:true,outstandingPrincipal:'520',totalProfitEarned:'0'};
const longNote='Automatic Instagram receipt payment igr:4f0c2a9e-7b1d-4c55-9a8e-12ab34cd56ef with a very long synthetic note that cannot fit on one line of a phone';
const payment=(id:string,paymentDate:string|null,amountReceived:string,extra:Record<string,unknown>={})=>({id,paymentDate,amountReceived,status:'Posted',accountLabel:'Dad SCB',notes:null,receiptReference:null,requestId:null,...extra});
const first=[payment('ph-1','2026-11-21','400',{notes:longNote,localPending:true}),payment('ph-2','2026-11-20','400',{notes:longNote}),payment('ph-3','2026-11-18','800',{status:'Processing',notes:'Paid 2 days at once'}),
 payment('ph-4','2026-11-15','1200',{accountLabel:'Cash',receiptReference:'synthetic-receipt'}),payment('ph-5','2026-11-05','400',{status:'Error',notes:longNote,receiptReference:'synthetic-receipt'}),payment('ph-6','2026-10-29','400'),payment('ph-7','2026-10-26','400',{status:null})];
const second=[payment('ph-8','2026-09-30','250',{notes:'Second page'}),payment('ph-9',null,'100',{status:'Cancelled'})];
type Fixture={history:string[];status:number;hold:boolean;release?:()=>void};
async function setup(page:Page){
 const state:Fixture={history:[],status:200,hold:false};
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async r=>{const u=new URL(r.request().url()),charges=u.pathname.endsWith('/charges'),upcoming=u.pathname.endsWith('/upcoming');
  return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:'2026-11-22',timezone:'Asia/Bangkok',asOf:'2026-11-22T05:00:00Z',items:upcoming?[]:charges?[{id:'ph-C',loanId:'ph-L',loanDisplayKey:'Synthetic loan',chargeDate:'2026-11-22',paymentStatus:'รอชำระ',paymentDate:null,amountRemaining:'520',totalPaid:'0',receivedToday:'0'}]:[borrower],borrower,nextCursor:null,horizonEnd:'2027-02-22',reviewRequired:false})})});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{const u=new URL(r.request().url());
  if(u.pathname.endsWith('/payments')){state.history.push(u.search);if(state.hold)await new Promise<void>(resolve=>{state.release=resolve});
   if(state.status!==200)return r.fulfill({status:state.status,contentType:'application/json',body:'{"ok":false}'}).catch(()=>{});
   const next=u.searchParams.get('cursor')==='page-2';return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,items:next?second:first,nextCursor:next?null:'page-2'})}).catch(()=>{})}
  if(u.pathname.startsWith('/api/payment-records/'))return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,item:{id:u.pathname.split('/').at(-1),version:'v1',status:'Posted',paymentDate:'2026-11-20',amountReceived:'400',accountLabel:'Dad SCB',notes:'Synthetic',allocations:[],repayments:[],cashMovements:[]}})});
  return r.fulfill({contentType:'application/json',body:'{"ok":true,"items":[],"nextCursor":null}'});
 });
 await routeSyntheticPreferences(page);await page.route('https://mw-credit-app-command-dev-test.run.app/api/dashboard',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})}));
 await page.goto(base);await expect(page.getByRole('button',{name:/Google/})).toBeVisible();await page.getByRole('button',{name:/Google/}).click();await chooseLanguage(page,'EN');await page.getByRole('button',{name:'Collection',exact:true}).click();await page.locator('.collection-tile-main').first().click();
 await expect(page.locator('.collection-charge')).toHaveCount(1);return state;
}
const toggle=(page:Page)=>page.locator('.collection-context .payment-history-toggle'),panel=(page:Page)=>page.locator('.payment-history-panel'),rows=(page:Page)=>page.locator('.ph-row');
test('R182 payment history opens as a list under month headings and the same button closes it; reopening starts at page 1',async({page})=>{
 const state=await setup(page),button=toggle(page);
 await expect(button).toHaveAttribute('aria-expanded','false');await expect(button).not.toHaveAttribute('aria-controls',/.+/);await expect(panel(page)).toHaveCount(0);
 await button.click();await expect(rows(page)).toHaveCount(7);await expect(button).toHaveAttribute('aria-expanded','true');await expect(button).toBeEnabled();
 expect(await button.getAttribute('aria-controls')).toBe(await panel(page).getAttribute('id'));
 await expect(page.getByRole('region',{name:'Payment history',exact:true})).toBeVisible();await expect(panel(page).getByRole('heading',{level:3,name:'Payment history',exact:true})).toBeVisible();
 await expect(page.locator('.ph-month')).toHaveText(['November 2026','October 2026']);
 // Exception-only status: Posted shows nothing; Confirming, Processing, Error and an unknown status are flagged.
 await expect(rows(page).nth(0).locator('.ph-flag')).toHaveText('Confirming…');await expect(rows(page).nth(1).locator('.ph-flag')).toHaveCount(0);await expect(rows(page).nth(2).locator('.ph-flag')).toHaveText('Processing');
 await expect(rows(page).nth(4).locator('.ph-flag')).toHaveText('Error');await expect(rows(page).nth(5).locator('.ph-meta')).toHaveCount(0);await expect(rows(page).nth(6).locator('.ph-flag')).toHaveText('Unavailable');
 await expect(panel(page)).not.toContainText('Posted');await expect(panel(page).getByRole('button',{name:'Payment details',exact:true})).toHaveCount(0);
 await expect(rows(page).nth(1).locator('.ph-date')).toHaveText('20-Nov');await expect(rows(page).nth(1).locator('.ph-account')).toHaveText('Dad SCB');await expect(rows(page).nth(1).locator('.ph-amount')).toHaveText('฿400');
 await expect(rows(page).nth(3).locator('.ph-receipt')).toHaveText('Receipt');await expect(rows(page).nth(4).locator('.ph-receipt')).toHaveText('· Receipt');
 // The whole row is the button (owner testing opens every payment).
 expect(await rows(page).evaluateAll(list=>list.map(node=>node.tagName))).toEqual(Array(7).fill('BUTTON'));
 // Page 2, then close: the second tap closes without scrolling the page and keeps the focus on the button.
 // Page 2: the pressed pager button is gone, so the panel heading takes the focus and sits in view below the top bar (PH-UX-09).
 await page.getByRole('button',{name:'Next payment history page',exact:true}).click();await expect(rows(page)).toHaveCount(2);
 // A payment without a date is grouped under "No date"; a cancelled one is flagged in grey.
 await expect(page.locator('.ph-month')).toHaveText(['September 2026','No date']);await expect(rows(page).nth(1).locator('.ph-flag')).toHaveText('Cancelled');
 expect(await rows(page).nth(1).locator('.ph-flag').evaluate(e=>[getComputedStyle(e).color,e.querySelector('svg')])).toEqual(['rgb(102, 102, 102)',null]);
 const title=panel(page).getByRole('heading',{level:3,name:'Payment history',exact:true});await expect(title).toBeFocused();
 await expect.poll(()=>title.evaluate(e=>{const bar=document.querySelector('.topbar'),fixed=bar&&/^(sticky|fixed)$/.test(getComputedStyle(bar).position)?bar.getBoundingClientRect().bottom:0,top=e.getBoundingClientRect().top;return top>=fixed-1&&top<innerHeight-40})).toBe(true);
 await page.getByRole('button',{name:'Previous payment history page',exact:true}).click();await expect(rows(page)).toHaveCount(7);await expect(title).toBeFocused();
 await page.getByRole('button',{name:'Next payment history page',exact:true}).click();await expect(rows(page)).toHaveCount(2);
 // Close: the second tap keeps the focus on the button and the button where it was on screen. Closing shortens the page:
 // when it can no longer hold its offset the browser clamps the scroll to the new end (the only move allowed), and the
 // button stays in view.
 await button.scrollIntoViewIfNeeded();const y=(await button.boundingBox())!.y;await button.click();await expect(panel(page)).toHaveCount(0);await expect(button).toHaveAttribute('aria-expanded','false');await expect(button).toBeFocused();{const moved=Math.abs((await button.boundingBox())!.y-y),clamped=await page.evaluate(()=>scrollY>=document.documentElement.scrollHeight-innerHeight-1);expect(moved<=1||clamped,'button moved '+moved+'px without a clamped scroll').toBe(true);await expect(button).toBeInViewport()}
 await button.click();await expect(rows(page)).toHaveCount(7);expect(state.history.at(-1)).toBe('');
 await chooseLanguagePreservingForm(page,'ไทย');await expect(page.locator('.ph-month')).toHaveText(['พฤศจิกายน 2569','ตุลาคม 2569']);await expect(rows(page).nth(1).locator('.ph-date')).toHaveText('20-พ.ย.');await expect(rows(page).nth(3).locator('.ph-receipt')).toHaveText('มีหลักฐาน');
});
test('R182 payment history closes while loading, from an open payment and after an error; Try again reloads inside the panel',async({page})=>{
 const state=await setup(page),button=toggle(page);
 // Closing while the read is in flight: the late answer never reopens the panel and there is no Loading text in it.
 state.hold=true;await button.click();await expect.poll(()=>!!state.release).toBe(true);await expect(panel(page)).toHaveAttribute('aria-busy','true');await expect(panel(page)).not.toContainText(/Loading|กำลังโหลด/);await expect(button).toBeEnabled();
 // (The held read answers 503, so nothing is saved for the next step's error to fall back on.)
 await button.click();await expect(panel(page)).toHaveCount(0);state.status=503;state.hold=false;state.release!();state.release=undefined;await page.waitForTimeout(300);await expect(panel(page)).toHaveCount(0);await expect(button).toHaveAttribute('aria-expanded','false');
 // An error stays inside the panel with Try again; the button still closes it; reopening then loads.
 await button.click();const alert=panel(page).getByRole('alert');await expect(alert).toContainText('Payment history unavailable.');await expect(rows(page)).toHaveCount(0);await expect(panel(page)).toHaveAttribute('aria-busy','false');
 await button.click();await expect(panel(page)).toHaveCount(0);await expect(page.getByText('Payment history unavailable.')).toHaveCount(0);
 await button.click();await expect(alert).toBeVisible();state.status=200;await alert.getByRole('button',{name:'Try again',exact:true}).click();await expect(rows(page)).toHaveCount(7);await expect(alert).toHaveCount(0);
 // From an open payment the second tap closes the whole panel (no confirmation); reopening shows the list again.
 await rows(page).nth(1).click();await expect(rows(page)).toHaveCount(0);await expect(panel(page)).toHaveCount(1);await expect(button).toHaveAttribute('aria-expanded','true');
 await button.click();await expect(panel(page)).toHaveCount(0);await expect(button).toHaveAttribute('aria-expanded','false');await expect(page.locator('dialog[open]')).toHaveCount(0);
 await button.click();await expect(rows(page)).toHaveCount(7);
});
test('R182 payment history row at 390px: two lines, the amount on the right, a long note on one line with an ellipsis, no sideways scroll',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await toggle(page).click();await expect(rows(page)).toHaveCount(7);
 const row=rows(page).nth(1),box=async(selector:string)=>(await row.locator(selector).boundingBox())!;
 const rowBox=(await row.boundingBox())!,date=await box('.ph-date'),account=await box('.ph-account'),amount=await box('.ph-amount'),meta=await box('.ph-meta');
 expect(rowBox.height).toBeGreaterThanOrEqual(44);expect(date.x).toBeLessThan(account.x);expect(account.x+account.width).toBeLessThanOrEqual(amount.x+1);expect(rowBox.x+rowBox.width-(amount.x+amount.width)).toBeLessThan(16);
 expect(meta.y).toBeGreaterThanOrEqual(date.y+date.height-4);expect(Math.abs(meta.x-account.x)).toBeLessThan(2);
 expect(await row.locator('.ph-note').evaluate(e=>[getComputedStyle(e).whiteSpace,getComputedStyle(e).textOverflow,e.scrollWidth>e.clientWidth,e.getBoundingClientRect().height<30,getComputedStyle(e).fontFamily===getComputedStyle(document.body).fontFamily])).toEqual(['nowrap','ellipsis',true,true,true]);
 // The flag and the receipt marker stay whole beside a long note.
 const flagged=rows(page).nth(4);expect(await flagged.locator('.ph-flag').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);await expect(flagged.locator('.ph-receipt')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('R182 the active Collection tab is left alone while a payment is open from the payment history (phone width)',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await toggle(page).click();await expect(rows(page)).toHaveCount(7);
 await rows(page).nth(1).click();await expect(rows(page)).toHaveCount(0);await expect(page.locator('.payment-record')).toBeVisible();
 const tab=page.getByRole('button',{name:'Collection',exact:true}).filter({visible:true});await tab.click();await page.waitForTimeout(300);
 await expect(page.locator('.payment-record')).toBeVisible();await expect(panel(page)).toHaveCount(1);await expect(toggle(page)).toHaveAttribute('aria-expanded','true');await expect(page.locator('.collection-compact-tile').first()).toBeHidden();
 // Back from the payment returns to the history list; with only the borrower open the tab goes back to the board.
 await page.locator('.topbar button').first().click();await expect(rows(page)).toHaveCount(7);await toggle(page).click();await expect(panel(page)).toHaveCount(0);
 await tab.click();await expect(page.locator('.collection-compact-tile').first()).toBeVisible();await expect(page.locator('.collection-charge')).toHaveCount(0);
});
