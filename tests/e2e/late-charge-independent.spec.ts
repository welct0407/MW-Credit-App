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
let all=base3;
type State={late:Record<string,Late>,posts:any[],operations:any[],reviews:any[],rejectNext:boolean,calls:string[],readFail:number,dropNext:boolean,hold:Promise<void>|null,release:(()=>void)|null};
const row=(s:State,c:typeof base3[number])=>{const l=s.late[c.id];return {id:c.id,loanId:'lc-L-'+c.id,loanDisplayKey:c.loan,chargeDate:businessDate,paymentStatus:'ยังไม่ชำระ',paymentDate:null,amountRemaining:String(110+l.due-l.paid),totalPaid:String(l.paid),receivedToday:'0',lateChargeDue:String(l.due),lateChargeRemaining:String(l.due-l.paid)}};
const record=(s:State,id:string)=>{const c=all.find(x=>x.id===id)!,l=s.late[id];return {id,loanId:'lc-L-'+id,borrowerName:'LateCharge borrower',borrowerLabel:'LateCharge borrower',chargeDate:businessDate,principalDue:'100',interestDue:'10',lateChargeDue:String(l.due),lateChargePaid:String(l.paid),lateChargeRemaining:String(l.due-l.paid),totalPaid:String(l.paid),amountRemaining:String(110+l.due-l.paid),notes:null,version:`ver-${id}-${l.version}`,repayments:[],allocations:[],loanDisplayKey:c.loan}};
// The payment draft for Receive payment: one charge that carries a late charge and one that does not (no lateChargeRemaining key).
const draftCharges=[{id:'lc-p1',chargeDate:businessDate,loanDisplayKey:'Late payable',principalRemaining:'100',interestRemaining:'10',lateChargeRemaining:'50',amountRemaining:'160'},{id:'lc-p2',chargeDate:'2026-10-07',loanDisplayKey:'Plain payable',principalRemaining:'40',interestRemaining:'10',amountRemaining:'50'}];
const draft={ok:true,mode:'dev-owner-testing',scope:'all',businessDate,asOf,borrower:{id:borrower.id,displayName:borrower.displayName},accounts:[{id:'lc-A',label:'Synthetic receiving account'}]};
async function setup(page:Page,filler=0){
 all=[...base3,...Array.from({length:filler},(_,i)=>({id:'lc-f'+i,loan:'Filler loan '+i,due:0,paid:0}))];
 const s:State={late:Object.fromEntries(all.map(c=>[c.id,{due:c.due,paid:c.paid,version:0}])),posts:[],operations:[],reviews:[],rejectNext:false,calls:[],readFail:0,dropNext:false,hold:null,release:null};
 page.on('dialog',dialog=>void dialog.accept());
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>{const u=new URL(r.request().url()),charges=u.pathname.endsWith('/charges'),list=u.pathname.endsWith('/upcoming');return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate,timezone:'Asia/Bangkok',asOf,items:list?[]:charges?all.map(c=>row(s,c)):[borrower],borrower,nextCursor:null,horizonEnd:'2027-01-08',reviewRequired:false})})});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
  const u=new URL(r.request().url()),path=u.pathname,method=r.request().method(),json=(body:any,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path.startsWith('/api/charge-records/')||path.startsWith('/api/operations'))s.calls.push(method+' '+path.replace(/^\/api\/operations\/[0-9a-f-]{36}$/,'/api/operations/<id>'));
  if(path.startsWith('/api/charge-records/')){const id=decodeURIComponent(path.split('/').at(-1)!);if(!s.late[id])return json({ok:false},404);if(s.readFail>0){s.readFail--;return json({ok:false,code:'unavailable'},503)}return json({ok:true,source:'dev',asOf,businessDate,item:record(s,id)})}
  if(path==='/api/operations'&&method==='POST'){const body=r.request().postDataJSON();s.operations.push(body);
   if(s.hold)await s.hold;if(s.dropNext){s.dropNext=false;return r.abort('failed')}
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
 await expect(page.locator('.collection-charge-row')).toHaveCount(all.length);
 return s;
}
const chargeRow=(page:Page,loan:string)=>page.locator('.collection-charge-row').filter({hasText:loan});
const increase=(scope:ReturnType<Page['locator']>|Page)=>scope.getByRole('button',{name:/^Increase late charge by 50/});
const decrease=(scope:ReturnType<Page['locator']>|Page)=>scope.getByRole('button',{name:/^Decrease late charge by 50/});
const confirm=(page:Page)=>page.getByRole('button',{name:'Confirm',exact:true});
const openDetails=async(page:Page,loan:string)=>{await chargeRow(page,loan).locator('.charge-tile-action').click();await expect(page.locator('dd.late-charge-value')).toBeVisible()};

