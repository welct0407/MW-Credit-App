import {test,expect,touchSession,type Page} from './fixtures/test';
// R131 (e): after opening an item from a list and pressing Back, the list is where it was. Part 1 runs the list-return
// contract on a harness (nested panel + window); the rest drives the real pages with synthetic auth and HTTP seams.
// It does not claim live authentication, the durable operation journal or any financial rule.

async function harness(page:Page,query=''){
 await page.route(url=>url.origin==='http://127.0.0.1:4173'&&url.pathname==='/',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style><div id="root"></div><script type="module" src="/tests/e2e/fixtures/list-return-harness.tsx"></script>'}));
 await page.goto('/'+query);await expect(page.locator('.lr-panel')).toBeVisible();
}
const settle=(page:Page)=>page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
/** Scroll the window and the panel, open a row the way a tap does, return where everything was. */
async function openRow(page:Page,id:string,win:number,panel:number){
 const saved=await page.evaluate(([id,win,panel])=>{
  window.scrollTo(0,win as number);const list=document.querySelector('.lr-panel')!;list.scrollTop=panel as number;
  const row=document.querySelector('[data-record-id="'+id+'"]') as HTMLElement;
  const state={scrollY:window.scrollY,panel:list.scrollTop,rowTop:row.getBoundingClientRect().top};row.click();return state;
 },[id,win,panel] as const);
 await expect(page.getByTestId('view')).toHaveText('detail');await settle(page);
 return saved;
}
const where=(page:Page)=>page.evaluate(()=>{const list=document.querySelector('.lr-panel') as HTMLElement|null,row=document.activeElement?.closest('[data-record-id]') as HTMLElement|null;
 return {scrollY:window.scrollY,panel:list?.scrollTop??-1,max:list?list.scrollHeight-list.clientHeight:-1,focus:document.activeElement?.getAttribute('data-record-id')??(document.activeElement===list?'panel':document.activeElement?.tagName),rowTop:row?row.getBoundingClientRect().top:null}});
const near=(value:number,expected:number,slack=2)=>expect(Math.abs(value-expected),value+' vs '+expected).toBeLessThanOrEqual(slack);

for(const query of ['','?strict=1'])test.describe('list-return contract'+(query?' (React StrictMode)':''),()=>{
 test('restores the panel and the window, anchors the row and focuses it',async({page})=>{
  await harness(page,query);const saved=await openRow(page,'r18',150,700);
  await page.getByRole('button',{name:'Back plain',exact:true}).click();
  await expect.poll(async()=>(await where(page)).focus).toBe('r18');
  const after=await where(page);near(after.scrollY,saved.scrollY);near(after.panel,saved.panel);near(after.rowTop!,saved.rowTop,2);
 });
 test('restores when the rows arrive two frames after Back',async({page})=>{
  await harness(page,query);const saved=await openRow(page,'r30',100,1400);
  await page.getByRole('button',{name:'Back late',exact:true}).click();
  await expect.poll(async()=>(await where(page)).focus).toBe('r30');
  const after=await where(page);near(after.scrollY,saved.scrollY);near(after.panel,saved.panel);near(after.rowTop!,saved.rowTop,2);
 });
 test('clamps when the list shrank and falls back to the panel when the row is gone',async({page})=>{
  await harness(page,query);await openRow(page,'r18',150,700);
  await page.getByRole('button',{name:'Back shrunk',exact:true}).click();
  await expect.poll(async()=>(await where(page)).focus).toBe('panel');
  const after=await where(page);expect(after.max).toBeLessThan(700);near(after.panel,Math.max(0,after.max),1);expect(after.panel).toBeGreaterThanOrEqual(0);
  await page.waitForTimeout(700);const settled=await where(page);expect(settled.focus).toBe('panel');near(settled.panel,Math.max(0,settled.max),1);
 });
 test('a removed row only drops focus to the panel; positions still return',async({page})=>{
  await harness(page,query);const saved=await openRow(page,'r18',150,700);
  await page.getByRole('button',{name:'Back removed',exact:true}).click();
  await expect.poll(async()=>(await where(page)).focus).toBe('panel');
  await page.waitForTimeout(600);const after=await where(page);near(after.panel,saved.panel);near(after.scrollY,saved.scrollY);
 });
 test('a reordered row is focused and scrolled into view',async({page})=>{
  await harness(page,query);await openRow(page,'r18',150,700);
  await page.getByRole('button',{name:'Back reordered',exact:true}).click();
  await expect.poll(async()=>(await where(page)).focus).toBe('r18');await page.waitForTimeout(700);
  const box=await page.evaluate(()=>{const row=document.querySelector('[data-record-id="r18"]')!.getBoundingClientRect(),list=document.querySelector('.lr-panel')!.getBoundingClientRect();return {rowTop:row.top,rowBottom:row.bottom,listTop:list.top,listBottom:list.bottom}});
  expect(box.rowTop).toBeGreaterThanOrEqual(box.listTop-1);expect(box.rowBottom).toBeLessThanOrEqual(box.listBottom+1);expect((await where(page)).focus).toBe('r18');
 });
});

test.describe('list-return safety',()=>{
 test('leave() keeps the saved position when scrollTo rejects an options object (older Safari)',async({page})=>{
  await harness(page);
  await page.evaluate(()=>{const original=window.scrollTo.bind(window);(window as any).scrollTo=(a:any,b?:number)=>{if(typeof a==='object')throw new TypeError('options object not supported');return original(a,b as number)}});
  const saved=await openRow(page,'r18',150,700);
  expect((await where(page)).scrollY,'the opened page starts at the top').toBe(0);
  await page.getByRole('button',{name:'Back plain',exact:true}).click();
  await expect.poll(async()=>(await where(page)).focus).toBe('r18');
  const after=await where(page);near(after.scrollY,saved.scrollY);near(after.panel,saved.panel);near(after.rowTop!,saved.rowTop,2);
 });
 test('a press inside main after Back stops the restore; a press outside main does not',async({page})=>{
  await harness(page);await openRow(page,'r30',100,1400);
  await page.getByRole('button',{name:'Back interrupt',exact:true}).click();
  // Back interrupt already sent a wheel; use the late variant for the pointer cases.
  await page.waitForTimeout(700);
  await openRow(page,'r30',100,1400);
  await page.evaluate(()=>{document.querySelector('footer')!.dispatchEvent(new Event('pointerdown',{bubbles:true}))});
  await page.getByRole('button',{name:'Back late',exact:true}).click();
  await page.evaluate(()=>document.querySelector('footer')!.dispatchEvent(new Event('pointerdown',{bubbles:true})));
  await expect.poll(async()=>(await where(page)).focus).toBe('r30');
  await openRow(page,'r30',100,1400);
  await page.getByRole('button',{name:'Back slow',exact:true}).click();
  await page.evaluate(()=>document.querySelector('main')!.dispatchEvent(new Event('pointerdown',{bubbles:true})));
  await page.waitForTimeout(2200);expect((await where(page)).panel).toBeLessThan(5);
 });

 test('a touch or wheel after Back stops the restore for good',async({page})=>{
  await harness(page);await openRow(page,'r30',100,1400);
  await page.getByRole('button',{name:'Back interrupt',exact:true}).click();
  await page.waitForTimeout(800);const after=await where(page);expect(after.panel,'rows arrived after the interrupt; nothing may pull the list back').toBeLessThan(5);near(after.scrollY,0,300);
 });
 test('a row that arrives within 2 s is restored and focused',async({page})=>{
  await harness(page);const saved=await openRow(page,'r30',100,1400);
  await page.getByRole('button',{name:'Back slow',exact:true}).click();
  await expect.poll(async()=>(await where(page)).focus,{timeout:4000}).toBe('r30');
  await page.waitForTimeout(400);const after=await where(page);near(after.panel,saved.panel);near(after.scrollY,saved.scrollY);near(after.rowTop!,saved.rowTop,2);
 });
 test('a row that arrives after the 2 s cap is left alone',async({page})=>{
  await harness(page);await openRow(page,'r30',100,1400);
  await page.getByRole('button',{name:'Back toolate',exact:true}).click();
  await page.waitForTimeout(3300);const after=await where(page);expect(after.panel).toBeLessThan(5);expect(after.focus).not.toBe('r30');
 });
 test('a restore with no row key ends at 500 ms: rows after that are left alone',async({page})=>{
  await harness(page);
  await page.evaluate(()=>{window.scrollTo(0,100);document.querySelector('.lr-panel')!.scrollTop=1400});
  await page.getByRole('button',{name:'Open nokey',exact:true}).click();await expect(page.getByTestId('view')).toHaveText('detail');
  await page.getByRole('button',{name:'Back slow',exact:true}).click();
  await page.waitForTimeout(1800);expect((await where(page)).panel,'no key, rows came at 1.1 s').toBeLessThan(5);
 });
 test('the restore ends once the row is anchored: a later user scroll is not undone',async({page})=>{
  await harness(page);await openRow(page,'r30',100,1400);
  await page.getByRole('button',{name:'Back slow',exact:true}).click();
  await expect.poll(async()=>(await where(page)).focus,{timeout:4000}).toBe('r30');await page.waitForTimeout(500);
  await page.evaluate(()=>{document.querySelector('.lr-panel')!.scrollTop=300});await page.waitForTimeout(500);
  expect((await where(page)).panel).toBe(300);
 });
 test('a real touch tap inside main (browser-generated, hasTouch) cancels the restore',async({page},info)=>{
  test.skip(!info.project.name.startsWith('mobile'),'Touch is the phone projects.');
  await harness(page);await openRow(page,'r30',100,1400);
  await page.getByRole('button',{name:'Back slow',exact:true}).click();
  const box=(await page.locator('main').boundingBox())!;await page.touchscreen.tap(box.x+20,Math.max(box.y,0)+30);
  await page.waitForTimeout(1900);expect((await where(page)).panel).toBeLessThan(5);
 });
 test('touch: a sideways swipe or a first touchstart does not cancel; a vertical scroll or a tap does',async({page})=>{
  const touch=(type:string,x:number,y:number)=>page.evaluate(([type,x,y])=>{const target=document.querySelector('main')!;const data={identifier:1,target,clientX:x as number,clientY:y as number};let t:Touch|typeof data;try{t=new Touch(data)}catch{t=data}const touches=type==='touchend'?[]:[t];let event:Event;try{event=new TouchEvent(type as string,{bubbles:true,cancelable:true,touches:touches as Touch[],changedTouches:[t as Touch]})}catch{event=new Event(type as string,{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:touches},changedTouches:{value:[t]}})}target.dispatchEvent(event)},[type,x,y] as const);
  const settled=async(expectRestored:boolean)=>{await page.waitForTimeout(1900);const after=await where(page);if(expectRestored){expect(after.focus).toBe('r30');near(after.panel,1400)}else expect(after.panel).toBeLessThan(5)};
  // Sideways swipe (a swipe-back in progress): the restore carries on.
  await harness(page);await openRow(page,'r30',100,1400);await page.getByRole('button',{name:'Back slow',exact:true}).click();
  await touch('touchstart',100,300);await touch('touchmove',160,303);await touch('touchmove',260,306);await touch('touchend',260,306);await settled(true);
  // A press that never moves far but is still down (touchstart only): not a cancel.
  await openRow(page,'r30',100,1400);await page.getByRole('button',{name:'Back slow',exact:true}).click();
  await touch('touchstart',100,300);await settled(true);
  // Vertical scroll: cancels.
  await openRow(page,'r30',100,1400);await page.getByRole('button',{name:'Back slow',exact:true}).click();
  await touch('touchstart',100,300);await touch('touchmove',102,360);await touch('touchend',102,360);await settled(false);
  // Tap: cancels.
  await openRow(page,'r30',100,1400);await page.getByRole('button',{name:'Back slow',exact:true}).click();
  await touch('touchstart',100,300);await touch('touchend',101,301);await settled(false);
 });
 test('no restore without Back: leaving by another route keeps a fresh list at the top',async({page})=>{
  await harness(page);await openRow(page,'r18',150,700);
  await page.getByRole('button',{name:'Away',exact:true}).click();
  await page.waitForTimeout(700);const after=await where(page);expect(after.panel).toBe(0);expect(after.focus).not.toBe('r18');
 });
 test('a second open replaces the first: Back focuses the row last opened',async({page})=>{
  await harness(page);await openRow(page,'r18',150,700);
  await page.getByRole('button',{name:'Away',exact:true}).click();await expect(page.getByTestId('view')).toHaveText('list');
  const second=await openRow(page,'r5',0,0);
  await page.getByRole('button',{name:'Back plain',exact:true}).click();
  await expect.poll(async()=>(await where(page)).focus).toBe('r5');near((await where(page)).panel,second.panel);
 });
 test('unmounting while a restore runs raises no error and moves nothing afterwards',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await harness(page,'?strict=1');await openRow(page,'r30',100,1400);
  await page.getByRole('button',{name:'Back slow',exact:true}).click();await page.evaluate(()=>(window as any).__unmount());
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(800);
  expect(await page.evaluate(()=>window.scrollY)).toBe(0);expect(errors).toEqual([]);
 });
});

