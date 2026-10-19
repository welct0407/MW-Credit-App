import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {encodeDeltaChunk} from '../../services/api/offline-dataset-delta.mjs';
const dashboard={collection:{notPaid:0,partiallyPaid:0,overdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]};
// UX-FULL-01..06 (owner, 19 October 2026; moved the same day): "Full sync" is the last section of the Saved changes page
// (opened by "All synced" / "Waiting to sync"), shows with or without saved changes, is disabled offline with the reason as
// its title, confirms once, sends saved changes first and then walks every domain from the start (no source version)
// while the header progress stays visible.
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=5650+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-full-sync-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(40000);
const auth=`let listener;export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function getAuth(){return {}};export async function setPersistence(){};const user={uid:'synthetic',getIdToken:async()=>'synthetic'};export function onAuthStateChanged(a,fn){listener=fn;window.emitUser=()=>fn(user);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener(user)};export async function signOut(){listener(null)};`;
const identity={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic'},id='55555555-5555-4555-8555-555555555555';
const seedPending=(page:Page)=>page.evaluate(async({identity,id}:{identity:{issuer:string;uid:string};id:string})=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository(identity);await repo.authorize();await repo.savePending(id,{domain:'borrower',command:{requestId:id,operation:'borrower.update',targetId:'synthetic-target',expectedVersion:'a'.repeat(64),predecessorRequestId:null,receiptId:null,inputs:{note:'unsynced'}}})},{identity,id});
async function account(page:Page){if(page.viewportSize()!.width<=1050&&await page.locator('dialog[open]').count()===0)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click()}
test('Full sync on the Saved changes page confirms, sends saved changes first, then walks every domain without a source version; offline it is disabled',async({page,context})=>{
 const log:string[]=[];let applied=false,hold=false,release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,source:'dev',items:[],nextCursor:null,asOf:'2026-10-15T05:00:00Z'})}));
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{const url=new URL(r.request().url()),path=url.pathname,method=r.request().method();
  // The saved change stays queued (503) until Full sync is tapped, so its sending is observed after the tap.
  if(path==='/api/operations'&&method==='POST'){log.push('saved-change');return applied?r.fulfill({contentType:'application/json',body:'{"ok":true,"kind":"recorded","originalOutcome":{"status":"applied","code":null}}'}):r.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"code":"command_unavailable"}'})}
  if(path==='/api/operations/'+id)return r.fulfill({contentType:'application/json',body:'{"ok":true,"kind":"unresolved","safeToUseNewRequestId":false}'});
  if(path.endsWith('offline-dataset')){const body=method==='POST'?r.request().postDataJSON():{};log.push('dataset:'+(url.searchParams.get('domain')??'notifications')+':'+(body.sourceVersion===null||body.sourceVersion===undefined?'walk':'check'));if(hold)await held;const domain=url.searchParams.get('domain')??'notifications',version='a'.repeat(64);
   const chunk={schemaVersion:2,domain,generation:'g-'+domain,startedAt:'2026-10-15T05:00:00.000Z',asOf:'2026-10-15T05:00:00.000Z',businessDate:'2026-10-15',sourceVersion:version,patches:domain==='records'?[{key:'dashboard',mode:'replace',value:dashboard}]:[],complete:true,nextCursor:null,progress:{completed:1,total:1}};
   if(method!=='POST')return r.fulfill({json:chunk});
   if(body.sourceVersion===version&&!body.need?.length)return r.fulfill({json:{...chunk,schemaVersion:3,patches:[],values:{},unchanged:true}});
   return r.fulfill({json:encodeDeltaChunk(chunk,body.need??[])})}
  if(path==='/api/preferences')return r.fulfill({contentType:'application/json',body:'{"ok":true,"item":{"language":null}}'});
  if(path==='/api/dashboard')return r.fulfill({json:dashboard});
  return r.fulfill({contentType:'application/json',body:'{"ok":true,"items":[],"nextCursor":null}'})});
 await page.goto(base);await seedPending(page);await page.evaluate(()=>(window as any).emitUser());
 // The shell settles after sign-in (a status change closes the mobile drawer): retry until the page shows.
 const savedPage=page.getByRole('region',{name:'Saved unsynced changes'}),full=savedPage.getByRole('button',{name:'Full sync',exact:true});
 const open=async()=>expect(async()=>{if(!await savedPage.isVisible()){await account(page);await page.locator('.waiting-sync-button').filter({visible:true}).first().click({timeout:1000})}await expect(full).toBeVisible({timeout:1000})}).toPass({timeout:15000});
 await open();await expect(full).toBeEnabled();
 // UX-FULL-01: its own section at the bottom of the page, after the saved changes and their Retry sync; not in the side menu.
 expect(await savedPage.locator(':scope > *').evaluateAll(es=>es.at(-1)!.className)).toBe('full-sync-section');
 await expect(page.locator('.live-account-signout-group').getByRole('button',{name:'Full sync',exact:true})).toHaveCount(0);
 // Offline: visible, disabled, the reason as its title.
 await context.setOffline(true);
 await expect(full).toBeDisabled();await expect(full).toHaveAttribute('title','Full sync needs a connection');
 // Back online the app retries the saved change and checks the domains; tap once that has settled.
 log.length=0;await context.setOffline(false);await expect(full).toBeEnabled();
 await expect.poll(()=>log.includes('saved-change'),{timeout:10000}).toBe(true);
 await expect(async()=>{const before=log.length;await page.waitForTimeout(700);expect(log.length).toBe(before)}).toPass({timeout:10000});await expect(full).toBeEnabled();
 // UX-FULL-02/06: one confirmation; saved changes go first, then every domain walks (no source version).
 const dialogs:string[]=[];page.on('dialog',dialog=>{dialogs.push(dialog.message());void dialog.accept()});
 log.length=0;hold=true;applied=true;await full.click();
 await expect.poll(()=>dialogs).toEqual(['Re-download all data? Saved data stays usable; this takes about 20 seconds.']);
 await expect.poll(()=>log.filter(entry=>entry.startsWith('dataset:')).length).toBeGreaterThanOrEqual(1);
 expect(log[0]).toBe('saved-change');expect(log.filter(entry=>entry.startsWith('dataset:')).every(entry=>entry.endsWith(':walk'))).toBe(true);
 // UX-FULL-03: while it runs the button is disabled and busy, the page stays open and the header progress shows.
 await expect(full).toBeDisabled();await expect(full).toHaveAttribute('aria-busy','true');
 await expect(page.locator('.header-load-progress').filter({visible:true})).toHaveCount(1);await expect(savedPage).toBeVisible();
 hold=false;release();
 // The completion text; with nothing saved any more the section still shows and Full sync is ready again.
 await expect(page.locator('.sync-announcement')).toContainText('Full sync complete',{timeout:15000});
 await expect(savedPage.getByText('No unsynced changes.')).toBeVisible();await expect(full).toBeEnabled();await expect(full).not.toHaveAttribute('aria-busy');
});
