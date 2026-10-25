import {chooseLanguage,chooseLanguagePreservingForm,routeSyntheticPreferences} from './live-controls';
function preparedWire(value:any){const{data,...metadata}=value;return{...metadata,schemaVersion:2,generation:'fixture-'+value.domain,nextCursor:null,patches:Object.entries(data??{}).map(([key,value])=>({key,mode:'replace',value}))}}

import {test,expect} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import sharp from 'sharp';
import {randomBytes} from 'node:crypto';
let server:ChildProcess;let base:string;let serverLog="";
test.beforeAll(async({},info)=>{
 const port=5800+info.workerIndex;base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-${port}-${Date.now()}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_FIXTURE_BORROWER_ID:'4G-UI-B'},stdio:'pipe'});
 server.stdout?.on("data",data=>{serverLog+=String(data)});server.stderr?.on("data",data=>{serverLog+=String(data)});
 await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return0()}},{timeout:20000}).toBe(200);
});
function return0(){return 0}
test.afterAll(()=>server?.kill()); test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)console.log(serverLog)});
const authMock=`let listener;export const browserLocalPersistence='local';export const inMemoryPersistence='memory';export const browserPopupRedirectResolver={};export function initializeAuth(a,o){if(o.persistence!=='local')throw Error('persistence');return {}};export function getAuth(){return {}};export async function setPersistence(a,p){if(p!=='local')throw Error('persistence');}export function onAuthStateChanged(a,fn){listener=fn;fn(null);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener({uid:'synthetic-owner',getIdToken:async()=>{if(globalThis.__g07PendingReferenceTokenGate)await globalThis.__g07PendingReferenceTokenGate;return 'synthetic-bearer'}})};export async function signOut(){listener(null)};`;
test.use({timezoneId:'America/Los_Angeles'});test.setTimeout(60000);

