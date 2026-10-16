import {test,expect} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
// APP-OFFLINE-01 in the live shell: a 401 from the read API expires the session and purges caches, but unsynced pending rows survive for the same UID.
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=5300+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-expired-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());
const auth=`let listener;export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function getAuth(){return {}};export async function setPersistence(){};const user={uid:'synthetic',getIdToken:async()=>'synthetic'};export function onAuthStateChanged(a,fn){listener=fn;window.emitUser=()=>fn(user);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener(user)};export async function signOut(){window.signouts=(window.signouts||0)+1;listener(null)};`;
const identity={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic'};
test('expired session keeps unsynced pending rows while clearing snapshots and the lease',async({page})=>{
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>r.fulfill({status:401,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":false,"code":"session_invalid"}'}));
 await page.goto(base);
 const seeded=await page.evaluate(async(identity:{issuer:string;uid:string})=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository(identity);await repo.authorize();const id='33333333-3333-4333-8333-333333333333';await repo.savePending(id,{domain:'borrower',command:{requestId:id,operation:'borrower.update',targetId:'synthetic-target',expectedVersion:'a'.repeat(64),predecessorRequestId:null,receiptId:null,inputs:{note:'unsynced'}}});await repo.saveSnapshot('synthetic-snapshot',{charges:[]});return {pending:(await repo.list('pending')).length,authorized:await repo.authorized()}},identity);
 expect(seeded).toEqual({pending:1,authorized:true});
 await page.evaluate(()=>(window as any).emitUser());
 await expect(page.getByRole('heading',{name:'Please sign in again'})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).signouts)).toBe(1);
 const after=await page.evaluate(async(identity:{issuer:string;uid:string})=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository(identity);const rows=await repo.list('pending');return {pending:rows.length,note:rows[0]?.value?.command?.inputs?.note,state:rows[0]?.sync?.state,authorized:await repo.authorized(),snapshot:await repo.snapshot('synthetic-snapshot')}},identity);
 expect(after).toEqual({pending:1,note:'unsynced',state:'queued',authorized:false,snapshot:null});
});