// ---- Real pages: synthetic auth and HTTP seams, the real DOM. ----
import {chooseLanguage} from './live-controls';
import {referrerRoute,referrerMai,rebateExpenses,refereeBorrowers,accruingLoans} from './fixtures/referrers-fixture';
import {spawn,type ChildProcess} from 'node:child_process';
const BD='2026-11-05',ASOF='2026-11-05T05:00:00Z';
const auth=`let listener;const user={uid:'list-return-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(localStorage.getItem('list-return-owner')?user:null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){localStorage.setItem('list-return-owner','1');listener(user)};export async function signOut(){localStorage.removeItem('list-return-owner');listener(null)};`;
type Handler=(path:string,url:URL,method:string)=>any|undefined|Promise<any>;
async function signIn(page:Page,base:string,read:Handler,command:Handler){
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));
 await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 const answer=(handler:Handler,fallback:(path:string,method:string)=>any)=>async(r:import('@playwright/test').Route)=>{
  const url=new URL(r.request().url()),method=r.request().method();let body=await handler(url.pathname,url,method);
  if(body===undefined)body=fallback(url.pathname,method);
  const status=body?.__status??200;if(body?.__status)delete body.__status;
  return r.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)}).catch(()=>{});
 };
 const envelope={ok:true,source:'dev',businessDate:BD,timezone:'Asia/Bangkok',asOf:ASOF,horizonEnd:'2027-02-05',reviewRequired:false};
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',answer(read,()=>({...envelope,items:[],nextCursor:null})));
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',answer(command,(path,method)=>
  path==='/api/preferences'?{ok:true,item:{id:'R-partner',version:'b'.repeat(64),language:null,statementAccountId:null,statementDate:null}}
  :path==='/api/expense-options'?{ok:true,businessDate:BD,categories:[],accounts:[]}
  :path==='/api/dashboard'?{collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]}
  :path.startsWith('/api/operations/')&&method==='GET'?{ok:true,kind:'unresolved',safeToUseNewRequestId:false}
  :{ok:true,items:[],nextCursor:null}));
 await page.goto(base);await page.getByRole('button',{name:/Google/}).click();await chooseLanguage(page,'EN');
}
async function menu(page:Page,name:string){
 // Collection and Borrowers are in the phone tab bar; the other workspaces sit in the navigation drawer there.
 if(page.viewportSize()!.width<=1050&&!['Collection','Borrowers'].includes(name))await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 await page.getByRole('button',{name,exact:true}).filter({visible:true}).first().click();
}
/** Scroll whatever scrolls the target (its nearest overflowing ancestor, else the window) so the target is ~mid-view. */
async function scrollTo(page:Page,selector:string){
 return page.evaluate(sel=>{
  const el=document.querySelector(sel) as HTMLElement;
  for(let n:HTMLElement|null=el.parentElement;n&&n!==document.body;n=n.parentElement){const o=getComputedStyle(n).overflowY;if(/^(auto|scroll)$/.test(o)&&n.scrollHeight>n.clientHeight+1){const r=el.getBoundingClientRect(),c=n.getBoundingClientRect();n.scrollTop+=r.top-c.top-c.height/2;return {where:'element:'+n.className,top:n.scrollTop}}}
  const r=el.getBoundingClientRect();window.scrollBy(0,r.top-innerHeight/2);return {where:'window',top:window.scrollY};
 },selector);
}
/** The position of the row (its screen top), the window and every scrolling ancestor. */
const track=(page:Page,selector:string)=>page.evaluate(sel=>{
 const el=document.querySelector(sel) as HTMLElement|null;const tops:Record<string,number>={};
 for(let n:HTMLElement|null=el?.parentElement??null;n&&n!==document.body;n=n.parentElement)if(/^(auto|scroll)$/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1)tops[n.className.split(' ')[0]||n.tagName]=n.scrollTop;
 const ae=document.activeElement as HTMLElement|null;
 return {scrollY:window.scrollY,tops,rowTop:el?el.getBoundingClientRect().top:null,focus:ae?.closest('[data-record-id]')?.getAttribute('data-record-id')??null,scrollerTops:Object.values(tops)};
},selector);
async function settleBack(page:Page){await page.waitForTimeout(650)}