const toast=(page:Page)=>page.locator('p.sync-toast.late-charge-toast');
const REFUSED='Late charge cannot be less than what was already paid on it. Refresh to see the current amount.';
const holdWrites=(s:State)=>{s.hold=new Promise<void>(done=>{s.release=()=>{s.hold=null;done()}})};

test('Collection row: late charge line only for what the row carries; a tap applies at once (no Confirm) and the toast shows the change',async({page})=>{
 const s=await setup(page);
 const a=chargeRow(page,'Late loan A'),b=chargeRow(page,'Late loan B'),c=chargeRow(page,'Late loan C');
 await expect(toast(page)).toHaveClass(/idle/);await expect(toast(page)).toHaveAttribute('role','status');await expect(toast(page)).toHaveAttribute('aria-live','polite');
 await expect(a.locator('.charge-late-note')).toHaveCount(0);await expect(a.locator('.charge-late-line').getByRole('button',{name:/^Increase late charge by 50/})).toContainText('+50');
 await expect(b.locator('.charge-late-note')).toHaveText('Late charge ฿50 · ฿20 paid');await expect(decrease(b)).toBeEnabled();
 await expect(c.locator('.charge-late-note')).toHaveText('Late charge ฿50 · ฿50 paid');await expect(decrease(c)).toBeDisabled();await expect(decrease(c)).toHaveAttribute('aria-describedby',/charge-late-note-lc-c2/);
 // +50 on the row without one: one charge.update at the live version, no Confirm page, and the toast.
 await increase(a).click();
 await expect(toast(page)).toHaveText('Late charge +฿50 · now ฿50');await expect(toast(page)).not.toHaveClass(/refused|idle/);
 await expect(confirm(page)).toHaveCount(0);await expect(page.getByRole('region',{name:'Late charge',exact:true})).toHaveCount(0);
 expect(s.operations).toHaveLength(1);
 expect(s.operations[0]).toMatchObject({operation:'charge.update',targetId:'lc-c0',expectedVersion:'ver-lc-c0-0',inputs:{loanId:'lc-L-lc-c0',chargeDate:businessDate,principalDue:'100',interestDue:'10',lateChargeDue:'50',notes:null}});
 await expect(chargeRow(page,'Late loan A').locator('.charge-late-note')).toHaveText('Late charge ฿50');
 // The toast clears by itself after about 3 seconds.
 await expect(toast(page)).toHaveClass(/idle/,{timeout:10000});await expect(toast(page)).toHaveText('');
 // A decrease uses the true minus sign (U+2212): up to 100, then down to 50.
 await increase(chargeRow(page,'Late loan A')).click();await expect(toast(page)).toHaveText('Late charge +฿50 · now ฿100');
 await decrease(chargeRow(page,'Late loan A')).click();await expect(toast(page)).toHaveText('Late charge −฿50 · now ฿50');
 expect(s.operations.map(o=>o.inputs.lateChargeDue)).toEqual(['50','100','50']);
 expect(s.operations.map(o=>o.expectedVersion)).toEqual(['ver-lc-c0-0','ver-lc-c0-1','ver-lc-c0-2']);
 // A row with a late charge steps from its stored figure and stops at what was paid: 50 - 50 would be 0, the floor is 20.
 await decrease(chargeRow(page,'Late loan B')).click();await expect(toast(page)).toHaveText('Late charge −฿30 · now ฿20');
 expect(s.operations[3].inputs.lateChargeDue).toBe('20');
});

