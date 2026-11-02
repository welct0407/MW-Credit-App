import {test,expect,type Page} from '@playwright/test';
import {chooseLanguagePreservingForm,routeSyntheticPreferences} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=7800+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/payforward-independent-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(45000);
// Explicit synthetic auth/HTTP seams; this file never claims actual Firebase SDK/offline worker proof.
const auth=`let listener;const user={uid:'payforward-independent-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(localStorage.getItem('payforward-owner')?user:null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){localStorage.setItem('payforward-owner','1');listener(user)};export async function signOut(){localStorage.removeItem('payforward-owner');listener(null)};`;

// R110 Pay Forward (Release 1): the Remainder block of Receive payment. Synthetic seams only; the server is simulated from the
// same rules as pwa_pay_forward_plan_v1 (due 10 first, then forward 10 a day or principal on today's charge). Shapes follow
// Byte's final contract: Auto-assign returns `remainder` {amount, loans, forward, principal[]}; POST /plan returns {plan, loans}.
const borrower={id:'pf-B',displayName:'PayForward ผู้กู้จำลอง / Synthetic borrower',borrowerDisplayName:'PayForward ผู้กู้จำลอง / Synthetic borrower',status:'not_paid',amountDue:'10',amountCollected:'0',amountRemaining:'10',hasActiveLoan:true,outstandingPrincipal:'1000',totalProfitEarned:'0'};
const due=[{id:'pf-due',chargeDate:'2026-10-08',loanDisplayKey:'Daily loan / เงินกู้จำลอง',principalRemaining:'0',interestRemaining:'10',amountRemaining:'10'}];
const draft={ok:true,mode:'dev-owner-testing',scope:'all',businessDate:'2026-10-08',asOf:'2026-10-08T05:00:00Z',borrower:{id:borrower.id,displayName:borrower.displayName},accounts:[{id:'pf-A',label:'Synthetic receiving account'}]};
const label='Daily loan / เงินกู้จำลอง';
const addDays=(date:string,n:number)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const keyOf=(date:string)=>'cg8:5:pf-LA:'+date;
type State={plans:any[],reviews:any[],posts:any[],drift:boolean};
function planFor(amount:number,purpose:any){
 const remainder=amount-10,allocations:any[]=[{chargeId:'pf-due',principal:'0',interest:'10',expectedPrincipalRemaining:'0',expectedInterestRemaining:'10',chargeDate:'2026-10-08'}];
 const materialize:any[]=[],forward:any[]=[],principal:any[]=[],paidThrough:Record<string,string>={},settles:string[]=[];let left=remainder,daily=10;
 const ask=(purpose?.principal??[]).find((p:any)=>p.loanId==='pf-LA');
 if(ask){const a=Number(ask.amount);if(a>=1000)settles.push('pf-LA');else{left-=a;daily=Math.round((1000-a)/100);allocations[0]={...allocations[0],principal:String(a),expectedPrincipalRemaining:String(a)};
  principal.push({loanId:'pf-LA',kind:'raise',chargeId:'pf-due',chargeDate:'2026-10-08',amount:String(a),accruedInterest:'0',principalDue:String(a),outstandingBefore:'1000',outstandingAfter:String(1000-a),dailyBefore:'10',dailyAfter:String(daily),nextChargeDate:'2026-10-09',nextChargeAmount:String(daily)})}}
 if(purpose?.forward)for(let n=1;left>0&&n<=93;n++){const date=addDays('2026-10-08',n),pay=Math.min(daily,left),row={loanId:'pf-LA',chargeId:keyOf(date),chargeDate:date,principalDue:'0',interestDue:String(daily)};
  materialize.push(row);forward.push({...row,principal:'0',interest:String(pay),partial:pay<daily,booked:true});allocations.push({chargeId:row.chargeId,principal:'0',interest:String(pay),expectedPrincipalRemaining:'0',expectedInterestRemaining:String(daily),chargeDate:date});if(pay===daily)paidThrough['pf-LA']=date;left-=pay}
 return {day:'2026-10-08',amount:String(amount),dueTotal:'10',remainder:String(remainder),due:['pf-due'],allocations,materialize,principal,forward,uncovered:String(Math.max(0,left)),paidThrough,settles,blocked:[],options:[]};
}
// What the server's Auto-assign adds above the due amount (nothing chosen): the forward preview and one principal option.
function remainderFor(amount:number){
 const rest=amount-10,fwd=planFor(amount,{forward:true,principal:[]}),pr=planFor(amount,{forward:false,principal:[{loanId:'pf-LA',amount:String(rest)}]});
 return {amount:String(rest),loans:{'pf-LA':label},forward:{rows:fwd.forward,paidThrough:fwd.paidThrough,uncovered:fwd.uncovered,blocked:[]},principal:[{loanId:'pf-LA',amount:String(rest),settles:pr.settles.length>0,entry:pr.principal[0]??null}]};
}
async function setup(page:Page){
 const state:State={plans:[],reviews:[],posts:[],drift:false};
 page.on('dialog',dialog=>void dialog.accept());
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>{const u=new URL(r.request().url()),charges=u.pathname.endsWith('/charges'),list=u.pathname.endsWith('/upcoming');return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:draft.businessDate,timezone:'Asia/Bangkok',asOf:draft.asOf,items:list?[]:charges?due.map(x=>({...x,loanId:'pf-LA',paymentStatus:'ยังไม่ชำระ',paymentDate:null,totalPaid:'0',receivedToday:'0'})):[borrower],borrower,nextCursor:null,horizonEnd:'2027-01-08',reviewRequired:false})})});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
  const u=new URL(r.request().url()),path=u.pathname,json=(body:any,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path.includes('/payment-drafts/')){
   if(path.endsWith('/plan')){const body=r.request().postDataJSON();state.plans.push(body);return json({businessDate:draft.businessDate,purpose:body.purpose,plan:planFor(Number(body.amountReceived),body.purpose),loans:{'pf-LA':label}})}
   if(path.endsWith('/auto-assign')){const body=r.request().postDataJSON(),amount=Number(body.amountReceived),first=Math.min(amount,10);
    return json({...draft,charges:due,allocations:[{chargeId:'pf-due',principal:'0',interest:String(first),expectedPrincipalRemaining:'0',expectedInterestRemaining:'10',chargeDate:'2026-10-08'}],amountReceived:body.amountReceived,allocated:String(first),unallocated:String(amount-first),...(amount>10?{remainder:remainderFor(amount)}:{}),nextCursor:null})}
   if(path.endsWith('/review')){const body=r.request().postDataJSON();state.reviews.push(body);if(state.drift)return json({ok:false,code:'plan_changed',charges:due,upcoming:[],businessDate:draft.businessDate},409);return json({...draft,charges:due,upcoming:[],allocations:body.allocations,materialize:body.materialize,principal:body.principal,total:body.amountReceived,nextCursor:null})}
   return json({...draft,charges:due,upcoming:[],nextCursor:null});
  }
  if(path.endsWith('/payments'))return json({ok:true,items:[],nextCursor:null});
  if(path.endsWith('/api/payment-commands')&&r.request().method()==='POST'){state.posts.push(r.request().postDataJSON());return json({ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-payforward',code:null,recordedAt:draft.asOf}})}
  return json({ok:true,kind:'unresolved',safeToUseNewRequestId:false});
 });
 await routeSyntheticPreferences(page);await page.route('https://mw-credit-app-command-dev-test.run.app/api/dashboard',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})}));
 await page.goto(base);await page.getByRole('button',{name:/Google/}).click();await chooseLanguagePreservingForm(page,'EN');await page.getByRole('button',{name:'Collection',exact:true}).click();await page.locator('.collection-tile-main').first().click();await page.getByRole('button',{name:'Receive selected charges',exact:true}).click();
 await expect(page.getByRole('textbox',{name:/^Amount received(?: \*)?$/})).toBeVisible();const account=page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/});if(!await account.inputValue())await account.selectOption('pf-A');return state;
}
const amount=(page:Page)=>page.getByRole('textbox',{name:/^Amount received(?: \*)?$/});
const review=(page:Page)=>page.getByRole('button',{name:'Review payment',exact:true});
const auto=(page:Page)=>page.getByRole('button',{name:'Auto-assign',exact:true});
const block=(page:Page)=>page.getByRole('group',{name:/^Remainder ฿\d/});
const choice=(page:Page,name:RegExp)=>page.getByRole('radio',{name});
const option=(page:Page,name:RegExp)=>page.locator('.remainder-options label').filter({hasText:name});
const hint=(page:Page)=>page.locator('#remainder-help');

