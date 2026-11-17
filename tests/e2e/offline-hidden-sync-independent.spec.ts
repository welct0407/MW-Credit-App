import {test,expect,type Page,emitSyntheticUser} from './fixtures/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {encodeDeltaChunk} from '../../services/api/offline-dataset-delta.mjs';
// R171 (owner, 17 November 2026: "keep syncing as if it's focused, even when hidden completely in desktop … the desktop app
// (and desktop web browser) will always show the latest data whenever i open it"): on a computer the offline dataset keeps
// syncing while the page is hidden (UX-HSYNC-01/02: quietly, no progress bar, no announcement); a phone still pauses.
const dashboard={collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]};
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=5690+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-hidden-sync-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(60000);
const auth=`let listener;export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function getAuth(){return {}};export async function setPersistence(){};const user={uid:'synthetic',getIdToken:async()=>'synthetic'};export function onAuthStateChanged(a,fn){listener=fn;window.emitUser=()=>fn(user);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener(user)};export async function signOut(){listener(null)};`;
type Asked={domain:string;cursor:string|null;at:number};
/** A synthetic command service: every domain is one complete chunk; once `server.changed` is set, records has new data and
 * walks in three chunks. Each dataset request is logged with its domain and cursor. */
async function serve(page:Page){
 const state={changed:false,asked:[] as Asked[]};
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,source:'dev',items:[],nextCursor:null,asOf:'2026-10-15T05:00:00Z'})}));
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{const url=new URL(r.request().url()),path=url.pathname,method=r.request().method();
  if(path.endsWith('offline-dataset')){
   const body=method==='POST'?r.request().postDataJSON():{},domain=url.searchParams.get('domain')??'notifications',cursor=body.cursor??url.searchParams.get('cursor');
   state.asked.push({domain,cursor:cursor??null,at:Date.now()});
   const version=(state.changed&&domain==='records'?'b':'a').repeat(64),walk=state.changed&&domain==='records',step=cursor?Number(cursor):0,last=!walk||step===2;
   const chunk={schemaVersion:2,domain,generation:'g-'+domain+(walk?'-2':''),startedAt:'2026-10-15T05:00:00.000Z',asOf:'2026-10-15T05:00:00.000Z',businessDate:'2026-10-15',sourceVersion:version,patches:domain==='records'&&step===0?[{key:'dashboard',mode:'replace',value:dashboard}]:[],complete:last,nextCursor:last?null:String(step+1),progress:{completed:step+1,total:walk?3:1}};
   if(method!=='POST')return r.fulfill({json:chunk});
   if(body.sourceVersion===version&&!body.need?.length)return r.fulfill({json:{...chunk,schemaVersion:3,patches:[],values:{},unchanged:true}});
   return r.fulfill({json:encodeDeltaChunk(chunk,body.need??[])})}
  if(path==='/api/preferences')return r.fulfill({contentType:'application/json',body:'{"ok":true,"item":{"language":null}}'});
  if(path==='/api/dashboard')return r.fulfill({json:dashboard});
  return r.fulfill({contentType:'application/json',body:'{"ok":true,"items":[],"nextCursor":null}'})});
 return state;
}
/** The page as hidden or visible again: document.visibilityState, document.hidden and the visibilitychange event. */
const visibility=(page:Page,hidden:boolean)=>page.evaluate(value=>{for(const [key,read] of [['visibilityState',value?'hidden':'visible'],['hidden',value]] as const)Object.defineProperty(document,key,{configurable:true,get:()=>read});document.dispatchEvent(new Event('visibilitychange'));if(!value)window.dispatchEvent(new Event('focus'))},hidden);
const status=(page:Page)=>page.locator('.live-sync-status').filter({visible:true});
async function signedIn(page:Page){
 await page.clock.install();
 const server=await serve(page);await page.goto(base);await emitSyntheticUser(page);
 // The first download has finished and the data is current.
 await expect(status(page)).toContainText(/^Updated \d\d:\d\d$/,{timeout:20000});
 await expect(async()=>{const before=server.asked.length;await page.waitForTimeout(500);expect(server.asked.length).toBe(before)}).toPass({timeout:10000});
 return server;
}

test('a hidden computer keeps syncing: the poll walks the changed records while hidden; the return asks nothing and shows no progress',async({page},info)=>{
 test.skip(info.project.name!=='desktop-chromium','computer user agent only');
 const server=await signedIn(page);
 // UX-HSYNC-01: every text the live region receives from here on (it never re-mounts); a quiet sync writes none.
 await page.evaluate(()=>{const region=document.querySelector('.sync-announcement')!,said:string[]=[];(window as any).said=said;new MutationObserver(()=>{if(region.textContent)said.push(region.textContent)}).observe(region,{childList:true,characterData:true,subtree:true})});
 await visibility(page,true);server.changed=true;const hiddenFrom=server.asked.length;
 // The 30-second poll fires while the page is hidden and the three-chunk walk runs to its end.
 await page.clock.runFor(31000);
 await expect.poll(()=>server.asked.slice(hiddenFrom).filter(asked=>asked.domain==='records').map(asked=>asked.cursor),{timeout:15000}).toEqual([null,'1','2']);
 await expect.poll(()=>server.asked.slice(hiddenFrom).some(asked=>asked.domain==='notifications')).toBe(true);
 await expect(async()=>{const before=server.asked.length;await page.waitForTimeout(500);expect(server.asked.length).toBe(before)}).toPass({timeout:10000});
 // Back again within 30 s of that check: no new cycle, no request, no progress bar; the status reads ready.
 const returnedFrom=server.asked.length;await visibility(page,false);await page.waitForTimeout(1500);
 expect(server.asked.slice(returnedFrom)).toEqual([]);
 await expect(page.locator('.header-load-progress').filter({visible:true})).toHaveCount(0);
 await expect(status(page)).toContainText(/^Updated \d\d:\d\d$/);
 expect(await page.evaluate(()=>(window as any).said)).toEqual([]);
});

test.describe('on a phone',()=>{
 test.use({userAgent:IPHONE});
 test('a hidden phone asks nothing until it is visible again',async({page})=>{
  const server=await signedIn(page);
  await visibility(page,true);server.changed=true;const hiddenFrom=server.asked.length;
  await page.clock.runFor(31000);await page.waitForTimeout(1500);
  expect(server.asked.slice(hiddenFrom)).toEqual([]);
  // A return checks at once (phones always check on return) and picks the change up.
  await visibility(page,false);
  await expect.poll(()=>server.asked.slice(hiddenFrom).filter(asked=>asked.domain==='records').map(asked=>asked.cursor),{timeout:15000}).toEqual([null,'1','2']);
 });
});
