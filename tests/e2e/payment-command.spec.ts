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
// Use the actual desktop account control without cancelling the retained child form.
async function openSavedPayments(page:any){
 const viewport=page.viewportSize()!;if(viewport.width<=1050)await page.setViewportSize({...viewport,width:1440});
 await page.getByRole('button',{name:/^(?:Waiting to sync|All synced)/}).filter({visible:true}).first().click();
 if(viewport.width<=1050)await page.setViewportSize(viewport);
}
function replyDraft(route:any){
 const path=new URL(route.request().url()).pathname;
 const input=path.endsWith('/review')?route.request().postDataJSON():null;
 const charges=input?draft.charges.filter(row=>input.allocations.some((line:any)=>line.chargeId===row.id)):draft.charges;
 return route.fulfill({contentType:'application/json',body:JSON.stringify({...draft,charges,total:charges.reduce((sum,row)=>sum+BigInt(row.amountRemaining),0n).toString()})});
}
test('G06 bounded list preserves notes, total, scroll and bilingual review at 320/390/desktop',async({page},info)=>{
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',r=>replyDraft(r));
 await page.route('https://mw-credit-app-command-dev-test.run.app/api/operations/*',r=>r.request().method()==='GET'?r.fulfill({json:{ok:true,kind:'unresolved',safeToUseNewRequestId:false}}):r.fallback());
 /* Registered once, after the catch-all so it wins, and kept across the widths: the language choice persists through GET /api/preferences, a status-first read of the request, a preference.update command and its reconciliation read; a draft body in their place makes the app roll the language back to English or keep the preference pending with the language controls blocked. */await routeSyntheticPreferences(page);
 for(const width of [320,390,1440]){
 await page.setViewportSize({width,height:850});
 await setup(page);await page.locator('.collection-tile-main').first().click();await expect(page.getByRole('button',{name:'Receive selected charges'}),await page.locator('body').innerText()).toBeVisible({timeout:8000});await page.getByRole('button',{name:'Receive selected charges'}).click();await page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/}).selectOption('synthetic-account');
 const region=page.getByRole('region',{name:'Payment allocation',exact:true});await expect(region.getByRole('checkbox')).toHaveCount(100);
 await page.getByRole('textbox',{name:/^Amount received(?: \*)?$/}).fill('330');await region.getByRole('checkbox').first().check();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Synthetic preserved notes');
 await region.evaluate(el=>el.scrollTop=el.scrollHeight);const scroll=await region.evaluate(el=>el.scrollTop);
 await region.getByRole('checkbox').last().check();expect(await region.evaluate(el=>el.scrollTop)).toBe(scroll);
 await expect(page.locator('output')).toContainText('Allocated฿330');await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('Synthetic preserved notes');
 await page.getByRole('button',{name:'Review payment',exact:true}).click();await expect(page.locator('.selected-payment')).toContainText('Synthetic preserved notes');await expect(page.locator('.selected-payment')).toContainText('฿330');
 await page.getByRole('button',{name:'Edit',exact:true}).click();await chooseLanguagePreservingForm(page,'ไทย');await expect(page.getByRole('region',{name:'จัดสรรการรับชำระ'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/r052-payment-command-api/ui-'+info.project.name+'-'+width+'-th.png',fullPage:true});
 }
});
test('G07 queued unknown outcome keeps immutable request and reconciles before retry without Collection row',async({page})=>{
 const posts:any[]=[],events:string[]=[];let recorded=false;
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
 const path=new URL(r.request().url()).pathname;
 if(path.includes('payment-drafts'))return replyDraft(r);
 if(/^\/api\/payment-commands\/[^/]+$/.test(path)&&r.request().method()==='GET'){
 events.push('status:'+path.split('/').at(-1));return r.fulfill({json:recorded?{ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-payment'}}:{ok:true,kind:'unresolved',safeToUseNewRequestId:false}});
 }
 if(path==='/api/payment-commands'&&r.request().method()==='POST'){const body=r.request().postDataJSON();events.push('post:'+body.requestId);posts.push(body);return r.abort('failed')}
 return r.fulfill({json:{ok:true,items:[]}});
 });
 await setup(page);await page.locator('.collection-tile-main').first().click();await page.getByRole('button',{name:'Receive selected charges'}).click();await page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/}).selectOption('synthetic-account');
 await page.getByRole('textbox',{name:/^Amount received(?: \*)?$/}).fill('110');await page.locator('.payment-allocation-row input[type=checkbox]').first().check();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Immutable synthetic note');
 await page.getByRole('button',{name:'Review payment'}).click();await page.getByRole('button',{name:'Confirm payment'}).click();
 await expect(page.getByText('Saved on this device. Will sync when connected.',{exact:true})).toBeVisible();await expect.poll(()=>posts.length).toBe(1);
 const original=posts[0];expect(original).toMatchObject({amountReceived:'110',notes:'Immutable synthetic note'});
 const pending=await page.evaluate(async()=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');return (await ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-owner'}).list('pending'))[0].value.command});expect(pending).toEqual(original);
 await openSavedPayments(page);await page.getByRole('button',{name:'Sync now',exact:true}).click();await expect.poll(()=>posts.length).toBe(2);expect(posts[1]).toEqual(original);
 expect(events).toEqual(['status:'+original.requestId,'post:'+original.requestId,'status:'+original.requestId,'post:'+original.requestId]);
 recorded=true;await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>r.fulfill({json:{ok:true,source:'dev',timezone:'Asia/Bangkok',items:[],nextCursor:null,businessDate:draft.businessDate,asOf:draft.asOf}}));
 await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:authMock.replace('fn(null)',"fn({uid:'synthetic-owner',getIdToken:async()=>'synthetic-bearer'})")}));await page.reload();await expect(page.locator('.live-body')).toBeVisible();
 await openSavedPayments(page);await expect(page.getByText('No unsynced changes.',{exact:true})).toBeVisible();expect(posts).toHaveLength(2);expect(events.at(-1)).toBe('status:'+original.requestId);
});