test('the Remainder block appears only above the due amount, preselects nothing and keeps Review disabled until a choice is made',async({page})=>{
 const s=await setup(page);
 await amount(page).fill('10');await auto(page).click();
 await expect(block(page)).toHaveCount(0);await expect(review(page)).toBeEnabled();expect(s.plans).toHaveLength(0);
 await amount(page).fill('60');await auto(page).click();
 await expect(block(page)).toBeVisible();
 for(const name of [/^Pay forward/,/^Repay principal/,/^Split/]){await expect(choice(page,name)).toBeVisible();await expect(choice(page,name)).not.toBeChecked()}
 // Each option previews its effect before anything is chosen.
 await expect(option(page,/^Pay forward/)).toContainText('9–13 Oct (10 × 5), paid through 13 Oct');await expect(option(page,/^Repay principal/)).toContainText('1,000 → 950');
 await expect(page.getByText('Pay ahead',{exact:true})).toHaveCount(0);
 await expect(review(page)).toBeDisabled();await expect(hint(page)).toHaveText('Choose how to use the remainder before review.');await expect(review(page)).toHaveAttribute('aria-describedby',/remainder-help/);
 expect(s.reviews).toHaveLength(0);expect(s.posts).toHaveLength(0);expect(s.plans).toHaveLength(0);
});

