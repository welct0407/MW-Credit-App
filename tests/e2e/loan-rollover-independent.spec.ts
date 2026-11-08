import {test,expect,type Page} from './fixtures/test';
import {chooseLanguage} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
// R136 Part B (design 4.3, 5.2, 5.3): the loan record's Rollover action opens the rollover form prefilled from the original loan;
// the statement (B4) follows the server quote and the penalty; Review leads to the confirm page; Confirm sends loan.rollover
// online; the new loan opens with the result line.
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=8650+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/r136-rollover-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(40000);test.use({actionTimeout:5000});
// Synthetic auth/HTTP seams with real DOM. Does not claim live authentication or a durable operation journal.
const auth=`let listener;const user={uid:'r136-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(localStorage.getItem('r136-owner')?user:null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){localStorage.setItem('r136-owner','1');listener(user)};export async function signOut(){localStorage.removeItem('r136-owner');listener(null)};`;
const fields={name:'ผู้กู้จำลอง / Synthetic borrower',description:'English synthetic name',communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:null};
const record={...fields,id:'C-borrower',version:'a'.repeat(64),createdDate:'2026-09-01',aiCollectionEnabled:true,details:{preferredReceivingAccountLabel:null,referrerName:null,hasActiveLoan:true,hasClosedLoan:false,totalAmountLoaned:'10000',totalInterestEarned:'2800',totalNumberOfLoans:1,outstandingPrincipal:'2800',activeInterest:'100',activeReturn:'0.01',activeProfit:'0',coverageDate:'2026-10-09',closedPrincipal:'0',closedInterest:'0',closedReturn:'0'}};
const directory={...record,borrowerDisplayName:fields.name,displayName:fields.name,outstandingPrincipal:'2800',totalProfitEarned:'2800',hasActiveLoan:true};
const accounts=[{id:'C-account',label:'Synthetic Lisa lending account',isDefault:true,holderId:'ch:lisa',active:true,holderActive:true}];
type Handler=(path:string,url:URL,method:string,body:any)=>any;
async function setup(page:Page,handle:Handler,loanRows:any[]=[]){
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>{const path=new URL(r.request().url()).pathname;return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:'2026-10-09',asOf:'2026-10-09T05:00:00Z',items:path.endsWith('/loans')?loanRows:[directory],item:path.includes('/loans/')?loanRows[0]:directory,nextCursor:null})})});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{const url=new URL(r.request().url()),path=url.pathname,method=r.request().method();let result:any=handle(path,url,method,method==='POST'?r.request().postDataJSON():null);
  if(result===undefined){if(path==='/api/preferences')result={ok:true,item:{id:'C-partner',version:'b'.repeat(64),language:null,statementAccountId:null,statementDate:null}};else if(path==='/api/loan-options')result={ok:true,businessDate:'2026-10-09',accounts};else if(path==='/api/borrower-options')result={ok:true,accounts:[{id:'C-account',label:'Synthetic Lisa lending account'}],referrers:[]};else if(path.includes('/borrower-records'))result={ok:true,item:record};else if(path==='/api/dashboard')result={collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]};else if(path.startsWith('/api/operations/'))result={ok:true,kind:'unresolved',safeToUseNewRequestId:false};else result={ok:true,items:[],nextCursor:null};}
  if(result.item?.id&&result.item?.version&&!result.asOf){result.asOf=Date.now();result.businessDate='2026-10-09'}
  return r.fulfill({contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
 });
 await page.goto(base);await page.getByRole('button',{name:/Google/}).click();await chooseLanguage(page,'EN');await page.getByRole('button',{name:'Borrowers',exact:true}).filter({visible:true}).click();await expect(page.getByRole('button',{name:'Add borrower',exact:true})).toBeVisible();
}

