import {chooseLanguage,signOut} from './live-controls';
import {test,expect} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
let server:ChildProcess;let base:string;let serverLog="";
test.beforeAll(async({},info)=>{
 const port=5800+info.workerIndex;base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-${port}-${Date.now()}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_FIXTURE_BORROWER_ID:'4G-UI-B'},stdio:'pipe'});
 server.stdout?.on("data",data=>{serverLog+=String(data)});server.stderr?.on("data",data=>{serverLog+=String(data)});
 await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return0()}},{timeout:20000}).toBe(200);
});
function return0(){return 0}
test.afterAll(()=>server?.kill()); test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)console.log(serverLog)});
const authMock=`let listener;export const browserLocalPersistence='local';export const inMemoryPersistence='memory';export const browserPopupRedirectResolver={};export function initializeAuth(a,o){if(o.persistence!=='local')throw Error('persistence');return {}};export function getAuth(){return {}};export async function setPersistence(a,p){if(p!=='local')throw Error('persistence');}export function onAuthStateChanged(a,fn){listener=fn;fn(null);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener({uid:'synthetic-owner',getIdToken:async()=>'synthetic-bearer'})};export async function signOut(){listener(null)};`;
test.use({timezoneId:'America/Los_Angeles'});test.setTimeout(60000);

