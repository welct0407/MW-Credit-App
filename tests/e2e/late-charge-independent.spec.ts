import {test,expect,type Page} from '@playwright/test';
import {chooseLanguagePreservingForm,routeSyntheticPreferences} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=8100+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/latecharge-independent-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(60000);
// R118 late charges. Explicit synthetic auth/HTTP seams (as pay-forward-independent.spec.ts): this file never claims actual Firebase SDK
// or offline worker proof. The command service is simulated: GET /api/charge-records/:id (version, late due and paid), POST
// /api/operations (charge.update applies the late charge, or is refused like the SQL guard), the payment draft and review.
const auth=`let listener;const user={uid:'latecharge-independent-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(localStorage.getItem('latecharge-owner')?user:null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){localStorage.setItem('latecharge-owner','1');listener(user)};export async function signOut(){localStorage.removeItem('latecharge-owner');listener(null)};`;
const borrower={id:'lc-B',displayName:'LateCharge ผู้กู้จำลอง / Synthetic borrower',borrowerDisplayName:'LateCharge ผู้กู้จำลอง / Synthetic borrower',status:'not_paid',amountDue:'330',amountCollected:'20',amountRemaining:'310',hasActiveLoan:true,outstandingPrincipal:'1000',totalProfitEarned:'0'};
const businessDate='2026-10-08',asOf='2026-10-08T05:00:00Z';
// Three recorded charges of 100 principal and 10 interest: no late charge; late 50 with 20 paid; late 50 fully paid.
const base3=[{id:'lc-c0',loan:'Late loan A',due:0,paid:0},{id:'lc-c1',loan:'Late loan B',due:50,paid:20},{id:'lc-c2',loan:'Late loan C',due:50,paid:50}];
type Late={due:number,paid:number,version:number};
type State={late:Record<string,Late>,posts:any[],operations:any[],reviews:any[],rejectNext:boolean};
const row=(s:State,c:typeof base3[number])=>{const l=s.late[c.id];return {id:c.id,loanId:'lc-L-'+c.id,loanDisplayKey:c.loan,chargeDate:businessDate,paymentStatus:'ยังไม่ชำระ',paymentDate:null,amountRemaining:String(110+l.due-l.paid),totalPaid:String(l.paid),receivedToday:'0',lateChargeDue:String(l.due),lateChargeRemaining:String(l.due-l.paid)}};
const record=(s:State,id:string)=>{const c=base3.find(x=>x.id===id)!,l=s.late[id];return {id,loanId:'lc-L-'+id,borrowerName:'LateCharge borrower',borrowerLabel:'LateCharge borrower',chargeDate:businessDate,principalDue:'100',interestDue:'10',lateChargeDue:String(l.due),lateChargePaid:String(l.paid),lateChargeRemaining:String(l.due-l.paid),totalPaid:String(l.paid),amountRemaining:String(110+l.due-l.paid),notes:null,version:`ver-${id}-${l.version}`,repayments:[],allocations:[],loanDisplayKey:c.loan}};
// The payment draft for Receive payment: one charge that carries a late charge and one that does not (no lateChargeRemaining key).
const draftCharges=[{id:'lc-p1',chargeDate:businessDate,loanDisplayKey:'Late payable',principalRemaining:'100',interestRemaining:'10',lateChargeRemaining:'50',amountRemaining:'160'},{id:'lc-p2',chargeDate:'2026-10-07',loanDisplayKey:'Plain payable',principalRemaining:'40',interestRemaining:'10',amountRemaining:'50'}];
const draft={ok:true,mode:'dev-owner-testing',scope:'all',businessDate,asOf,borrower:{id:borrower.id,displayName:borrower.displayName},accounts:[{id:'lc-A',label:'Synthetic receiving account'}]};
async function setup(page:Page){
 const s:State={late:{'lc-c0':{due:0,paid:0,version:0},'lc-c1':{due:50,paid:20,version:0},'lc-c2':{due:50,paid:50,version:0}},posts:[],operations:[],reviews:[],rejectNext:false};
 page.on('dialog',dialog=>void dialog.accept());
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>{const u=new URL(r.request().url()),charges=u.pathname.endsWith('/charges'),list=u.pathname.endsWith('/upcoming');return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate,timezone:'Asia/Bangkok',asOf,items:list?[]:charges?base3.map(c=>row(s,c)):[borrower],borrower,nextCursor:null,horizonEnd:'2027-01-08',reviewRequired:false})})});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
  const u=new URL(r.request().url()),path=u.pathname,method=r.request().method(),json=(body:any,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path.startsWith('/api/charge-records/')){const id=decodeURIComponent(path.split('/').at(-1)!);if(!s.late[id])return json({ok:false},404);return json({ok:true,source:'dev',asOf,businessDate,item:record(s,id)})}
  if(path==='/api/operations'&&method==='POST'){const body=r.request().postDataJSON();s.operations.push(body);
   if(s.rejectNext){s.rejectNext=false;return json({ok:false,kind:'recorded',originalOutcome:{status:'rejected',code:'record_requires_reconciliation',result:null}},409)}
   const l=s.late[body.targetId];l.due=Number(body.inputs.lateChargeDue);l.version+=1;
   return json({ok:true,kind:'recorded',originalOutcome:{status:'applied',code:null,result:{operation:body.operation,targetType:'charge',targetId:body.targetId,paymentId:null,plan:null,predecessorRequestId:null}}})}
  if(path.startsWith('/api/operations/'))return json({ok:true,kind:'unresolved',safeToUseNewRequestId:false});
  if(path.includes('/payment-drafts/')){
   if(path.endsWith('/review')){const body=r.request().postDataJSON();s.reviews.push(body);return json({...draft,charges:draftCharges,upcoming:[],allocations:body.allocations,materialize:body.materialize??[],principal:body.principal??[],total:body.amountReceived,nextCursor:null})}
   return json({...draft,charges:draftCharges,upcoming:[],nextCursor:null});
  }
  if(path.endsWith('/api/payment-commands')&&method==='POST'){s.posts.push(r.request().postDataJSON());return json({ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-latecharge',code:null,recordedAt:asOf}})}
  if(path.endsWith('/payments'))return json({ok:true,items:[],nextCursor:null});
  return json({ok:true,kind:'unresolved',safeToUseNewRequestId:false});
 });
 await routeSyntheticPreferences(page);await page.route('https://mw-credit-app-command-dev-test.run.app/api/dashboard',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})}));
 await page.goto(base);await page.getByRole('button',{name:/Google/}).click();await chooseLanguagePreservingForm(page,'EN');await page.getByRole('button',{name:'Collection',exact:true}).click();await page.locator('.collection-tile-main').first().click();
 await expect(page.locator('.collection-charge-row')).toHaveCount(3);
 return s;
}
const chargeRow=(page:Page,loan:string)=>page.locator('.collection-charge-row').filter({hasText:loan});
const increase=(scope:ReturnType<Page['locator']>|Page)=>scope.getByRole('button',{name:/^Increase late charge by 50/});
const decrease=(scope:ReturnType<Page['locator']>|Page)=>scope.getByRole('button',{name:/^Decrease late charge by 50/});
const confirm=(page:Page)=>page.getByRole('button',{name:'Confirm',exact:true});
const openDetails=async(page:Page,loan:string)=>{await chargeRow(page,loan).locator('.charge-tile-action').click();await expect(page.locator('dd.late-charge-value')).toBeVisible()};

