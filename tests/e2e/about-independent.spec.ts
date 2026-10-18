import {chooseLanguage} from './live-controls';
import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decryptTroubleshooting,parseTroubleshootingFile} from '../../scripts/troubleshooting/envelope.mjs';
// R072 About (independent): release, environment and commit signed in, and reachable signed out; the troubleshooting file is encrypted
// with a per-run test key (MW_TROUBLESHOOTING_PUBLIC_KEY_FILE) and decrypted here in memory only.
let server:ChildProcess;let base:string;let serverLog="";let keyDirectory:string;
const testKey=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
test.beforeAll(async()=>{
 const port=7500+test.info().workerIndex;base=`http://127.0.0.1:${port}`;
 keyDirectory=mkdtempSync(join(tmpdir(),'mw-about-key-'));writeFileSync(join(keyDirectory,'public.pem'),testKey.publicKey);
 server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-about-${port}-${Date.now()}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',MW_TROUBLESHOOTING_PUBLIC_KEY_FILE:join(keyDirectory,'public.pem')},stdio:'pipe'});
 server.stdout?.on("data",data=>{serverLog+=String(data)});server.stderr?.on("data",data=>{serverLog+=String(data)});
 await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200);
});
test.afterAll(()=>{server?.kill();if(keyDirectory)rmSync(keyDirectory,{recursive:true,force:true})}); test.afterEach(async()=>{const info=test.info();if(info.status!==info.expectedStatus)console.log(serverLog)});
const authMock=`let listener;export const browserLocalPersistence='local';export const inMemoryPersistence='memory';export const browserPopupRedirectResolver={};export function initializeAuth(a,o){if(o.persistence!=='local')throw Error('persistence');return {}};export function getAuth(){return {}};export async function setPersistence(a,p){if(p!=='local')throw Error('persistence');}export function onAuthStateChanged(a,fn){listener=fn;fn(null);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener({uid:'synthetic-owner',getIdToken:async()=>'synthetic-bearer'})};export async function signOut(){listener(null)};`;
const borrower={id:'test-row',name:'SYNTHETIC ABOUT FIXTURE',borrowerDisplayName:'SYNTHETIC ABOUT FIXTURE - English',totalProfitEarned:'1.00',createdDate:'2026-10-07',hasActiveLoan:true,outstandingPrincipal:'100.00',note:null};
async function routeApp(page:Page,external:string[]){
 // Desktop and phone Chromium both take the download path here, so the file can be read back.
 await page.addInitScript(()=>{delete (Navigator.prototype as any).share;delete (Navigator.prototype as any).canShare});
 await page.route('**/deps/firebase_app.js*',route=>route.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));
 await page.route('**/deps/firebase_auth.js*',route=>route.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async route=>{
  const req=route.request();if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'Authorization','access-control-allow-methods':'GET'}});return}
  await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,source:'dev',items:new URL(req.url()).pathname.endsWith('/loans')?[]:[borrower],item:borrower,nextCursor:null,asOf:'2026-10-07T05:00:00Z',businessDate:'2026-10-07'})}).catch(()=>{});
 });
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1'||u.hostname==='mw-credit-app-read-dev-test.run.app'){await route.fallback();return}external.push(u.hostname);await route.abort()});
}
/** Downloads the troubleshooting file and decrypts it with the test private key (never written to disk outside Playwright's temp download). */
async function downloadTroubleshooting(page:Page,about:ReturnType<Page['getByRole']>){
 const button=about.getByRole('button',{name:'Download troubleshooting file'});await expect(button).toBeEnabled({timeout:15000});
 const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);
 expect(download.suggestedFilename()).toMatch(/^mw-credit-troubleshooting-dev-\d{8}-\d{4}\.txt$/);
 const text=readFileSync((await download.path())!,'utf8');
 expect(text.split('\n')[0]).toBe('MW Credit troubleshooting file (encrypted). Send it only to the app owner.');
 await expect(about.getByRole('status')).toHaveText('Downloaded. Send the file to the owner by LINE or email.');
 const envelope=parseTroubleshootingFile(text);expect(envelope.environment).toBe('dev');
 return {text,payload:decryptTroubleshooting(envelope,testKey.privateKey)};
}
async function openFromMenu(page:Page,name:RegExp){
 if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click();
 await page.getByRole('button',{name}).filter({visible:true}).click();
}
test('About is a signed-in view with release, environment and commit in English and Thai',async({page},info)=>{
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 const external:string[]=[];
 await page.route('**/deps/firebase_app.js*',route=>route.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));
 await page.route('**/deps/firebase_auth.js*',route=>route.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async route=>{
  const req=route.request();if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'Authorization','access-control-allow-methods':'GET'}});return}
  await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,source:'dev',items:new URL(req.url()).pathname.endsWith('/loans')?[]:[borrower],item:borrower,nextCursor:null,asOf:'2026-10-07T05:00:00Z',businessDate:'2026-10-07'})}).catch(()=>{});
 });
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1'||u.hostname==='mw-credit-app-read-dev-test.run.app'){await route.fallback();return}external.push(u.hostname);await route.abort()});
 await page.goto(base);await expect(page.getByRole('heading',{name:'Sign in to continue',exact:true})).toBeVisible();
 await expect(page.locator('.access-blocked').getByRole('button',{name:'About',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Continue with Google'}).click();await expect(page.getByRole('button',{name:/SYNTHETIC ABOUT FIXTURE/})).toBeVisible();
 await openFromMenu(page,/^About$/);
 const about=page.getByRole('region',{name:'About',exact:true});
 await expect(about).toBeVisible();await expect(page.locator('h1')).toHaveText('About');
 await expect(page.locator('button[aria-label="About"][aria-current="page"]')).not.toHaveCount(0);
 await expect(page.getByRole('button',{name:'Search borrowers'})).toHaveCount(0);
 const value=(label:string)=>about.locator('dt',{hasText:new RegExp('^'+label+'$')}).locator('xpath=following-sibling::dd[1]');
 await expect(value('Release')).toHaveText('R072 · in development');
 await expect(value('Environment')).toHaveText('DEV · dev-lm.mw-credit.com');
 await expect(value('Source commit')).toHaveText(/^([0-9a-f]{7,}|unknown)$/);
 await expect(value('Build')).toHaveText(/^([0-9a-f]{24}|Unavailable)$/);
 await expect(value('Access')).toHaveText('Read-only');await expect(value('Waiting to sync')).toHaveText('None');await expect(value('Language')).toHaveText('English');
 await expect(about.locator('img')).toHaveAttribute('alt','');await expect(about.getByText('DEV',{exact:true})).toBeVisible();
 await about.getByRole('button',{name:'Copy details'}).click();await expect(about.getByRole('status')).toHaveText('Copied');
 const copied=await page.evaluate(()=>navigator.clipboard.readText());
 expect(copied).toMatch(/^MW Credit\nRelease: R072 · in development\nBuild: ([0-9a-f]{24}|unavailable)\nCommit: ([0-9a-f]{7,}|unknown)\nEnvironment: Development \(https:\/\/dev-lm\.mw-credit\.com\)\nApp mode: Browser tab\nConnection: Online\nWaiting to sync: 0$/);
 expect(copied).not.toContain('synthetic-owner');
 await page.screenshot({path:`test-results/r072-about/${info.project.name}-about-en.png`,fullPage:true});
 await chooseLanguage(page,'ไทย');
 const thai=page.getByRole('region',{name:'เกี่ยวกับ',exact:true});
 await expect(thai).toBeVisible();await expect(page.locator('h1')).toHaveText('เกี่ยวกับ');await expect(thai).toContainText('R072 · กำลังพัฒนา');await expect(thai).toContainText('ภาษา');
 // Borrowers is a primary route: the desktop sidebar or the phone bottom bar, without the menu.
 await page.getByRole('button',{name:'ผู้กู้',exact:true}).filter({visible:true}).click();
 await expect(thai).toHaveCount(0);await expect(page.getByRole('button',{name:/SYNTHETIC ABOUT FIXTURE/})).toBeVisible();await expect(page.locator('h1')).toHaveText('ผู้กู้');
 expect(external).toEqual([]);
});

test('About is reachable signed out from the sign-in card; Back, Escape and browser Back return; the file holds counts only',async({page})=>{
 const external:string[]=[];await routeApp(page,external);
 await page.goto(base);const card=page.getByRole('heading',{name:'Sign in to continue',exact:true});await expect(card).toBeVisible();
 // A saved change from an earlier session of another owner on this device: counted, never its content.
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('mw-credit-dev-owner:https://securetoken.google.com/clever-oasis-508610-n7:synthetic-earlier-owner',1);request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const tx=request.result.transaction('records','readwrite');tx.objectStore('records').put({key:'pending:33333333-3333-4333-8333-333333333333',kind:'pending',savedAt:Date.now()-120000,value:{command:{operation:'borrower.update',inputs:{note:'SYNTHETIC SIGNED-OUT NOTE'}}},sync:{state:'blocked',code:'stale_version',attempted:true,deferred:true}});tx.oncomplete=()=>{request.result.close();resolve()};tx.onerror=()=>reject(tx.error)}}));
 const cardAbout=page.locator('.access-blocked').getByRole('button',{name:'About',exact:true});
 await cardAbout.click();
 const about=page.getByRole('region',{name:'About',exact:true});await expect(about).toBeVisible();await expect(card).toHaveCount(0);await expect(page.locator('h1')).toHaveText('About');
 const value=(label:string)=>about.locator('dt',{hasText:new RegExp('^'+label+'$')}).locator('xpath=following-sibling::dd[1]');
 await expect(value('Account')).toHaveText('Not signed in');await expect(value('Release')).toHaveText('R072 · in development');
 for(const hidden of ['Access','Waiting to sync','Signed in as'])await expect(about.locator('dt',{hasText:new RegExp('^'+hidden+'$')})).toHaveCount(0);
 await expect(about.getByRole('heading',{name:'Troubleshooting',exact:true})).toBeVisible();
 const {text,payload}=await downloadTroubleshooting(page,about);
 expect(text).not.toContain('SYNTHETIC');
 expect(Object.keys(payload).sort()).toEqual(['app','createdAt','device','events','schemaVersion','serviceWorker','session','signedOutStorage']);
 expect(payload.schemaVersion).toBe(1);expect(payload.app.release).toBe('R072');expect(payload.session).toEqual({status:'signed_out',rootError:null,signInError:null});
 expect(payload.signedOutStorage.supported).toBe(true);const owner=payload.signedOutStorage.owners.find((item:any)=>item.pending?.length);
 expect(owner.namespace).toMatch(/^[0-9a-f]{16}$/);expect(owner.pending[0]).toMatchObject({operation:'borrower.update',state:'blocked',code:'stale_version',attempted:true,deferred:true});
 const plain=JSON.stringify(payload);for(const sentinel of ['SYNTHETIC SIGNED-OUT NOTE','synthetic-earlier-owner','"value"','inputs'])expect(plain).not.toContain(sentinel);
 // Header Back returns to the card and focus to its About button.
 await page.getByRole('button',{name:'Back to sign-in',exact:true}).click();await expect(card).toBeVisible();await expect(about).toHaveCount(0);await expect(cardAbout).toBeFocused();
 await cardAbout.click();await expect(about).toBeVisible();await page.keyboard.press('Escape');await expect(card).toBeVisible();await expect(cardAbout).toBeFocused();
 await cardAbout.click();await expect(about).toBeVisible();await page.goBack();await expect(card).toBeVisible();await expect(page).toHaveURL(base+'/');
 expect(external).toEqual([]);
});
test('Signed in, the file carries a blocked saved change in full with the receipt as a descriptor and no token or uid',async({page})=>{
 const external:string[]=[];await routeApp(page,external);
 await page.goto(base);await page.getByRole('button',{name:'Continue with Google'}).click();await expect(page.getByRole('button',{name:/SYNTHETIC ABOUT FIXTURE/})).toBeVisible();
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('mw-credit-dev-owner:https://securetoken.google.com/clever-oasis-508610-n7:synthetic-owner',1);request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const id='44444444-4444-4444-8444-444444444444',tx=request.result.transaction('records','readwrite'),value={domain:'payment',borrowerLabel:'SYNTHETIC BLOCKED BORROWER',command:{requestId:id,operation:'payment.receive',inputs:{amount:'123.45',note:'SYNTHETIC BLOCKED NOTE Bearer synthetic-bearer'}},receipt:{image:new Blob([new Uint8Array([9,8,7,6])],{type:'image/jpeg'})}};
   tx.objectStore('records').put({key:'pending:'+id,kind:'pending',savedAt:Date.now()-60000,value,identity:'synthetic',sync:{state:'blocked',code:'stale_version',outcome:{code:'stale_version'},attempted:true,deferred:true}});tx.oncomplete=()=>{request.result.close();window.dispatchEvent(new Event('mw-offline-saved'));resolve()};tx.onerror=()=>reject(tx.error)}}));
 await openFromMenu(page,/^About$/);
 const about=page.getByRole('region',{name:'About',exact:true});await expect(about).toBeVisible();
 await expect(about.getByText('File ready · includes 1 failed save')).toBeVisible({timeout:15000});
 const {text,payload}=await downloadTroubleshooting(page,about);
 expect(text).not.toContain('SYNTHETIC');
 expect(payload.session.status).toBe('ready');expect(payload.session.accountHash).toMatch(/^[0-9a-f]{16}$/);
 expect(payload.pending.failed).toHaveLength(1);const failed=payload.pending.failed[0];
 expect(failed.value.borrowerLabel).toBe('SYNTHETIC BLOCKED BORROWER');expect(failed.value.command.inputs.amount).toBe('123.45');expect(failed.value.command.inputs.note).toBe('SYNTHETIC BLOCKED NOTE Bearer [redacted]');
 expect(failed.value.receipt.image).toEqual({type:'image/jpeg',size:4,sha256:expect.stringMatching(/^[0-9a-f]{64}$/)});
 expect(failed.sync).toMatchObject({state:'blocked',code:'stale_version',attempted:true,deferred:true});
 expect(payload.offline.pending).toBe(1);expect(payload.offline.domains.map((item:any)=>item.domain)).toEqual(['records','collection','cash','management','notifications']);
 const plain=JSON.stringify(payload);for(const sentinel of ['synthetic-bearer','synthetic-owner','synthetic-public-test-key','mw-credit-app-read-dev-test','"data"'])expect(plain).not.toContain(sentinel);
 expect(external).toEqual([]);
});
test('A file failure and Copy details share one status: the newest wins, and Retry clears it',async({page})=>{
 const external:string[]=[];await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await page.addInitScript(()=>{let failures=1;const importKey=SubtleCrypto.prototype.importKey;SubtleCrypto.prototype.importKey=function(this:SubtleCrypto,...args:any[]){if(failures-->0)return Promise.reject(Error('synthetic failure'));return (importKey as any).apply(this,args)} as any});
 await routeApp(page,external);
 await page.goto(base);await page.locator('.access-blocked').getByRole('button',{name:'About',exact:true}).click();
 const about=page.getByRole('region',{name:'About',exact:true}),status=about.getByRole('status'),file=about.getByRole('button',{name:'Download troubleshooting file'});
 await expect(status).toHaveText('Could not create the file. Try again or use Copy details.');await expect(file).toBeDisabled();
 await about.getByRole('button',{name:'Copy details'}).click();await expect(status).toHaveText('Copied');
 await about.getByRole('button',{name:'Retry',exact:true}).click();await expect(status).toHaveText('');await expect(file).toBeEnabled({timeout:15000});
 await expect(about.getByRole('button',{name:'Retry',exact:true})).toHaveCount(0);
 expect(external).toEqual([]);
});