const borrower={id:'4G-UI-B',displayName:'Synthetic borrower / ผู้กู้จำลอง',status:'not_paid',amountDue:'330',amountCollected:'0',amountRemaining:'330'};
const draft={ok:true,mode:'synthetic-only',businessDate:'2026-10-08',asOf:'2026-10-08T05:00:00Z',borrower:{id:borrower.id,displayName:borrower.displayName},charges:Array.from({length:100},(_,i)=>({id:'synthetic-charge-'+i,chargeDate:'2026-10-07',loanDisplayKey:'Synthetic loan / เงินกู้จำลอง '+i,amountRemaining:i===0?'110':'220'})),accounts:[{id:'synthetic-account',label:'Synthetic receiving account'}]};
async function setup(page:any,empty=false){
 await page.route('**/deps/firebase_app.js*',(r:any)=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));
 await page.route('**/deps/firebase_auth.js*',(r:any)=>r.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async(r:any)=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:'2026-10-08',timezone:'Asia/Bangkok',asOf:'2026-10-08T05:00:00Z',items:empty||r.request().url().includes('/charges')||r.request().url().includes('/upcoming')?[]:[borrower],borrower,nextCursor:null,horizonEnd:'2027-01-08',reviewRequired:false})}));
 await page.goto(base);await page.getByRole('button',{name:/Google/}).click();await chooseLanguage(page,'EN');await page.getByRole('button',{name:'Collection',exact:true}).click();
}
function replyDraft(route:any){
 const path=new URL(route.request().url()).pathname;
 const input=path.endsWith('/review')?route.request().postDataJSON():null;
 const charges=input?draft.charges.filter(row=>input.selectedChargeIds.includes(row.id)):draft.charges;
 return route.fulfill({contentType:'application/json',body:JSON.stringify({...draft,charges,total:charges.reduce((sum,row)=>sum+BigInt(row.amountRemaining),0n).toString()})});
}
test('G06 bounded list preserves notes, total, scroll and bilingual review at 320/390/desktop',async({page},info)=>{
 for(const width of [320,390,1440]){
 await page.setViewportSize({width,height:850});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',r=>replyDraft(r));
 await setup(page);await page.locator('.collection-borrower').first().click();await expect(page.getByRole('button',{name:'Receive selected charges'}),await page.locator('body').innerText()).toBeVisible({timeout:8000});await page.getByRole('button',{name:'Receive selected charges'}).click();
 const region=page.getByRole('region',{name:'Charge selection',exact:true});await expect(region.getByRole('checkbox')).toHaveCount(100);
 await region.getByRole('checkbox').first().check();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Synthetic preserved notes');
 await region.evaluate(el=>el.scrollTop=el.scrollHeight);const scroll=await region.evaluate(el=>el.scrollTop);
 await region.getByRole('checkbox').last().check();expect(await region.evaluate(el=>el.scrollTop)).toBe(scroll);
 await expect(page.locator('output')).toHaveText('฿330');await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('Synthetic preserved notes');
 await page.getByRole('button',{name:'Review payment',exact:true}).click();await expect(page.locator('.selected-payment')).toContainText('Synthetic preserved notes');await expect(page.locator('.selected-payment')).toContainText('฿330');
 await page.getByRole('button',{name:'Edit',exact:true}).click();await chooseLanguage(page,'ไทย');await expect(page.getByRole('region',{name:'เลือกรายการเรียกเก็บ'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'outputs/r052-payment-command-api/ui-'+info.project.name+'-'+width+'-th.png',fullPage:true});
 await page.unroute('https://mw-credit-app-command-dev-test.run.app/**');
 }
});
test('G07 Unknown exact retry and immutable pending recovery remains accessible without Collection row',async({page})=>{
 const posts:any[]=[];let statusGets=0;
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
 const path=new URL(r.request().url()).pathname;
 if(path.includes('payment-drafts'))return replyDraft(r);
 if(path.endsWith('/result'))return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'command_unavailable'})});
 if(r.request().method()==='POST'){posts.push(r.request().postDataJSON());return r.abort('failed')}
 statusGets++;await r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,kind:'unresolved',safeToUseNewRequestId:false})});
 });
 await setup(page);await page.locator('.collection-borrower').first().click();await expect(page.getByRole('button',{name:'Receive selected charges'}),await page.locator('body').innerText()).toBeVisible({timeout:8000});await page.getByRole('button',{name:'Receive selected charges'}).click();
 await page.getByRole('checkbox').first().check();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Immutable synthetic note');
 await page.getByRole('button',{name:'Review payment'}).click();await page.getByRole('button',{name:'Confirm payment online'}).click();
 await expect(page.getByRole('heading',{name:'Outcome unknown'})).toBeVisible();expect(posts).toHaveLength(1);await expect(page.getByRole('button',{name:'Retry same command'})).toBeDisabled();
 await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Check status')!;b.click();b.click()});await expect.poll(()=>statusGets).toBe(1);await expect(page.getByRole('button',{name:'Retry same command'})).toBeEnabled();
 await page.getByRole('button',{name:'Retry same command'}).click();await expect(page.getByRole('heading',{name:'Outcome unknown'})).toBeVisible();await expect.poll(()=>posts.length).toBe(2);expect(posts[1]).toEqual(posts[0]);
 expect(await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage)))).toEqual({'mw-credit.pending-command':posts[0].requestId});
 await page.unroute('https://mw-credit-app-read-dev-test.run.app/**');await setup(page,true);
 await page.getByRole('button',{name:'Check pending payment status'}).click();await expect(page.getByRole('heading',{name:'Outcome unknown'})).toBeVisible();await expect(page.getByRole('button',{name:'Retry same command'})).toBeDisabled();
 await page.getByRole('button',{name:'Check status',exact:true}).click();await expect.poll(()=>statusGets).toBe(2);expect(posts).toHaveLength(2);
});