test('Pay forward: one collapsed row with a count, Paid through, Change; v10 materialize is reviewed and posted',async({page})=>{
 const s=await setup(page);await amount(page).fill('60');await auto(page).click();
 await choice(page,/^Pay forward/).check();
 await expect.poll(()=>s.plans.length).toBe(1);expect(s.plans[0]).toEqual({amountReceived:'60',purpose:{forward:true,principal:[],loans:null}});
 // The choice collapses to a summary line with Change; focus moves to Change.
 await expect(block(page)).toHaveCount(0);await expect(page.locator('.remainder-choice')).toContainText('Remainder ฿50: Pay forward');await expect.soft(page.getByRole('button',{name:'Change',exact:true}),'RP-5: focus lands on Change when the choice collapses').toBeFocused();
 const run=page.locator('details.forward-run');await expect(run).toHaveCount(1);await expect(run.locator('summary')).toContainText('9–13 Oct · 10 × 5');await expect(run.locator('summary .next-charge-badge')).toBeVisible();
 await run.locator('summary').click();await expect(run.locator('.payment-allocation-row')).toHaveCount(5);
 await expect(page.locator('.remainder-summary')).toHaveText(/Paid through 13 Oct/);
 await expect(review(page)).toBeEnabled();await review(page).click();
 const sent=s.reviews.at(-1);expect(sent.materialize.map((e:any)=>e.chargeDate)).toEqual([1,2,3,4,5].map(n=>addDays('2026-10-08',n)));expect(sent.principal).toEqual([]);
 await expect(page.locator('.remainder-summary')).toHaveText(/Paid through 13 Oct/);
 await page.getByRole('button',{name:'Confirm payment',exact:true}).click();await expect.poll(()=>s.posts.length).toBe(1);
 const posted=s.posts[0];expect(posted.schemaVersion).toBe(10);expect(posted.amountReceived).toBe('60');expect(posted.materialize).toHaveLength(5);expect(posted.allocations).toHaveLength(6);expect(posted.principal).toEqual([]);
});