test.describe('list return on the real pages',()=>{
 let server:ChildProcess,base:string;
 test.beforeAll(async({},info)=>{const port=8400+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/list-return-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:30000}).toBe(200)});
 test.afterAll(()=>server?.kill());test.setTimeout(90000);test.use({actionTimeout:8000});

 test('Referrers: a long list returns to the opened referrer; the detail opens at the top; a history row returns to itself',async({page})=>{
  const many=Array.from({length:45},(_,i)=>i===0?referrerMai:{...referrerMai,id:'R-X'+i,name:'ผู้แนะนำ'+i,description:'Referrer '+i});
  const detailFor=(id:string)=>({...referrerRoute('/api/referrers/R-MAI')!.body,referrer:{...referrerMai,id}});
  await signIn(page,base,()=>undefined,(path,_u,method)=>{
   if(method!=='GET')return undefined;
   if(path==='/api/referrers')return {ok:true,items:many,businessDate:BD};
   const one=/^\/api\/referrers\/([^/]+)$/.exec(path);if(one){const body=detailFor(decodeURIComponent(one[1]));return body}
   const r=referrerRoute(path);return r?{...r.body,__status:r.status}:undefined;
  });
  await menu(page,'Referrers');await expect(page.locator('[data-record-id="R-X30"]')).toBeVisible();
  await scrollTo(page,'[data-record-id="R-X30"]');await page.waitForTimeout(100);
  const before=await track(page,'[data-record-id="R-X30"]');expect(before.scrollY+before.scrollerTops.reduce((a,b)=>a+b,0)).toBeGreaterThan(300);
  await page.locator('[data-record-id="R-X30"]').evaluate(node=>(node as HTMLElement).click());
  await expect(page.getByRole('heading',{name:'Settlement history'})).toBeVisible();
  const top=await page.evaluate(()=>{const scrolled:number[]=[];document.querySelectorAll('main *').forEach(n=>{if(/^(auto|scroll)$/.test(getComputedStyle(n).overflowY)&&n.scrollTop>0)scrolled.push(n.scrollTop)});return {y:scrollY,scrolled}});
  expect(top.y,'the referrer page opens at the top').toBe(0);expect(top.scrolled).toEqual([]);
  // In the detail: go to the bottom, open a history row, come back.
  const history=page.locator('[data-record-id^="expense:"],[data-record-id^="settlement:"],[data-record-id^="offset:"],[data-record-id^="paid-at-close:"]').last();
  await history.scrollIntoViewIfNeeded();const key=await history.getAttribute('data-record-id');
  await scrollTo(page,`[data-record-id="${key}"]`);const inner=await track(page,`[data-record-id="${key}"]`);
  await history.evaluate(node=>(node as HTMLElement).click());await page.waitForTimeout(300);
  await page.getByRole('button',{name:/^Back/}).first().click();
  await expect.poll(async()=>(await track(page,`[data-record-id="${key}"]`)).focus).toBe(key);await settleBack(page);
  const afterInner=await track(page,`[data-record-id="${key}"]`);near(afterInner.rowTop!,inner.rowTop!,3);
  // Back to the list.
  await page.getByRole('button',{name:/^Back/}).first().click();
  await expect.poll(async()=>(await track(page,'[data-record-id="R-X30"]')).focus).toBe('R-X30');await settleBack(page);
  const after=await track(page,'[data-record-id="R-X30"]');near(after.rowTop!,before.rowTop!,3);near(after.scrollY,before.scrollY,3);
  expect(after.scrollerTops).toEqual(before.scrollerTops.map(v=>expect.closeTo(v,-1)) as any);
 });

 test('Expenses: a long list returns to the opened expense; a related link returns to itself',async({page})=>{
  const rows=Array.from({length:45},(_,i)=>({...rebateExpenses['rr1:L-PEND'],id:'rr1:L-X'+i,expenseDate:'2026-10-'+String(1+(i%28)).padStart(2,'0'),relatedLoanId:'L-OPEN1',relatedLoanLabel:'Fon loan '+i,relatedBorrowerId:'B-NOK',relatedBorrowerLabel:'Nok'}));
  await signIn(page,base,()=>undefined,(path,_u,method)=>{
   if(method!=='GET')return undefined;
   if(path==='/api/expense-records')return {ok:true,items:rows,nextCursor:null};
   const one=/^\/api\/expense-records\/(.+)$/.exec(path);if(one){const row=rows.find(r=>r.id===decodeURIComponent(one[1]));if(row)return {ok:true,item:row}}
   const r=referrerRoute(path);return r?{...r.body,__status:r.status}:undefined;
  });
  await menu(page,'Expenses');const target='[data-record-id="rr1:L-X30"]';await expect(page.locator(target)).toBeVisible();
  await scrollTo(page,target);await page.waitForTimeout(100);
  const before=await track(page,target);expect(before.scrollY+before.scrollerTops.reduce((a,b)=>a+b,0)).toBeGreaterThan(300);
  await page.locator(target).evaluate(node=>(node as HTMLElement).click());await expect(page.locator('[data-record-id="relatedLoanLabel"]')).toBeVisible();
  await scrollTo(page,'[data-record-id="relatedLoanLabel"]');const inner=await track(page,'[data-record-id="relatedLoanLabel"]');
  await page.locator('[data-record-id="relatedLoanLabel"]').evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('button',{name:'Back to loans'})).toBeVisible();
  await page.getByRole('button',{name:'Back to loans'}).click();
  await expect.poll(async()=>(await track(page,'[data-record-id="relatedLoanLabel"]')).focus).toBe('relatedLoanLabel');await settleBack(page);
  near((await track(page,'[data-record-id="relatedLoanLabel"]')).rowTop!,inner.rowTop!,3);
  await page.getByRole('button',{name:/^Back to expenses/}).first().click();
  await expect.poll(async()=>(await track(page,target)).focus).toBe('rr1:L-X30');await settleBack(page);
  const after=await track(page,target);near(after.rowTop!,before.rowTop!,3);near(after.scrollY,before.scrollY,3);
 });

 test('Expenses: the opened expense starts at the top of the page, not at the list position',async({page})=>{
  const rows=Array.from({length:45},(_,i)=>({...rebateExpenses['rr1:L-PEND'],id:'rr1:L-X'+i,expenseDate:'2026-10-'+String(1+(i%28)).padStart(2,'0')}));
  await signIn(page,base,()=>undefined,(path,_u,method)=>{
   if(method!=='GET')return undefined;
   if(path==='/api/expense-records')return {ok:true,items:rows,nextCursor:null};
   const one=/^\/api\/expense-records\/(.+)$/.exec(path);if(one){const row=rows.find(r=>r.id===decodeURIComponent(one[1]));if(row)return {ok:true,item:row}}
   return undefined;
  });
  await menu(page,'Expenses');const target='[data-record-id="rr1:L-X30"]';await expect(page.locator(target)).toBeVisible();
  await scrollTo(page,target);await page.locator(target).evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('heading',{name:'Referral Rebate / เงินคืนค่าแนะนำลูกค้า'}).first()).toBeVisible();
  await page.waitForTimeout(400);
  const top=await page.evaluate(()=>{const scrolled:number[]=[];document.querySelectorAll('main *').forEach(n=>{if(/^(auto|scroll)$/.test(getComputedStyle(n).overflowY)&&n.scrollTop>0)scrolled.push(n.scrollTop)});return {y:scrollY,scrolled}});
  expect(top.y,'window scroll when the expense opened').toBe(0);expect(top.scrolled,'scrolled sections when the expense opened').toEqual([]);
 });

 // Collection with command access: 40 board borrowers, 30 charges for the opened one.
 const statuses=['not_paid','partially_paid','overdue','long_overdue','fully_paid'];
 const board=Array.from({length:40},(_,i)=>({id:'cb-'+i,displayName:'ผู้กู้ '+i+' - Synthetic '+i,status:statuses[Math.floor(i/8)],overdueDays:null,amountDue:'13',amountCollected:'3',amountRemaining:'10'}));
 const chargeRows=Array.from({length:30},(_,i)=>({id:'ch-'+i,loanId:'L-OPEN1',loanDisplayKey:'ผู้กู้ Synthetic loan '+i+'-฿12,000-07/10-2%',chargeDate:'2026-10-'+String(1+(i%28)).padStart(2,'0'),paymentStatus:'ยังไม่ชำระ',paymentDate:null,amountRemaining:'110.00',totalPaid:'0',receivedToday:'0'}));
 const collectionRead:Handler=(path)=>{
  if(path==='/api/collection')return {ok:true,source:'dev',businessDate:BD,timezone:'Asia/Bangkok',asOf:ASOF,items:board,nextCursor:null};
  const sub=/^\/api\/collection\/([^/]+)\/(charges|upcoming)$/.exec(path);
  if(sub){const b=board.find(x=>x.id===decodeURIComponent(sub[1]))??board[0];return {ok:true,source:'dev',businessDate:BD,timezone:'Asia/Bangkok',asOf:ASOF,horizonEnd:'2027-02-05',reviewRequired:false,borrower:b,items:sub[2]==='charges'?chargeRows:[],nextCursor:null}}
  return undefined;
 };
 const collectionCommand:Handler=(path,_u,method)=>{
  if(method!=='GET')return undefined;
  const charge=/^\/api\/charge-records\/(.+)$/.exec(path);
  if(charge){const id=decodeURIComponent(charge[1]);return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,item:{id,loanId:'L-OPEN1',borrowerName:'Synthetic',borrowerLabel:'Synthetic',chargeDate:BD,principalDue:'100',interestDue:'10',lateChargeDue:'0',lateChargePaid:'0',lateChargeRemaining:'0',totalPaid:'0',amountRemaining:'110',notes:null,version:'v-'+id,repayments:[],allocations:[],loanDisplayKey:'Synthetic loan'}}}
  const borrower=/^\/api\/borrower-records\/(.+)$/.exec(path);if(borrower){const id=decodeURIComponent(borrower[1]);return {ok:true,asOf:ASOF,businessDate:BD,item:{...refereeBorrowers['B-NOK'],id,name:'ผู้กู้ '+id}}}
  const loan=/^\/api\/loan-records\/([^/]+)$/.exec(path);if(loan)return {ok:true,asOf:ASOF,businessDate:BD,item:accruingLoans['L-OPEN1']};
  return undefined;
 };
 const panelTops=(page:Page)=>page.evaluate(()=>({list:(document.querySelector('.list-panel') as HTMLElement|null)?.scrollTop??null,detail:(document.querySelector('.detail-panel') as HTMLElement|null)?.scrollTop??null,y:scrollY}));

 test('Collection: the board returns to the opened tile with Back and with a swipe (mobile); both panels return (desktop)',async({page},info)=>{
  const mobile=info.project.name.startsWith('mobile');
  await signIn(page,base,collectionRead,collectionCommand);
  await menu(page,'Collection');const tile='.collection-tile-main[data-record-id="cb-30"]';await expect(page.locator(tile)).toBeVisible();
  await scrollTo(page,tile);await page.waitForTimeout(100);
  const board0=await track(page,tile);expect(board0.scrollY+board0.scrollerTops.reduce((a,b)=>a+b,0)).toBeGreaterThan(300);
  await page.locator(tile).evaluate(node=>(node as HTMLElement).click());await expect(page.locator('.collection-charge-row')).toHaveCount(30);
  if(mobile){
   await page.getByRole('button',{name:'Back to Collection'}).click();
   await expect.poll(async()=>(await track(page,tile)).focus).toBe('cb-30');await settleBack(page);
   let after=await track(page,tile);near(after.rowTop!,board0.rowTop!,2);near(after.scrollY,board0.scrollY,2);
   // The same through the edge swipe (native touch).
   await page.locator(tile).evaluate(node=>(node as HTMLElement).click());await expect(page.locator('.collection-charge-row')).toHaveCount(30);await page.waitForTimeout(300);
   const session=await touchSession(page);const y=Math.round(page.viewportSize()!.height/2),w=page.viewportSize()!.width;
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:1,y}]});for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:1+w*.7*i/6,y}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await expect(page.locator('.collection-charge-row')).toHaveCount(0);
   await expect.poll(async()=>(await track(page,tile)).focus).toBe('cb-30');await settleBack(page);
   after=await track(page,tile);near(after.rowTop!,board0.rowTop!,3);near(after.scrollY,board0.scrollY,3);await session.detach();
   return;
  }
  // Desktop: the board stays beside the detail. Charge detail, then Back.
  const lists=await panelTops(page);expect(lists.list).toBeGreaterThan(100);
  const chargeSel='.charge-tile-action[data-record-id="ch-20"]';await scrollTo(page,chargeSel);await page.waitForTimeout(100);
  const detail0=await panelTops(page),row0=await track(page,chargeSel);expect(detail0.detail).toBeGreaterThan(100);
  await page.locator(chargeSel).evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('button',{name:'Back to charges'})).toBeVisible();
  await page.getByRole('button',{name:'Back to charges'}).click();
  await expect.poll(async()=>(await track(page,chargeSel)).focus).toBe('ch-20');await settleBack(page);
  let tops=await panelTops(page);near(tops.list!,lists.list!,2);near(tops.detail!,detail0.detail!,3);near((await track(page,chargeSel)).rowTop!,row0.rowTop!,3);
  // The loan link replaces the whole workspace (grid remount): both panels come back.
  const loanSel='.charge-loan-link[data-record-id="ch-20:loan"]';await scrollTo(page,loanSel);await page.waitForTimeout(100);
  const detail1=await panelTops(page),loan0=await track(page,loanSel);
  await page.locator(loanSel).evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('button',{name:'Back to loans'})).toBeVisible();
  await page.getByRole('button',{name:'Back to loans'}).click();
  await expect.poll(async()=>(await track(page,loanSel)).focus).toBe('ch-20:loan');await settleBack(page);
  tops=await panelTops(page);near(tops.list!,lists.list!,2);near(tops.detail!,detail1.detail!,3);near((await track(page,loanSel)).rowTop!,loan0.rowTop!,3);
 });

 test('Borrowers (owner): loan, then Back keeps loans page 2 and the row; a related charge keeps related page 2',async({page},info)=>{
  test.skip(info.project.name.startsWith('mobile'),'The owner Borrowers flow is a desktop layout (a section scroller); the Collection and Referrers tests cover the phone window scroll.');
  const loans=Array.from({length:30},(_,i)=>({id:'pl-'+i,borrowerId:'BX',borrowerDisplayName:'ผู้กู้ Synthetic',originalDailyInterestRate:'2',loanDate:'2026-10-'+String(1+(i%28)).padStart(2,'0'),dueDate:null,closeDate:null,status:'ยังไม่ปิดยอด',loanType:'ดอกเบี้ยรายวัน',principalAmount:String(10000+i),outstandingPrincipal:'100',totalPrincipalReceived:'0',totalInterestReceived:'0',totalAmountReceived:'0',defaulted:false,autoChargeEnabled:false}));
  const charges=Array.from({length:30},(_,i)=>({id:'rc-'+i,date:'2026-10-'+String(1+(i%28)).padStart(2,'0'),status:'ยังไม่ชำระ',principal:'100',interest:'10',lateCharge:'0'}));
  const cur=(array:any[],cursor:string|null)=>cursor?{items:array.slice(25),nextCursor:null}:{items:array.slice(0,25),nextCursor:array.length>25?Buffer.from('p2').toString('base64url'):null};
  const reads:string[]=[];
  await signIn(page,base,(path,url)=>{
   reads.push(path+url.search);
   if(path==='/api/borrowers')return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,items:[{id:'BX',name:'ผู้กู้',borrowerDisplayName:'ผู้กู้ Synthetic',totalProfitEarned:'10',createdDate:'2026-10-07',hasActiveLoan:true,outstandingPrincipal:'100',note:null}],nextCursor:null};
   if(path==='/api/borrowers/BX')return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,item:{...refereeBorrowers['B-NOK'],id:'BX',name:'ผู้กู้',borrowerDisplayName:'ผู้กู้ Synthetic',displayName:'ผู้กู้ Synthetic',outstandingPrincipal:'100',totalProfitEarned:'10',hasActiveLoan:true}};
   if(path==='/api/borrowers/BX/loans')return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,...cur(loans,url.searchParams.get('cursor'))};
   return undefined;
  },(path,url,method)=>{
   if(method!=='GET')return undefined;
   if(path==='/api/borrower-options')return {ok:true,accounts:[{id:'ca:a',label:'Synthetic account'}],referrers:[{id:'R-MAI',label:'มาย - Mai'}]};
   const related=/^\/api\/loan-records\/([^/]+)\/(charges|payments)$/.exec(path);
   if(related)return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,...(related[2]==='charges'?cur(charges,url.searchParams.get('cursor')):{items:[],nextCursor:null})};
   const loan=/^\/api\/loan-records\/([^/]+)$/.exec(path);if(loan)return {ok:true,asOf:ASOF,businessDate:BD,item:{...accruingLoans['L-OPEN1'],id:decodeURIComponent(loan[1]),borrowerId:'BX'}};
   const charge=/^\/api\/charge-records\/(.+)$/.exec(path);if(charge){const id=decodeURIComponent(charge[1]);return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,item:{id,loanId:'pl-27',borrowerName:'Synthetic',borrowerLabel:'Synthetic',chargeDate:BD,principalDue:'100',interestDue:'10',lateChargeDue:'0',lateChargePaid:'0',lateChargeRemaining:'0',totalPaid:'0',amountRemaining:'110',notes:null,version:'v-'+id,repayments:[],allocations:[],loanDisplayKey:'Synthetic loan'}}}
   const borrower=/^\/api\/borrower-records\/(.+)$/.exec(path);if(borrower)return {ok:true,asOf:ASOF,businessDate:BD,item:{...refereeBorrowers['B-NOK'],id:'BX',name:'ผู้กู้'}};
   return undefined;
  });
  await menu(page,'Borrowers');await page.locator('.borrower-tile-main').first().click();
  await expect(page.locator('.loan-record')).toHaveCount(25);await page.getByRole('button',{name:'Next loans page',exact:true}).click();
  const loanSel='.loan-record[data-record-id="pl-27"]';await expect(page.locator(loanSel)).toBeVisible();await expect(page.locator('.loan-record')).toHaveCount(5);
  await scrollTo(page,loanSel);await page.waitForTimeout(100);const loan0=await track(page,loanSel);
  await page.locator(loanSel).evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('button',{name:'Back to loans'})).toBeVisible();
  // Related charges page 2, then a charge.
  await expect(page.locator('[data-record-id="rc-3"]')).toBeVisible();await page.getByRole('button',{name:'Next related page',exact:true}).click();
  const chargeSel='[data-record-id="rc-27"]';await expect(page.locator(chargeSel)).toBeVisible();await scrollTo(page,chargeSel);await page.waitForTimeout(100);const charge0=await track(page,chargeSel);
  await page.locator(chargeSel).evaluate(node=>(node as HTMLElement).click());await expect(page.getByText('Charge date').first()).toBeVisible();
  await page.getByRole('button',{name:/^Back/}).first().click();
  await expect(page.getByRole('button',{name:'Previous related page',exact:true})).toBeVisible();
  await expect.poll(async()=>(await track(page,chargeSel)).focus).toBe('rc-27');await settleBack(page);
  near((await track(page,chargeSel)).rowTop!,charge0.rowTop!,3);await expect(page.getByRole('button',{name:'Previous related page',exact:true})).toBeVisible();
  // Back to the borrower: page 2 of the loans and the opened loan.
  await page.getByRole('button',{name:'Back to loans'}).click();
  await expect.poll(async()=>(await track(page,loanSel)).focus).toBe('pl-27');await settleBack(page);
  await expect(page.locator('.loan-record')).toHaveCount(5);await expect(page.getByRole('button',{name:'Previous loans page',exact:true})).toBeVisible();
  near((await track(page,loanSel)).rowTop!,loan0.rowTop!,3);
 });

 test('Upcoming Charges: a borrower and a charge open at the top; Back returns to each row',async({page})=>{
  const root=Array.from({length:25},(_,i)=>({id:'up-'+i,borrowerId:'UB-'+i,label:'ผู้กู้ Upcoming '+i,dueDate:'2026-11-'+String(6+Math.floor(i/5)).padStart(2,'0'),totalCharge:'110'}));
  const dates=['2026-11-06','2026-11-07','2026-11-08','2026-11-09','2026-11-10'].map(date=>({date,amount:'550'}));
  const events=Array.from({length:20},(_,i)=>({id:'ev-'+i,loanId:'L-OPEN1',loanDate:'2026-10-01',loanType:'ดอกเบี้ยรายวัน',loanPrincipal:'10000',basis:'Projected',amount:'110',principal:'100',interest:'10',dueDate:'2026-11-08'}));
  await signIn(page,base,()=>undefined,(path,_u,method)=>{
   if(method!=='GET')return undefined;
   if(path==='/api/upcoming-charges')return {ok:true,source:'dev',businessDate:BD,asOf:ASOF,items:root,dateTotals:dates,nextCursor:null};
   const one=/^\/api\/upcoming-charges\/([^/]+)\/(.+)$/.exec(path);if(one)return {ok:true,source:'dev',businessDate:BD,asOf:ASOF,borrowerLabel:'ผู้กู้ Upcoming',items:events,dateTotals:dates,nextCursor:null};
   return undefined;
  });
  await menu(page,'Upcoming Charges');const target='[data-record-id="up-20"]';await expect(page.locator(target)).toBeVisible();
  await scrollTo(page,target);await page.waitForTimeout(100);const before=await track(page,target);expect(before.scrollY+before.scrollerTops.reduce((a,b)=>a+b,0)).toBeGreaterThan(200);
  await page.locator(target).evaluate(node=>(node as HTMLElement).click());await expect(page.locator('[data-record-id="ev-3"]')).toBeVisible();await page.waitForTimeout(300);
  const top=await page.evaluate(()=>{const scrolled:number[]=[];document.querySelectorAll('main *').forEach(n=>{if(/^(auto|scroll)$/.test(getComputedStyle(n).overflowY)&&n.scrollTop>0)scrolled.push(n.scrollTop)});return {y:scrollY,scrolled}});
  expect(top.y,'window scroll when the date opened').toBe(0);expect(top.scrolled).toEqual([]);
  await scrollTo(page,'[data-record-id="ev-15"]');const inner=await track(page,'[data-record-id="ev-15"]');
  await page.locator('[data-record-id="ev-15"]').evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('button',{name:'Back to upcoming date'})).toBeVisible();
  await page.getByRole('button',{name:'Back to upcoming date'}).click();
  await expect.poll(async()=>(await track(page,'[data-record-id="ev-15"]')).focus).toBe('ev-15');await settleBack(page);near((await track(page,'[data-record-id="ev-15"]')).rowTop!,inner.rowTop!,3);
  await page.getByRole('button',{name:'Back to Upcoming Charges'}).click();
  await expect.poll(async()=>(await track(page,target)).focus).toBe('up-20');await settleBack(page);
  const after=await track(page,target);near(after.rowTop!,before.rowTop!,3);near(after.scrollY,before.scrollY,3);
 });

 test('Referrers: a settlement and the rebate opened from it each return to their own row',async({page})=>{
  await signIn(page,base,()=>undefined,(path,_u,method)=>{if(method!=='GET')return undefined;const r=referrerRoute(path);return r?{...r.body,__status:r.status}:undefined});
  await menu(page,'Referrers');await page.locator('[data-record-id="R-MAI"]').click();await expect(page.getByRole('heading',{name:'Settlement history'})).toBeVisible();
  const settlement='[data-record-id^="settlement:"]';await expect(page.locator(settlement)).toBeVisible();await scrollTo(page,settlement);
  const key=(await page.locator(settlement).getAttribute('data-record-id'))!,sel=`[data-record-id="${key}"]`,inDetail=await track(page,sel);
  await page.locator(sel).evaluate(node=>(node as HTMLElement).click());
  const rebate='[data-record-id="rr1:L-PAID"]';await expect(page.locator(rebate)).toBeVisible();await scrollTo(page,rebate);const inSettlement=await track(page,rebate);
  await page.locator(rebate).evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('button',{name:/^Back to referrer/}).first()).toBeVisible();
  await page.getByRole('button',{name:/^Back/}).first().click();
  await expect.poll(async()=>(await track(page,rebate)).focus).toBe('rr1:L-PAID');await settleBack(page);near((await track(page,rebate)).rowTop!,inSettlement.rowTop!,3);
  await page.getByRole('button',{name:/^Back/}).first().click();
  await expect.poll(async()=>(await track(page,sel)).focus).toBe(key);await settleBack(page);near((await track(page,sel)).rowTop!,inDetail.rowTop!,3);
 });
 const assessments=Array.from({length:60},(_,i)=>({id:'as-'+i,assessmentId:'ASSESS-'+i,borrowerId:'B-NOK',borrowerLabel:'ผู้กู้ Assess '+i,proposedLoanAmount:'10000'}));
 const assessmentCommand:Handler=(path,_u,method)=>{
  if(method!=='GET')return undefined;
  if(path==='/api/management/assessments')return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,items:assessments,nextCursor:null};
  const one=/^\/api\/management\/assessments\/(.+)$/.exec(path);if(one){const row=assessments.find(a=>a.id===decodeURIComponent(one[1]));if(row)return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,item:{...row,version:'f'.repeat(64),calculatedAt:'2026-11-05T05:00:00Z',forecastEnd:'2027-02-05',freshness:'current',isFinite:true,minimumDailyProfitRate:'0.01',onLine:false,recommendation:'Approve'}}}
  return undefined;
 };
 async function openAssessments(page:Page){
  await signIn(page,base,()=>undefined,assessmentCommand);
  await menu(page,'Management');
  const section=page.getByRole('button',{name:'Loan Assessments',exact:true}).filter({visible:true});
  if(await section.count()===0&&page.viewportSize()!.width<=1050)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await section.first().click();
  await expect(page.locator('[data-record-id="as-30"]')).toBeVisible();
 }
 test('LRP-MGT-2: Loan Assessments returns to the opened assessment',async({page})=>{
  await openAssessments(page);const sel='[data-record-id="as-40"]';
  await scrollTo(page,sel);await page.waitForTimeout(100);const before=await track(page,sel);expect(before.scrollY+before.scrollerTops.reduce((a,b)=>a+b,0)).toBeGreaterThan(300);
  await page.locator(sel).evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('heading',{name:'ASSESS-40'})).toBeVisible();
  await page.getByRole('button',{name:'Back to assessments'}).first().click();
  await expect.poll(async()=>(await track(page,sel)).focus).toBe('as-40');await settleBack(page);
  const after=await track(page,sel);near(after.rowTop!,before.rowTop!,3);
 });
 test('LRP-LAY-1: at 1280 the Management list scrolls in one container and restores',async({page},info)=>{
  test.skip(info.project.name.startsWith('mobile'),'The fixed desktop shell is the layout under test (>= 1200px).');
  await page.setViewportSize({width:1280,height:720});
  await openAssessments(page);const sel='[data-record-id="as-40"]';
  const shape=await page.evaluate(()=>{const row=document.querySelector('[data-record-id="as-40"]')!;const scrollers:string[]=[];for(let n:HTMLElement|null=row.parentElement;n&&n!==document.documentElement;n=n.parentElement)if(/^(auto|scroll)$/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1)scrollers.push(n.tagName.toLowerCase()+'.'+n.className.split(' ')[0]);return {scrollers,windowScrolls:document.documentElement.scrollHeight>innerHeight+1}});
  expect(shape.scrollers.length,'exactly one scrolling container around the rows: '+shape.scrollers.join(' > ')).toBe(1);expect(shape.scrollers[0]).toContain('management-workspace');expect(shape.windowScrolls,'the window itself must not scroll').toBe(false);
  await scrollTo(page,sel);await page.waitForTimeout(100);const before=await track(page,sel);expect(before.scrollerTops[0]).toBeGreaterThan(300);
  await page.locator(sel).evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('heading',{name:'ASSESS-40'})).toBeVisible();
  await page.getByRole('button',{name:'Back to assessments'}).first().click();
  await expect.poll(async()=>(await track(page,sel)).focus).toBe('as-40');await settleBack(page);
  const after=await track(page,sel);near(after.rowTop!,before.rowTop!,3);near(after.scrollerTops[0],before.scrollerTops[0],3);
 });

 test('LRP-BOR-1 (owner): a loan opened from the borrower returns to its row although the borrower page rebuilds about 700 ms after Back',async({page},info)=>{
  test.skip(info.project.name.startsWith('mobile'),'Desktop two-pane layout.');
  const loans=Array.from({length:25},(_,i)=>({id:'ol-'+i,borrowerId:'BX',borrowerDisplayName:'ผู้กู้ Synthetic',originalDailyInterestRate:'2',loanDate:'2026-10-'+String(1+(i%28)).padStart(2,'0'),dueDate:null,closeDate:null,status:'ยังไม่ปิดยอด',loanType:'ดอกเบี้ยรายวัน',principalAmount:String(10000+i),outstandingPrincipal:'100',totalPrincipalReceived:'0',totalInterestReceived:'0',totalAmountReceived:'0',defaulted:false,autoChargeEnabled:false}));
  let recordReads=0;
  await signIn(page,base,(path)=>{
   if(path==='/api/borrowers')return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,items:[{id:'BX',name:'ผู้กู้',borrowerDisplayName:'ผู้กู้ Synthetic',totalProfitEarned:'10',createdDate:'2026-10-07',hasActiveLoan:true,outstandingPrincipal:'100',note:null}],nextCursor:null};
   if(path==='/api/borrowers/BX')return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,item:{...refereeBorrowers['B-NOK'],id:'BX',name:'ผู้กู้',borrowerDisplayName:'ผู้กู้ Synthetic',displayName:'ผู้กู้ Synthetic',outstandingPrincipal:'100',totalProfitEarned:'10',hasActiveLoan:true}};
   if(path==='/api/borrowers/BX/loans')return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,items:loans,nextCursor:null};
   return undefined;
  },async(path,_u,method)=>{
   if(method!=='GET')return undefined;
   if(path==='/api/borrower-options')return {ok:true,accounts:[{id:'ca:a',label:'Synthetic account'}],referrers:[{id:'R-MAI',label:'มาย - Mai'}]};
   if(path==='/api/borrower-records/BX'){recordReads++;if(recordReads>1)await new Promise(done=>setTimeout(done,700));return {ok:true,asOf:ASOF,businessDate:BD,item:{...refereeBorrowers['B-NOK'],id:'BX',name:'ผู้กู้'}}}
   const loan=/^\/api\/loan-records\/([^/]+)$/.exec(path);if(loan)return {ok:true,asOf:ASOF,businessDate:BD,item:{...accruingLoans['L-OPEN1'],id:decodeURIComponent(loan[1]),borrowerId:'BX'}};
   if(/^\/api\/loan-records\/[^/]+\/(charges|payments)$/.test(path))return {ok:true,asOf:ASOF,businessDate:BD,items:[],nextCursor:null};
   return undefined;
  });
  await menu(page,'Borrowers');await page.locator('.borrower-tile-main').first().click();
  await expect(page.locator('.loan-record')).toHaveCount(25);
  const sel='.loan-record[data-record-id="ol-20"]';await scrollTo(page,sel);await page.waitForTimeout(100);const before=await track(page,sel);
  await page.locator(sel).evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('button',{name:'Back to loans'})).toBeVisible();
  await page.getByRole('button',{name:'Back to loans'}).click();
  await expect.poll(async()=>(await track(page,sel)).focus,{timeout:4000}).toBe('ol-20');await settleBack(page);
  near((await track(page,sel)).rowTop!,before.rowTop!,3);expect(recordReads,'the borrower record was fetched again after Back').toBeGreaterThan(1);
 });

 test('LRP-LAY-2: at 1280 Cash Accounts keeps its heading and scrolls the holders and the accounts panes separately',async({page},info)=>{
  test.skip(info.project.name.startsWith('mobile'),'The fixed desktop shell (>= 1200px).');
  await page.setViewportSize({width:1280,height:720});
  const rows=Array.from({length:40},(_,i)=>({id:'ch-'+i,label:'Holder '+i,name:'Holder '+i,holderId:'ch-0',currentBalance:'10',cashIn:'1',cashOut:'1',active:true,isDefault:false}));
  await signIn(page,base,()=>undefined,(path,_u,method)=>{if(method!=='GET')return undefined;if(path.startsWith('/api/management/'))return {ok:true,source:'dev',asOf:ASOF,businessDate:BD,items:rows,nextCursor:null};return undefined});
  await menu(page,'Management');await page.getByRole('button',{name:'Cash Accounts',exact:true}).filter({visible:true}).first().click();
  await expect(page.locator('.cash-accounts-layout')).toBeVisible();await page.waitForTimeout(500);
  const shape=await page.evaluate(()=>{const layout=document.querySelector('.cash-accounts-layout') as HTMLElement,panes=Array.from(layout.children) as HTMLElement[],cash=document.querySelector('main>.management-cash') as HTMLElement,heading=cash.querySelector('header') as HTMLElement;
   return {panes:panes.map(p=>({overflow:getComputedStyle(p).overflowY,scrolls:p.scrollHeight>p.clientHeight+1,h:p.clientHeight})),winScrolls:document.documentElement.scrollHeight>innerHeight+1,cashScrolls:cash.scrollHeight>cash.clientHeight+1,headingTop:heading.getBoundingClientRect().top,mainTop:(document.querySelector('main') as HTMLElement).getBoundingClientRect().top}});
  expect(shape.panes.length).toBe(2);for(const pane of shape.panes)expect(pane.overflow).toBe('auto');
  expect(shape.panes[0].scrolls,'the holders pane scrolls on its own').toBe(true);expect(shape.winScrolls).toBe(false);expect(shape.cashScrolls,'the panel itself does not scroll while panes do').toBe(false);
  await page.locator('.cash-accounts-layout>section').first().evaluate(node=>{node.scrollTop=400});
  expect(await page.evaluate(()=>(document.querySelector('main>.management-cash header') as HTMLElement).getBoundingClientRect().top),'the heading stays put when a pane scrolls').toBe(shape.headingTop);
 });

});