test('G07 invalid replacement releases upload busy and Posted retains notes despite receipt GET failure',async({page})=>{
 let releaseUpload:(()=>void)|undefined,postedBody:any,receiptGets=0,posts=0;
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
 const path=new URL(r.request().url()).pathname;
 if(path.includes('payment-drafts'))return replyDraft(r);
 if(path.endsWith('/result'))return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'command_unavailable'})});
 if(path.includes('/receipts/')){
  if(r.request().method()==='GET'){receiptGets++;return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'receipt_unavailable'})})}
  if(!releaseUpload)await new Promise<void>(resolve=>releaseUpload=resolve);
  return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,receipt:{receiptId:path.split('/').at(-1)}})}).catch(()=>{});
 }
 posts++;postedBody=r.request().postDataJSON();await r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-payment',code:null,recordedAt:'2026-10-08T05:00:00Z'}})});
 });
 await setup(page);await page.locator('.collection-borrower').first().click();await page.getByRole('button',{name:'Receive selected charges'}).click();
 await page.getByRole('checkbox').first().check();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Posted synthetic notes');
 const input=page.locator('input[type=file]');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVhQAAAAASUVORK5CYII=','base64');
 await input.setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await expect.poll(()=>!!releaseUpload).toBe(true);
 await input.setInputFiles({name:'invalid.heic',mimeType:'image/heic',buffer:Buffer.from('invalid')});
 await expect(page.getByText('Uploading receipt…',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Review payment',exact:true})).toBeDisabled();
 releaseUpload!();await page.getByRole('button',{name:'Remove receipt / proceed without receipt'}).click();
 await input.setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('button',{name:'Review payment',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Review payment'}).click();await page.getByRole('button',{name:'Confirm payment online'}).click();
 await expect(page.getByRole('heading',{name:'Original payment recorded as Posted'})).toBeVisible();await expect(page.getByText('Payment remains Posted. The receipt could not be loaded.')).toBeVisible();
 await expect(page.locator('.selected-payment')).toContainText('Posted synthetic notes');await expect(page.locator('.selected-payment')).toContainText('฿110');
 expect(posts).toBe(1);expect(receiptGets).toBe(1);expect(postedBody.receiptId).toMatch(/^[0-9a-f-]{36}$/);
 expect(await page.evaluate(()=>sessionStorage.getItem('mw-credit.pending-command'))).toBeNull();
});

test('G07 pending-reference storage refusal warns and auth loss clears business state',async({page})=>{
 let posts=0;
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
 if(new URL(r.request().url()).pathname.includes('payment-drafts'))return replyDraft(r);
 if(r.request().method()==='POST'){posts++;return r.abort('failed')}
 await r.fulfill({contentType:'application/json',body:JSON.stringify(draft)});
 });
 await setup(page);
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===sessionStorage&&key==='mw-credit.pending-command')throw new DOMException('blocked','SecurityError');return original.call(this,key,value)}});
 await page.locator('.collection-borrower').first().click();await page.getByRole('button',{name:'Receive selected charges'}).click();await page.getByRole('checkbox').first().check();
 await page.getByRole('button',{name:'Review payment'}).click();await page.getByRole('button',{name:'Confirm payment online'}).click();
 await expect(page.getByText('This browser cannot retain the reference. Copy it before leaving.')).toBeVisible();expect(posts).toBe(1);
 await signOut(page);await expect(page.getByRole('heading',{name:'Sign in to continue',exact:true})).toBeVisible();await expect(page.locator('.selected-payment')).toHaveCount(0);
});
test('G07 offline before confirmation clears business draft and never dispatches',async({page,context})=>{
 let posts=0;
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
 if(new URL(r.request().url()).pathname.includes('payment-drafts'))return replyDraft(r);
 if(r.request().method()==='POST'){posts++;return r.abort('failed')}
 await r.fulfill({contentType:'application/json',body:JSON.stringify(draft)});
 });
 await setup(page);await page.locator('.collection-borrower').first().click();await page.getByRole('button',{name:'Receive selected charges'}).click();await page.getByRole('checkbox').first().check();
 await page.getByRole('button',{name:'Review payment'}).click();await context.setOffline(true);
 await expect(page.locator('.selected-payment')).toHaveCount(0);await expect(page.getByRole('button',{name:'Confirm payment online'})).toHaveCount(0);
 expect(posts).toBe(0);await context.setOffline(false);expect(posts).toBe(0);
});



