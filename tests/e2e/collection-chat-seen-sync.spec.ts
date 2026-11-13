import {chooseLanguagePreservingForm,routeSyntheticPreferences} from './live-controls';
import {test,expect,type BrowserContext,type Page,type Route} from './fixtures/test';
import {spawn,type ChildProcess} from 'node:child_process';
// R149: the "new group chat summary" list mark agrees across one user's devices. Two browser contexts (two devices) sign
// in as the same mocked user against one shared mocked server: the read API answers the list with the user's stored
// chatSeenAt, the command service takes POST /api/collection/{id}/chat-seen. Invented text only; the device clock is fixed.
let server:ChildProcess;let base:string;let serverLog='';
test.beforeAll(async({},info)=>{
 const port=5700+info.workerIndex;base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-${port}-${Date.now()}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});
 server.stdout?.on('data',data=>{serverLog+=String(data)});server.stderr?.on('data',data=>{serverLog+=String(data)});
 await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200);
});
test.afterAll(()=>server?.kill());test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)console.log(serverLog)});
const READ='https://mw-credit-app-read-dev-test.run.app',COMMAND='https://mw-credit-app-command-dev-test.run.app';
const NOW='2026-11-12T08:00:00Z',first='2026-11-12T06:10:00.000Z',second='2026-11-12T07:40:00.000Z';
const authMock=`let listener;const user={uid:'chat-seen-sync-user',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener(user)};export async function signOut(){listener(null)};`;
const envelope={ok:true,source:'dev',businessDate:'2026-11-12',timezone:'Asia/Bangkok',asOf:NOW};
const names:Record<string,string>={'seen-a':'Synthetic borrower A','seen-d':'Synthetic borrower D','seen-c':'No summary - Synthetic C'};
/** The shared server: each borrower's summary time, the one user's stored seen values and every accepted or attempted POST. */
function sharedServer(){
 const state={summaryAt:{'seen-a':first,'seen-d':first} as Record<string,string>,seen:{} as Record<string,string>,posts:[] as {device:string;id:string;body:unknown;authorization:string|undefined;contentType:string|undefined}[],attempts:[] as string[],down:new Set<string>()};
 const json=(r:Route,body:unknown,status=200)=>r.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)}).catch(()=>{});
 const items=()=>Object.keys(names).map(id=>({id,displayName:names[id],status:'not_paid',overdueDays:null,sinceLastPaymentDays:null,neverPaid:null,amountDue:'1200',amountCollected:'0',amountRemaining:'1200',prepaidToday:'0',prepaidOnly:false,chatSummaryAt:state.summaryAt[id]??null,chatSeenAt:state.seen[id]??null}));
 const summary=(id:string)=>state.summaryAt[id]?{headline:{th:'สรุปสังเคราะห์ของ '+id,en:'Synthetic summary for '+id+' at '+state.summaryAt[id]},points:[{speaker:{role:'partner'},th:'ตกลง',en:'Agreed.'}],lastSpeaker:{role:'partner'},lastMessageAt:state.summaryAt[id],generatedAt:state.summaryAt[id],messageCount:3,shared:false}:null;
 async function attach(context:BrowserContext,device:string){
  await context.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await context.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:authMock}));
  await context.route(READ+'/**',async r=>{const u=new URL(r.request().url());
   if(u.pathname==='/api/collection')return json(r,{...envelope,items:items(),nextCursor:null});
   const charges=/^\/api\/collection\/([^/]+)\/charges$/.exec(u.pathname);
   if(charges){const id=decodeURIComponent(charges[1]);return json(r,{...envelope,borrower:items().find(row=>row.id===id),items:[{id:'charge-'+id,loanId:'loan-'+id,loanDisplayKey:'Synthetic loan',chargeDate:'2026-11-12',paymentStatus:'รอชำระ',paymentDate:null,amountRemaining:'1200',totalPaid:'0',receivedToday:'0'}],nextCursor:null,groupChat:summary(id)});}
   return json(r,{...envelope,horizonEnd:'2027-02-12',reviewRequired:false,items:[]});});
  await context.route(COMMAND+'/**',async r=>{const request=r.request(),u=new URL(request.url()),record=/^\/api\/borrower-records\/([^/]+)$/.exec(u.pathname),seen=/^\/api\/collection\/([^/]+)\/chat-seen$/.exec(u.pathname);
   if(request.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}}).catch(()=>{});
   if(seen){
    const id=decodeURIComponent(seen[1]);state.attempts.push(device+':'+id);
    // This device has no connection to the service: the request never arrives.
    if(state.down.has(device))return r.abort('internetdisconnected').catch(()=>{});
    if(request.method()!=='POST')return json(r,{ok:false,code:'method_not_allowed'},405);
    const body=request.postDataJSON(),headers=request.headers();state.posts.push({device,id,body,authorization:headers.authorization,contentType:headers['content-type']});
    // As pwa_mark_group_chat_seen_v1: no summary is ignored; the value is clamped to the summary and only moves forward.
    const last=state.summaryAt[id];if(!last)return json(r,{ok:true,kind:'ignored',seenAt:null});
    const target=Date.parse(body.lastMessageAt)<Date.parse(last)?body.lastMessageAt:last,moved=!state.seen[id]||Date.parse(state.seen[id])<Date.parse(target);
    if(moved)state.seen[id]=target;return json(r,{ok:true,kind:moved?'stored':'unchanged',seenAt:state.seen[id]});
   }
   if(record){const id=decodeURIComponent(record[1]);return json(r,{...envelope,item:{id,version:'v-'+id,name:id,description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:false,referrerId:null,preferredReceivingAccountId:null,note:null}});}
   return json(r,{...envelope,items:[],nextCursor:null,months:[],item:null});});
  await routeSyntheticPreferences(context);await context.route(COMMAND+'/api/dashboard',r=>json(r,{collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]}));
 }
 return {state,attach};
}
const tile=(page:Page,id:string)=>page.locator(`.collection-tile-main[data-record-id="${id}"]`);
const mark=(page:Page,id:string)=>tile(page,id).locator('.collection-chat-mark');
const card=(page:Page)=>page.locator('.collection-chat-summary');
/** Sign in and open Collection (also after a reload: the mocked session starts signed out). */
async function enter(page:Page){
 await page.getByRole('button',{name:/Google/}).click();await chooseLanguagePreservingForm(page,'EN');await page.getByRole('button',{name:'Collection',exact:true}).click();
 await expect(page.locator('.collection-compact-tile')).toHaveCount(3);
}
async function start(page:Page,desktop:boolean){
 if(desktop)await page.setViewportSize({width:1440,height:900});
 await page.clock.setFixedTime(new Date(NOW));await page.goto(base);await enter(page);
}
const reopen=async(page:Page)=>{await page.reload();await enter(page)};
/** Open the borrower's card and wait for this version of the summary (the card rendering it is what counts as seen; a
 * saved earlier version may show first), then return to the list on a phone. */