test('Collection row: late charge line only for what the row carries, +50 asks for Confirm "Late charge ฿0 → ฿50", and the shortcut is hidden offline',async({page})=>{
 const s=await setup(page);
 // A row without a late charge shows the +50 button; a row with one shows the figure, a note and the stepper; a paid-up one stops at what was paid.
 const a=chargeRow(page,'Late loan A'),b=chargeRow(page,'Late loan B'),c=chargeRow(page,'Late loan C');
 await expect(a.locator('.charge-late-note')).toHaveCount(0);await expect(a.locator('.charge-late-line').getByRole('button',{name:/^Increase late charge by 50/})).toContainText('+50');
 await expect(b.locator('.charge-late-note')).toHaveText('Late charge ฿50 · ฿20 paid');await expect(decrease(b)).toBeEnabled();
 await expect(c.locator('.charge-late-note')).toHaveText('Late charge ฿50 · ฿50 paid');await expect(decrease(c)).toBeDisabled();await expect(decrease(c)).toHaveAttribute('aria-describedby',/charge-late-note-lc-c2/);
 // +50 on the row without one: the live charge is read for its version, then the standard Confirm shows the change.
 await increase(a).click();
 const card=page.getByRole('region',{name:'Late charge',exact:true});await expect(card).toBeVisible();
 await expect(card.locator('dt',{hasText:'Late charge'})).toBeVisible();await expect(card.locator('.chat-proposal-before')).toHaveText('฿0');await expect(card.locator('dd strong').filter({hasText:'฿50'})).toBeVisible();
 expect(s.operations).toHaveLength(0);
 await confirm(page).click();await expect.poll(()=>s.operations.length).toBe(1);
 expect(s.operations[0]).toMatchObject({operation:'charge.update',targetId:'lc-c0',expectedVersion:'ver-lc-c0-0',inputs:{loanId:'lc-L-lc-c0',chargeDate:businessDate,principalDue:'100',interestDue:'10',lateChargeDue:'50',notes:null}});
 // Back on the list the row now carries the late charge (the list was reloaded).
 await expect(chargeRow(page,'Late loan A').locator('.charge-late-note')).toHaveText('Late charge ฿50');
 // The stepper of a row with a late charge goes up by 50 from the stored figure.
 await increase(chargeRow(page,'Late loan B')).click();await expect(page.getByRole('region',{name:'Late charge',exact:true}).locator('.chat-proposal-before')).toHaveText('฿50');
 await expect(page.getByRole('region',{name:'Late charge',exact:true}).locator('dd strong').filter({hasText:'฿100'})).toBeVisible();
 await page.getByRole('button',{name:'Back to details',exact:true}).click();
 // The server refuses a change below what was paid (stale list): the shortcut's refusal asks for a refresh and names no figure.
 s.rejectNext=true;await decrease(chargeRow(page,'Late loan B')).click();await confirm(page).click();
 await expect(page.getByRole('alert').filter({hasText:'Late charge cannot be less than what was already paid on it. Refresh to see the current amount.'})).toBeVisible();
 expect(s.operations).toHaveLength(2);await page.getByRole('button',{name:'Back to details',exact:true}).click();
 // Offline: the shortcut is hidden (it needs the live version); the note stays; online again it returns.
 await page.context().setOffline(true);
 await expect(page.locator('.charge-late-line')).toHaveCount(0);await expect(chargeRow(page,'Late loan B').locator('.charge-late-note')).toHaveText('Late charge ฿50 · ฿20 paid');
 await page.context().setOffline(false);
 await expect(page.locator('.charge-late-line')).toHaveCount(3);
 expect(s.operations).toHaveLength(2);
});