// ---- Legacy (read-only) Borrowers: no command service, the page lists loans itself. ----
test.describe('list return on the legacy read-only Borrowers',()=>{
 let server:ChildProcess,base:string;
 test.beforeAll(async({},info)=>{const port=8450+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/list-return-legacy-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:30000}).toBe(200)});
 test.afterAll(()=>server?.kill());test.setTimeout(90000);test.use({actionTimeout:8000});
 const borrowers=Array.from({length:60},(_,i)=>({id:'lb-'+i,name:'ชื่อ '+i,borrowerDisplayName:'ชื่อ '+i+' - English '+i,totalProfitEarned:'10',createdDate:'2026-10-07',hasActiveLoan:true,outstandingPrincipal:'9000',note:null}));
 const loans=Array.from({length:25},(_,i)=>({id:'ll-'+i,borrowerId:'lb-50',borrowerDisplayName:'ชื่อ 50 - English 50',originalDailyInterestRate:'2',loanDate:'2026-10-'+String(1+(i%28)).padStart(2,'0'),dueDate:null,closeDate:null,status:'ยังไม่ปิดยอด',loanType:'ดอกเบี้ยรายวัน',principalAmount:String(12000+i),outstandingPrincipal:'123',totalPrincipalReceived:'0',totalInterestReceived:'0',totalAmountReceived:'0',defaulted:false,autoChargeEnabled:false}));
 const read:Handler=(path)=>{
  const env={ok:true,source:'dev',businessDate:BD,asOf:ASOF};
  if(path==='/api/borrowers')return {...env,items:borrowers,nextCursor:null};
  const loan=/^\/api\/borrowers\/([^/]+)\/loans\/([^/]+)$/.exec(path);if(loan)return {...env,item:loans.find(l=>l.id===loan[2])};
  const list=/^\/api\/borrowers\/([^/]+)\/loans$/.exec(path);if(list)return {...env,items:loans,nextCursor:null};
  const one=/^\/api\/borrowers\/([^/]+)$/.exec(path);if(one)return {...env,item:borrowers.find(b=>b.id===decodeURIComponent(one[1]))};
  return undefined;
 };
 const tops=(page:Page)=>page.evaluate(()=>({y:scrollY,list:(document.querySelector('.list-panel') as HTMLElement|null)?.scrollTop??null,detail:(document.querySelector('.detail-panel') as HTMLElement|null)?.scrollTop??null}));

 test('LRP-BOR-1: a legacy loan opened from the borrower returns to its row',async({page})=>{
  await signIn(page,base,read,()=>undefined);
  await expect(page.locator('.borrower-tile-main').first()).toBeVisible();
  await page.locator('.borrower-tile-main').nth(50).scrollIntoViewIfNeeded();await page.locator('.borrower-tile-main').nth(50).click();
  await expect(page.locator('.loan-record')).toHaveCount(25);
  const sel='.loan-record[data-record-id="ll-20"]';await scrollTo(page,sel);await page.waitForTimeout(100);const before=await track(page,sel);
  await page.locator(sel).evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('article',{name:'Loan details'})).toBeVisible();
  await page.getByRole('button',{name:'Back to loans'}).click();
  await expect.poll(async()=>(await track(page,sel)).focus).toBe('ll-20');await settleBack(page);
  near((await track(page,sel)).rowTop!,before.rowTop!,3);await expect(page.locator('.loan-record')).toHaveCount(25);
 });

 test('LRP-BOR-2: a borrower opened from a deep list lands at the top and stays there; Back returns to its tile',async({page})=>{
  await signIn(page,base,read,()=>undefined);
  const tile='.borrower-tile-main[data-record-id="lb-50"]';await expect(page.locator(tile)).toBeVisible();
  await scrollTo(page,tile);await page.waitForTimeout(100);
  const before=await track(page,tile),listBefore=await tops(page);expect(listBefore.y+(listBefore.list??0)).toBeGreaterThan(500);
  await page.locator(tile).evaluate(node=>(node as HTMLElement).click());await expect(page.locator('.loan-record')).toHaveCount(25);await page.waitForTimeout(600);
  const open=await tops(page);expect(open.y,'window at the top').toBe(0);expect(open.detail??0,'detail panel at the top').toBe(0);
  if(open.list!==null&&page.viewportSize()!.width>1050)near(open.list,listBefore.list!,2);// two panes: the list stays where it was
  await page.getByRole('button',{name:/^Back to (list|Borrowers)/}).first().click();
  await expect.poll(async()=>(await track(page,tile)).focus).toBe('lb-50');await settleBack(page);
  const after=await track(page,tile);near(after.rowTop!,before.rowTop!,3);near(after.scrollY,before.scrollY,3);
 });
 test('pager: Back then an immediate page change is not dragged back; opening a borrower and paging closes the detail cleanly',async({page},info)=>{
  const records=Array.from({length:150},(_,i)=>({id:'pg-'+i,name:'ผู้กู้ '+i,borrowerDisplayName:'ผู้กู้ '+i+' - English '+i,totalProfitEarned:'10',createdDate:'2026-10-07',hasActiveLoan:true,outstandingPrincipal:'9000',note:null}));
  await signIn(page,base,(path,url)=>{
   const env={ok:true,source:'dev',businessDate:BD,asOf:ASOF};
   if(path==='/api/borrowers'){const start=url.searchParams.get('cursor')==='pg-page-2'?100:0;return {...env,items:records.slice(start,start+100),nextCursor:start===0?'pg-page-2':null}}
   const one=/^\/api\/borrowers\/(pg-\d+)$/.exec(path);if(one)return {...env,item:records.find(r=>r.id===one[1])};
   return undefined;
  },()=>undefined);
  const next=page.getByRole('button',{name:'Next borrowers page',exact:true}),previous=page.getByRole('button',{name:'Previous borrowers page',exact:true});
  await expect(page.locator('.borrower-tile-main')).toHaveCount(100);
  // Desktop: a borrower is open on page 1; Next replaces the list and closes the detail.
  if(!info.project.name.startsWith('mobile')){
   await page.locator('.borrower-tile-main[data-record-id="pg-3"]').click();await expect(page.locator('.detail-panel')).toContainText('English 3');
   await next.scrollIntoViewIfNeeded();await next.click();await expect(page.locator('.borrower-tile-main')).toHaveCount(50);
   await expect(page.locator('.detail-panel.unselected')).toHaveCount(1);
  }else{await next.scrollIntoViewIfNeeded();await next.click();await expect(page.locator('.borrower-tile-main')).toHaveCount(50)}
  // Page 2: open a row, Back, and change page at once.
  const tile='.borrower-tile-main[data-record-id="pg-140"]';await scrollTo(page,tile);await page.locator(tile).evaluate(node=>(node as HTMLElement).click());await expect(page.locator('.detail-panel')).toContainText('English 140');
  await page.getByRole('button',{name:/^Back to (list|Borrowers)/}).first().click();
  await previous.scrollIntoViewIfNeeded();await previous.click();await expect(page.locator('.borrower-tile-main')).toHaveCount(100);
  await page.waitForTimeout(2300);
  const top=await page.evaluate(()=>window.scrollY+((document.querySelector('.list-panel') as HTMLElement)?.scrollTop??0));
  expect(top,'the list stays near the top of page 1, nothing pulled it back to the old row').toBeLessThan(200);
  expect(await page.evaluate(()=>document.activeElement?.getAttribute('data-record-id')),'no stale focus on the page-2 row').not.toBe('pg-140');
 });

 test('LRP-BOR-4: Back while the detail read is pending does not reopen the borrower, and a late read does not replace the next one',async({page})=>{
  let detailReads=0;
  await signIn(page,base,async(path)=>{
   const env={ok:true,source:'dev',businessDate:BD,asOf:ASOF};
   if(path==='/api/borrowers')return {...env,items:borrowers,nextCursor:null};
   const loans=/^\/api\/borrowers\/([^/]+)\/loans$/.exec(path);if(loans)return {...env,items:[],nextCursor:null};
   const one=/^\/api\/borrowers\/(lb-\d+)$/.exec(path);if(one){detailReads++;await new Promise(done=>setTimeout(done,900));return {...env,item:borrowers.find(b=>b.id===one[1])}}
   return undefined;
  },()=>undefined);
  const tile='.borrower-tile-main[data-record-id="lb-5"]';await expect(page.locator(tile)).toBeVisible();
  await page.locator(tile).evaluate(node=>(node as HTMLElement).click());
  // Shown at once, from the row: the name, the list values and no empty or error state.
  const panel=page.locator('.detail-panel');await expect(panel).toContainText('English 5');await expect(panel).toContainText('9,000');
  await expect.poll(()=>detailReads).toBeGreaterThan(0);
  // Back while the read is pending, then let it land: the list stays, the borrower does not reopen.
  await page.getByRole('button',{name:/^Back to (list|Borrowers)/}).first().click();
  await expect(page.locator('.detail-panel.unselected, .list-panel').first()).toBeVisible();
  const frames:string[]=[];for(let i=0;i<14;i++){frames.push(await page.evaluate(()=>String(!!document.querySelector('.detail-panel:not(.unselected) h2')||/English 5/.test((document.querySelector('.detail-panel')as HTMLElement)?.innerText??'')&&innerWidth<=1050&&!!document.querySelector('.loan-record-list')))); await page.waitForTimeout(100)}
  expect(frames.filter(f=>f==='true').length,'borrower page reappeared after Back').toBe(0);
  await expect(page.locator('.borrower-tile-main').first()).toBeVisible();
  // Open another borrower: the first one's late read must not replace it.
  await page.locator('.borrower-tile-main[data-record-id="lb-6"]').evaluate(node=>(node as HTMLElement).click());
  await page.waitForTimeout(1300);await expect(page.locator('.detail-panel')).toContainText('English 6');await expect(page.locator('.detail-panel')).not.toContainText('English 5 ');
 });

 test('LRP-BOR-4: while the detail read is pending the page shows the row, not a false "No loans" state',async({page})=>{
  await signIn(page,base,async(path)=>{
   const env={ok:true,source:'dev',businessDate:BD,asOf:ASOF};
   if(path==='/api/borrowers')return {...env,items:borrowers,nextCursor:null};
   if(/^\/api\/borrowers\/[^/]+\/loans$/.test(path))return {...env,items:loans.slice(0,3),nextCursor:null};
   const one=/^\/api\/borrowers\/(lb-\d+)$/.exec(path);if(one){await new Promise(done=>setTimeout(done,900));return {...env,item:borrowers.find(b=>b.id===one[1])}}
   return undefined;
  },()=>undefined);
  await page.locator('.borrower-tile-main[data-record-id="lb-5"]').evaluate(node=>(node as HTMLElement).click());
  const panel=page.locator('.detail-panel');await expect(panel).toContainText('English 5');
  const text=await panel.innerText();expect(text,'borrower has loans; nothing may claim otherwise while they load').not.toMatch(/No loans|unavailable|ไม่มี|ไม่สามารถ/i);
  await expect(page.locator('.loan-record')).toHaveCount(3);
 });

});