const borrower={id:'4G-UI-B',displayName:'Synthetic borrower / ผู้กู้จำลอง',status:'not_paid',amountDue:'330',amountCollected:'0',amountRemaining:'330'};
const draft={ok:true,mode:'synthetic-only',businessDate:'2026-10-08',asOf:'2026-10-08T05:00:00Z',borrower:{id:borrower.id,displayName:borrower.displayName},charges:Array.from({length:100},(_,i)=>({id:'synthetic-charge-'+i,chargeDate:'2026-10-07',loanDisplayKey:'Synthetic loan / เงินกู้จำลอง '+i,amountRemaining:i===0?'110':'220',principalRemaining:i===0?'100':'200',interestRemaining:i===0?'10':'20'})),accounts:[{id:'synthetic-account',label:'Synthetic receiving account'}]};
async function setup(page:any,empty=false){
 await page.route('**/deps/firebase_app.js*',(r:any)=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));
 await page.route('**/deps/firebase_auth.js*',(r:any)=>r.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async(r:any)=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:'2026-10-08',timezone:'Asia/Bangkok',asOf:'2026-10-08T05:00:00Z',items:empty||r.request().url().includes('/charges')||r.request().url().includes('/upcoming')?[]:[borrower],borrower,nextCursor:null,horizonEnd:'2027-01-08',reviewRequired:false})}));
 await page.goto(base);await page.getByRole('button',{name:/Google/}).click();await chooseLanguage(page,'EN');await page.getByRole('button',{name:'Collection',exact:true}).click();
}
function replyDraft(route:any){
 const path=new URL(route.request().url()).pathname;
 const input=path.endsWith('/review')?route.request().postDataJSON():null;
 const charges=input?draft.charges.filter(row=>input.allocations.some((line:any)=>line.chargeId===row.id)):draft.charges;
 return route.fulfill({contentType:'application/json',body:JSON.stringify({...draft,charges,total:charges.reduce((sum,row)=>sum+BigInt(row.amountRemaining),0n).toString()})});
}
// R075 receipt recognition on the receiving form. The recognition route and all other API calls are mocked; no model, bank or production data is involved.
const allocation={chargeId:'synthetic-charge-0',principal:'100',interest:'10',expectedPrincipalRemaining:'100',expectedInterestRemaining:'10',chargeDate:'2026-10-07'};
const suggestion={amountReceived:'110',cashAccountId:'synthetic-account',bankReference:'SYNREF123456',paymentDate:'2026-10-07',transferTime:'14:35'};
async function slipPng(){return sharp(Buffer.from('<svg width="320" height="480" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="480" fill="#fffef0"/><text x="24" y="48" font-size="24">SYNTHETIC SLIP</text></svg>')).png().toBuffer()}
async function mockApi(page:any,recognition:(route:any)=>Promise<void>|void){
 const state={recognitionCalls:0,autoAssignBodies:[] as any[],posted:[] as any[]};
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async(r:any)=>{
  const path=new URL(r.request().url()).pathname;
  if(path.includes('payment-drafts')&&path.endsWith('/auto-assign')){state.autoAssignBodies.push(r.request().postDataJSON());return r.fulfill({contentType:'application/json',body:JSON.stringify({allocations:[allocation],charges:[draft.charges[0]]})})}
  if(path.includes('payment-drafts'))return replyDraft(r);
  if(path.endsWith('/recognition')){state.recognitionCalls++;return recognition(r)}
  if(path.includes('/receipts/'))return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,receipt:{receiptId:path.split('/').at(-1)}})});
  if(r.request().method()==='GET')return r.fulfill({json:{ok:true,kind:'unresolved',safeToUseNewRequestId:false}});
  if(path!=='/api/payment-commands')return r.fulfill({json:{ok:true}});
  state.posted.push(r.request().postDataJSON());return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-payment',code:null,recordedAt:'2026-10-08T05:00:00Z'}})});
 });
 return state;
}
const recognized=(extra:any={})=>(r:any)=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,status:'recognized',provider:'gemini',suggestion,warnings:[],...extra})});
async function openForm(page:any){
 await setup(page);await page.locator('.collection-tile-main').first().click();await page.getByRole('button',{name:'Receive selected charges'}).click();
 await expect(page.getByRole('textbox',{name:/^Amount received(?: \*)?$/})).toBeVisible();
}
const amountBox=(page:any)=>page.getByRole('textbox',{name:/^Amount received(?: \*)?$/});
const accountBox=(page:any)=>page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/});
const attach=async(page:any)=>page.locator('input[type=file]').setInputFiles({name:'synthetic-slip.png',mimeType:'image/png',buffer:await slipPng()});

test('R075 recognized slip fills empty fields, runs Auto-assign and posts schema 7 with slip date, reference and time',async({page})=>{
 const state=await mockApi(page,recognized());
 await openForm(page);await attach(page);
 await expect(amountBox(page)).toHaveValue('110');await expect(accountBox(page)).toHaveValue('synthetic-account');
 await expect(page.locator('input.slip-reference')).toHaveValue('SYNREF123456');await expect(page.locator('input[type=time]')).toHaveCount(0);await expect(page.getByText('Transfer time')).toHaveCount(0);
 const note=page.locator('p.field-help.recognition-note[role=status]').filter({hasText:'From slip'});
 await expect(note.first()).toContainText('Gemini');await expect(note.first()).toContainText('amount, account, reference, date. Check before review.');
 await expect(page.getByText(/business date/).first()).toContainText('07-Oct (slip) · business date 08-Oct');
 expect(state.recognitionCalls).toBe(1);await expect.poll(()=>state.autoAssignBodies.length).toBe(1);expect(state.autoAssignBodies[0]).toEqual({amountReceived:'110'});
 await expect(page.locator('output')).toContainText('Allocated฿110');
 await page.getByRole('button',{name:'Review payment',exact:true}).click();await expect(page.locator('.selected-payment')).toContainText('SYNREF123456');await expect(page.locator('.selected-payment')).not.toContainText('14:35');await expect(page.locator('.selected-payment')).not.toContainText('Transfer time');
 await page.getByRole('button',{name:'Confirm payment'}).click();await expect(page.locator('.payment-success')).toContainText('Payment received');
 expect(state.posted).toHaveLength(1);
 expect(state.posted[0]).toMatchObject({schemaVersion:7,paymentDate:'2026-10-07',bankReference:'SYNREF123456',transferTime:'14:35',amountReceived:'110',paymentMethod:'Bank Transfer',cashAccountId:'synthetic-account'});
 expect(state.recognitionCalls).toBe(1);
});