test('Charge details: the late charge sits with a stepper, shows paid and remaining, goes through Confirm, and stops at what was paid',async({page})=>{
 const s=await setup(page);
 await openDetails(page,'Late loan B');
 const value=page.locator('dd.late-charge-value');
 await expect(value).toContainText('฿50');
 await expect(page.locator('dt',{hasText:'Late Charge Paid'})).toBeVisible();await expect(page.locator('dt',{hasText:'Late Charge Remaining'})).toBeVisible();
 await expect(page.locator('dd',{hasText:/^฿30$/}).first()).toBeVisible();
 // Increase: Confirm shows ฿50 → ฿100; Confirm posts a charge.update at the record's version.
 await increase(value).click();
 const card=page.getByRole('region',{name:'Late charge',exact:true});await expect(card.locator('.chat-proposal-before')).toHaveText('฿50');await expect(card.locator('dd strong').filter({hasText:'฿100'})).toBeVisible();
 await confirm(page).click();await expect.poll(()=>s.operations.length).toBe(1);
 expect(s.operations[0]).toMatchObject({operation:'charge.update',targetId:'lc-c1',expectedVersion:'ver-lc-c1-0',inputs:{lateChargeDue:'100',principalDue:'100',interestDue:'10'}});
 await expect(page.locator('dd.late-charge-value')).toContainText('฿100');
 // Decrease from 100 goes to 50; from 50 the floor is what was paid (20), never lower.
 await decrease(page.locator('dd.late-charge-value')).click();await expect(page.getByRole('region',{name:'Late charge',exact:true}).locator('dd strong').filter({hasText:'฿50'})).toBeVisible();
 await page.getByRole('button',{name:'Back to details',exact:true}).click();
 // A refusal by the server guard (stale or below paid) asks for a refresh.
 s.rejectNext=true;await decrease(page.locator('dd.late-charge-value')).click();await confirm(page).click();
 await expect(page.getByRole('alert').filter({hasText:'Late charge cannot be less than what was already paid on it. Refresh to see the current amount.'})).toBeVisible();
 expect(s.operations).toHaveLength(2);
 // A charge whose late charge is fully paid cannot be stepped down at all.
 await page.getByRole('button',{name:'Back to details',exact:true}).click();await page.getByRole('button',{name:'Back to charges',exact:true}).click();
 await openDetails(page,'Late loan C');
 await expect(decrease(page.locator('dd.late-charge-value'))).toBeDisabled();await expect(page.locator('dd.late-charge-value')).toContainText('฿50');
});