test('Collection row: buttons are disabled with aria-busy while a command is in flight; two quick taps are two sequential commands with fresh versions',async({page})=>{
 const s=await setup(page);
 const a=chargeRow(page,'Late loan A'),line=a.locator('.charge-late-line');
 // In flight: every late-charge button of the list is disabled and the row's line is busy.
 holdWrites(s);await increase(a).click();
 await expect.poll(()=>s.operations.length).toBe(1);
 await expect(line).toHaveAttribute('aria-busy','true');await expect(page.locator('.charge-late-line button:disabled').first()).toBeDisabled();
 await expect(increase(chargeRow(page,'Late loan B'))).toBeDisabled();await expect(decrease(chargeRow(page,'Late loan B'))).toBeDisabled();
 s.release!();await expect(toast(page)).toHaveText('Late charge +฿50 · now ฿50');await expect(line).not.toHaveAttribute('aria-busy','true');await expect(increase(chargeRow(page,'Late loan B'))).toBeEnabled();
 // Two taps in the same instant: the second waits for the first and reads the version the first produced.
 await page.evaluate(()=>{const button=[...document.querySelectorAll('.collection-charge-row')].find(row=>row.textContent?.includes('Late loan A'))!.querySelector('button[aria-label^="Increase late charge by 50"]') as HTMLButtonElement;button.click();button.click()});
 await expect.poll(()=>s.operations.length).toBe(3);
 expect(s.operations.map(o=>o.expectedVersion)).toEqual(['ver-lc-c0-0','ver-lc-c0-1','ver-lc-c0-2']);
 expect(s.operations.map(o=>o.inputs.lateChargeDue)).toEqual(['50','100','150']);
 await expect(toast(page)).toHaveText('Late charge +฿50 · now ฿150');
});

test('Collection row: while a step saves the pair is busy with the pending figure, the spinner and a sticky toast; the result replaces them; a refusal reverts the figure; no status read precedes the send',async({page})=>{
 const s=await setup(page);
 const b=chargeRow(page,'Late loan B'),steps=b.locator('.loan-step-buttons');
 await expect(steps).not.toHaveClass(/saving/);await expect(b.locator('.charge-late-note')).toHaveText('Late charge ฿50 · ฿20 paid');
 // The POST is held: the pair is dimmed and busy, the tapped button shows the spinner, the note shows ฿50 → ฿100, the toast stays.
 holdWrites(s);await increase(b).click();await expect.poll(()=>s.operations.length).toBe(1);
 await expect(steps).toHaveClass(/saving/);await expect(steps).toHaveAttribute('aria-busy','true');await expect(b.locator('.charge-late-line')).toHaveAttribute('aria-busy','true');
 await expect(b.locator('.collection-spinner')).toHaveCount(1);await expect(increase(b)).toBeDisabled();await expect(decrease(b)).toBeDisabled();
 await expect(b.locator('.charge-late-note .payment-status-processing .chat-proposal-before')).toHaveText('฿50');await expect(b.locator('.charge-late-note .payment-status-processing strong')).toHaveText('฿100');
 await expect(toast(page)).toHaveText('Saving late charge…');await page.waitForTimeout(3500);await expect(toast(page)).toHaveText('Saving late charge…');await expect(toast(page)).not.toHaveClass(/idle/);
 // Released: the result toast replaces the sticky one and the figure is plain again.
 s.release!();await expect(toast(page)).toHaveText('Late charge +฿50 · now ฿100');
 await expect(steps).not.toHaveClass(/saving/);await expect(b.locator('.collection-spinner')).toHaveCount(0);await expect(b.locator('.payment-status-processing')).toHaveCount(0);
 await expect(b.locator('.charge-late-note')).toHaveText('Late charge ฿100 · ฿20 paid');
 // Round trips and the order: the first tap reads the live record, posts and reads back; no status read before the send.
 expect(s.calls).toEqual(['GET /api/charge-records/lc-c1','POST /api/operations','GET /api/charge-records/lc-c1']);
 expect(s.calls.some(call=>call.startsWith('GET /api/operations/'))).toBe(false);
 expect(s.operations[0]).toMatchObject({expectedVersion:'ver-lc-c1-0',inputs:{lateChargeDue:'100'}});
 // The second tap on the same row needs no live read (the read-back gave the version): the send, then the read-back.
 const seen=s.calls.length;await decrease(b).click();await expect(toast(page)).toHaveText('Late charge −฿50 · now ฿50');
 expect(s.calls.slice(seen)).toEqual(['POST /api/operations','GET /api/charge-records/lc-c1']);expect(s.operations[1]).toMatchObject({expectedVersion:'ver-lc-c1-1',inputs:{lateChargeDue:'50'}});
 // A refusal reverts the figure: the pending figure shows while held, then the old figure returns with the refusal toast.
 await expect(toast(page)).toHaveClass(/idle/,{timeout:6000});
 s.rejectNext=true;holdWrites(s);await decrease(b).click();await expect.poll(()=>s.operations.length).toBe(3);
 await expect(b.locator('.charge-late-note .payment-status-processing strong')).toHaveText('฿20');
 s.release!();await expect(toast(page)).toHaveText(REFUSED);await expect(toast(page)).toHaveClass(/refused/);
 await expect(steps).not.toHaveClass(/saving/);await expect(b.locator('.payment-status-processing')).toHaveCount(0);await expect(b.locator('.charge-late-note')).toHaveText('Late charge ฿50 · ฿20 paid');
});

