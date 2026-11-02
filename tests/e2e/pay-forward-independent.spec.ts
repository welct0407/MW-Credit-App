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


// R113: settle and close from Receive payment, the owner's Ying case. The server is simulated from V126's shapes: two daily-interest loans,
// 1,000 at 20 a day and 2,000 at 200 a day, today's charges 20 + 200, a 3,220 slip. Auto-assign's remainder carries repay {purpose, settles,
// uncovered} and a settle-only option per loan (payoffRemainder); POST /plan returns the settle entries (amount = payoff remainder, accruedInterest =
// gap interest, payoff, charges) and closes {loan:{payoff,gapInterest,charges,rebate}}; the command entry has the seven keys with kind 'settle'.
const yingDue=[{id:'y-dueA',chargeDate:'2026-10-08',loanDisplayKey:'Ying-A',principalRemaining:'0',interestRemaining:'20',amountRemaining:'20'},
 {id:'y-dueB',chargeDate:'2026-10-08',loanDisplayKey:'Ying-B',principalRemaining:'0',interestRemaining:'200',amountRemaining:'200'}];
const yingLoans={'y-LA':'Ying-A','y-LB':'Ying-B'};
const yingEntry=(loanId:string,payoff:string,amount:string,principalDue:string,chargeId:string)=>({loanId,kind:'settle',chargeId,chargeDate:'2026-10-08',amount,accruedInterest:'0',principalDue,payoff,charges:payoff==='1020'?'20':'200'});
const yingAlloc=[{chargeId:'y-dueA',principal:'1000',interest:'20',expectedPrincipalRemaining:'1000',expectedInterestRemaining:'20',chargeDate:'2026-10-08'},
 {chargeId:'y-dueB',principal:'2000',interest:'200',expectedPrincipalRemaining:'2000',expectedInterestRemaining:'200',chargeDate:'2026-10-08'}];
const yingPlan=(settles:string[],blocked:any[]=[])=>({day:'2026-10-08',amount:'3220',dueTotal:'220',remainder:'3000',due:['y-dueA','y-dueB'],allocations:yingAlloc,materialize:[],forward:[],uncovered:'0',paidThrough:{},settles,blocked,
 principal:[yingEntry('y-LA','1020','1000','1000','y-dueA'),yingEntry('y-LB','2200','2000','2000','y-dueB')].filter(entry=>settles.includes(entry.loanId))});
