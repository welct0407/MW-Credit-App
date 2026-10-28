import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {encodeDeltaChunk} from '../../services/api/offline-dataset-delta.mjs';
const dashboard={collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]};
// UX-RECON-01..07 (owner, 19 October 2026): a reconciliation mismatch that persists after its single heal shows a
// line above Full sync, a header indicator on every screen, a dot on "All synced" and one toast; it survives a
// reload and clears after a Full sync followed by a matching check. A mismatch the heal resolves shows nothing.
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=7500+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-data-check-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(60000);
const auth=`let listener;export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function getAuth(){return {}};export async function setPersistence(){};const user={uid:'synthetic',getIdToken:async()=>'synthetic'};export function onAuthStateChanged(a,fn){listener=fn;window.emitUser=()=>fn(user);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener(user)};export async function signOut(){listener(null)};`;
const identity={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic'};
// The last pass was long ago: the first idle moment after the first complete download reconciles.
const seedDue=(page:Page)=>page.evaluate(async(identity:{issuer:string;uid:string})=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository(identity);await repo.authorize();await repo.saveReconciledAt(1)},identity);
const flags=(page:Page)=>page.evaluate(async(identity:{issuer:string;uid:string})=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository(identity);await repo.authorize();return (await repo.readReconcileFlags()).map(flag=>flag.domain)},identity);
async function account(page:Page){if(page.viewportSize()!.width<=1050&&await page.locator('dialog[open]').count()===0)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click()}
/** cash differs from the server while `differs()` holds; every other domain matches. */
async function routes(page:Page,differs:()=>boolean){
 const calls:string[]=[];
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,source:'dev',items:[],nextCursor:null,asOf:'2026-10-15T05:00:00Z'})}));
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{const url=new URL(r.request().url()),path=url.pathname,method=r.request().method();
  if(path.endsWith('offline-dataset')){const body=method==='POST'?r.request().postDataJSON():{},domain=url.searchParams.get('domain')??'notifications',version='a'.repeat(64);
   if(body.reconcile){const result=domain==='cash'&&differs()?'mismatch':'match';calls.push(domain+':'+result);return r.fulfill({json:{schemaVersion:3,domain,asOf:'2026-10-15T05:00:00.000Z',businessDate:'2026-10-15',reconcile:true,result,keys:result==='mismatch'?['overview']:[],sourceVersion:version,patches:[],values:{},complete:true,nextCursor:null}})}
   if(domain==='cash'&&body.sourceVersion!==version)calls.push('cash:walk');
   const chunk={schemaVersion:2,domain,generation:'g-'+domain,startedAt:'2026-10-15T05:00:00.000Z',asOf:'2026-10-15T05:00:00.000Z',businessDate:'2026-10-15',sourceVersion:version,patches:domain==='records'?[{key:'dashboard',mode:'replace',value:dashboard}]:domain==='cash'?[{key:'overview',mode:'replace',value:{balance:'5'}}]:[],complete:true,nextCursor:null,progress:{completed:1,total:1}};
   if(method!=='POST')return r.fulfill({json:chunk});
   if(body.sourceVersion===version&&!body.need?.length)return r.fulfill({json:{...chunk,schemaVersion:3,patches:[],values:{},unchanged:true}});
   return r.fulfill({json:encodeDeltaChunk(chunk,body.need??[])})}
  if(path==='/api/preferences')return r.fulfill({contentType:'application/json',body:'{"ok":true,"item":{"language":null}}'});
  if(path==='/api/dashboard')return r.fulfill({json:dashboard});
  return r.fulfill({contentType:'application/json',body:'{"ok":true,"items":[],"nextCursor":null}'})});
 return calls;
}
const indicator=(page:Page)=>page.getByRole('button',{name:'Data check found a difference',exact:true});
test('a persistent mismatch shows the line, indicator, dot and one toast; it survives a reload and clears after Full sync and a match',async({page})=>{
 let differs=true;const calls=await routes(page,()=>differs);
 await page.goto(base);await seedDue(page);await page.evaluate(()=>(window as any).emitUser());
 await expect(indicator(page)).toBeVisible({timeout:20000});
 expect(calls.filter(call=>call.startsWith('cash:'))).toEqual(expect.arrayContaining(['cash:mismatch','cash:walk']));
 expect(calls.filter(call=>call==='cash:mismatch')).toHaveLength(2);expect(calls.filter(call=>call==='cash:walk').length).toBeGreaterThanOrEqual(1);
 // UX-RECON-07: one toast.
 await expect(page.locator('.data-check-toast')).toHaveText('Data check found a difference in Cash. Tap the warning icon for details.');
 // UX-RECON-05: the dot on "All synced" (nothing is waiting).
 await expect(async()=>{await account(page);await expect(page.getByRole('button',{name:'All synced, data check found a difference',exact:true}).filter({visible:true})).toBeVisible({timeout:1000})}).toPass({timeout:15000});
 await page.keyboard.press('Escape');
 // UX-RECON-06/02: the indicator opens Saved changes at the line, directly above Full sync.
 await expect(async()=>{if(await page.locator('#data-check-warning').count()===0)await indicator(page).click({timeout:1000});await expect(page.locator('#data-check-warning')).toBeVisible({timeout:1000})}).toPass({timeout:15000});
 const line=page.locator('#data-check-warning');
 await expect(line).toHaveAttribute('role','status');await expect(line).toContainText('Data check found a difference in Cash. Your saved data may be out of date. Run Full sync. If this message stays, send the troubleshooting file from About to the owner. (checked ');
 expect(await page.locator('.full-sync-section > *').evaluateAll(es=>es.map(e=>e.id||e.className))).toEqual(['data-check-warning','secondary-button full-sync-button']);
 await expect(line).toBeInViewport();
 // A reload: the indicator stays (IndexedDB), the toast does not repeat.
 await page.reload();await page.evaluate(()=>(window as any).emitUser());
 await expect(indicator(page)).toBeVisible({timeout:20000});await page.waitForTimeout(2000);
 await expect(page.locator('.data-check-toast')).toHaveText('');expect(calls.filter(call=>call==='cash:mismatch')).toHaveLength(2);
 // UX-RECON-04: Full sync, then a matching check of the flagged area only, clears everything silently.
 differs=false;const before=calls.length;page.on('dialog',dialog=>void dialog.accept());
 await expect(async()=>{if(await page.locator('#data-check-warning').count()===0)await indicator(page).click({timeout:1000});await expect(page.locator('#data-check-warning')).toBeVisible({timeout:1000})}).toPass({timeout:15000});
 await page.locator('.full-sync-button').click();
 await expect(indicator(page)).toHaveCount(0,{timeout:20000});await expect(page.locator('#data-check-warning')).toHaveCount(0);
 expect(calls.slice(before).filter(call=>call.includes(':match')||call.includes(':mismatch'))).toEqual(['cash:match']);
 expect(await flags(page)).toEqual([]);await expect(page.locator('.data-check-toast')).toHaveText('');
});
test('a mismatch the heal resolves shows nothing',async({page})=>{
 let mismatches=0;const calls=await routes(page,()=>mismatches++===0);
 await page.goto(base);await seedDue(page);await page.evaluate(()=>(window as any).emitUser());
 await expect.poll(()=>calls.filter(call=>call.startsWith('cash:')&&call!=='cash:walk'),{timeout:20000}).toEqual(['cash:mismatch','cash:match']);
 await page.waitForTimeout(500);
 await expect(indicator(page)).toHaveCount(0);await expect(page.locator('.data-check-toast')).toHaveText('');expect(await flags(page)).toEqual([]);
});