test('Collection row: a refusal shows the refusal text in the toast (class refused); a load failure and a queued save have their own texts',async({page})=>{
 const s=await setup(page);
 // The server refuses (stale or below paid): the toast carries the refusal and the class refused; nothing changed.
 s.rejectNext=true;await decrease(chargeRow(page,'Late loan B')).click();
 await expect(toast(page)).toHaveText(REFUSED);await expect(toast(page)).toHaveClass(/refused/);expect(s.operations).toHaveLength(1);
 await expect(chargeRow(page,'Late loan B').locator('.charge-late-note')).toHaveText('Late charge ฿50 · ฿20 paid');
 // The live read fails: no command is sent.
 await expect(toast(page)).toHaveClass(/idle/,{timeout:10000});
 s.readFail=1;await increase(chargeRow(page,'Late loan A')).click();
 await expect(toast(page)).toHaveText('Charge could not be loaded. Try again.');await expect(toast(page)).toHaveClass(/refused/);expect(s.operations).toHaveLength(1);
 // Nothing to change: what was paid grew elsewhere to the whole late charge; the live read leaves nothing to step down, and the row-note wording shows.
 s.late['lc-c1'].paid=50;await decrease(chargeRow(page,'Late loan B')).click();await expect(toast(page)).toHaveText('Late charge ฿50 · ฿50 paid');await expect(toast(page)).not.toHaveClass(/refused/);expect(s.operations).toHaveLength(1);
 await expect(toast(page)).toHaveClass(/idle/,{timeout:6000});
 // The command cannot reach the server: saved on the device, the row's buttons wait for its outcome.
 await expect(toast(page)).toHaveClass(/idle/,{timeout:10000});
 s.dropNext=true;await increase(chargeRow(page,'Late loan A')).click();
 await expect(toast(page)).toHaveText('Saved on this device. Will sync when connected.');
 await expect(chargeRow(page,'Late loan A').locator('.charge-late-line')).toHaveAttribute('aria-busy','true');await expect(increase(chargeRow(page,'Late loan A'))).toBeDisabled();
});

test('Collection row: buttons are hidden offline and return online',async({page})=>{
 const s=await setup(page);
 await expect(page.locator('.charge-late-line')).toHaveCount(3);
 await page.context().setOffline(true);
 await expect(page.locator('.charge-late-line')).toHaveCount(0);await expect(chargeRow(page,'Late loan B').locator('.charge-late-note')).toHaveText('Late charge ฿50 · ฿20 paid');
 await page.context().setOffline(false);
 await expect(page.locator('.charge-late-line')).toHaveCount(3);
 expect(s.operations).toHaveLength(0);
});