const original={id:'R-loan',version:'b'.repeat(64),borrowerId:record.id,borrowerDisplayName:'Synthetic rollover borrower',loanDate:'2026-09-22',principal:'10000.00',transferFee:'1000.00',disbursingAccountId:'C-account',disbursingAccountLabel:'Synthetic Lisa lending account',type:'ผ่อนชำระรายวัน',dueDate:'2026-10-16',dailyPayment:'500.00',fixedInterest:null,currentDailyInterest:null,originalRate:1,paymentInterval:1,scheduleAnchor:null,arrangement:null,autoChargeEnabled:true,status:'ยังไม่ปิดยอด',defaulted:false,closeDate:null,defaultLoss:null,outstandingPrincipal:'2800',principalReceived:'7200',interestReceived:'2800',amountReceived:'10000',defaultLossDate:null,lastDefaultLoss:null,unpaidChargeCount:0,unpaidChargeAmount:'0',rolloverSourceLoanId:null,rolledOverToLoanId:null};
const row={id:'R-loan',borrowerId:record.id,borrowerDisplayName:'Synthetic rollover borrower',originalDailyInterestRate:'1',loanDate:'2026-09-22',dueDate:'2026-10-16',closeDate:null,loanType:'ผ่อนชำระรายวัน',status:'ยังไม่ปิดยอด',principalAmount:'10000',outstandingPrincipal:'2800',totalPrincipalReceived:'7200',totalInterestReceived:'2800',totalAmountReceived:'10000',defaulted:false,autoChargeEnabled:true};
let sourceLoanDate='2026-09-22';
function preview(url:URL){const penalty=url.searchParams.get('penalty')??'2000',day=url.searchParams.get('day')??'2026-10-09',settlement=String(3500+Number(penalty));
 return {ok:true,businessDate:day,today:'2026-10-09',yesterday:'2026-10-08',penalty,eligible:true,reason:null,accounts:[{id:'C-account',label:'Synthetic Lisa lending account',isDefault:true}],
  source:{id:'R-loan',borrowerId:record.id,type:'ผ่อนชำระรายวัน',principal:'10000.00',transferFee:'1000.00',loanDate:sourceLoanDate,dueDate:'2026-10-16',dailyPayment:'500.00',currentDailyInterest:null,paymentInterval:1,arrangement:null,disbursingAccountId:'C-account',originalRate:1,term:25,version:'b'.repeat(64)},
  quote:{eligible:true,type:'ผ่อนชำระรายวัน',businessDate:day,unpaid:'0',unchargedDays:7,missingPrincipal:'2800',remainingInterest:'700',interestClamped:false,penalty,dailyAmount:'500',settlement,sourceVersion:'b'.repeat(64),planHash:(penalty==='2000'?'c':'d').repeat(64),
   allocations:[{chargeId:'rl138:6:R-loan:'+day,principal:'2800',interest:String(700+Number(penalty)),lateCharge:'0'}]}};}
/** A rollover draft saved on an older day (no longer today or yesterday), with untouched prefill: 2026-10-01 + 24 days and its note. */
async function seedOldDraft(page:Page){await page.evaluate(async source=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');
 await ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'r136-owner'}).saveDraft('loan:rollover:R-loan',{domain:'loan',label:'Synthetic rollover borrower',draft:{kind:'rollover',loanId:'R-loan',targetId:'f1111111-1111-4111-8111-111111111111',day:'2026-10-01',penalty:'2000',arrangementEdited:false,
  fields:{principal:'10000',transferFee:'1000',disbursingAccountId:'C-account',dueDate:'2026-10-25',dailyPayment:'500',currentDailyInterest:null,paymentInterval:1,arrangement:source}}})},
 'Rollover of loan OLD (loan date 22/09/2026, principal ฿10,000, daily payment ฿500, due 16/10/2026), closed on 01/10/2026 with early closure penalty ฿2,000.\nต่อสัญญาจากสินเชื่อ OLD (วันที่กู้ 22/09/2026 เงินต้น ฿10,000 ยอดชำระรายวัน ฿500 ครบกำหนด 16/10/2026) ปิดเมื่อ 01/10/2026 ค่าปรับปิดก่อนกำหนด ฿2,000')}