test('Charge edit page: the Late charge field steps by 50, stops at the paid floor, refuses a figure below it, and Confirm shows the change',async({page})=>{
 const s=await setup(page);
 await openDetails(page,'Late loan B');await page.getByRole('button',{name:'Edit charge',exact:true}).click();
 const field=page.locator('input[data-field="lateChargeDue"]'),form=page.locator('form');
 await expect(field).toHaveValue('50');await expect(page.getByLabel('Late Charge Due',{exact:true})).toHaveCount(1);
 await increase(form).click();await expect(field).toHaveValue('100');
 await decrease(form).click();await expect(field).toHaveValue('50');
 await decrease(form).click();await expect(field).toHaveValue('20');await expect(decrease(form)).toBeDisabled();await expect(field).toHaveAttribute('aria-describedby',/late-charge-paid-/);
 // Keyboard ArrowDown at the floor stays; ArrowUp steps by 50.
 await field.focus();await page.keyboard.press('ArrowDown');await expect(field).toHaveValue('20');await page.keyboard.press('ArrowUp');await expect(field).toHaveValue('70');
 // A typed figure below what was paid is refused with the field marked and focused; nothing is confirmed.
 await field.fill('10');await page.getByRole('button',{name:'Review change',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Late charge cannot be less than the ฿20 already paid on it.'})).toBeVisible();await expect(field).toHaveAttribute('aria-invalid','true');await expect(field).toBeFocused();
 await field.fill('20');await page.getByRole('button',{name:'Review change',exact:true}).click();
 // Waived down to exactly what was paid is allowed: Confirm shows ฿50 → ฿20.
 const card=page.getByRole('region',{name:'Edit charge',exact:true});
 await expect(card.locator('dt',{hasText:/^Late charge( due)?$/i})).toBeVisible();await expect(card.locator('.chat-proposal-before')).toHaveText('฿50');await expect(card.locator('dd strong').filter({hasText:'฿20'})).toBeVisible();
 expect(s.operations).toHaveLength(0);
 await confirm(page).click();await expect.poll(()=>s.operations.length).toBe(1);
 expect(s.operations[0]).toMatchObject({operation:'charge.update',targetId:'lc-c1',expectedVersion:'ver-lc-c1-0',inputs:{loanId:'lc-L-lc-c1',principalDue:'100',interestDue:'10',lateChargeDue:'20'}});
});

test('Charge edit page: a charge with no late charge shows 0 and Confirm reads "Late charge ฿0 → ฿50"',async({page})=>{
 const s=await setup(page);
 await openDetails(page,'Late loan A');await page.getByRole('button',{name:'Edit charge',exact:true}).click();
 const field=page.locator('input[data-field="lateChargeDue"]');await expect(field).toHaveValue('0');await expect(decrease(page.locator('form'))).toBeDisabled();
 await increase(page.locator('form')).click();await expect(field).toHaveValue('50');
 await page.getByRole('button',{name:'Review change',exact:true}).click();
 const card=page.getByRole('region',{name:'Edit charge',exact:true});
 await expect(card.locator('dt',{hasText:/^Late charge( due)?$/i})).toBeVisible();await expect(card.locator('.chat-proposal-before')).toHaveText('฿0');await expect(card.locator('dd strong').filter({hasText:'฿50'})).toBeVisible();
 await confirm(page).click();await expect.poll(()=>s.operations.length).toBe(1);
 expect(s.operations[0].inputs.lateChargeDue).toBe('50');
});

test('Receive payment: the third Late charge input appears only on a charge that carries one; interest, then late charge, then principal; the v11 line has eight keys',async({page})=>{
 const s=await setup(page);
 await page.getByRole('button',{name:'Receive selected charges',exact:true}).click();
 const amount=page.getByRole('textbox',{name:/^Amount received(?: \*)?$/});await expect(amount).toBeVisible();
 const account=page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/});if(!await account.inputValue())await account.selectOption('lc-A');
 // Third input only on the charge that carries a late charge (with its Max hint); the other keeps the two inputs of today.
 const late=page.getByRole('textbox',{name:'Late charge for Late payable 2026-10-08'});
 await expect(late).toHaveCount(1);await expect(page.getByRole('textbox',{name:/^Late charge for Plain payable/})).toHaveCount(0);
 await expect(page.locator('.late-charge-input')).toHaveCount(1);await expect(page.locator('.payment-allocation-row').filter({hasText:'Late payable'}).locator('.late-charge-input')).toHaveCount(1);await expect(page.locator('.payment-allocation-row').filter({hasText:'Plain payable'}).locator('.late-charge-input')).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:/^Interest for Plain payable/})).toHaveCount(1);await expect(page.getByRole('textbox',{name:/^Principal for Plain payable/})).toHaveCount(1);
 await expect(page.locator('.payment-allocation-row').filter({hasText:'Late payable'})).toContainText('Late charge (Max ฿50)');
 await expect(page.locator('.payment-allocation-row').filter({hasText:'Plain payable'})).not.toContainText('Late charge');
 // 120 over the charge (principal 100, interest 10, late 50): interest 10, late 50, principal 60.
 await amount.fill('120');await page.getByRole('checkbox',{name:/^Allocate to Late payable 2026-10-08/}).check();
 await expect(page.getByRole('textbox',{name:'Interest for Late payable 2026-10-08'})).toHaveValue('10');await expect(late).toHaveValue('50');await expect(page.getByRole('textbox',{name:'Principal for Late payable 2026-10-08'})).toHaveValue('60');
 // 30 only: interest 10, late 20, principal 0 (the order inside a charge).
 await amount.fill('30');await page.getByRole('checkbox',{name:/^Allocate to Late payable 2026-10-08/}).uncheck();await page.getByRole('checkbox',{name:/^Allocate to Late payable 2026-10-08/}).check();
 await expect(page.getByRole('textbox',{name:'Interest for Late payable 2026-10-08'})).toHaveValue('10');await expect(late).toHaveValue('20');await expect(page.getByRole('textbox',{name:'Principal for Late payable 2026-10-08'})).toHaveValue('0');
 // Review sends the eight-key line; the review card names the late part; Confirm posts schemaVersion 11.
 await page.getByRole('button',{name:'Review payment',exact:true}).click();
 await expect.poll(()=>s.reviews.length).toBe(1);
 expect(s.reviews[0].allocations).toEqual([{chargeId:'lc-p1',principal:'0',interest:'10',lateCharge:'20',expectedPrincipalRemaining:'100',expectedInterestRemaining:'10',expectedLateChargeRemaining:'50',chargeDate:businessDate}]);
 expect(Object.keys(s.reviews[0].allocations[0])).toEqual(['chargeId','principal','interest','lateCharge','expectedPrincipalRemaining','expectedInterestRemaining','expectedLateChargeRemaining','chargeDate']);
 await expect(page.getByText(/Late charge ฿20/).first()).toBeVisible();
 await page.getByRole('button',{name:'Confirm payment',exact:true}).click();await expect.poll(()=>s.posts.length).toBe(1);
 expect(s.posts[0].schemaVersion).toBe(11);expect(s.posts[0].amountReceived).toBe('30');expect(s.posts[0].allocations[0]).toMatchObject({lateCharge:'20',expectedLateChargeRemaining:'50'});
});