// DB-LOCK-01 / W4-UX-02: a 409 command_busy is a known non-outcome. The form shows the busy state (not
// "Outcome unknown", not a rejection) and the coordinator resends the identical request automatically.
test('W4 busy command shows the busy state and is retried automatically with the same request',async({page})=>{
 const posts:any[]=[],events:string[]=[];let recorded=false;
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
 const path=new URL(r.request().url()).pathname;
 if(path.includes('payment-drafts'))return replyDraft(r);
 if(/^\/api\/payment-commands\/[^/]+$/.test(path)&&r.request().method()==='GET'){events.push('status');return r.fulfill({json:recorded?{ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-payment',recordedAt:'2026-10-08T05:00:00Z'}}:{ok:true,kind:'unresolved',safeToUseNewRequestId:false}});}
 if(path==='/api/payment-commands'&&r.request().method()==='POST'){const body=r.request().postDataJSON();posts.push(body);events.push('post');if(posts.length===1)return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,code:'command_busy'})});recorded=true;return r.fulfill({json:{ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-payment',code:null,recordedAt:'2026-10-08T05:00:00Z'}}})}
 return r.fulfill({json:{ok:true,items:[]}});
 });
 await setup(page);await page.locator('.collection-tile-main').first().click();await page.getByRole('button',{name:'Receive selected charges'}).click();await page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/}).selectOption('synthetic-account');
 await page.getByRole('textbox',{name:/^Amount received(?: \*)?$/}).fill('110');await page.locator('.payment-allocation-row input[type=checkbox]').first().check();
 await page.getByRole('button',{name:'Review payment'}).click();await page.getByRole('button',{name:'Confirm payment'}).click();
 await expect(page.getByRole('status').filter({hasText:'Busy — not saved yet'})).toBeVisible();await expect(page.getByText('Nothing was applied. Retrying automatically.',{exact:true})).toBeVisible();
 await expect(page.getByText('Outcome unknown')).toHaveCount(0);await expect(page.getByText(/Could not apply/)).toHaveCount(0);await expect(page.getByRole('button',{name:'Retry same command',exact:true})).toBeEnabled();
 await expect.poll(()=>posts.length,{timeout:15000}).toBe(2);expect(posts[1]).toEqual(posts[0]);expect(events.slice(0,3)).toEqual(['status','post','status']);
 await expect(page.locator('.payment-success')).toContainText('Payment received');await expect(page.getByText('Busy — not saved yet')).toHaveCount(0);
});