test('Change reopens the choice; a partial last charge is badged',async({page})=>{
 const s=await setup(page);await amount(page).fill('55');await auto(page).click();
 await expect(option(page,/^Pay forward/)).toContainText('13 Oct (5, partial)');
 await choice(page,/^Pay forward/).check();await expect(page.getByRole('button',{name:'Change',exact:true})).toBeVisible();
 // 55 = 10 due + 45: a collapsed run of four full charges, and the partial fifth (5 of 10) on its own row with its badge.
 await expect(page.locator('details.forward-run')).toHaveCount(1);await expect(page.locator('details.forward-run summary')).toContainText('9–12 Oct · 10 × 4');
 await expect(page.locator('.payment-allocation-row').filter({hasText:'Partial'})).toHaveCount(1);await expect(page.locator('.payment-allocation-row').filter({hasText:'Partial'})).toContainText(/13-Oct/);
 await page.getByRole('button',{name:'Change',exact:true}).click();await expect(block(page)).toBeVisible();await expect(choice(page,/^Pay forward/)).toBeChecked();await expect(choice(page,/^Pay forward/)).toBeFocused();
 await choice(page,/^Repay principal/).check();await expect.poll(()=>s.plans.length).toBe(2);expect(s.plans[1].purpose.principal).toEqual([{loanId:'pf-LA',amount:'45'}]);expect(s.plans[1].purpose.forward).toBe(false);
});

test('Repay principal previews the new outstanding and daily interest and posts a v10 principal entry',async({page})=>{
 const s=await setup(page);await amount(page).fill('110');await auto(page).click();
 await expect(option(page,/^Repay principal/)).toContainText('1,000 → 900, new interest 9/day');
 await choice(page,/^Repay principal/).check();await expect.poll(()=>s.plans.length).toBe(1);
 expect(s.plans[0].purpose).toEqual({forward:false,principal:[{loanId:'pf-LA',amount:'100'}],loans:null});
 await expect(page.locator('.remainder-summary')).toContainText('Next charge 9 Oct · ฿9 · Outstanding 1,000 → 900');
 await expect(review(page)).toBeEnabled();await review(page).click();
 expect(s.reviews.at(-1).principal).toEqual([expect.objectContaining({loanId:'pf-LA',kind:'raise',amount:'100',principalDue:'100'})]);expect(s.reviews.at(-1).materialize).toEqual([]);
 await page.getByRole('button',{name:'Confirm payment',exact:true}).click();await expect.poll(()=>s.posts.length).toBe(1);
 expect(s.posts[0].schemaVersion).toBe(10);expect(s.posts[0].principal).toHaveLength(1);expect(s.posts[0].principal[0]).toMatchObject({loanId:'pf-LA',kind:'raise',chargeId:'pf-due',amount:'100'});
});

test('the settlement guard blocks Review, and a remainder beyond 93 days shows what cannot be allocated',async({page})=>{
 const s=await setup(page);await amount(page).fill('1010');await auto(page).click();
 await expect(option(page,/^Repay principal/)).toContainText('This settles the loan');
 await choice(page,/^Repay principal/).check();await expect.poll(()=>s.plans.length).toBe(1);
 await expect(hint(page)).toHaveText('This settles the loan. Use Close Loan.');await expect(hint(page)).toHaveAttribute('role','status');await expect(review(page)).toBeDisabled();
 await amount(page).fill('2000');await auto(page).click();await choice(page,/^Pay forward/).check();
 await expect(hint(page)).toContainText('is beyond the next 93 days and cannot be allocated.');await expect(review(page)).toBeDisabled();
 expect(s.reviews).toHaveLength(0);
});

test('plan_changed on review reloads the plan; offline the remainder paths are replaced by a due-only payment',async({page,context})=>{
 const s=await setup(page);await amount(page).fill('60');await auto(page).click();await choice(page,/^Pay forward/).check();await expect(review(page)).toBeEnabled();
 s.drift=true;await review(page).click();await expect(page.getByRole('alert')).toContainText('The allocation plan changed');
 s.drift=false;await page.getByRole('button',{name:'Use current balances',exact:true}).click();await expect.poll(()=>s.plans.length).toBe(2);await expect(amount(page)).toHaveValue('60');await expect(review(page)).toBeEnabled();
 await context.setOffline(true);
 await expect(page.getByText('Paying forward or repaying principal needs a connection. You can still receive the due amount now.')).toBeVisible();
 await page.getByRole('button',{name:'Use due amount',exact:true}).click();await expect(amount(page)).toHaveValue('10');await expect(review(page)).toBeEnabled();await expect(block(page)).toHaveCount(0);
});