async function show(page:Page,id:string,desktop:boolean,version:string){
 await tile(page,id).click();await expect(card(page).locator('.collection-chat-headline')).toHaveText('Synthetic summary for '+id+' at '+version);
 if(!desktop)await page.getByRole('button',{name:/^(Back to Collection|กลับงานติดตาม)$/}).click();
 await expect(tile(page,id)).toBeVisible();
}
const unsent=(page:Page)=>page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('mw-credit.chat-seen-unsent:')).map(key=>localStorage.getItem(key)));

test('one user, two devices: seen on one clears the mark on the other; a newer summary relights both; an unsent value goes once the connection is back; blocked storage follows the server',async({page,browser,viewport,userAgent,deviceScaleFactor,isMobile,hasTouch,timezoneId,browserName},info)=>{
 test.setTimeout(120000);
 const desktop=info.project.name.startsWith('desktop'),shared=sharedServer(),{state}=shared;
 const options={viewport,userAgent,deviceScaleFactor,hasTouch,timezoneId,...(browserName==='firefox'?{}:{isMobile})};
 const errors:string[]=[];
 const device=async(name:string,context:BrowserContext,existing?:Page)=>{await shared.attach(context,name);const opened=existing??await context.newPage();opened.on('pageerror',error=>errors.push(name+': '+error.message));return opened};
 const contextB=await browser.newContext(options),contextC=await browser.newContext(options);
 try{
  // Device A: the mark is there; opening the card sends one request and clears it.
  const a=await device('A',page.context(),page);await start(a,desktop);
  await expect(mark(a,'seen-a')).toHaveCount(1);await expect(mark(a,'seen-d')).toHaveCount(1);await expect(mark(a,'seen-c')).toHaveCount(0);
  await show(a,'seen-a',desktop,first);
  await expect(mark(a,'seen-a')).toHaveCount(0);await expect(mark(a,'seen-d')).toHaveCount(1);
  await expect.poll(()=>state.posts.length).toBe(1);
  expect(state.posts[0]).toEqual({device:'A',id:'seen-a',body:{lastMessageAt:first},authorization:'Bearer synthetic-bearer',contentType:'application/json'});
  expect(state.seen).toEqual({'seen-a':first});expect(await unsent(a)).toEqual([]);
  // Opening the same card again sends nothing more.
  await show(a,'seen-a',desktop,first);await a.waitForTimeout(300);expect(state.attempts).toEqual(['A:seen-a']);

  // Device B, same user, empty storage: no mark for the summary seen on A; opening that card sends nothing (the server has it).
  const b=await device('B',contextB);await start(b,desktop);
  await expect(mark(b,'seen-a')).toHaveCount(0);await expect(mark(b,'seen-d')).toHaveCount(1);
  expect(await b.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('mw-credit.chat-seen')))).toEqual([]);
  await show(b,'seen-a',desktop,first);await b.waitForTimeout(300);expect(state.attempts).toEqual(['A:seen-a']);

  // A newer summary relights the mark on both devices.
  state.summaryAt['seen-a']=second;
  await reopen(a);await reopen(b);
  await expect(mark(a,'seen-a')).toHaveCount(1);await expect(mark(b,'seen-a')).toHaveCount(1);

  // Device A loses its connection to the service: the mark still clears there at once, the value waits, B keeps its mark.
  state.down.add('A');
  await show(a,'seen-a',desktop,second);
  await expect(mark(a,'seen-a')).toHaveCount(0);
  await expect.poll(()=>state.attempts.filter(entry=>entry==='A:seen-a').length).toBe(2);
  expect(state.posts.length).toBe(1);expect(state.seen).toEqual({'seen-a':first});
  await expect.poll(()=>unsent(a)).toEqual([JSON.stringify({'seen-a':second})]);
  await reopen(b);await expect(mark(b,'seen-a')).toHaveCount(1);
  // Back online: the waiting value is sent exactly once, and B's mark clears on its next read.
  state.down.delete('A');
  await a.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect.poll(()=>state.posts.length).toBe(2);
  expect(state.posts[1]).toEqual({device:'A',id:'seen-a',body:{lastMessageAt:second},authorization:'Bearer synthetic-bearer',contentType:'application/json'});
  await expect.poll(()=>unsent(a)).toEqual([]);
  await a.evaluate(()=>{window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'))});await a.waitForTimeout(300);
  expect(state.posts.length).toBe(2);expect(state.seen).toEqual({'seen-a':second});
  await reopen(b);await expect(mark(b,'seen-a')).toHaveCount(0);await expect(mark(b,'seen-d')).toHaveCount(1);
  // A reloaded with the value sent: still no mark, nothing sent again.
  await reopen(a);await expect(mark(a,'seen-a')).toHaveCount(0);await a.waitForTimeout(300);expect(state.posts.length).toBe(2);

  // Device C cannot use its storage for the seen values: the server value alone decides. No mark for what the user
  // saw elsewhere, a mark for what the user has not seen; opening that card clears it at once and for the next visit.
  await contextC.addInitScript(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem,blocked=(key:string)=>key.startsWith('mw-credit.chat-seen');
   Storage.prototype.getItem=function(key:string){if(blocked(key))throw new DOMException('blocked','SecurityError');return get.call(this,key)};
   Storage.prototype.setItem=function(key:string,value:string){if(blocked(key))throw new DOMException('blocked','SecurityError');return set.call(this,key,value)};
   Storage.prototype.removeItem=function(key:string){if(blocked(key))throw new DOMException('blocked','SecurityError');return remove.call(this,key)}});
  const c=await device('C',contextC);await start(c,desktop);
  await expect(mark(c,'seen-a')).toHaveCount(0);await expect(mark(c,'seen-d')).toHaveCount(1);
  await show(c,'seen-d',desktop,first);
  await expect(mark(c,'seen-d')).toHaveCount(0);
  await expect.poll(()=>state.posts.length).toBe(3);expect(state.posts[2]).toMatchObject({device:'C',id:'seen-d',body:{lastMessageAt:first}});
  await reopen(c);await expect(mark(c,'seen-d')).toHaveCount(0);await expect(mark(c,'seen-a')).toHaveCount(0);
  // And on the first device, through the server value (its own storage never saw that card).
  await reopen(a);await expect(mark(a,'seen-d')).toHaveCount(0);
  expect(state.seen).toEqual({'seen-a':second,'seen-d':first});expect(state.posts.map(post=>post.device+':'+post.id)).toEqual(['A:seen-a','A:seen-a','C:seen-d']);
  expect(errors).toEqual([]);
 }finally{await contextB.close();await contextC.close()}
});