test('G07 removed delayed upload cannot revive receipt and Posted retains notes despite receipt GET failure',async({page})=>{
 let releaseUpload:(()=>void)|undefined,postedBody:any,receiptGets=0,posts=0,oldReceiptId:string|undefined,oldUploadSettled=false;
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
 const path=new URL(r.request().url()).pathname;
 if(path.includes('payment-drafts'))return replyDraft(r);
 if(path.endsWith('/result'))return r.fulfill({contentType:'application/json',body:JSON.stringify({originalCommand:postedBody,originalOutcome:{status:'posted'},currentSource:'present',payment:{status:'Posted',paymentDate:'2026-10-08',amountReceived:'110',postedAmount:'110',notes:'Posted synthetic notes',receiptReference:'manual-receipts/dev/pwa/'+postedBody.requestId.replaceAll('-','')+'/'+postedBody.receiptId.replaceAll('-','')+'.png',receiptAt:'now'},allocations:[],repayments:[],cashMovements:[],history:{recordedAt:'now'}})});
 if(path.includes('/receipts/')){
  if(r.request().method()==='GET'){receiptGets++;return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'receipt_unavailable'})})}
  const held=!releaseUpload;if(held){oldReceiptId=path.split('/').at(-1);await new Promise<void>(resolve=>releaseUpload=resolve)}
  await r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,receipt:{receiptId:path.split('/').at(-1)}})}).catch(()=>{});if(held)oldUploadSettled=true;return;
 }
 if(r.request().method()==='GET')return r.fulfill({json:{ok:true,kind:'unresolved',safeToUseNewRequestId:false}});
 if(path!=='/api/payment-commands')return r.fulfill({json:{ok:true}});
 posts++;postedBody=r.request().postDataJSON();await r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-payment',code:null,recordedAt:'2026-10-08T05:00:00Z'}})});
 });
 await setup(page);await page.locator('.collection-tile-main').first().click();await page.getByRole('button',{name:'Receive selected charges'}).click();await page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/}).selectOption('synthetic-account');
 await page.getByRole('textbox',{name:/^Amount received(?: \*)?$/}).fill('110');await page.locator('.payment-allocation-row input[type=checkbox]').first().check();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Posted synthetic notes');
 const input=page.locator('input[type=file]');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVhQAAAAASUVORK5CYII=','base64');
 await input.setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await expect.poll(()=>!!releaseUpload).toBe(true);
 await expect(input).toHaveCount(0);await page.getByRole('button',{name:'Remove receipt',exact:true}).click();await expect(input).toHaveCount(1);
 releaseUpload!();await expect.poll(()=>oldUploadSettled).toBe(true);await expect(page.locator('.payment-receipt-preview')).toHaveCount(0);await expect(page.getByText('Uploading receipt…',{exact:true})).toHaveCount(0);
 await input.setInputFiles({name:'invalid.heic',mimeType:'image/heic',buffer:Buffer.from('invalid')});
 await expect(page.getByText('Uploading receipt…',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Review payment',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Remove receipt',exact:true}).click();
 await input.setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('button',{name:'Review payment',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Review payment'}).click();await page.getByRole('button',{name:'Confirm payment'}).click();
 await expect(page.locator('.payment-success')).toContainText('Payment received');await page.getByRole('button',{name:'Payment details',exact:true}).click();await expect(page.getByText('Current receipt could not be verified. Recorded payment is unchanged.')).toBeVisible();
 await expect(page.getByRole('region',{name:'Payment result details'})).toContainText('Posted synthetic notes');await expect(page.getByRole('region',{name:'Payment result details'})).toContainText('฿110');
 expect(posts).toBe(1);expect(receiptGets).toBe(1);expect(postedBody.receiptId).toMatch(/^[0-9a-f-]{36}$/);expect(postedBody.receiptId).not.toBe(oldReceiptId);
 expect(await page.evaluate(()=>sessionStorage.getItem('mw-credit.pending-command'))).toBeNull();
});

