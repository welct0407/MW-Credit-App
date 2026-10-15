import {test,expect,type Page} from '@playwright/test';
import {signOut} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
// APP-OFFLINE-02: while unsynced saved requests exist the Sign out button is disabled and reads "Sync N pending first", with
// "Sync saved changes" and "Review saved changes" beside it; logout() re-checks and fails closed. A denied (403) session keeps the
// saved-changes screen reachable, and a same-UID re-sign-in gets a working repository without a reload.
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=5400+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-signout-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(40000);
const auth=`let listener;export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function getAuth(){return {}};export async function setPersistence(){};const user={uid:'synthetic',getIdToken:async()=>'synthetic'};export function onAuthStateChanged(a,fn){listener=fn;window.emitUser=()=>fn(user);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener(user)};export async function signOut(){window.signouts=(window.signouts||0)+1;listener(null)};`;
const identity={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic'},id='44444444-4444-4444-8444-444444444444';
const pendingRows=(page:Page)=>page.evaluate(async(identity:{issuer:string;uid:string})=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');return ownerOfflineRepository(identity).list('pending')},identity);
const seedPending=(page:Page)=>page.evaluate(async({identity,id}:{identity:{issuer:string;uid:string};id:string})=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository(identity);await repo.authorize();await repo.savePending(id,{domain:'borrower',command:{requestId:id,operation:'borrower.update',targetId:'synthetic-target',expectedVersion:'a'.repeat(64),predecessorRequestId:null,receiptId:null,inputs:{note:'unsynced'}}})},{identity,id});
async function account(page:Page){if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click()}
async function closeAccount(page:Page){if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:/^(Close menu|ปิดเมนู)$/}).click()}
type Routes={posts:string[];statusGets:number;status:number;applied:boolean};
async function setup(page:Page):Promise<Routes>{
 const routes:Routes={posts:[],statusGets:0,status:200,applied:false};
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>r.fulfill({status:routes.status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,source:'dev',items:[],nextCursor:null,asOf:'2026-10-15T05:00:00Z'})}));
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',r=>{const path=new URL(r.request().url()).pathname,method=r.request().method();
  if(routes.status!==200)return r.fulfill({status:routes.status,contentType:'application/json',body:'{"ok":false,"code":"access_denied"}'});
  if(path==='/api/operations'&&method==='POST'){routes.posts.push(path);return routes.applied?r.fulfill({contentType:'application/json',body:'{"ok":true,"kind":"recorded","originalOutcome":{"status":"applied","code":null}}'}):r.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"code":"command_unavailable"}'})}
  if(path==='/api/operations/'+id){routes.statusGets++;return r.fulfill({contentType:'application/json',body:'{"ok":true,"kind":"unresolved","safeToUseNewRequestId":false}'})}
  if(path==='/api/preferences')return r.fulfill({contentType:'application/json',body:'{"ok":true,"item":{"language":null}}'});
  if(path==='/api/dashboard')return r.fulfill({contentType:'application/json',body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})});
  return r.fulfill({contentType:'application/json',body:'{"ok":true,"items":[],"nextCursor":null}'})});
 await page.goto(base);return routes;
}
test('sign-out is blocked with sync and review affordances until the saved request is gone',async({page,context})=>{
 const routes=await setup(page);await seedPending(page);
 await page.evaluate(()=>(window as any).emitUser());
 await account(page);
 const blocked=page.getByRole('button',{name:'Sync 1 pending first',exact:true}).filter({visible:true});
 await expect(blocked).toBeVisible();await expect(blocked).toBeDisabled();await expect(blocked).toHaveAttribute('aria-disabled','true');
 await expect(page.getByRole('button',{name:'Sign out',exact:true}).filter({visible:true})).toHaveCount(0);
 // Distinct accessible names: the header affordance never collides with the saved-changes screen's own "Sync now".
 await expect(page.getByRole('button',{name:'Sync now',exact:true})).toHaveCount(0);
 const syncSaved=page.getByRole('button',{name:'Sync saved changes',exact:true}).filter({visible:true});await expect(syncSaved).toBeVisible();
 await expect(page.getByRole('button',{name:'Review saved changes',exact:true}).filter({visible:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).signouts??0)).toBe(0);expect(await pendingRows(page)).toHaveLength(1);
 // Offline: the affordance reports that it is waiting for a connection instead of staying silent.
 await context.setOffline(true);await syncSaved.click();await expect(page.getByText('Waiting for a connection. Saved changes remain on this device.',{exact:true}).filter({visible:true})).toBeVisible();await context.setOffline(false);
 await syncSaved.click();
 // The row cannot be applied (503) so it stays queued and the saved-changes screen opens with its reason.
 await expect(page.getByRole('region',{name:'Saved unsynced changes'})).toBeVisible();await expect.poll(()=>routes.posts.length).toBeGreaterThan(0);expect(routes.statusGets).toBeGreaterThan(0);
 expect(await pendingRows(page)).toHaveLength(1);expect(await page.evaluate(()=>(window as any).signouts??0)).toBe(0);
 await page.evaluate(async({identity,id}:{identity:{issuer:string;uid:string};id:string})=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');await ownerOfflineRepository(identity).remove('pending',id)},{identity,id});
 await account(page);
 const enabled=page.getByRole('button',{name:'Sign out',exact:true}).filter({visible:true});await expect(enabled).toBeVisible();await expect(enabled).toBeEnabled();
 await expect(page.getByRole('button',{name:'Review saved changes',exact:true})).toHaveCount(0);
 await closeAccount(page);
 await signOut(page);
 await expect(page.getByRole('heading',{name:'Sign in to continue',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).signouts)).toBe(1);
});
test('denied session keeps saved changes reviewable and a same-UID re-sign-in syncs them without a reload',async({page})=>{
 const routes=await setup(page);routes.status=403;await seedPending(page);
 await page.evaluate(()=>(window as any).emitUser());
 await expect(page.getByRole('heading',{name:'This account does not have access',exact:true})).toBeVisible();
 await expect.poll(async()=>(await pendingRows(page)).length).toBe(1);
 await account(page);
 const blocked=page.getByRole('button',{name:'Sync 1 pending first',exact:true}).filter({visible:true});await expect(blocked).toBeVisible();await expect(blocked).toBeDisabled();
 await page.getByRole('button',{name:'Review saved changes',exact:true}).filter({visible:true}).click();
 const region=page.getByRole('region',{name:'Saved unsynced changes',exact:true});await expect(region).toBeVisible();await expect(region).toContainText(id);
 await expect(region.getByText('Connect to verify this account before accessing saved records.',{exact:true})).toBeVisible();
 await expect(region.getByRole('button',{name:'Remove saved change',exact:true})).toHaveCount(0);
 // Membership is restored and the same UID signs in again: the saved request must sync with the fresh repository.
 routes.status=200;routes.applied=true;
 await page.getByRole('button',{name:'Continue with Google',exact:true}).click();
 await expect.poll(()=>routes.posts.length,{timeout:15000}).toBe(1);
 await expect.poll(async()=>(await pendingRows(page)).length).toBe(0);
 await account(page);await expect(page.getByRole('button',{name:'Sign out',exact:true}).filter({visible:true})).toBeEnabled();
});
test('sign-out fails closed when the pending list cannot be read',async({page})=>{
 await setup(page);
 await page.evaluate(()=>(window as any).emitUser());
 await account(page);await expect(page.getByRole('button',{name:'Sign out',exact:true}).filter({visible:true})).toBeEnabled();await closeAccount(page);
 await page.evaluate(()=>{IDBObjectStore.prototype.getAll=function(){throw new DOMException('synthetic storage failure','InvalidStateError')}});
 await signOut(page);
 await expect(page.getByRole('heading',{name:'Sign-out could not be completed',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).signouts??0)).toBe(0);
});
