import {test,expect,type Page} from '@playwright/test';
import {signOut} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
// APP-OFFLINE-02: while unsynced saved requests exist the Sign out button is disabled and reads "Sync N pending first", with a Sync now affordance; logout() re-checks.
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=5400+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-signout-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(40000);
const auth=`let listener;export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function getAuth(){return {}};export async function setPersistence(){};const user={uid:'synthetic',getIdToken:async()=>'synthetic'};export function onAuthStateChanged(a,fn){listener=fn;window.emitUser=()=>fn(user);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener(user)};export async function signOut(){window.signouts=(window.signouts||0)+1;listener(null)};`;
const identity={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic'},id='44444444-4444-4444-8444-444444444444';
const pendingRows=(page:Page)=>page.evaluate(async(identity:{issuer:string;uid:string})=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');return ownerOfflineRepository(identity).list('pending')},identity);
async function account(page:Page){if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click()}
async function closeAccount(page:Page){if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:/^(Close menu|ปิดเมนู)$/}).click()}
test('sign-out is blocked with a sync affordance until the saved request is gone',async({page})=>{
 const posts:string[]=[];let statusGets=0;
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,source:'dev',items:[],nextCursor:null,asOf:'2026-10-15T05:00:00Z'})}));
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',r=>{const path=new URL(r.request().url()).pathname,method=r.request().method();
  if(path==='/api/operations'&&method==='POST'){posts.push(path);return r.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"code":"command_unavailable"}'})}
  if(path==='/api/operations/'+id){statusGets++;return r.fulfill({contentType:'application/json',body:'{"ok":true,"kind":"unresolved","safeToUseNewRequestId":false}'})}
  if(path==='/api/preferences')return r.fulfill({contentType:'application/json',body:'{"ok":true,"item":{"language":null}}'});
  if(path==='/api/dashboard')return r.fulfill({contentType:'application/json',body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})});
  return r.fulfill({contentType:'application/json',body:'{"ok":true,"items":[],"nextCursor":null}'})});
 await page.goto(base);
 await page.evaluate(async({identity,id}:{identity:{issuer:string;uid:string};id:string})=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository(identity);await repo.authorize();await repo.savePending(id,{domain:'borrower',command:{requestId:id,operation:'borrower.update',targetId:'synthetic-target',expectedVersion:'a'.repeat(64),predecessorRequestId:null,receiptId:null,inputs:{note:'unsynced'}}})},{identity,id});
 await page.evaluate(()=>(window as any).emitUser());
 await account(page);
 const blocked=page.getByRole('button',{name:'Sync 1 pending first',exact:true}).filter({visible:true});
 await expect(blocked).toBeVisible();await expect(blocked).toBeDisabled();await expect(blocked).toHaveAttribute('aria-disabled','true');
 await expect(page.getByRole('button',{name:'Sign out',exact:true}).filter({visible:true})).toHaveCount(0);
 const syncNow=page.getByRole('button',{name:'Sync now',exact:true}).filter({visible:true});await expect(syncNow).toBeVisible();
 await blocked.click({force:true}).catch(()=>{});expect(await page.evaluate(()=>(window as any).signouts??0)).toBe(0);expect(await pendingRows(page)).toHaveLength(1);
 await syncNow.click();
 // The row cannot be applied (503) so it stays queued and the saved-changes screen opens with its reason.
 await expect(page.getByRole('region',{name:'Saved unsynced changes'})).toBeVisible();await expect.poll(()=>posts.length).toBeGreaterThan(0);expect(statusGets).toBeGreaterThan(0);
 expect(await pendingRows(page)).toHaveLength(1);expect(await page.evaluate(()=>(window as any).signouts??0)).toBe(0);
 await page.evaluate(async({identity,id}:{identity:{issuer:string;uid:string};id:string})=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');await ownerOfflineRepository(identity).remove('pending',id)},{identity,id});
 await account(page);
 const enabled=page.getByRole('button',{name:'Sign out',exact:true}).filter({visible:true});await expect(enabled).toBeVisible();await expect(enabled).toBeEnabled();
 await closeAccount(page);
 await signOut(page);
 await expect(page.getByRole('heading',{name:'Sign in to continue',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).signouts)).toBe(1);
});