test('R075 typed amount is preserved with a warning and Use slip amount replaces it on request',async({page})=>{
 const state=await mockApi(page,recognized());
 await openForm(page);await amountBox(page).fill('100');await attach(page);
 const mismatch=page.locator('.recognition-note').filter({hasText:'Slip shows a different amount'});
 await expect(mismatch).toBeVisible();await expect(amountBox(page)).toHaveValue('100');
 await expect(accountBox(page)).toHaveValue('synthetic-account');await expect(page.locator('input.slip-reference')).toHaveValue('SYNREF123456');
 expect(state.autoAssignBodies).toHaveLength(0);
 await mismatch.getByRole('button',{name:'Use slip amount'}).click();
 await expect(amountBox(page)).toHaveValue('110');await expect(mismatch).toHaveCount(0);
});

test('R075 duplicate bank reference warns on the form and on review without blocking confirm',async({page})=>{
 const state=await mockApi(page,recognized({warnings:[{code:'reference_exists'}]}));
 await openForm(page);await attach(page);
 const warn=page.getByText('This reference is already on a recorded payment.');
 await expect(warn).toHaveCount(1);await expect(warn).toBeVisible();
 await expect(page.getByRole('button',{name:'Review payment',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Review payment',exact:true}).click();
 await expect(page.locator('.selected-payment').getByText('This reference is already on a recorded payment.')).toBeVisible();
 await page.getByRole('button',{name:'Confirm payment'}).click();await expect(page.locator('.payment-success')).toContainText('Payment received');
 expect(state.posted).toHaveLength(1);expect(state.posted[0].bankReference).toBe('SYNREF123456');
});

test('R075 unavailable recognition leaves the form manual and a manual payment still posts',async({page})=>{
 const state=await mockApi(page,r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,status:'unavailable'})}));
 await openForm(page);await attach(page);
 await expect(page.getByText('Slip not read — enter details manually.')).toBeVisible();
 await expect(amountBox(page)).toHaveValue('');await expect(accountBox(page)).toHaveValue('');await expect(page.locator('input.slip-reference')).toHaveValue('');await expect(page.locator('input[type=time]')).toHaveCount(0);
 expect(state.autoAssignBodies).toHaveLength(0);
 await accountBox(page).selectOption('synthetic-account');await amountBox(page).fill('110');await page.locator('.payment-allocation-row input[type=checkbox]').first().check();
 await page.getByRole('button',{name:'Review payment',exact:true}).click();await page.getByRole('button',{name:'Confirm payment'}).click();await expect(page.locator('.payment-success')).toContainText('Payment received');
 expect(state.posted[0]).toMatchObject({schemaVersion:7,paymentDate:'2026-10-08',amountReceived:'110',bankReference:null,transferTime:null});
});

