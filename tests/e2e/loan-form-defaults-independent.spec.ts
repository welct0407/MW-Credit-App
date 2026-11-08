import {test,expect,type Page} from './fixtures/test';
import {chooseLanguage} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
// R136 Part A (design 3, 5.1): choosing Daily instalment on a new loan fills the documentation fee (10%), the daily payment (5%)
// and the due date (+24 days); a typed value is never overwritten; the helper lines and the summary above Save; the saved command.
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=8600+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/r136-defaults-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
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

test('R136 new daily instalment loan: defaults, typed values kept, helper lines, summary and the saved command',async({page})=>{
 const writes:any[]=[];
 await setup(page,(path,_url,method,body)=>{if(path==='/api/operations'&&method==='POST'){writes.push(body);return {ok:true,kind:'recorded',originalOutcome:{status:'applied',code:null,result:{operation:body.operation,targetType:'loan',targetId:body.targetId,paymentId:null,plan:null,predecessorRequestId:null}}}}return undefined});
 await page.locator('.borrower-tile-main').click();await page.getByRole('button',{name:'New loan',exact:true}).click();await expect(page.getByRole('button',{name:'Save loan',exact:true})).toBeEnabled();
 const money=(label:string)=>page.locator('label').filter({has:page.locator('.field-title').filter({hasText:new RegExp('^'+label+'$')})}).getByRole('textbox');
 await expect(page.locator('.field-title').filter({hasText:/^Documentation Fee$/})).toBeVisible();
 await money('Principal Amount').fill('10000');await page.getByRole('combobox',{name:/^Disbursing Cash Account/}).selectOption('C-account');
 await page.getByRole('radio',{name:'Daily instalment',exact:true}).check();
 await expect(money('Documentation Fee')).toHaveValue('1000');await expect(money('Daily Payment Amount')).toHaveValue('500');await expect(page.getByLabel(/^Due Date/)).toHaveValue('2026-11-02');
 await expect(page.getByTestId('due-date-helper')).toHaveText('25 days, loan date is day 1');
 await expect(page.getByTestId('daily-payment-helper')).toHaveText('Daily principal ฿400 · daily interest ฿100 (1.00% of principal per day)');
 await expect(page.getByTestId('loan-summary')).toContainText('Total ฿12,500 over 25 days · interest ฿2,500 + documentation fee ฿1,000');
 await expect(page.getByTestId('loan-summary')).toContainText('Cash issued to borrower ฿8,500 = ฿10,000 principal − ฿1,000 documentation fee − ฿500 first-day payment');
 // A typed fee stays; the untouched daily payment follows the principal; the remainder rule shows.
 await money('Documentation Fee').fill('800');await money('Principal Amount').fill('20001');
 await expect(money('Documentation Fee')).toHaveValue('800');await expect(money('Daily Payment Amount')).toHaveValue('1000');
 await expect(page.getByTestId('daily-payment-helper')).toHaveText('Daily principal ฿800 · daily interest ฿200 (1.00% of principal per day) · first 1 days +฿1 principal');
 await page.getByRole('button',{name:'Save loan',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(1);
 expect(writes[0]).toMatchObject({operation:'loan.create',inputs:{principal:'20001',transferFee:'800',dailyPayment:'1000',dueDate:'2026-11-02',loanDate:'2026-10-09',type:'ผ่อนชำระรายวัน',autoChargeEnabled:true}});
});
