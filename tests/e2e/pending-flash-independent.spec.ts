import {test,expect,type Page} from '@playwright/test';
import {chooseLanguage,routeSyntheticPreferences} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
// Owner report (PROD R064, iPhone): an ordinary online language change must not flash the
// "Waiting to sync" badge, the "Saved on this device. Waiting to sync." message or the
// "1 saved change not synced yet" sign-out note during its sub-second first send. A failed send
// still surfaces all three.
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=5500+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-flash-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(60000);
const auth=`let listener;export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function getAuth(){return {}};export async function setPersistence(){};const user={uid:'synthetic-flash',getIdToken:async()=>'synthetic'};export function onAuthStateChanged(a,fn){listener=fn;window.emitUser=()=>fn(user);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener(user)};export async function signOut(){listener(null)};`;
const flashPattern=/\d+ saved changes? not synced yet|ยังมีรายการที่บันทึกไว้ \d+ รายการที่ยังไม่ซิงค์|Saved on this device\. Waiting to sync\.|บันทึกบนอุปกรณ์แล้ว รอซิงค์/;
async function setup(page:Page){
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,source:'dev',items:[],nextCursor:null,asOf:'2026-10-15T05:00:00Z'})}));
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',r=>{const path=new URL(r.request().url()).pathname;if(path.startsWith('/api/operations/'))return r.fulfill({contentType:'application/json',body:'{"ok":true,"kind":"unresolved","safeToUseNewRequestId":false}'});if(path==='/api/dashboard')return r.fulfill({contentType:'application/json',body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})});return r.fulfill({contentType:'application/json',body:'{"ok":true,"items":[],"nextCursor":null}'})});
 const writes=await routeSyntheticPreferences(page);
 await page.goto(base);await page.evaluate(()=>(window as any).emitUser());await expect(page.locator('.live-body')).toBeVisible();
 // Record every moment any pending affordance appears anywhere in the DOM, visible or not.
 await page.evaluate(pattern=>{const w=window as any;w.__flashes=[];const regex=new RegExp(pattern);const scan=()=>{if(document.querySelector('.waiting-sync-badge'))w.__flashes.push('badge');for(const el of document.querySelectorAll('button,p,[role=status]')){const text=(el.getAttribute('aria-label')??'')+' '+(el.textContent??'');if(regex.test(text)){w.__flashes.push(text.trim().slice(0,60));break}}};new MutationObserver(scan).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});scan()},flashPattern.source);
 return writes;
}
const flashes=(page:Page)=>page.evaluate(()=>[...new Set((window as any).__flashes as string[])]);
async function drawer(page:Page){if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click()}
test('an ordinary online language change never shows the pending badge, waiting message or blocked sign-out label',async({page})=>{
 const writes=await setup(page);
 await chooseLanguage(page,'ไทย');await expect.poll(()=>writes.length).toBe(1);
 await page.waitForTimeout(2600);
 expect(await flashes(page)).toEqual([]);expect(await page.evaluate(async()=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');return (await ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-flash'}).list('pending')).length})).toBe(0);
 await drawer(page);await expect(page.getByRole('button',{name:/^(ออกจากระบบ|Sign out)$/}).filter({visible:true})).toBeEnabled();await expect(page.locator('.waiting-sync-badge')).toHaveCount(0);
});
test('a failed first send does surface the badge, the waiting message and the blocked sign-out label',async({page})=>{
 await setup(page);
 await page.route('https://mw-credit-app-command-dev-test.run.app/api/operations',r=>r.request().method()==='POST'?r.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"code":"command_unavailable"}'}):r.fallback());
 await chooseLanguage(page,'ไทย');
 await drawer(page);
 await expect(page.locator('.waiting-sync-badge').filter({visible:true})).toHaveText('1');
 await expect(page.getByRole('button',{name:/^(Sign out|ออกจากระบบ)$/}).filter({visible:true})).toBeDisabled();await expect(page.getByText(/^(1 saved change not synced yet\. Sync before signing out\.|ยังมีรายการที่บันทึกไว้ 1 รายการที่ยังไม่ซิงค์ กรุณาซิงค์ก่อนออกจากระบบ)$/).filter({visible:true})).toBeVisible();
 await expect.poll(async()=>(await flashes(page)).some(entry=>/Saved on this device|บันทึกบนอุปกรณ์แล้ว/.test(entry))).toBe(true);
});