test('Charge details: the late charge sits with a stepper and shows paid and remaining; a tap applies at once with a toast; offline the buttons are disabled',async({page})=>{
 const s=await setup(page);
 await openDetails(page,'Late loan B');
 const value=page.locator('dd.late-charge-value');
 await expect(value).toContainText('฿50');
 await expect(page.locator('dt',{hasText:'Late Charge Paid'})).toBeVisible();await expect(page.locator('dt',{hasText:'Late Charge Remaining'})).toBeVisible();
 await expect(page.locator('dd',{hasText:/^฿30$/}).first()).toBeVisible();
 const seen=s.calls.length;await increase(value).click();
 await expect(toast(page)).toHaveText('Late charge +฿50 · now ฿100');await expect(confirm(page)).toHaveCount(0);
 await expect.poll(()=>s.calls.slice(seen)).toEqual(['POST /api/operations','GET /api/charge-records/lc-c1']);expect(s.calls.some(call=>call.startsWith('GET /api/operations/'))).toBe(false);
 expect(s.operations).toHaveLength(1);expect(s.operations[0]).toMatchObject({operation:'charge.update',targetId:'lc-c1',expectedVersion:'ver-lc-c1-0',inputs:{lateChargeDue:'100',principalDue:'100',interestDue:'10'}});
 await expect(page.locator('dd.late-charge-value')).toContainText('฿100');
 await decrease(page.locator('dd.late-charge-value')).click();await expect(toast(page)).toHaveText('Late charge −฿50 · now ฿50');
 expect(s.operations[1]).toMatchObject({expectedVersion:'ver-lc-c1-1',inputs:{lateChargeDue:'50'}});
 // In flight both buttons are disabled and the value is busy.
 holdWrites(s);await increase(page.locator('dd.late-charge-value')).click();await expect.poll(()=>s.operations.length).toBe(3);
 await expect(page.locator('dd.late-charge-value')).toHaveAttribute('aria-busy','true');await expect(page.locator('dd.late-charge-value .loan-step-buttons')).toHaveClass(/saving/);await expect(page.locator('dd.late-charge-value .payment-status-processing strong')).toHaveText('฿100');await expect(toast(page)).toHaveText('Saving late charge…');await expect(increase(page.locator('dd.late-charge-value'))).toBeDisabled();await expect(decrease(page.locator('dd.late-charge-value'))).toBeDisabled();
 s.release!();await expect(toast(page)).toHaveText('Late charge +฿50 · now ฿100');
 // The server refuses: the toast carries the refusal text.
 await expect(toast(page)).toHaveClass(/idle/,{timeout:10000});
 s.rejectNext=true;await decrease(page.locator('dd.late-charge-value')).click();await expect(toast(page)).toHaveText(REFUSED);await expect(toast(page)).toHaveClass(/refused/);
 const operations=s.operations.length;
 // Offline each tap would need a live read: both buttons are disabled.
 await page.context().setOffline(true);
 await expect(increase(page.locator('dd.late-charge-value'))).toBeDisabled();await expect(decrease(page.locator('dd.late-charge-value'))).toBeDisabled();
 await page.context().setOffline(false);
 await expect(increase(page.locator('dd.late-charge-value'))).toBeEnabled();
 expect(s.operations).toHaveLength(operations);
 // A charge whose late charge is fully paid cannot be stepped down at all.
 await page.getByRole('button',{name:'Back to charges',exact:true}).click();
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

test('Charge edit page: a server refusal of the changed late charge asks for a refresh',async({page})=>{
 const s=await setup(page);
 await openDetails(page,'Late loan B');await page.getByRole('button',{name:'Edit charge',exact:true}).click();
 const field=page.locator('input[data-field="lateChargeDue"]');await increase(page.locator('form')).click();await expect(field).toHaveValue('100');
 await page.getByRole('button',{name:'Review change',exact:true}).click();
 s.rejectNext=true;await confirm(page).click();
 await expect(page.getByRole('alert').filter({hasText:REFUSED})).toBeVisible();
});

test('Collection shortcut: the long list keeps its place when a tap applies',async({page})=>{
 const s=await setup(page,30);
 const last=chargeRow(page,'Filler loan 29');await last.scrollIntoViewIfNeeded();
 const before=(await last.boundingBox())!.y;
 expect(await page.evaluate(()=>window.scrollY>0||[...document.querySelectorAll('*')].some(e=>e.scrollTop>0))).toBe(true);
 await increase(last).click();await expect(toast(page)).toHaveText('Late charge +฿50 · now ฿50');
 await expect(chargeRow(page,'Filler loan 29').locator('.charge-late-note')).toHaveText('Late charge ฿50');
 expect(s.operations).toHaveLength(1);
 expect(Math.abs((await chargeRow(page,'Filler loan 29').boundingBox())!.y-before)).toBeLessThan(40);
 await expect(confirm(page)).toHaveCount(0);
});