for(const width of [320,390])test(`G07 receipt picker and large removable preview stay consistent through review ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:850});let uploadId:string|undefined;const posted:any[]=[];
 const receiptImage=await sharp(Buffer.from('<svg width="320" height="480" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="480" fill="#fffef0"/><text x="24" y="48" font-size="24">SYNTHETIC RECEIPT</text><path d="M24 70H296M24 150H296M24 220H296" stroke="#555"/><text x="24" y="120" font-size="20">UI test only</text><text x="24" y="190" font-size="20">Amount 110</text></svg>')).png().toBuffer();
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
  const path=new URL(r.request().url()).pathname;if(path.includes('payment-drafts'))return replyDraft(r);
  if(path.includes('/receipts/')){uploadId=path.split('/').at(-1);return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,receipt:{receiptId:uploadId}})})}
  if(r.request().method()!=='POST')return r.fulfill({json:{ok:true,kind:'unresolved',safeToUseNewRequestId:false}});
  if(path!=='/api/payment-commands')return r.fulfill({json:{ok:true}});
  posted.push(r.request().postDataJSON());return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-payment',code:null,recordedAt:'2026-10-08T05:00:00Z'}})});
 });
 await setup(page);await page.locator('.collection-tile-main').first().click();await page.getByRole('button',{name:'Receive selected charges',exact:true}).click();await page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/}).selectOption('synthetic-account');await page.getByRole('textbox',{name:/^Amount received(?: \*)?$/}).fill('110');await page.locator('.payment-allocation-row input[type=checkbox]').first().check();
 const input=page.locator('input[type=file]');expect(await input.evaluate(node=>(node as HTMLInputElement).multiple)).toBe(false);
 await input.setInputFiles({name:'synthetic-receipt.png',mimeType:'image/png',buffer:receiptImage});await expect.poll(()=>uploadId).toBeTruthy();await expect(page.getByRole('button',{name:'Review payment',exact:true})).toBeEnabled();await expect(input).toHaveCount(0);
 const image=page.getByRole('img',{name:'Selected receipt',exact:true});await expect(image).toBeVisible();await expect.poll(()=>image.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(320);expect((await image.boundingBox())!.width).toBeGreaterThan(width*.75);
 const remove=page.getByRole('button',{name:'Remove receipt',exact:true});const imageBox=await image.boundingBox(),removeBox=await remove.boundingBox();expect(removeBox!.x+removeBox!.width).toBeGreaterThan(imageBox!.x+imageBox!.width-55);expect(removeBox!.y).toBeLessThan(imageBox!.y+55);await page.screenshot({path:info.outputPath('selected-receipt-edit.png'),fullPage:true});
 await page.getByRole('button',{name:'Review payment',exact:true}).click();await expect(image).toBeVisible();expect((await image.boundingBox())!.width).toBeGreaterThan(width*.75);await page.screenshot({path:info.outputPath('selected-receipt-review.png'),fullPage:true});expect(posted).toHaveLength(0);
 await page.getByRole('button',{name:'Edit',exact:true}).click();await remove.click();await expect(image).toHaveCount(0);await expect(input).toHaveCount(1);await expect(page.getByRole('button',{name:'Review payment',exact:true})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.getByRole('button',{name:'Review payment',exact:true}).click();await page.getByRole('button',{name:'Confirm payment',exact:true}).click();await expect(page.locator('.payment-success')).toContainText('Payment received');expect(posted).toHaveLength(1);expect(posted[0].receiptId).toBeNull();
});

test('G07 pending-reference storage refusal warns; sign-out is blocked while queued and auth loss keeps the queued payment',async({page})=>{
 let posts=0;let postedBody:any;let sessionLost=false;
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
 if(new URL(r.request().url()).pathname.includes('payment-drafts'))return replyDraft(r);
 if(r.request().method()==='POST'){posts++;postedBody=r.request().postDataJSON();return r.abort('failed')}
 if(sessionLost)return r.fulfill({status:401,contentType:'application/json',body:'{"ok":false,"code":"session_invalid"}'});
 await r.fulfill({json:{ok:true,kind:'unresolved',safeToUseNewRequestId:false}});
 });
 await setup(page);
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===sessionStorage&&key==='mw-credit.pending-command'){
  const fixture=window as any;if(!fixture.__g07PendingReferenceTokenGate)fixture.__g07PendingReferenceTokenGate=new Promise<void>(resolve=>fixture.__g07ReleasePendingReferenceToken=resolve);
  throw new DOMException('blocked','SecurityError');
 }return original.call(this,key,value)}});
 await page.locator('.collection-tile-main').first().click();await page.getByRole('button',{name:'Receive selected charges'}).click();await page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/}).selectOption('synthetic-account');await page.getByRole('textbox',{name:/^Amount received(?: \*)?$/}).fill('110');await page.locator('.payment-allocation-row input[type=checkbox]').first().check();
 await page.getByRole('button',{name:'Review payment'}).click();await page.getByRole('button',{name:'Confirm payment'}).click();
 await expect(page.getByText('This browser cannot retain the reference. Copy it before leaving.')).toBeVisible();
 expect(posts).toBe(0);expect(await page.evaluate(()=>sessionStorage.getItem('mw-credit.pending-command'))).toBeNull();
 const reference=await page.locator('.selected-payment code').innerText();expect(reference).toMatch(/^[a-f0-9-]{36}$/);
 await page.evaluate(()=>(window as any).__g07ReleasePendingReferenceToken());
 await expect.poll(()=>posts).toBe(1);expect(postedBody.requestId).toBe(reference);
 await expect(page.getByText('Saved on this device. Will sync when connected.',{exact:true})).toBeVisible();
 // APP-OFFLINE-02: the queued payment blocks sign-out; APP-OFFLINE-01: an involuntary 401 expires the session but keeps pending:* rows.
 const viewport=page.viewportSize()!;if(viewport.width<=1050)await page.setViewportSize({...viewport,width:1440});
 const signOut=page.getByRole('button',{name:'Sign out',exact:true}).filter({visible:true});await expect(signOut).toBeDisabled();await expect(signOut).toHaveAccessibleDescription('1 saved change not synced yet. Sync before signing out.');
 if(viewport.width<=1050)await page.setViewportSize(viewport);
 const pending=()=>page.evaluate(async()=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-owner'});return {pending:(await repo.list('pending')).map((row:any)=>row.value.command.requestId),authorized:await repo.authorized()}});
 expect((await pending()).pending).toEqual([reference]);
 sessionLost=true;await expect(page.getByRole('heading',{name:'Please sign in again',exact:true})).toBeVisible({timeout:20000});await expect(page.locator('.selected-payment')).toHaveCount(0);
 expect(await pending()).toEqual({pending:[reference],authorized:false});
 expect(posts).toBe(1);
});
test('G07 offline before confirmation retains review without dispatching an unconfirmed payment',async({page,context})=>{
 let posts=0;
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
 if(new URL(r.request().url()).pathname.includes('payment-drafts'))return replyDraft(r);
 if(r.request().method()==='POST'){posts++;return r.abort('failed')}
 await r.fulfill({json:{ok:true,kind:'unresolved',safeToUseNewRequestId:false}});
 });
 await setup(page);await page.locator('.collection-tile-main').first().click();await page.getByRole('button',{name:'Receive selected charges'}).click();await page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/}).selectOption('synthetic-account');await page.getByRole('textbox',{name:/^Amount received(?: \*)?$/}).fill('110');await page.locator('.payment-allocation-row input[type=checkbox]').first().check();
 await page.getByRole('button',{name:'Review payment'}).click();await context.setOffline(true);
 await expect(page.locator('.selected-payment')).toBeVisible();await expect(page.getByRole('button',{name:'Save for sync',exact:true})).toBeEnabled();await expect(page.locator('.selected-payment')).toContainText('฿110');
 expect(posts).toBe(0);await context.setOffline(false);expect(posts).toBe(0);
});

test('Foreground reconnect recovers full authenticated composition after missed online and preserves ready form',async({page,context})=>{
 const events:string[]=[],posted:any[]=[];let authorizationReads=0;
 // Fixture-borrower mode renews through its authenticated borrower read; owner mode may use preferences.
 page.on('request',request=>{const url=new URL(request.url());if(request.method()==='GET'&&request.headers().authorization==='Bearer synthetic-bearer'&&((url.origin==='https://mw-credit-app-read-dev-test.run.app'&&url.pathname==='/api/borrowers')||(url.origin==='https://mw-credit-app-command-dev-test.run.app'&&url.pathname==='/api/preferences')))authorizationReads++});await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{const path=new URL(r.request().url()).pathname;if(path==='/api/preferences'){return r.fulfill({json:{item:{language:'English'}}})}if(path.includes('payment-drafts'))return replyDraft(r);events.push(r.request().method()+' '+path);if(r.request().method()==='POST'){posted.push(r.request().postDataJSON());return r.fulfill({json:{kind:'recorded',originalOutcome:{status:'applied'}}})}return r.fulfill({json:{kind:'unresolved'}})});await setup(page);await page.locator('.collection-tile-main').first().click();await page.getByRole('button',{name:'Receive selected charges'}).click();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Preserved during background reconnect');
 await page.evaluate(async()=>{const module=await import('/apps/pwa/src/owner-offline.ts');(window as any).__foregroundRepo=module.ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-owner'},'dev');await(window as any).__foregroundRepo.authorize()});
 for(const foreground of ['pageshow','visibilitychange','focus']){const initialAuthorizationReads=authorizationReads;await context.setOffline(true);await page.evaluate(async()=>{const fixture=window as any;fixture.__missOnline=(event:Event)=>event.stopImmediatePropagation();window.addEventListener('online',fixture.__missOnline,true);const requestId=crypto.randomUUID();fixture.__foregroundRequest=requestId;await fixture.__foregroundRepo.savePending(requestId,{domain:'borrower',command:{requestId,operation:'borrower.update',targetId:'synthetic',inputs:{note:'Queue from '+requestId},expectedVersion:'a'.repeat(64),receiptId:null}});await new Promise<void>((resolve,reject)=>{const request=indexedDB.open(fixture.__foregroundRepo.scopeName,1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put({key:'lease:owner',kind:'lease',savedAt:Date.now(),value:{verifiedAt:Date.now()-25*60*60*1000}});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(Error('Fixture lease expiration failed'))}})});await context.setOffline(false);await page.evaluate(foreground=>{const fixture=window as any;window.removeEventListener('online',fixture.__missOnline,true);if(foreground==='visibilitychange'){Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))}else window.dispatchEvent(new Event(foreground))},foreground);await expect.poll(()=>authorizationReads).toBeGreaterThan(initialAuthorizationReads);await expect.poll(()=>page.evaluate(()=>(window as any).__foregroundRepo.syncAuthorized())).toBe(true);await expect.poll(()=>page.evaluate(async()=>(await(window as any).__foregroundRepo.list('pending')).length),{timeout:8000}).toBe(0);await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('Preserved during background reconnect');}
 await page.locator('.collection-update').click();await expect(page.locator('.refresh-feedback')).toContainText('Your edits are kept');await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('Preserved during background reconnect');expect(posted).toHaveLength(3);for(const command of posted){const get=events.indexOf('GET /api/operations/'+command.requestId),post=events.indexOf('POST /api/operations',get);expect(get).toBeGreaterThanOrEqual(0);expect(post).toBeGreaterThan(get)}
});

test('Root Collection shows exact saved page before deferred fresh response with loading header and preserves cache on failed refresh',async({page})=>{
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',r=>r.fulfill({json:{item:{language:'English'}}}));await setup(page);await expect(page.locator('.collection-tile-main')).toContainText(borrower.displayName);await expect(page.locator('.collection-spinner')).toHaveCount(0);await expect(page.locator('.collection-update svg.app-icon[data-icon=refresh]')).toHaveAttribute('data-icon','refresh');await page.getByRole('button',{name:'Borrowers',exact:true}).click();await page.evaluate(async()=>{const module=await import('/apps/pwa/src/owner-offline.ts'),repo=module.ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-owner'},'dev');await repo.authorize();(window as any).__rootCacheSeed=await repo.saveCachedResponse('json:https://mw-credit-app-read-dev-test.run.app/api/collection?limit=25'+'|day='+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),{format:'json',contentType:'application/json',data:{ok:true,source:'dev',businessDate:'2026-10-14',asOf:'2026-10-14T05:00:00Z',nextCursor:null,items:[{id:'cached',displayName:'Cached IDB collection',status:'not_paid',amountDue:'25',amountCollected:'0',amountRemaining:'25'}]}},await repo.readRevision())});
 expect(await page.evaluate(()=>(window as any).__rootCacheSeed)).toBe(true);let heldReads=0;let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);await page.route('https://mw-credit-app-read-dev-test.run.app/api/collection?**',async r=>{heldReads++;await held;return r.fulfill({json:{ok:true,source:'dev',businessDate:'2026-10-14',asOf:'2026-10-14T06:00:00Z',nextCursor:null,items:[{id:'fresh',displayName:'Fresh IDB collection',status:'not_paid',amountDue:'30',amountCollected:'0',amountRemaining:'30'}]}})});await page.getByRole('button',{name:'Collection',exact:true}).click();await expect.poll(()=>heldReads).toBeGreaterThan(0);await expect(page.locator('.collection-tile-main')).toContainText('Cached IDB collection');await expect(page.locator('.collection-spinner')).toBeVisible();await expect(page.locator('.collection-update')).toHaveAttribute('data-refresh-state','loading');await expect(page.locator('.collection-update .collection-spinner')).toBeVisible();await expect(page.locator('.refresh-failure-badge')).toHaveCount(0);await expect(page.locator('.collection-tile-main')).toBeEnabled();release();await expect(page.locator('.collection-tile-main')).toContainText('Fresh IDB collection');await expect(page.locator('.collection-spinner')).toHaveCount(0);
 await page.route('https://mw-credit-app-read-dev-test.run.app/api/collection?**',r=>r.fulfill({status:503,json:{code:'unavailable'}}));await page.locator('.collection-update').click();await expect(page.locator('.collection-tile-main')).toContainText('Fresh IDB collection');await expect(page.locator('.cached-read-status')).toBeVisible();await expect(page.locator('.collection-update')).toHaveAttribute('data-refresh-state','error');await expect(page.locator('.refresh-failure-badge')).toBeVisible();await expect(page.locator('.collection-update svg.app-icon[data-icon=refresh]')).toHaveAttribute('data-icon','refresh');await expect(page.locator('.collection-update')).toHaveAttribute('title',/Refresh failed/);await page.route('https://mw-credit-app-read-dev-test.run.app/api/collection?**',r=>r.fulfill({json:{ok:true,source:'dev',businessDate:'2026-10-14',asOf:'2026-10-14T06:00:00Z',nextCursor:null,items:[{id:'fresh',displayName:'Fresh IDB collection',status:'not_paid',amountDue:'30',amountCollected:'0',amountRemaining:'30'}]}}));await page.locator('.collection-update').click();await expect(page.locator('.collection-update')).toHaveAttribute('data-refresh-state','success');await expect(page.locator('.refresh-failure-badge')).toHaveCount(0);
 await page.evaluate(async()=>{const module=await import('/apps/pwa/src/owner-offline.ts'),repo=module.ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-owner'},'dev'),envelope={ok:true,source:'dev',businessDate:'2026-10-14',asOf:'2026-10-14T05:00:00Z',nextCursor:null},borrower={id:'fresh',displayName:'Fresh IDB collection',status:'not_paid',amountDue:'30',amountCollected:'0',amountRemaining:'30'};const entries=[['/api/collection/fresh/charges?limit=10',{...envelope,borrower,items:[{id:'cached-charge',loanId:'loan',loanDisplayKey:'Cached loan charge',chargeDate:'2026-10-14',paymentStatus:'Unpaid',paymentDate:null,amountRemaining:'30',totalPaid:'0',receivedToday:'0'}]}],['/api/collection/fresh/upcoming?businessDate=2026-10-14',{...envelope,horizonEnd:'2026-11-14',reviewRequired:false,items:[{id:'date',dueDate:'2026-10-15',totalCharge:'9'}]}]];for(const[path,data]of entries)await repo.saveCachedResponse('json:https://mw-credit-app-read-dev-test.run.app'+path+(String(path).includes('businessDate=')?'':'|day='+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())),{format:'json',contentType:'application/json',data},await repo.readRevision())});
 let releaseDetails!:()=>void;const detailsHeld=new Promise<void>(resolve=>releaseDetails=resolve);await page.route('https://mw-credit-app-read-dev-test.run.app/api/collection/fresh/**',async r=>{await detailsHeld;const envelope={ok:true,source:'dev',businessDate:'2026-10-14',asOf:'2026-10-14T06:00:00Z',nextCursor:null};return r.fulfill({json:r.request().url().includes('/upcoming')?{...envelope,horizonEnd:'2026-11-14',reviewRequired:false,items:[{id:'date',dueDate:'2026-10-15',totalCharge:'11'}]}:{...envelope,borrower:{id:'fresh',displayName:'Fresh IDB collection',status:'not_paid',amountDue:'30',amountCollected:'0',amountRemaining:'30'},items:[]}})});await page.locator('.collection-tile-main').click();await expect(page.locator('.charge-tile-action')).toHaveAttribute('aria-label',/Cached loan charge/);await expect(page.locator('.upcoming-date-row')).toContainText('฿9');await expect(page.locator('.upcoming-date-row')).toBeEnabled();await expect(page.locator('.collection-spinner')).toBeVisible();releaseDetails();await expect(page.locator('.upcoming-date-row')).toContainText('฿11');
});

test('Current refresh clears errors from multiple offline pages and keeps a new current failure visible',async({page,context})=>{
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',r=>r.fulfill({json:{item:{language:'English'}}}));await setup(page);await expect(page.locator('.collection-tile-main')).toBeVisible();await expect(page.locator('.collection-spinner')).toHaveCount(0);await page.getByRole('button',{name:'Borrowers',exact:true}).click();await expect(page.locator('.collection-spinner')).toHaveCount(0);await page.getByRole('button',{name:'Collection',exact:true}).click();await expect(page.locator('.collection-tile-main')).toBeVisible();await expect(page.locator('.collection-spinner')).toHaveCount(0);
 await context.setOffline(true);await page.getByRole('button',{name:'Borrowers',exact:true}).click();await expect(page.locator('.refresh-failure-badge')).toBeVisible();await page.getByRole('button',{name:'Collection',exact:true}).click();await expect(page.locator('.collection-tile-main')).toBeVisible();await expect(page.locator('.refresh-failure-badge')).toBeVisible();await context.setOffline(false);await page.locator('.collection-update').click();await expect(page.locator('.collection-update')).toHaveAttribute('data-refresh-state','success');await expect(page.locator('.refresh-failure-badge')).toHaveCount(0);
 await page.route('https://mw-credit-app-read-dev-test.run.app/api/collection?**',r=>r.fulfill({status:503,json:{code:'current_failure'}}));await page.locator('.collection-update').click();await expect(page.locator('.refresh-failure-badge')).toBeVisible();await expect(page.locator('.collection-update')).toHaveAttribute('data-refresh-state','error');
});




test('Native root left swipe reveals navigation at phone tablet and collapsed desktop widths',async({page,context})=>{
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',r=>r.fulfill({json:{item:{language:'English'}}}));await setup(page);
 const session=await context.newCDPSession(page);await session.send('Emulation.setTouchEmulationEnabled',{enabled:true});
 for(const width of [390,900,1440]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(450);
  if(width===1440&&await page.getByRole('button',{name:'Collapse navigation',exact:true}).count())await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();
  const main=await page.locator('main[data-workspace]').boundingBox();const x=Math.min(width-40,main!.x+Math.min(main!.width-30,250)),y=main!.y+150;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-130*i/6,y}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  if(width<=1050){await expect(page.getByRole('dialog',{name:'Navigation menu'})).toBeVisible();await page.waitForTimeout(450);await page.getByRole('button',{name:'Close menu',exact:true}).click()}
  else {await expect(page.getByRole('button',{name:'Collapse navigation',exact:true})).toHaveAttribute('aria-expanded','true');await expect(page.locator('#live-desktop-navigation')).toBeVisible()}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await session.detach();
});

test('Full app preparation keeps current page usable with header progress then opens unvisited Collection offline',async({page,context},info)=>{
 await page.setViewportSize({width:390,height:844});const directoryBorrower={id:borrower.id,name:'Prepared synthetic borrower',borrowerDisplayName:'Prepared synthetic borrower',totalProfitEarned:'10',createdDate:'2026-10-14',hasActiveLoan:true,outstandingPrincipal:'330',note:null};let releaseRecords!:()=>void,releaseMedia!:()=>void;const recordsHeld=new Promise<void>(r=>releaseRecords=r),mediaHeld=new Promise<void>(r=>releaseMedia=r),prepared:string[]=[];let releaseUpdate!:()=>void,deltaReads=0,failUpdate=false;const updateHeld=new Promise<void>(r=>releaseUpdate=r);
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async route=>{const url=new URL(route.request().url()),domain=url.searchParams.get('domain')??'notifications';if(url.pathname.includes('/receipt')){await mediaHeld;return route.fulfill({body:await sharp({create:{width:20,height:30,channels:3,background:'#f68c18'}}).png().toBuffer(),contentType:'image/png'})}if(!url.pathname.includes('offline-dataset'))return route.fulfill({json:{item:{language:'English'}}});if(route.request().method()==='POST'){deltaReads++;await updateHeld;if(failUpdate)return route.fulfill({status:503,json:{code:'unavailable'}});return route.fulfill({json:{schemaVersion:3,domain,complete:true,unchanged:true,sourceVersion:null,nextCursor:null,asOf:'2026-10-14T00:00:00Z',businessDate:'2026-10-14',patches:[],values:{}}})}prepared.push(domain);if(domain==='records')await recordsHeld;return route.fulfill({json:preparedWire({schemaVersion:1,domain,complete:true,ok:true,asOf:'2026-10-14T00:00:00Z',businessDate:'2026-10-14',data:domain==='records'?{borrowerList:[directoryBorrower],borrowers:[],payments:[{id:'media',receiptReference:'attached',receiptAt:'2026-10-14T00:00:00Z'}]}:domain==='collection'?{items:[{...borrower,id:'unvisited',displayName:'Prepared unvisited collection'}],charges:[],borrowerUpcoming:[{borrowerId:'unvisited',scope:'collection',horizonEnd:'2026-11-14',reviewRequired:false,items:[],previews:[]}]}: {}})})});
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:authMock}));await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>r.fulfill({json:{ok:true,source:'dev',businessDate:'2026-10-14',asOf:'2026-10-14T00:00:00Z',items:[directoryBorrower],nextCursor:null}}));await page.goto(base);await page.getByRole('button',{name:/Google/}).click();await chooseLanguage(page,'EN');await page.evaluate(async()=>{const m=await import('/apps/pwa/src/owner-offline.ts');await m.ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-owner'},'dev').authorize();window.dispatchEvent(new Event('mw-offline-prepare'))});await expect.poll(()=>prepared.includes('records')).toBe(true);const progress=page.locator('.header-load-progress');await expect(progress).toBeVisible();await expect(page.locator('.borrower-tile')).toContainText('Prepared synthetic borrower');await expect(page.locator('.borrower-tile')).not.toContainText('NaN');const geometry=await page.evaluate(()=>{const p=document.querySelector('.header-load-progress')!.getBoundingClientRect(),r=document.querySelector('.collection-update')!.getBoundingClientRect();return {left:p.right<=r.left,overflow:document.documentElement.scrollWidth>innerWidth}});expect(geometry).toEqual({left:true,overflow:false});releaseRecords();await expect(progress).toHaveAttribute('value','80');await page.screenshot({path:info.outputPath('header-offline-preparation-390.png')});releaseMedia();await expect(progress).toHaveCount(0);await expect(page.locator('.offline-preparation-status')).toHaveCount(0);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));/* Owner 17 Oct 2026: every focus refreshes at once, even right after a completed check; "sync now" (the manual prepare) joins that check, and a background check shows no header progress (SYNC-UX-02). */await expect.poll(()=>deltaReads).toBe(1);await page.evaluate(()=>window.dispatchEvent(new Event('mw-offline-prepare')));await page.waitForTimeout(600);expect(deltaReads).toBe(1);await expect(progress).toHaveCount(0);await expect(page.locator('.header-load-percent')).toHaveCount(0);await expect(page.getByText('Updating saved data…',{exact:true})).toHaveCount(0);await expect(page.locator('.offline-preparation-status')).toHaveCount(0);await context.setOffline(true);await expect(progress).toHaveCount(0);await expect(page.locator('.header-load-percent')).toHaveCount(0);await context.setOffline(false);await expect(progress).toHaveCount(0);await page.screenshot({path:info.outputPath('header-background-update-390.png')});releaseUpdate();await expect(progress).toHaveCount(0);failUpdate=true;await page.evaluate(()=>window.dispatchEvent(new Event('mw-offline-prepare')));await expect(page.locator('.offline-preparation-status')).toContainText('Updates paused');await expect(progress).toHaveCount(0);await expect(page.locator('.offline-preparation-status').getByRole('button',{name:'Retry',exact:true})).toBeVisible();
 await context.setOffline(true);await page.getByRole('button',{name:'Collection',exact:true}).click();await expect(page.locator('.collection-tile-main')).toContainText('Prepared unvisited collection');await page.locator('.collection-tile-main').click();await expect(page.getByRole('region',{name:'Collection charge details'}).getByRole('button',{name:'Prepared unvisited collection',exact:true})).toBeVisible();
});

test('G07 receipt downscale shows a preparing state and keeps review disabled until the prepared file is attached',async({page})=>{
 const uploads:{type:string;width:number|undefined}[]=[];
 await page.addInitScript(()=>{const original=window.createImageBitmap.bind(window);(window as any).createImageBitmap=async(...args:any[])=>{await new Promise<void>(resolve=>{(window as any).__releaseBitmap=resolve});return (original as any)(...args)}});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
  const path=new URL(r.request().url()).pathname;if(path.includes('payment-drafts'))return replyDraft(r);
  if(path.includes('/receipts/')&&r.request().method()==='POST'){const body=r.request().postDataBuffer()!;uploads.push({type:r.request().headers()['content-type'],width:(await sharp(body).metadata()).width});return r.fulfill({json:{ok:true,receipt:{receiptId:path.split('/').at(-1)}}})}
  await r.fulfill({json:{ok:true,kind:'unresolved',safeToUseNewRequestId:false}});
 });
 await setup(page);await page.locator('.collection-tile-main').first().click();await page.getByRole('button',{name:'Receive selected charges',exact:true}).click();await page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/}).selectOption('synthetic-account');await page.getByRole('textbox',{name:/^Amount received(?: \*)?$/}).fill('110');await page.locator('.payment-allocation-row input[type=checkbox]').first().check();
 const review=page.getByRole('button',{name:'Review payment',exact:true});await expect(review).toBeEnabled();
 const noise=randomBytes(1700*1275*3);
 const photo=await sharp(noise,{raw:{width:1700,height:1275,channels:3}}).png().toBuffer();
 await page.locator('input[type=file]').setInputFiles({name:'synthetic-photo.png',mimeType:'image/png',buffer:photo});
 await expect(page.getByText('Preparing receipt…',{exact:true})).toBeVisible();await expect(review).toBeDisabled();expect(uploads).toHaveLength(0);
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseBitmap)).toBe('function');await page.evaluate(()=>(window as any).__releaseBitmap());
 await expect.poll(()=>uploads.length).toBe(1);await expect(review).toBeEnabled();await expect(page.getByText('Preparing receipt…',{exact:true})).toHaveCount(0);
 expect(uploads[0]).toEqual({type:'image/jpeg',width:1600});
});