test('R095 a new payer for a borrower with payer lines is information only and posts schema 8 with payerLines',async({page})=>{
 const headers:any[]=[];
 const after='Somsak Jaidee\nMR. SOMCHAI J***';
 const state=await mockApi(page,r=>{headers.push(r.request().headers());return recognized({payer:{slipName:'MR. SOMCHAI J***',lines:['Somsak Jaidee'],listed:false,before:'Somsak Jaidee',after}})(r)});
 await openForm(page);await attach(page);
 await expect(page.locator('p.field-summary').filter({hasText:'Payer on slip'})).toHaveText('Payer on slip: MR. SOMCHAI J***');
 await expect(page.locator('p.field-help[role=status]').filter({hasText:'payer'})).toHaveText('Will be added as another payer for this borrower.');
 await expect(page.locator('.recognition-note').filter({hasText:/payer/i})).toHaveCount(0);
 expect(headers[0]['x-borrower-id']).toBe(borrower.id);
 await page.getByRole('button',{name:'Review payment',exact:true}).click();
 await expect(page.locator('.selected-payment p.field-summary').filter({hasText:'Payer added'})).toHaveText('Payer added: MR. SOMCHAI J***');
 await page.getByRole('button',{name:'Confirm payment'}).click();await expect(page.locator('.payment-success')).toContainText('Payment received');
 expect(state.posted[0]).toMatchObject({schemaVersion:8,payerLines:{before:'Somsak Jaidee',after},bankReference:'SYNREF123456',paymentMethod:'Bank Transfer'});
});

test('R095 a first payer name says it will be saved (EN and Thai) and posts schema 8',async({page})=>{
 const state=await mockApi(page,recognized({payer:{slipName:'นาย สมชาย ใจดี',lines:[],listed:false,before:null,after:'นาย สมชาย ใจดี'}}));
 await routeSyntheticPreferences(page);
 await openForm(page);await attach(page);
 await expect(page.locator('p.field-help[role=status]').filter({hasText:'payer name'})).toHaveText("Will be saved as this borrower's payer name.");
 // Auto-assign answers after the payer note; snapshot the form for the language switch only once its allocation is shown.
 await expect.poll(()=>state.autoAssignBodies.length).toBe(1);await expect(page.locator('output')).toContainText('Allocated฿110');
 await chooseLanguagePreservingForm(page,'ไทย');
 await expect(page.locator('p.field-summary').filter({hasText:'ผู้โอนในสลิป'})).toHaveText('ผู้โอนในสลิป: นาย สมชาย ใจดี');
 await expect(page.locator('p.field-help[role=status]').filter({hasText:'จะบันทึกเป็นชื่อผู้โอน'})).toHaveText('จะบันทึกเป็นชื่อผู้โอนของผู้กู้รายนี้');
 await chooseLanguagePreservingForm(page,'EN');
 await page.getByRole('button',{name:'Review payment',exact:true}).click();await page.getByRole('button',{name:'Confirm payment'}).click();await expect(page.locator('.payment-success')).toContainText('Payment received');
 expect(state.posted[0]).toMatchObject({schemaVersion:8,payerLines:{before:null,after:'นาย สมชาย ใจดี'}});
});

test('R095 an already listed payer or no payer read adds nothing and keeps schema 7',async({page})=>{
 for(const payer of [{slipName:'MR. SOMCHAI J***',lines:['Somchai Jaidee'],listed:true,before:'Somchai Jaidee',after:null},{slipName:null,lines:['Somsak Jaidee'],listed:false,before:'Somsak Jaidee',after:null}]){
  await page.unrouteAll({behavior:'ignoreErrors'});
  const state=await mockApi(page,recognized({payer}));
  await openForm(page);await attach(page);
  await expect(amountBox(page)).toHaveValue('110');
  await expect(page.getByText(/Payer on slip/)).toHaveCount(payer.slipName?1:0);
  await expect(page.getByText(/Will be (added|saved)/)).toHaveCount(0);
  await page.getByRole('button',{name:'Review payment',exact:true}).click();await expect(page.getByText(/Payer added/)).toHaveCount(0);
  await page.getByRole('button',{name:'Confirm payment'}).click();await expect(page.locator('.payment-success')).toContainText('Payment received');
  expect(state.posted[0].schemaVersion).toBe(7);expect('payerLines' in state.posted[0]).toBe(false);
 }
});
