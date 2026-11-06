import {test,expect,type Page} from './fixtures/test';
import {chooseLanguage,chooseLanguagePreservingForm} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=7900+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/rebate-independent-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(40000);test.use({actionTimeout:5000});
// Synthetic auth/HTTP seams with real DOM. Does not claim live authentication or durable operation journal.
const auth=`let listener;const user={uid:'rebate-independent-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(localStorage.getItem('rebate-owner')?user:null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){localStorage.setItem('rebate-owner','1');listener(user)};export async function signOut(){localStorage.removeItem('rebate-owner');listener(null)};`;
const fields={name:'ผู้กู้จำลองชื่อยาว / Synthetic borrower',description:'English synthetic name',communicationName:'ชื่อที่ใช้ติดต่อ',instagramUsername:'synthetic_instagram',city:'Bangkok',workingLocation:'Synthetic office',address:'บรรทัดหนึ่ง\nline two',hidden:null,referrerId:'C-referrer',preferredReceivingAccountId:'C-account',note:'หมายเหตุ ไทย\n exact note '};
const record={...fields,id:'C-borrower',version:'a'.repeat(64),createdDate:'2026-10-08',aiCollectionEnabled:true,details:{preferredReceivingAccountLabel:'Synthetic receiving account',referrerName:'ผู้แนะนำจำลอง',hasActiveLoan:true,hasClosedLoan:true,totalAmountLoaned:'200',totalInterestEarned:'75',totalNumberOfLoans:2,outstandingPrincipal:'100',activeInterest:'25',activeReturn:'0.25',activeProfit:'-75',coverageDate:'2026-10-10',closedPrincipal:'100',closedInterest:'50',closedReturn:'0.5'}};
const directory={...record,borrowerDisplayName:fields.name,displayName:fields.name,outstandingPrincipal:'100',totalProfitEarned:'75',hasActiveLoan:true};
type State={writes:any[],status:number,lost:boolean,holdOptions:boolean,releaseOptions?:()=>void,holdWrite:boolean,releaseWrite?:()=>void,statusReads:string[],pendingBeforePosts:any[],statusOutcome:string,readRequests:string[],commandReads:string[],loanAccounts:any[],loanRows:any[],expenseItem:any,loanItem?:any,referrers?:any[],referrersTruncated?:boolean,optionQueries:string[],closePreview?:any,collectionItems?:any[]};
async function pending(page:Page){return page.evaluate(async()=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');return ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'rebate-independent-owner'}).list('pending')})}
async function setup(page:Page){const s:State={writes:[],status:200,lost:false,holdOptions:false,holdWrite:false,statusReads:[],pendingBeforePosts:[],statusOutcome:'unresolved',readRequests:[],commandReads:[],optionQueries:[],loanAccounts:[{id:'C-account',label:'Synthetic Lisa lending account',isDefault:false,holderId:'ch:lisa',active:true,holderActive:true}],loanRows:[],expenseItem:expenseFullC};
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>{const path=new URL(r.request().url()).pathname;s.readRequests.push(path);return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:'2026-10-08',asOf:'2026-10-08T05:00:00Z',items:path.endsWith('/loans')?s.loanRows:[directory],item:path.includes('/loans/')?s.loanRows[0]:directory,nextCursor:null})})});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{const path=new URL(r.request().url()).pathname,method=r.request().method();if(method==='GET')s.commandReads.push(path);let result:any={ok:true,items:[],nextCursor:null};
  if(path==='/api/preferences'){/* A versioned preference row: the language save succeeds, so the app does not revert the switch (a failed save rightly restores the previous language). */result={ok:true,item:{id:'C-partner',version:'b'.repeat(64),language:null,statementAccountId:null,statementDate:null}}} else if(path==='/api/expense-options'){if(s.holdOptions)await new Promise<void>(done=>s.releaseOptions=done);result={ok:true,businessDate:'2026-10-09',categories:expenseCategoriesUiC,accounts:[{id:'C-account',label:'Synthetic Dad paying account',holderId:'ch:dad',holderLabel:'Dad'}]}}
  else if(path==='/api/expense-records'){result={ok:true,items:[s.expenseItem],nextCursor:null}}
  else if(path.startsWith('/api/expense-records/')){result={ok:true,item:s.expenseItem}}
  else if(path==='/api/loan-options'){if(s.holdOptions)await new Promise<void>(done=>s.releaseOptions=done);result={ok:true,businessDate:'2026-10-09',accounts:s.loanAccounts}}
  else if(path==='/api/borrower-options'){if(s.holdOptions)await new Promise<void>(done=>s.releaseOptions=done);const q=new URL(r.request().url()).searchParams.get('q')??'';s.optionQueries.push(q);const rows=s.referrers??[{id:'C-referrer',label:'ผู้แนะนำจำลอง'},{id:record.id,label:'Self must not appear'}];result={ok:true,accounts:[{id:'C-account',label:'Synthetic receiving account'}],referrers:rows.filter(row=>[row.label,row.description].some(v=>String(v??'').toLowerCase().includes(q.toLowerCase()))),...(s.referrersTruncated?{truncated:true}:{})}}
  else if(path.endsWith('/close-preview')){if(s.holdOptions)await new Promise<void>(done=>s.releaseOptions=done);result=s.closePreview??{ok:true,businessDate:'2026-10-09',sourceVersion:loanFullC.version,amount:'115',planHash:'c'.repeat(64),accounts:s.loanAccounts}}
  else if(path.startsWith('/api/loan-records/')&&(path.endsWith('/charges')||path.endsWith('/payments'))){result={ok:true,items:[],nextCursor:null}}else if(path.startsWith('/api/loan-records/')){result={ok:true,item:s.loanItem??loanFullC}}
  else if(path.startsWith('/api/payment-drafts/')){result={ok:true,mode:'dev-owner-testing',scope:'all',businessDate:'2026-10-09',asOf:'2026-10-09T05:00:00Z',borrower:{id:record.id,displayName:'Synthetic payment borrower'},accounts:[{id:'C-account',label:'Synthetic receiving account'}],charges:[{id:'C-charge',chargeDate:'2026-10-09',loanDisplayKey:'Synthetic loan',principalRemaining:'10',interestRemaining:'0',amountRemaining:'10'}],nextCursor:null}}
  else if(path.startsWith('/api/payment-commands/')){result={ok:true,kind:'unresolved',safeToUseNewRequestId:false}}
  else if(path.includes('/borrower-records')){expect(method).toBe('GET');result={ok:true,item:record};}
  else if(path==='/api/operations'&&method==='POST'){const body=r.request().postDataJSON();s.pendingBeforePosts.push(await pending(page));s.writes.push({method,body});if(s.holdWrite)await new Promise<void>(done=>s.releaseWrite=done);if(s.lost){s.statusOutcome='unavailable';return r.abort('failed')}result={ok:s.status===200,kind:'recorded',originalOutcome:{status:s.status===200?'applied':'rejected',code:s.status===200?null:'source_conflict',result:s.status===200?{operation:body.operation,targetType:'borrower',targetId:body.targetId,paymentId:null,plan:null,predecessorRequestId:null}:null}};return r.fulfill({status:s.status,contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});}
  else if(path.startsWith('/api/operations/')){expect(method).toBe('GET');s.statusReads.push(path.split('/').at(-1)!);if(s.statusOutcome==='unavailable')return r.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});result=s.statusOutcome==='unresolved'?{ok:true,kind:'unresolved',safeToUseNewRequestId:false}:{ok:true,kind:'recorded',originalOutcome:{status:s.statusOutcome,code:s.statusOutcome==='rejected'?'source_conflict':null,result:null}};}
  if(result.item?.id&&result.item?.version){result.asOf=Date.now();result.businessDate='2026-10-09'}return r.fulfill({contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
 });
 await page.route('https://mw-credit-app-command-dev-test.run.app/api/dashboard',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})}));await page.goto(base);await page.getByRole('button',{name:/Google/}).click();await chooseLanguage(page,'EN');await page.getByRole('button',{name:'Borrowers',exact:true}).filter({visible:true}).click();await expect(page.getByRole('button',{name:'Add borrower',exact:true})).toBeVisible();return s;
}