const savedDraft=(page:Page)=>page.evaluate(async()=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');return ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'r136-owner'}).draft('loan:rollover:R-loan')});
test('R136 rollover: record action, prefilled form, live statement, confirm and the new loan with its result line',async({page})=>{
 const writes:any[]=[],previews:string[]=[];let created:any=null;
 await setup(page,(path,url,method,body)=>{
  if(path==='/api/loan-records/R-loan/rollover-preview'){previews.push(url.search);return preview(url)}
  if(path==='/api/operations'&&method==='POST'){writes.push(body);created={...original,id:body.targetId,version:'e'.repeat(64),loanDate:'2026-10-09',dueDate:'2026-11-02',outstandingPrincipal:'9600',principalReceived:'400',rolloverSourceLoanId:'R-loan',rolloverSourceDisplayKey:'Synthetic rollover borrower-฿10,000-22/09-1%',rolloverSourceCloseDate:'2026-10-09'};
   return {ok:true,kind:'recorded',originalOutcome:{status:'applied',code:null,result:{operation:'loan.rollover',targetType:'loan',targetId:body.targetId,paymentId:'fd6:fd6:'+body.targetId,plan:null,predecessorRequestId:null,settlement:{paymentId:'pwa:'+body.requestId},rollover:{closedLoanId:'R-loan',newLoanId:body.targetId,statement:{cashIssued:'3000'}}}}}}
  // The settlement payment record: the referred original loan's rebate, offset to the referrer's loan (design 5.3 result line).
  if(path.startsWith('/api/payment-records/pwa%3A')||path.startsWith('/api/payment-records/pwa:'))return {ok:true,item:{id:decodeURIComponent(path.split('/').at(-1)!),closeRebates:[{loanId:'R-loan',amount:'550.00',offsetPaymentId:'ro122:x',offsetAmount:'550.00',payableAmount:'0',offsetLoanLabel:'Referrer loan',referrerLabel:'Mai',paidThrough:'2026-11-30',rebateState:'offset'}]}};
  if(path.startsWith('/api/loan-records/')&&(path.endsWith('/charges')||path.endsWith('/payments')))return {ok:true,items:[],nextCursor:null};
  if(path==='/api/loan-records/R-loan')return {ok:true,item:original,asOf:Date.now(),businessDate:'2026-10-09'};
  if(path.startsWith('/api/loan-records/')&&created)return {ok:true,item:created,asOf:Date.now(),businessDate:'2026-10-09'};
  return undefined;
 },[row]);
 await page.locator('.borrower-tile-main').click();await page.locator('.loan-record').click();
 // A draft from an older day: the day moves to today, the untouched due date and arrangement note follow, the quote is today's.
 await seedOldDraft(page);
 await page.getByRole('button',{name:'Rollover',exact:true}).click();
 await expect(page.getByRole('radio',{name:/^Today · /})).toBeChecked();
 await expect(page.getByRole('heading',{name:'Rollover loan · Synthetic rollover borrower'})).toBeVisible();
 const statement=page.getByTestId('rollover-statement'),amount=(key:string)=>statement.locator(`[data-row="${key}"] .rollover-amount`);
 await expect(amount('available')).toHaveText('฿8,500');await expect(amount('settlement')).toHaveText('฿5,500');await expect(amount('cash')).toHaveText('฿3,000');await expect(amount('profit')).toHaveText('฿3,800');
 await expect(statement).toContainText('− 7 days not yet charged × ฿500');await expect(statement).toContainText('principal ฿2,800 · interest ฿700');
 await expect(page.getByText('฿2,000 = 4 days of ฿500',{exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:/^Loan Arrangement/})).toHaveValue(/^Rollover of loan .*closed on 09\/10\/2026 with early closure penalty ฿2,000\.\nต่อสัญญาจากสินเชื่อ /);
 await expect(page.getByLabel('Due Date',{exact:true})).toHaveValue('2026-11-02');
 // One more day of penalty: the quote is read again and the statement follows.
 await page.getByRole('button',{name:'Increase penalty by one day',exact:true}).click();
 await expect(page.getByText('฿2,500 = 5 days of ฿500',{exact:true})).toBeVisible();await expect(amount('cash')).toHaveText('฿2,500');
 await page.getByRole('button',{name:'Decrease penalty by one day',exact:true}).click();await expect(amount('cash')).toHaveText('฿3,000');
 expect(previews.some(q=>q.includes('penalty=2500'))).toBe(true);
 // The device draft (design 5.3): leaving and reopening keeps the edited penalty and principal, and the statement is quoted again.
 await page.getByRole('button',{name:'Increase penalty by one day',exact:true}).click();await page.getByRole('textbox',{name:'Principal Amount',exact:true}).fill('11000');await expect(amount('cash')).toHaveText('฿3,350');
 const quotes=previews.length;await page.waitForTimeout(700);
 await page.getByRole('button',{name:'Back to loan details',exact:true}).click();await page.getByRole('button',{name:'Rollover',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Principal Amount',exact:true})).toHaveValue('11000');await expect(page.getByText('฿2,500 = 5 days of ฿500',{exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Documentation Fee',exact:true})).toHaveValue('1100');await expect(amount('cash')).toHaveText('฿3,350');expect(previews.length).toBeGreaterThan(quotes);expect(previews.at(-1)).toContain('penalty=2500');
 await page.getByRole('button',{name:'Decrease penalty by one day',exact:true}).click();await page.getByRole('textbox',{name:'Principal Amount',exact:true}).fill('10000');await expect(amount('cash')).toHaveText('฿3,000');
 // UX-11: the penalty may be cleared while typing (no quote, an inline message, Review disabled); "750" is quoted as typed.
 const penaltyBox=page.getByRole('textbox',{name:'Early closure penalty (original loan)',exact:true});
 await penaltyBox.fill('');await expect(page.getByTestId('penalty-message')).toHaveText('Enter the penalty in whole baht (0 or more).');await expect(page.getByRole('button',{name:'Review rollover',exact:true})).toBeDisabled();
 await penaltyBox.fill('0750');await expect(penaltyBox).toHaveValue('750');await expect(page.getByTestId('penalty-message')).toHaveCount(0);await expect(amount('cash')).toHaveText('฿4,250');
 expect(previews.some(q=>q.includes('penalty=750'))).toBe(true);
 await penaltyBox.fill('2000');await expect(amount('cash')).toHaveText('฿3,000');
 // UX-13: a principal change re-derives the untouched fee and daily payment at the original loan's ratios (10% and 5%); a typed fee stays.
 const principalBox=page.getByRole('textbox',{name:'Principal Amount',exact:true}),feeBox=page.getByRole('textbox',{name:'Documentation Fee',exact:true}),dailyBox=page.getByRole('textbox',{name:'Daily Payment Amount',exact:true});
 await principalBox.fill('12000');await expect(feeBox).toHaveValue('1200');await expect(dailyBox).toHaveValue('600');
 await feeBox.fill('1100');await principalBox.fill('14000');await expect(feeBox).toHaveValue('1100');await expect(dailyBox).toHaveValue('700');
 await feeBox.fill('');await principalBox.fill('10000');await expect(feeBox).toHaveValue('1000');await expect(dailyBox).toHaveValue('500');
 await expect(page.locator('.rollover-review-row')).toContainText('Cash issued ฿3,000');
 await page.getByRole('button',{name:'Review rollover',exact:true}).click();
 await expect(page.locator('.rollover-cash-lead')).toContainText('Cash issued to borrower ฿3,000');
 await expect(page.getByTestId('rollover-cash-lines')).toHaveText('Cash: ฿10,000 out (disbursement); in by net-off at disbursement: ฿1,500 first day of the new loan, ฿5,500 settlement of the original loan.');
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(1);
 expect(writes[0].targetId).toBe('f1111111-1111-4111-8111-111111111111');
 expect(writes[0]).toMatchObject({operation:'loan.rollover',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{borrowerId:record.id,loanDate:'2026-10-09',principal:'10000',transferFee:'1000',type:'ผ่อนชำระรายวัน',dueDate:'2026-11-02',dailyPayment:'500',currentDailyInterest:null,paymentInterval:1,autoChargeEnabled:true,sourceLoanId:'R-loan',sourceExpectedVersion:'b'.repeat(64),penalty:'2000',expectedSettlement:'5500',expectedPlanHash:'c'.repeat(64)}});
 await expect(page.getByTestId('rollover-result')).toContainText('Rollover saved: loan ');await expect(page.getByTestId('rollover-result')).toContainText('· ฿3,000 cash to Synthetic rollover borrower');
 await expect(page.getByTestId('rollover-rebate')).toHaveText('Rebate: rebate ฿550 offset to Referrer loan, paid through 30 Nov');
 await expect(page.getByRole('button',{name:/^Rollover of /})).toBeVisible();
 // After the apply no draft is left: reopening Rollover on the original loan starts from a fresh prefill.
 expect(await savedDraft(page)).toBeFalsy();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('R136 rollover: Yesterday before the original loan date is offered disabled with its reason, and the form stays (UX-12)',async({page})=>{
 sourceLoanDate='2026-10-09';
 try{
  await setup(page,(path,url)=>{if(path==='/api/loan-records/R-loan/rollover-preview')return preview(url);if(path.startsWith('/api/loan-records/')&&(path.endsWith('/charges')||path.endsWith('/payments')))return {ok:true,items:[],nextCursor:null};
   if(path==='/api/loan-records/R-loan')return {ok:true,item:{...original,loanDate:'2026-10-09',dueDate:'2026-11-02'},asOf:Date.now(),businessDate:'2026-10-09'};return undefined},[{...row,loanDate:'2026-10-09'}]);
  await page.locator('.borrower-tile-main').click();await page.locator('.loan-record').click();await page.getByRole('button',{name:'Rollover',exact:true}).click();
  await expect(page.getByRole('radio',{name:/^Today · 09\/10\/2026/})).toBeChecked();
  const yesterday=page.getByRole('radio',{name:/^Yesterday · 08\/10\/2026/});await expect(yesterday).toBeDisabled();
  await expect(page.locator('.loan-type-options')).toContainText('Before the original loan date 09/10/2026');
  await expect(page.getByTestId('rollover-statement')).toBeVisible();
 }finally{sourceLoanDate='2026-09-22'}
});