const yingCloses={'y-LA':{payoff:'1020',gapInterest:'0',charges:'20',rebate:{amount:'30',referrer:'Ying Referrer',offset:true}},'y-LB':{payoff:'2200',gapInterest:'0',charges:'200',rebate:null}};
async function yingSetup(page:Page){
 const s=await setup(page);const posts:any[]=[],plans:any[]=[],reviews:any[]=[];
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
  const u=new URL(r.request().url()),path=u.pathname,json=(body:any,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path.endsWith('/auto-assign')&&r.request().postDataJSON().amountReceived==='720')return json({...draft,charges:yingDue,allocations:yingAlloc.map(l=>({...l,principal:'0',interest:l.expectedInterestRemaining})),amountReceived:'720',allocated:'220',unallocated:'500',
   remainder:{amount:'500',loans:yingLoans,forward:{rows:[],paidThrough:{},uncovered:'500',blocked:[]},repay:null,
    principal:[{loanId:'y-LA',amount:'500',settles:false,entry:{loanId:'y-LA',kind:'raise',chargeId:'y-dueA',chargeDate:'2026-10-08',amount:'500',accruedInterest:'0',principalDue:'500',outstandingBefore:'1000',outstandingAfter:'500',dailyAfter:'10'},payoffRemainder:'1000'},
     {loanId:'y-LB',amount:'500',settles:false,entry:{loanId:'y-LB',kind:'raise',chargeId:'y-dueB',chargeDate:'2026-10-08',amount:'500',accruedInterest:'0',principalDue:'500',outstandingBefore:'2000',outstandingAfter:'1500',dailyAfter:'150'},payoffRemainder:'2000'}]}});
  if(path.endsWith('/auto-assign'))return json({...draft,charges:yingDue,allocations:yingAlloc.map(l=>({...l,principal:'0',interest:l.expectedInterestRemaining})),amountReceived:'3220',allocated:'220',unallocated:'3000',
   remainder:{amount:'3000',loans:yingLoans,forward:{rows:[],paidThrough:{},uncovered:'3000',blocked:[]},
    repay:{purpose:{forward:false,principal:[{loanId:'y-LA',amount:'1000'},{loanId:'y-LB',amount:'2000'}],loans:null},settles:['y-LA','y-LB'],uncovered:'0'},
    principal:[{loanId:'y-LA',amount:'1000',settles:true,entry:null,payoffRemainder:'1000',settleOnly:true},{loanId:'y-LB',amount:'2000',settles:true,entry:null,payoffRemainder:'2000',settleOnly:true}]}});
  if(path.endsWith('/plan')){const body=r.request().postDataJSON();plans.push(body);
   const lines=body.purpose.principal as {loanId:string;amount:string}[],A=lines.find(l=>l.loanId==='y-LA');
   if(A&&A.amount!=='1000')return json({businessDate:draft.businessDate,purpose:body.purpose,plan:{...yingPlan([]),settles:['y-LA'],principal:[],blocked:[{loanId:'y-LA',reason:'needs_gap_interest',more:String(1000-Number(A.amount))}]},loans:yingLoans,closes:{}});
   return json({businessDate:draft.businessDate,purpose:body.purpose,plan:yingPlan(['y-LA','y-LB'].filter(id=>lines.some(l=>l.loanId===id))),loans:yingLoans,closes:yingCloses});}
  if(path.endsWith('/review')){const body=r.request().postDataJSON();reviews.push(body);return json({...draft,charges:yingDue,upcoming:[],allocations:body.allocations,materialize:body.materialize,principal:body.principal,total:body.amountReceived,nextCursor:null});}
  if(path.endsWith('/api/payment-commands')&&r.request().method()==='POST'){posts.push(r.request().postDataJSON());return json({ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-ying'}});}
  return r.fallback();
 });
 expect(s.posts).toHaveLength(0);return {s,posts,plans,reviews};
}
test('Ying: Repay principal on a 3,220 slip closes both loans, shows the Closes lines and the rebate, keeps Review enabled and posts one v10 command with two settle entries',async({page})=>{
 const {posts,plans,reviews}=await yingSetup(page);
 await amount(page).fill('3220');await auto(page).click();
 await expect(block(page)).toBeVisible();await expect(option(page,/^Repay principal/)).toContainText('Closes Ying-A, Ying-B');await expect(review(page)).toBeDisabled();
 await choice(page,/^Repay principal/).check();await expect.poll(()=>plans.length).toBe(1);
 expect(plans[0].purpose).toEqual({forward:false,principal:[{loanId:'y-LA',amount:'1000'},{loanId:'y-LB',amount:'2000'}],loans:null});
 // The old guard line (use Close Loan) is gone; each loan shows what it closes, the first with its referral rebate (V124 default offset).
 await expect(page.getByText(/Use Close Loan/)).toHaveCount(0);
 const lines=page.locator('.remainder-closes');await expect(lines).toHaveCount(2);
 await expect(lines.nth(0)).toContainText('Closes Ying-A · payoff ฿1,020 (charges ฿20)');await expect(lines.nth(0)).toContainText('Rebate ฿30 to Ying Referrer — offset to their loan');
 await expect(lines.nth(1)).toContainText('Closes Ying-B · payoff ฿2,200 (charges ฿200)');await expect(lines.nth(1)).not.toContainText('Rebate');
 await expect(page.locator('.remainder-closes-summary')).toHaveText('Closes 2 loans · outstanding ฿0');
 await expect(page.locator('#remainder-help')).toHaveCount(0);   // nothing blocks Review (the hint slot exists only while a hint is shown)
 await expect(review(page)).toBeEnabled();await review(page).click();
 expect(reviews.at(-1).principal.map((e:any)=>[e.loanId,e.kind,e.amount])).toEqual([['y-LA','settle','1000'],['y-LB','settle','2000']]);
 await page.getByRole('button',{name:'Confirm payment',exact:true}).click();await expect.poll(()=>posts.length).toBe(1);
 const posted=posts[0];expect(posted.schemaVersion).toBe(10);expect(posted.amountReceived).toBe('3220');expect(posted.materialize).toEqual([]);
 expect(posted.principal).toEqual([{loanId:'y-LA',kind:'settle',chargeId:'y-dueA',chargeDate:'2026-10-08',amount:'1000',accruedInterest:'0',principalDue:'1000'},
  {loanId:'y-LB',kind:'settle',chargeId:'y-dueB',chargeDate:'2026-10-08',amount:'2000',accruedInterest:'0',principalDue:'2000'}]);
 expect(Object.keys(posted.principal[0])).toHaveLength(7);
});
test('Ying Split: a part short of a loan\'s payoff remainder keeps Review disabled and says how much more closes it',async({page})=>{
 const {plans}=await yingSetup(page);
 await amount(page).fill('3220');await auto(page).click();await choice(page,/^Split/).check();
 await expect(page.getByText('฿1,000 closes this loan',{exact:true})).toBeVisible();await expect(page.getByText('฿2,000 closes this loan',{exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:/^Principal part · Ying-A/}).fill('990');await page.getByRole('button',{name:'Apply',exact:true}).evaluate(node=>(node as HTMLElement).click());
 await expect.poll(()=>plans.length).toBe(1);expect(plans[0].purpose.forward).toBe(true);expect(plans[0].purpose.principal).toEqual([{loanId:'y-LA',amount:'990'}]);
 await expect(page.locator('#remainder-help')).toHaveText('฿10 more closes Ying-A.');await expect(review(page)).toBeDisabled();
 // R114 (1): a blocked plan shows only its hint, never the plan's Paid through or Closes lines.
 await expect(page.locator('#remainder-help')).toHaveAttribute('data-remainder-state','blocked');
 await expect(page.locator('.remainder-summary')).toHaveCount(0);await expect(page.locator('.remainder-closes')).toHaveCount(0);await expect(page.locator('.remainder-closes-summary')).toHaveCount(0);
});

test('R114 (2): a remainder short of a loan\'s payoff says how much more closes it, on Repay principal and on each Split part',async({page})=>{
 await yingSetup(page);
 await amount(page).fill('720');await auto(page).click();await expect(block(page)).toBeVisible();
 await expect(option(page,/^Repay principal/)).toContainText('฿500 more closes Ying-A');
 await choice(page,/^Split/).check();
 await expect(page.locator('.remainder-split small').nth(0)).toHaveText('฿500 more closes Ying-A');await expect(page.locator('.remainder-split small').nth(1)).toHaveText('฿1,500 more closes Ying-B');
 await expect(review(page)).toBeDisabled();
});
test('R114 Echo: a two-loan Split at 390 px does not overflow horizontally and Apply is inside the viewport and clickable',async({page},info)=>{
 test.skip(info.project.name!=='mobile-chromium','phone layout only');
 // The real loan keys are long ("<borrower> - <description>-฿1,000-27/10-10%"): the overflow Echo found at 745 px came from those labels.
 const short={...yingLoans};Object.assign(yingLoans,{'y-LA':'R113 SYNTHETIC YING A - R113 DEV end-to-end, synthetic-฿1,000-27/10-10%','y-LB':'R113 SYNTHETIC YING A - R113 DEV end-to-end, synthetic-฿2,000-31/10-10%'});
 try{
 const {plans}=await yingSetup(page);
 await amount(page).fill('3220');await auto(page).click();await choice(page,/^Split/).check();
 const split=page.locator('.remainder-split');await expect(split).toBeVisible();await expect(page.locator('.remainder-split input')).toHaveCount(2);
 const viewport=page.viewportSize()!;
 // The fieldset and the page do not scroll sideways, and every split part sits inside the viewport width.
 const overflow=await page.evaluate(()=>{const f=document.querySelector('.remainder-options') as HTMLElement,s=document.querySelector('.remainder-split') as HTMLElement;
  return {fieldset:f.scrollWidth-f.clientWidth,split:s.scrollWidth-s.clientWidth,page:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
 expect(overflow).toEqual({fieldset:0,split:0,page:0});
 for(const input of await page.locator('.remainder-split input').all()){const box=(await input.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width)}
 const apply=page.getByRole('button',{name:'Apply',exact:true});await apply.scrollIntoViewIfNeeded();
 const box=(await apply.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
 await expect(apply).toBeInViewport({ratio:1});
 await page.getByRole('textbox',{name:/^Principal part · .*฿1,000/}).fill('1000');
 await apply.click();   // a real click, not a scripted one
 await expect.poll(()=>plans.length).toBe(1);expect(plans[0].purpose.principal).toEqual([{loanId:'y-LA',amount:'1000'}]);
 }finally{Object.assign(yingLoans,short)}
});