const loanFullC={id:'C-loan',version:'b'.repeat(64),borrowerId:record.id,borrowerDisplayName:'Synthetic loan borrower',loanDate:'2026-10-06',principal:'100',transferFee:'2',disbursingAccountId:'C-account',disbursingAccountLabel:'Synthetic Lisa account',type:'ดอกเบี้ยรายวัน',dueDate:null,dailyPayment:null,fixedInterest:null,currentDailyInterest:'5',originalRate:5,paymentInterval:1,scheduleAnchor:'2026-10-06',arrangement:'source terms\nไทย',autoChargeEnabled:true,status:'ยังไม่ปิดยอด',defaulted:false,closeDate:null,defaultLoss:null,outstandingPrincipal:'100',principalReceived:'0',interestReceived:'7',amountReceived:'7',defaultLossDate:null,lastDefaultLoss:null,unpaidChargeCount:1,unpaidChargeAmount:'5.00'};
async function fullLoan(page:Page,s:State){s.loanRows=[{id:'C-loan',borrowerId:record.id,borrowerDisplayName:'Synthetic loan borrower',originalDailyInterestRate:'5',loanDate:'2026-10-06',dueDate:null,closeDate:null,loanType:'ดอกเบี้ยรายวัน',status:'ยังไม่ปิดยอด',principalAmount:'100',outstandingPrincipal:'100',totalPrincipalReceived:'0',totalInterestReceived:'7',totalAmountReceived:'7',defaulted:false,autoChargeEnabled:true}];await page.locator('.borrower-tile-main').click();await page.locator('.loan-record').click();await expect(page.getByRole('button',{name:'Edit loan',exact:true})).toBeVisible()}
const expenseCategoriesUiC=['Collection Cost / ค่าใช้จ่ายติดตามหนี้','Transportation / ค่าเดินทาง','Bank / Transfer Fee / ค่าธรรมเนียมธนาคารและโอนเงิน','Software / Subscription / ค่าซอฟต์แวร์และสมาชิก','Other / อื่น ๆ','Referral Rebate / เงินคืนค่าแนะนำลูกค้า'];
const expenseFullC={id:'C-expense',version:'d'.repeat(64),expenseDate:'2026-10-09',category:expenseCategoriesUiC[4],amount:'10.00',payeeName:'Synthetic expense payee',payeeBorrowerId:null,payeeBorrowerLabel:null,relatedBorrowerId:null,relatedBorrowerLabel:null,relatedLoanId:null,relatedLoanLabel:null,notes:'source expense note',paidByAccountId:'C-account',paidByAccountLabel:'Synthetic Dad paying account',paidByHolderId:'ch:dad',paidByHolderLabel:'Dad',sourceType:'Manual',sourceKey:null,grossProfitBasis:null,allocationBasis:'Expense Date Contribution Ratio',partnerAShare:'0.6',partnerBShare:'0.4',partnerAExpense:'6.00',partnerBExpense:'4.00',ruleVersion:null,createdAt:'2026-10-09 12:00:00',createdBy:'synthetic-origin@example.invalid',canEdit:true,canDelete:true,reimbursements:[]};
async function openExpensesC(page:Page){if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Expenses',exact:true}).filter({visible:true}).click();await expect(page.getByRole('button',{name:'Add expense',exact:true})).toBeVisible()}

// R111 Referral rebate offset (Release 2): the rebate choice in Loan Close and the Expenses "Settled by offset" read
// (the Collection prepayment source caption, COL-2, is deferred out of R111). Synthetic seams only; the preview, command and read shapes follow Byte's V122 contract (align the
// mock field names with it, not the assertions). Wording follows Echo (LC-1 to LC-4, EX-1, EX-2).
const expenseOffsetC={...expenseFullC,id:'rr1:C-loan',category:expenseCategoriesUiC[5],amount:'300.00',payeeName:'ผู้แนะนำจำลอง',payeeBorrowerId:'C-referrer',payeeBorrowerLabel:'ผู้แนะนำจำลอง',relatedLoanId:'C-loan',relatedLoanLabel:'L-0412',paidByAccountId:null,paidByAccountLabel:null,paidByHolderId:null,paidByHolderLabel:null,sourceType:'Referral Rebate',sourceKey:'REFERRAL_REBATE:C-loan',grossProfitBasis:'3000.00',ruleVersion:'REFERRAL_REBATE_V1',canEdit:false,canDelete:false,offsetPaymentId:'ro122:C-close',offsetAmount:'300.00',offsetLoanId:'C-referrer-loan',offsetLoanLabel:'L-0398',payableAmount:'0'};
const rebate=(over:any={})=>({amount:'300',referrer:{id:'C-referrer',displayName:'ผู้แนะนำจำลอง'},hasOpenLoan:true,previousPath:null,
 offset:{loans:{'C-referrer-loan':'L-0398'},rows:[{loanId:'C-referrer-loan',chargeDate:'2026-10-09',principalDue:'0',interestDue:'75',partial:false},{loanId:'C-referrer-loan',chargeDate:'2026-10-10',principalDue:'0',interestDue:'75',partial:false},{loanId:'C-referrer-loan',chargeDate:'2026-10-11',principalDue:'0',interestDue:'75',partial:false},{loanId:'C-referrer-loan',chargeDate:'2026-10-12',principalDue:'0',interestDue:'75',partial:false}],paidThrough:{'C-referrer-loan':'2026-10-12'},covered:'300',payable:'0'},businessDate:'2026-10-09',profit:'3000',rate:10,cap:1000,custom:false,...over});
const preview=(s:State,r:any)=>({ok:true,businessDate:'2026-10-09',sourceVersion:loanFullC.version,amount:'115',planHash:'c'.repeat(64),accounts:s.loanAccounts,...(r?{rebate:r}:{})});
async function openClose(page:Page,s:State,r:any){s.closePreview=preview(s,r);await fullLoan(page,s);await page.getByRole('button',{name:'Close Loan',exact:true}).click();await expect(page.getByRole('button',{name:'Review close',exact:true})).toBeDisabled()}
async function reviewAndConfirm(page:Page){await page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/}).selectOption('C-account');await page.getByRole('combobox',{name:/^Payment Method(?: \*)?$/}).selectOption('Cash');await page.getByRole('button',{name:'Review close',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm',exact:true})).toBeVisible()}
const group=(page:Page)=>page.getByRole('group',{name:/^Referral rebate ฿300/});
const choice=(page:Page,name:RegExp)=>page.getByRole('radio',{name});
const sentPath=(s:State)=>s.writes.at(-1)?.body.inputs.rebatePath;

test('the rebate choice offsets the referrer loan by default (D3), previews the plan, and the close command carries rebatePath offset',async({page})=>{
 const s=await setup(page);await openClose(page,s,rebate());
 await expect(group(page)).toBeVisible();
 await expect(choice(page,/^Offset referrer's loan/)).toBeChecked();await expect(choice(page,/^Record as pending payment/)).not.toBeChecked();
 await expect(page.locator('label').filter({hasText:/^Offset referrer's loan/})).toContainText('L-0398 · 9–12 Oct (฿75 × 4), paid through 12 Oct');
 await expect(page.getByRole('combobox',{name:/^Payment Method(?: \*)?$/}).locator('option')).toHaveText(['Bank Transfer','Cash','Net-off at Disbursement']);
 await reviewAndConfirm(page);
 await expect(page.locator('main')).toContainText('Offset to L-0398, paid through 12 Oct');
 await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect.poll(()=>s.writes.length).toBe(1);
 expect(s.writes[0].body.operation).toBe('loan.close');expect(sentPath(s)).toBe('offset');
 // LC-3: the loan record shows the rebate line of the close just applied.
 await expect(page.getByRole('status').filter({hasText:'Rebate: Offset to L-0398, paid through 12 Oct'})).toBeVisible();
});

// R129 (V137): a rebate not offset is pending payment (the Referrers page settles it); nothing moves from Lisa at the close.
test('choosing Record as pending payment sends rebatePath expense and names the pending rebate and the owed total',async({page})=>{
 const s=await setup(page);await openClose(page,s,rebate({owedBefore:'600'}));
 // The owed total shows only under the selected option (Echo LC-1).
 const pendingOption=page.locator('label').filter({hasText:/^Record as pending payment/});
 await expect(pendingOption).toContainText('฿300 pending to ผู้แนะนำจำลอง');await expect(pendingOption).not.toContainText('owed');
 await choice(page,/^Record as pending payment/).check();await expect(pendingOption).toContainText('฿300 pending to ผู้แนะนำจำลอง (฿900 owed after this close)');
 await chooseLanguagePreservingForm(page,'ไทย');await expect(page.locator('label').filter({hasText:/^บันทึกเป็นค้างจ่าย/})).toContainText('฿300 ค้างจ่ายให้ ผู้แนะนำจำลอง (รวมค้างจ่าย ฿900)');
 await chooseLanguagePreservingForm(page,'EN');await reviewAndConfirm(page);
 await expect(page.locator('main')).toContainText('฿300 pending to ผู้แนะนำจำลอง (฿900 owed after this close)');await expect(page.locator('main')).not.toContainText('transfer from Lisa');
 // The language switches above save the preference too; only the close counts here.
 await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect.poll(()=>s.writes.filter(w=>w.body.operation==='loan.close').length).toBe(1);expect(sentPath(s)).toBe('expense');
 await expect(page.getByRole('status').filter({hasText:'Rebate: ฿300 pending to ผู้แนะนำจำลอง'})).toBeVisible();
});

test('a re-close preselects the previous path instead of the default',async({page})=>{
 const s=await setup(page);await openClose(page,s,rebate({previousPath:'expense'}));
 await expect(choice(page,/^Record as pending payment/)).toBeChecked();await expect(choice(page,/^Offset referrer's loan/)).not.toBeChecked();
});

test('a rebate beyond the referrer schedule says what stays pending and does not block Review',async({page})=>{
 const s=await setup(page);const r=rebate();r.offset={...r.offset,covered:'200',payable:'100'};await openClose(page,s,r);
 await expect(page.locator('.field-help').filter({hasText:'฿200 offset to L-0398, paid through 12 Oct · ฿100 pending'})).toBeVisible();
 await page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/}).selectOption('C-account');await page.getByRole('combobox',{name:/^Payment Method(?: \*)?$/}).selectOption('Cash');
 await expect(page.getByRole('button',{name:'Review close',exact:true})).toBeEnabled();
});

test('a referrer without an open loan has no choice, only the pending line on the form and the confirmation',async({page})=>{
 const s=await setup(page);await openClose(page,s,rebate({hasOpenLoan:false,offset:null}));
 await expect(group(page)).toHaveCount(0);await expect(choice(page,/Offset referrer's loan/)).toHaveCount(0);
 await expect(page.locator('main')).toContainText('Rebate ฿300 pending to ผู้แนะนำจำลอง');
 await reviewAndConfirm(page);await expect(page.locator('main')).toContainText('฿300 pending to ผู้แนะนำจำลอง');await expect(page.locator('main')).not.toContainText('transfer from Lisa');
 await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect.poll(()=>s.writes.length).toBe(1);expect([undefined,'expense']).toContain(sentPath(s));
});

test('a close preview without a rebate shows no rebate block and sends no offset',async({page})=>{
 const s=await setup(page);await openClose(page,s,null);
 await expect(page.getByRole('radio')).toHaveCount(0);await expect(page.locator('main')).not.toContainText('Referral rebate');
 await reviewAndConfirm(page);await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect.poll(()=>s.writes.length).toBe(1);expect([undefined,'expense']).toContain(sentPath(s));
});

test('an offset that covers nothing is not offered; the rebate is recorded as pending payment',async({page})=>{
 const s=await setup(page);const r=rebate();r.offset={...r.offset,rows:[],paidThrough:{},covered:'0',payable:'300'};await openClose(page,s,r);
 await expect(choice(page,/^Offset referrer's loan/)).toHaveCount(0);
 await reviewAndConfirm(page);await expect(page.locator('main')).toContainText('฿300 pending to ผู้แนะนำจำลอง');
 await page.getByRole('button',{name:'Confirm',exact:true}).click();await expect.poll(()=>s.writes.length).toBe(1);expect([undefined,'expense']).toContain(sentPath(s));
});

test('the rebate choice fits a 320 px phone in English and Thai, one option per row',async({page})=>{
 await page.setViewportSize({width:320,height:900});const s=await setup(page);await openClose(page,s,rebate());
 for(const language of ['EN','ไทย'] as const){await chooseLanguagePreservingForm(page,language);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);}
 await chooseLanguagePreservingForm(page,'ไทย');await expect(page.getByRole('radio',{name:/^หักกับสินเชื่อผู้แนะนำ|^Offset referrer's loan · หักกับสินเชื่อผู้แนะนำ/})).toBeChecked();
 const first=await choice(page,/./).first().boundingBox(),second=await choice(page,/./).nth(1).boundingBox();expect(second!.y).toBeGreaterThan(first!.y);
});

test('Expenses: an offset-settled rebate reads "Settled by offset" with the referrer and loan key, hides Delete and points to the closing payment',async({page})=>{
 const s=await setup(page);s.expenseItem=expenseOffsetC;await openExpensesC(page);
 await expect(page.locator('.borrower-card').first()).toContainText('Settled by offset · L-0398');
 await page.locator('.borrower-card').click();
 await expect(page.locator('main')).toContainText('Settled by offset');await expect(page.locator('main')).toContainText('ผู้แนะนำจำลอง');await expect(page.locator('main')).toContainText('L-0398');
 await expect(page.locator('main')).not.toContainText('Synthetic Dad paying account');
 await expect(page.locator('main')).not.toContainText('Paid By Cash Holder');
 await expect(page.getByRole('button',{name:'Delete expense',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Edit expense',exact:true})).toHaveCount(0);
 await expect(page.locator('main')).toContainText('Remove through the closing payment');expect(s.writes).toHaveLength(0);
});

// R111 extension (V124): a loan closed by Receive payment shows, on the closing payment, what became of its rebate (Echo RP-11).
// The record field `closeRebate` and its keys are Byte's contract to align; the wording is Echo's.
// Amounts as the API sends them (numeric text with two decimals, found on DEV: a whole-number-only reader hid the line).
const closeRebate=(over:any={})=>({loanId:'C-loan',amount:'300.00',referrerLabel:'ผู้แนะนำจำลอง',offsetPaymentId:'ro122:pwa:C-closing',offsetAmount:'300.00',payableAmount:'0',offsetLoanId:'C-referrer-loan',offsetLoanLabel:'L-0398',paidThrough:'2026-10-12',...over});
async function openClosingPayment(page:Page,rebateLine:any,extra:any={}){
 const row={id:'C-closing',paymentDate:'2026-10-09',month:'2026-10',borrowerId:record.id,borrowerDisplayName:'SYNTHETIC closing borrower',status:'Posted',amountReceived:'1300',postedAmount:'1300',createdAt:null,groupAmountReceived:'1300'};
 await page.route('https://mw-credit-app-command-dev-test.run.app/api/payment-records**',r=>{const u=new URL(r.request().url());
  if(u.pathname==='/api/payment-records'){const month=u.searchParams.get('month');const result=month?{level:'payments',items:[row],nextCursor:null}:u.searchParams.has('borrowerId')?{level:'months',items:[{month:'2026-10',amountReceived:'1300',count:1}],nextCursor:null}:{level:'borrowers',items:[{id:record.id,borrowerId:record.id,borrowerDisplayName:'SYNTHETIC closing borrower'}],nextCursor:null};return r.fulfill({contentType:'application/json',body:JSON.stringify(result)})}
  return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,asOf:new Date().toISOString(),businessDate:'2026-10-09',item:{id:'C-closing',version:'e'.repeat(64),borrowerName:'SYNTHETIC closing borrower',paymentDate:'2026-10-09',amountReceived:'1300',postedAmount:'1300',status:'Posted',notes:null,allocations:[],repayments:[],cashMovements:[],agentReceiptPresent:false,receiptReference:null,...(rebateLine?{closeRebate:rebateLine,...extra}:{})}})})});
 const nav=page.locator(page.viewportSize()!.width<=1050?'.live-bottom-nav':'#live-desktop-navigation');
 await nav.getByRole('button',{name:'Payments',exact:true}).click();
 const list=page.getByRole('region',{name:'Payments list',exact:true});await expect(list.locator('.payment-borrower-group')).toHaveCount(1);
 for(const group of await list.locator('.payment-borrower-group').all()){if(await group.getAttribute('open')===null)await group.locator(':scope > summary').click();await expect(group.locator('.payment-month-group').first()).toBeVisible();for(const month of await group.locator('.payment-month-group').all())if(await month.getAttribute('open')===null)await month.locator(':scope > summary').click()}
 await expect(list.locator('.borrower-card')).toHaveCount(1);await list.locator('.borrower-card').first().click();return page.getByRole('region',{name:'Full payment details',exact:true});
}
test('the closing payment shows the rebate offset line (nothing payable when fully offset)',async({page})=>{
 await setup(page);const detail=await openClosingPayment(page,closeRebate());
 await expect(detail).toContainText('Loan closed · rebate ฿300 offset to L-0398, paid through 12 Oct');await expect(detail).not.toContainText('stays payable');
});
// R129 (V137): a rebate booked from V137 on is pending until a settlement pays it, then paid on the settlement date; a rebate
// booked before V137 (no rebateState, as here before R129) keeps the transfer from Lisa it had at close.
const unoffset={offsetPaymentId:null,offsetAmount:null,offsetLoanId:null,offsetLoanLabel:null,paidThrough:null,payableAmount:'300'};
test('the closing payment shows the pending rebate, and keeps the transfer from Lisa for a rebate booked before R129',async({page})=>{
 await setup(page);const detail=await openClosingPayment(page,closeRebate({...unoffset,rebateState:'pending',pendingAmount:'300.00',owedTotal:'900.00'}));
 await expect(detail).toContainText('Loan closed · rebate ฿300 pending to ผู้แนะนำจำลอง');await expect(detail).not.toContainText('transfer from Lisa');
});
test('the closing payment of a settled rebate names the settlement date',async({page})=>{
 await setup(page);const detail=await openClosingPayment(page,closeRebate({...unoffset,rebateState:'paid',pendingAmount:'0.00',settlementId:'c1111111-1111-4111-8111-111111111111',settlementDate:'2026-11-12'}));
 await expect(detail).toContainText('Loan closed · rebate ฿300 paid to ผู้แนะนำจำลอง on 12 Nov');
});
test('a rebate booked before R129 keeps the transfer from Lisa line',async({page})=>{
 await setup(page);const detail=await openClosingPayment(page,closeRebate(unoffset));
 await expect(detail).toContainText('Loan closed · rebate ฿300 to ผู้แนะนำจำลอง, transfer from Lisa');
});
test('a partly offset rebate adds the pending suffix',async({page})=>{
 await setup(page);const detail=await openClosingPayment(page,closeRebate({offsetAmount:'200.00',payableAmount:'100',rebateState:'pending',pendingAmount:'100.00'}));
 await expect(detail).toContainText('rebate ฿200 offset to L-0398, paid through 12 Oct · ฿100 pending');
});
test('a partly offset rebate booked before R129 keeps the payable suffix',async({page})=>{
 await setup(page);const legacy=await openClosingPayment(page,closeRebate({offsetAmount:'200.00',payableAmount:'100'}));
 await expect(legacy).toContainText('rebate ฿200 offset to L-0398, paid through 12 Oct · ฿100 stays payable');
});
test('an ordinary payment has no Loan closed rebate line',async({page})=>{
 await setup(page);const detail=await openClosingPayment(page,null);
 await expect(detail).not.toContainText('Loan closed');await expect(detail).not.toContainText('rebate');
});
// R119 (Echo PR-1/PR-2): a payment that closed two referred loans shows one line per loan, each starting with the closed
// loan's key, in the order the API sends (the Payment Allocations order); a single rebate keeps today's text.
// The first line is a rebate booked before R129 (no rebateState): its wording stays.
test('R119: two closeRebates give two lines in order, each starting with its closed loan key',async({page})=>{
 await setup(page);
 const first=closeRebate({loanId:'C-loan-a',loanDisplayKey:'SYNTHETIC A-฿1,000-01/10-2%',amount:'30.00',referrerLabel:'Referrer A',offsetPaymentId:null,offsetAmount:null,offsetLoanId:null,offsetLoanLabel:null,paidThrough:null,payableAmount:'30'});
 const second=closeRebate({loanId:'C-loan-b',loanDisplayKey:'SYNTHETIC B-฿2,000-02/10-2%',amount:'20.00',referrerLabel:'Referrer B',offsetPaymentId:'ro122:pwa:C-closing:C-loan-b',offsetAmount:'20.00',payableAmount:'0'});
 const detail=await openClosingPayment(page,first,{closeRebates:[first,second]});
 const lines=detail.locator('.close-rebate-line');await expect(lines).toHaveCount(2);
 await expect(lines.nth(0)).toHaveText('Loan SYNTHETIC A-฿1,000-01/10-2% closed · rebate ฿30 to Referrer A, transfer from Lisa');
 await expect(lines.nth(1)).toHaveText('Loan SYNTHETIC B-฿2,000-02/10-2% closed · rebate ฿20 offset to L-0398, paid through 12 Oct');
});
test('R119: a record with only closeRebate (no closeRebates) shows one line with today\'s text',async({page})=>{
 await setup(page);const detail=await openClosingPayment(page,closeRebate({loanDisplayKey:'SYNTHETIC C-฿1,000-01/10-2%'}));
 const lines=detail.locator('.close-rebate-line');await expect(lines).toHaveCount(1);
 await expect(lines).toHaveText('Loan closed · rebate ฿300 offset to L-0398, paid through 12 Oct');
});

// R120: the basis line under the rebate (Echo LC-1, LC-3): the profit base, the referrer's rate and cap, and the referrer's
// name when the terms are custom; in both the offset fieldset and the payout-only variant; hidden for an older preview.
test('R120 the Loan Close basis line with default terms sits under the legend of the offset choice',async({page})=>{
 const s=await setup(page);await openClose(page,s,rebate());
 await expect(group(page).locator('legend+p.field-help')).toHaveText('10% of ฿3,000 interest and late charges, maximum ฿1,000');
 // LC-4: the basis line takes its own full row; the two option cards share the row below it.
 const box=await group(page).evaluate(f=>{const r=(e:Element|null)=>e!.getBoundingClientRect(),basis=r(f.querySelector('.rebate-basis')),labels=[...f.querySelectorAll(':scope>label')].map(e=>r(e)),inner=f.clientWidth;return {basis:basis.width,inner,below:labels.length===2&&labels.every(l=>l.top>=basis.bottom)}});
 expect(box.basis).toBeGreaterThanOrEqual(box.inner-1);expect(box.below).toBe(true);expect(s.writes).toHaveLength(0);
});
test('R120 custom terms name the referrer under the pending line, in English and Thai',async({page})=>{
 const s=await setup(page);await openClose(page,s,rebate({hasOpenLoan:false,offset:null,amount:'360',profit:'2400',rate:15,cap:1500,custom:true}));
 const summary=page.locator('p.field-summary').filter({hasText:'Rebate ฿360 pending to ผู้แนะนำจำลอง'});await expect(summary).toBeVisible();
 await expect(summary.locator('+p.field-help')).toHaveText('15% of ฿2,400 interest and late charges, maximum ฿1,500 · custom terms for ผู้แนะนำจำลอง');
 await chooseLanguagePreservingForm(page,'ไทย');await expect(page.locator('main')).toContainText('15% ของดอกเบี้ยและค่าปรับล่าช้า ฿2,400 สูงสุด ฿1,500 · เงื่อนไขเฉพาะของ ผู้แนะนำจำลอง');expect(s.writes).toHaveLength(0);
});
test('R120 a preview without the terms (before V135) shows no basis line',async({page})=>{
 const s=await setup(page);await openClose(page,s,rebate({profit:undefined,rate:undefined,cap:undefined,custom:undefined}));
 await expect(group(page)).toBeVisible();await expect(page.locator('main')).not.toContainText('interest and late charges');expect(s.writes).toHaveLength(0);
});
for(const [label,item,expected] of [['a V2 referral rebate shows its Rebate terms',{...expenseOffsetC,ruleVersion:'REFERRAL_REBATE_V2',rebateRate:15,rebateCap:1500},'15% · maximum ฿1,500'],['a V1 referral rebate shows a dash',expenseOffsetC,'—']] as const)
 test('R120 Expenses: '+label,async({page})=>{
  const s=await setup(page);s.expenseItem=item;await openExpensesC(page);await page.locator('.borrower-card').click();
  const row=page.locator('dt',{hasText:/^Rebate terms$/});await expect(row).toBeVisible();await expect(row.locator('+dd')).toHaveText(expected);
  const order=await page.locator('main dt').allTextContents();expect(order.indexOf('Rebate terms')).toBe(order.indexOf('Gross Profit Basis')+1);expect(s.writes).toHaveLength(0);
 });
test('R120 Expenses: the Rebate terms row in Thai',async({page})=>{
 await page.setViewportSize({width:1440,height:900});const s=await setup(page);s.expenseItem={...expenseOffsetC,ruleVersion:'REFERRAL_REBATE_V2',rebateRate:15,rebateCap:1500};await openExpensesC(page);await page.locator('.borrower-card').click();
 await chooseLanguage(page,'ไทย');await expect(page.locator('dt',{hasText:/^เงื่อนไขค่าแนะนำ$/}).locator('+dd')).toHaveText('15% · สูงสุด ฿1,500');expect(s.writes).toHaveLength(0);
});
test('R120 Expenses: a manual expense has no Rebate terms row',async({page})=>{
 const s=await setup(page);s.expenseItem={...expenseFullC};await openExpensesC(page);await page.locator('.borrower-card').click();
 await expect(page.locator('dt',{hasText:/^Gross Profit Basis$/})).toBeVisible();await expect(page.locator('dt',{hasText:/^Rebate terms$/})).toHaveCount(0);expect(s.writes).toHaveLength(0);
});
