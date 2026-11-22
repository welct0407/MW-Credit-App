import {chooseLanguagePreservingForm,signOut} from './live-controls';
import {test,expect,deviceClass,layout,stacked} from './fixtures/test';
import {spawn,type ChildProcess} from 'node:child_process';
let server:ChildProcess;let base:string;let serverLog="";
test.beforeAll(async({},info)=>{
 const port=5500+info.workerIndex;base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-${port}-${Date.now()}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app'},stdio:'pipe'});
 server.stdout?.on("data",data=>{serverLog+=String(data)});server.stderr?.on("data",data=>{serverLog+=String(data)});
 await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return0()}},{timeout:20000}).toBe(200);
});
function return0(){return 0}
test.afterAll(()=>server?.kill()); test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)console.log(serverLog)});
const authMock=`let listener;export const browserLocalPersistence='local';export const inMemoryPersistence='memory';export const browserPopupRedirectResolver={};export function initializeAuth(a,o){if(o.persistence!=='local')throw Error('persistence');return {}};export function getAuth(){return {}};export async function setPersistence(a,p){if(p!=='local')throw Error('persistence');}export function onAuthStateChanged(a,fn){listener=fn;fn(null);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener({uid:'synthetic-owner',getIdToken:async()=>'synthetic-bearer'})};export async function signOut(){listener(null)};`;
test.use({timezoneId:'America/Los_Angeles'});
// R102: rows 18-20 are long_overdue (8+ days); 21+ stay fully_paid. R137: row 18 last paid 8 days ago, row 19 never paid
// (9 days since the first charge), row 20 is a cached pre-R137 row without the field (the R102 days-overdue text).
const statuses=['not_paid','partially_paid','overdue','long_overdue','fully_paid'];
const rows=Array.from({length:27},(_,i)=>({id:'private-board-'+i,displayName:'ผู้กู้ตัวอย่าง - Synthetic '+i,status:i>=21?'fully_paid':i>=18?'long_overdue':statuses[Math.floor(i/7)],overdueDays:i>=18&&i<21?i-10:i>=14&&i<18?2:null,...(i===18?{sinceLastPaymentDays:8,neverPaid:false}:i===19?{sinceLastPaymentDays:9,neverPaid:true}:i===20?{}:{sinceLastPaymentDays:null,neverPaid:null}),amountDue:i>=21?'0':'13.75',amountCollected:i>=21?'0':'3.25',amountRemaining:i>=21?'0':'10.50',prepaidToday:i===22?'100':'0',prepaidOnly:i===22,...(i===22?{prepaidPaymentDate:'2026-10-05'}:{}),...(i>=21?{groupRemaining:'0',groupCollected:'0'}:{})}));
const charges=Array.from({length:27},(_,i)=>({id:'private-charge-'+i,loanId:'private-loan',loanDisplayKey:'ผู้กู้ตัวอย่างชื่อยาว - Long synthetic borrower English name-฿12,000-07/10-2%',chargeDate:'2026-10-07',paymentStatus:'ชำระบางส่วน',paymentDate:null,amountRemaining:i===0?null:'10.50',totalPaid:'0',receivedToday:'-2.50',...(i===1?{paymentStatus:'ชำระแล้ว',paymentDate:'2026-10-06',amountRemaining:'0',totalPaid:'10.50',receivedToday:'0'}:i===2?{paymentStatus:'ชำระแล้ว',paymentDate:'2026-10-07',amountRemaining:'0',totalPaid:'10.50',receivedToday:'10.50'}:{})}));
test('R115 Collection loads one board of up to 100 borrowers; more than 100 shows the board pager; a first-page 400 stays an error',async({page},info)=>{
 if(info.project.name.startsWith('desktop'))await page.setViewportSize({width:1440,height:900});let more=false,firstPage400=false;const board:string[]=[];
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async r=>{const u=new URL(r.request().url());
  if(u.pathname==='/api/collection'){board.push(u.search);
   await r.fulfill({status:firstPage400?400:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(firstPage400?{ok:false,code:'invalid_request'}:{ok:true,source:'dev',businessDate:'2026-10-07',timezone:'Asia/Bangkok',asOf:'2026-10-07T05:00:00Z',items:rows.slice(0,Number(u.searchParams.get('limit'))),nextCursor:more?'synthetic-next':null})}).catch(()=>{});return;}
  await r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,source:'dev',businessDate:'2026-10-07',asOf:'2026-10-07T05:00:00Z',horizonEnd:'2027-01-07',reviewRequired:false,items:[]})}).catch(()=>{});});
 await page.goto(base);await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByRole('button',{name:'Collection',exact:true}).click();
 // All 27 rows (more than the former 25-row page) in one board, a count line, no board pager.
 await expect(page.locator('.collection-compact-tile')).toHaveCount(27);await expect(page.locator('.collection-workspace .list-count')).toHaveText('27 borrowers');
 // COLL-3: the count line lines up with the Left/Right line below it.
 expect(Math.abs((await page.locator('.collection-workspace .list-count').boundingBox())!.x-(await page.locator('.collection-workspace .list-meaning-legend').boundingBox())!.x)).toBeLessThan(1);
 expect(board).toEqual(['?limit=100']);await expect(page.getByRole('button',{name:/Collection page$/})).toHaveCount(0);await expect(page.locator('.collection-workspace .list-more')).toHaveCount(0);
 // COLL-2 (phone): the page scrolls, not an inner list; the last row clears the bottom bar.
 // Below the 1200px section scrollers the page scrolls, not the list, and the last tile clears the bottom navigation.
 if(layout(page)!=='desktop'){const panel=page.locator('.collection-workspace .list-panel');expect(await panel.evaluate(e=>e.scrollHeight<=e.clientHeight+1)).toBe(true);await page.locator('.collection-compact-tile').last().scrollIntoViewIfNeeded();await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const last=(await page.locator('.collection-compact-tile').last().boundingBox())!,bar=await page.locator('.live-bottom-nav').boundingBox();if(bar)expect(last.y+last.height).toBeLessThanOrEqual(bar.y)}
 // R131: a server that still has more rows: the board pager (next only on page 1) and the page range, no hint line.
 more=true;await page.getByRole('button',{name:'Refresh Collection — return to first page'}).click();await expect(page.getByRole('button',{name:'Next borrowers page',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Previous borrowers page',exact:true})).toHaveCount(0);await expect(page.locator('.collection-workspace .list-count')).toHaveText('Borrowers 1–27');await expect(page.locator('.collection-workspace .list-more')).toHaveCount(0);
 // A 400 on the board read stays an error.
 firstPage400=true;await page.getByRole('button',{name:'Refresh Collection — return to first page'}).click();
 await expect(page.getByRole('heading',{name:'Collection is unavailable'})).toBeVisible();
});
test('Collection board child pages financial display rollover errors and route/logout races',async({page},info)=>{
 if(info.project.name.startsWith('desktop'))await page.setViewportSize({width:1440,height:900});async function navigate(name:string){await page.getByRole('button',{name,exact:true}).click();} let code=200,businessDate='2026-10-07',hold=false,release:(()=>void)|undefined;const paths:string[]=[];
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async r=>{const u=new URL(r.request().url());if(u.pathname.endsWith('/upcoming')){await r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,source:'dev',businessDate,asOf:'2026-10-07T05:00:00Z',horizonEnd:'2027-01-07',reviewRequired:false,items:[]})});return;}paths.push(u.pathname+u.search);expect(r.request().method()).toBe('GET');const collection=u.pathname.startsWith('/api/collection'),child=u.pathname.endsWith('/charges');const status=collection?code:200;const day=businessDate;if(collection&&hold)await new Promise<void>(resolve=>release=resolve);const source=child?charges:rows,limit=Number(u.searchParams.get('limit')??25),start=u.searchParams.has('cursor')?Number(u.searchParams.get('cursor')):0;const items=collection?source.slice(start,start+limit):[];await r.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(status===200?{ok:true,source:'dev',businessDate:day,timezone:'Asia/Bangkok',asOf:'2026-10-07T05:00:00Z',items,borrower:rows[0],nextCursor:collection&&start+limit<source.length?String(start+limit):null}:{ok:false,code:status===409?'business_date_changed':'source_unavailable'})}).catch(()=>{})});
 await page.goto(base);await page.getByRole('button',{name:'Continue with Google'}).click();await navigate('Collection');await expect(page.locator('.collection-compact-tile')).toHaveCount(27);await expect(page.locator('.collection-compact-tile').first()).toContainText('฿11');await expect(page.locator('.collection-compact-tile.collection-status-fully_paid').first()).toContainText('฿0');{const prepaid=page.locator('.collection-compact-tile').nth(22);await expect(prepaid.locator('.collection-tile-status')).toContainText('Paid in advance');await expect(prepaid.locator('.collection-tile-status')).toContainText(/05[ -]Oct/);await expect(page.locator('.collection-compact-tile').nth(21).locator('.collection-tile-status')).not.toContainText('Paid in advance');await expect(prepaid.locator('.collection-tile-right strong')).toHaveText('฿100');await expect(page.locator('.record-group-heading.collection-status-fully_paid')).toContainText('Collected ฿0');await expect(page.locator('.collection-compact-tile').nth(21).locator('.collection-tile-status')).toHaveText('Fully paid');await expect(page.locator('.collection-compact-tile').nth(18).locator('.collection-tile-status')).toHaveText('Long overdue · No payment for 8 days');await expect(page.locator('.collection-compact-tile').nth(19).locator('.collection-tile-status')).toHaveText('Long overdue · Never paid · 9 days');await expect(page.locator('.collection-compact-tile').nth(20).locator('.collection-tile-status')).toHaveText('Long overdue · 10 days');await expect(page.locator('.collection-compact-tile').nth(14).locator('.collection-tile-status')).toHaveText('Overdue');await expect(page.locator('.record-group-heading.collection-status-long_overdue>span')).toHaveText('Long overdue');await expect(page.locator('.record-group-heading.collection-status-long_overdue>span')).toHaveCSS('color','rgb(55, 71, 79)')}await expect(page.getByRole('button',{name:/Collection page$/})).toHaveCount(0);await expect(page.locator('.collection-workspace .list-count')).toHaveText('27 borrowers');await page.getByRole('button',{name:'Refresh Collection — return to first page'}).click();await expect(page.locator('.collection-compact-tile')).toHaveCount(27);
 await page.locator('.collection-tile-main').first().click();await expect(page.locator('.collection-charge')).toHaveCount(10);await expect(page.locator('.collection-charge').first()).toContainText('Unavailable');await expect(page.locator('.charge-prepaid-note')).toHaveCount(1);await expect(page.locator('.collection-charge').nth(1).locator('.charge-prepaid-note')).toHaveText('Paid in advance · 06-Oct');await page.locator('.charge-tile-action').first().click();await expect(page.getByRole('article',{name:'Charge detail',exact:true})).toContainText('-฿3');await page.getByRole('button',{name:'Back to charges',exact:true}).click();await page.getByRole('button',{name:'Next charges page',exact:true}).click();await expect(page.locator('.collection-charge')).toHaveCount(10);await page.getByRole('button',{name:'Next charges page',exact:true}).click();await expect(page.locator('.collection-charge')).toHaveCount(7);await expect(page.getByRole('button',{name:'Next charges page',exact:true})).toHaveCount(0);expect(await page.locator('body').innerText()).not.toMatch(/private-(board|charge|loan)|THB/);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/r052-collection-read/${info.project.name}-TRIM-regression-en.png`,fullPage:true});await chooseLanguagePreservingForm(page,'ไทย');await expect(page.getByRole('region',{name:'พื้นที่งานติดตาม'})).toContainText('ยอดเรียกเก็บวันนี้');await page.screenshot({path:`test-results/r052-collection-read/${info.project.name}-TRIM-regression-th.png`,fullPage:true});await chooseLanguagePreservingForm(page,'EN');
 // The live-dev shell keeps verified reads in the owner's offline store; a 5xx refresh then shows the saved charges
 // (APP-OFFLINE saved-read fallback) with the refresh marked failed. Wait for the saved response so the outcome is deterministic.
 await expect.poll(()=>page.evaluate(async()=>{const names=(await indexedDB.databases()).map(d=>d.name!).filter(n=>n.startsWith('mw-credit-dev-owner:'));for(const name of names){const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});const keys=await new Promise<IDBValidKey[]>(resolve=>{const q=db.transaction('records').objectStore('records').getAllKeys();q.onsuccess=()=>resolve(q.result)});db.close();if(keys.some(key=>String(key).startsWith('cache:')&&String(key).includes('/charges?limit=10')))return true}return false})).toBe(true);
 code=503;const unavailable=page.waitForResponse(r=>r.url().includes('/charges?limit=10')&&r.status()===503);await page.getByRole('button',{name:'First charges page / refresh'}).click();await (await unavailable).finished();await expect(page.locator('.collection-update')).toHaveAttribute('data-refresh-state','error');await expect(page.getByText('Showing saved data. Refresh when connected to get the latest.')).toBeVisible();await expect(page.locator('.collection-charge')).toHaveCount(10);await expect(page.getByRole('region',{name:'Collection charge details'})).toContainText(rows[0].displayName);code=200;const restored=page.waitForResponse(r=>r.url().includes('/charges?limit=10')&&r.status()===200);await page.getByRole('button',{name:'First charges page / refresh'}).click();await (await restored).finished();await expect(page.locator('.collection-charge')).toHaveCount(10);await expect(page.locator('.collection-update .live-status-text')).toHaveText('Ready');
 code=409;await page.getByRole('button',{name:'Next charges page'}).click();await expect(page.getByRole('heading',{name:'The business date has changed'})).toBeVisible();await expect(page.locator('.collection-compact-tile,.collection-charge')).toHaveCount(0);code=200;await page.getByRole('button',{name:'Refresh Collection',exact:true}).click();await expect(page.locator('.collection-compact-tile')).toHaveCount(27);await expect(page.locator('.collection-update .live-status-text')).toHaveText('Ready');businessDate='2026-10-08';await page.locator('.collection-tile-main').first().click();await expect(page.getByRole('heading',{name:'The business date has changed'})).toBeVisible();await expect(page.locator('.collection-charge')).toHaveCount(0);await page.getByRole('button',{name:'Refresh Collection',exact:true}).click();await expect(page.locator('.collection-compact-tile')).toHaveCount(27);
 hold=true;await page.locator('.collection-tile-main').first().click();await expect.poll(()=>!!release).toBe(true);await navigate('Borrowers');hold=false;release!();await expect(page.locator('.collection-charge,.collection-compact-tile')).toHaveCount(0);await navigate('Collection');await expect(page.locator('.collection-compact-tile')).toHaveCount(27);hold=true;release=undefined;await page.getByRole('button',{name:'Refresh Collection — return to first page'}).click();await expect.poll(()=>!!release).toBe(true);await signOut(page);release!();await expect(page.getByRole('heading',{name:'Sign in to continue',exact:true})).toBeVisible();await expect(page.locator('.collection-charge,.collection-compact-tile')).toHaveCount(0);expect(paths.filter(x=>x.includes('/loans')).length).toBe(0);
});
// R131 (owner, 6 November 2026): beyond 100 borrowers the Collection board pages like the Borrowers list: previous/next at the
// end of the board, the page range in the count line, the search kept across pages, each page from the top, and Back from a
// borrower on page 2 returns to that tile on page 2.
test('Collection board pager: next and previous 100-borrower pages keep the search and return to the opened tile',async({page},info)=>{
 if(deviceClass(info)!=='tablet')await page.setViewportSize({width:deviceClass(info)==='phone'?390:1440,height:900});
 const board=Array.from({length:150},(_,i)=>({id:'board-'+i,displayName:'ผู้กู้ '+i+' - Board '+i,status:'not_paid',overdueDays:null,amountDue:'10',amountCollected:'0',amountRemaining:'10'}));
 const envelope={ok:true,source:'dev',businessDate:'2026-10-07',timezone:'Asia/Bangkok',asOf:'2026-10-07T05:00:00Z'};const requests:URLSearchParams[]=[];
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async r=>{const u=new URL(r.request().url());let body:any={...envelope,horizonEnd:'2027-01-07',reviewRequired:false,items:[],nextCursor:null};
  if(u.pathname==='/api/collection'){requests.push(u.searchParams);const q=(u.searchParams.get('q')??'').toLowerCase(),list=board.filter(x=>x.displayName.toLowerCase().includes(q)),start=u.searchParams.get('cursor')==='board-2'?100:0;body={...envelope,items:list.slice(start,start+100),nextCursor:list.length>start+100?'board-2':null}}
  else{const charges=/^\/api\/collection\/(board-\d+)\/charges$/.exec(u.pathname);if(charges)body={...envelope,borrower:board.find(x=>x.id===charges[1]),items:[],nextCursor:null}}
  await r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)}).catch(()=>{})});
 await page.goto(base);await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByRole('button',{name:'Collection',exact:true}).click();
 const tile='.collection-tile-main',count=page.locator('.collection-workspace .list-count'),next=page.getByRole('button',{name:'Next borrowers page',exact:true}),previous=page.getByRole('button',{name:'Previous borrowers page',exact:true});
 const top=()=>page.evaluate(()=>window.scrollY+(document.querySelector('.collection-workspace .list-panel') as HTMLElement).scrollTop);
 await expect(page.locator(tile)).toHaveCount(100);await expect(count).toHaveText('Borrowers 1–100');await expect(previous).toHaveCount(0);await expect(page.locator('.collection-workspace .list-more')).toHaveCount(0);
 await next.scrollIntoViewIfNeeded();expect(await top()).toBeGreaterThan(300);await next.click();
 await expect(page.locator(tile)).toHaveCount(50);await expect(page.locator(tile).first()).toContainText('Board 100');await expect(count).toHaveText('Borrowers 101–150');
 expect(requests.at(-1)!.get('cursor')).toBe('board-2');await expect(next).toHaveCount(0);await expect(previous).toBeVisible();await expect.poll(top).toBeLessThan(200);
 // Back from a borrower opened on page 2 returns to that tile on page 2 (the desktop board stays beside the detail).
 const row=page.locator(tile+'[data-record-id="board-140"]');await row.scrollIntoViewIfNeeded();await page.waitForTimeout(100);const before=await row.evaluate(e=>e.getBoundingClientRect().top);
 await row.click();await expect(page.getByRole('button',{name:'Back to Collection',exact:true})).toBeVisible();
 if(!stacked(page))await expect(page.locator(tile)).toHaveCount(50);
 await page.getByRole('button',{name:'Back to Collection',exact:true}).click();
 await expect(page.locator(tile)).toHaveCount(50);await expect(count).toHaveText('Borrowers 101–150');await expect(row).toBeFocused();
 await expect.poll(async()=>Math.abs(await row.evaluate(e=>e.getBoundingClientRect().top)-before)).toBeLessThanOrEqual(3);
 await previous.scrollIntoViewIfNeeded();await previous.click();await expect(page.locator(tile)).toHaveCount(100);await expect(count).toHaveText('Borrowers 1–100');expect(requests.at(-1)!.has('cursor')).toBe(false);await expect.poll(top).toBeLessThan(200);
 // A search keeps its query on the next page; a new search starts again at page 1; one page has no pager and the plain count.
 await page.getByRole('button',{name:'Search borrowers',exact:true}).click();const input=page.getByRole('searchbox',{name:'Search Thai or English name',exact:true});await input.fill('Board');await page.getByRole('button',{name:'Submit search',exact:true}).click();
 await expect(page.locator(tile)).toHaveCount(100);await page.getByRole('button',{name:'Back from search',exact:true}).click();await next.scrollIntoViewIfNeeded();await next.click();await expect(page.locator(tile)).toHaveCount(50);
 expect(requests.at(-1)!.get('q')).toBe('Board');expect(requests.at(-1)!.get('cursor')).toBe('board-2');
 await page.getByRole('button',{name:'Search borrowers',exact:true}).click();await input.fill('Board 14');await page.getByRole('button',{name:'Submit search',exact:true}).click();
 await expect(page.locator(tile)).toHaveCount(11);expect(requests.at(-1)!.has('cursor')).toBe(false);await page.getByRole('button',{name:'Back from search',exact:true}).click();await expect(previous).toHaveCount(0);await expect(next).toHaveCount(0);await expect(count).toHaveText('11 borrowers');
 // A refresh returns to page 1.
 await page.getByRole('button',{name:'Search borrowers',exact:true}).click();await page.getByRole('button',{name:'Clear search',exact:true}).click();await page.getByRole('button',{name:'Back from search',exact:true}).click();
 await expect(page.locator(tile)).toHaveCount(100);await next.scrollIntoViewIfNeeded();await next.click();await expect(count).toHaveText('Borrowers 101–150');
 await page.getByRole('button',{name:'Refresh Collection — return to first page'}).click();await expect(count).toHaveText('Borrowers 1–100');expect(requests.at(-1)!.has('cursor')).toBe(false);
});

// R163 (owner testing): the receipts read always asks for Bangkok today, a day change never empties the shown receipts, and a
// saved answer of another day never starts the early upcoming read. These cases need the owner-testing workspace
// (VITE_COMMAND_MODE=dev-owner-testing), so they run on their own dev server.
test.describe('R163 Collection receipts and the business date',()=>{
 let ownerServer:ChildProcess,ownerBase='',ownerLog='';
 test.beforeAll(async({},info)=>{
  const port=5700+info.workerIndex;ownerBase=`http://127.0.0.1:${port}`;
  ownerServer=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-owner-${port}-${Date.now()}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});
  ownerServer.stdout?.on('data',data=>{ownerLog+=String(data)});ownerServer.stderr?.on('data',data=>{ownerLog+=String(data)});
  await expect.poll(async()=>{try{return(await fetch(ownerBase)).status}catch{return 0}},{timeout:20000}).toBe(200);
 });
 test.afterAll(()=>ownerServer?.kill());test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)console.log(ownerLog)});
 const readOrigin='https://mw-credit-app-read-dev-test.run.app',commandOrigin='https://mw-credit-app-command-dev-test.run.app',cors={'access-control-allow-origin':'*'};
 const day={yesterday:'2026-10-06',today:'2026-10-07',next:'2026-10-08'};
 // Bangkok is UTC+7: 2026-10-07 12:00 Bangkok, and one minute before the next midnight.
 const noon=new Date('2026-10-07T05:00:00Z'),beforeMidnight=new Date('2026-10-07T16:59:00Z'),afterMidnight=new Date('2026-10-07T17:00:30Z');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
 /** The servers: the read origin answers the board, a borrower's charges and the upcoming read for `server.day`; the command
  * origin answers receipts through `server.receipts` (a handler) and everything else with an empty ok answer. */
 function serve(){
  const server={day:day.today,hold:null as null|Promise<void>,holdCharges:null as null|Promise<void>,upcoming:[] as string[],receipts:[] as URL[],receiptsAnswer:(_count:number):{status:number;body:any}=>({status:200,body:{ok:true,businessDate:'',items:[{id:'R-1',paymentDate:'2026-10-05',amount:'10',manualReceiptPresent:true,agentReceiptPresent:false,receiptAt:'2026-10-07T05:00:00Z'}],nextCursor:null}}),holdReceipts:null as null|Promise<void>,answered:[] as string[]};
  const row={id:'board-1',displayName:'ผู้กู้ตัวอย่าง - Synthetic 1',status:'partially_paid',overdueDays:null,amountDue:'20',amountCollected:'10',amountRemaining:'10'};
  const charge={id:'charge-1',loanId:'loan-1',loanDisplayKey:'Synthetic loan',chargeDate:'2026-10-05',paymentStatus:'ชำระบางส่วน',paymentDate:null,amountRemaining:'10',totalPaid:'10',receivedToday:'0'};
  const envelope=()=>({ok:true,source:'dev',businessDate:server.day,timezone:'Asia/Bangkok',asOf:server.day+'T05:00:00Z'});
  const install=async(page:import('@playwright/test').Page)=>{
   await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:authMock}));
   await page.route(readOrigin+'/**',async r=>{
    const u=new URL(r.request().url());let body:any={...envelope(),horizonEnd:'2027-01-07',reviewRequired:false,items:[],nextCursor:null};
    if(u.pathname.endsWith('/upcoming')){server.upcoming.push(u.searchParams.get('businessDate')??'');body={...body,businessDate:u.searchParams.get('businessDate')??server.day,borrower:row}}
    else if(u.pathname.endsWith('/charges')){if(server.holdCharges)await server.holdCharges;body={...envelope(),borrower:row,items:[charge],nextCursor:null}}
    else if(u.pathname==='/api/collection'){if(server.hold)await server.hold;body={...envelope(),items:[row],nextCursor:null}}
    await r.fulfill({contentType:'application/json',headers:cors,body:JSON.stringify(body)}).catch(()=>{});
   });
   await page.route(commandOrigin+'/**',async r=>{
    const u=new URL(r.request().url());
    if(u.pathname.endsWith('/receipt'))return r.fulfill({contentType:'image/png',headers:cors,body:png}).catch(()=>{});
    if(u.pathname.endsWith('/collection-receipts')){
     server.receipts.push(u);if(server.holdReceipts&&server.receipts.length>1)await server.holdReceipts;
     const answer=server.receiptsAnswer(server.receipts.length);server.answered.push(String(answer.status));
     return r.fulfill({status:answer.status,contentType:'application/json',headers:cors,body:JSON.stringify(answer.status===200?{...answer.body,businessDate:u.searchParams.get('businessDate')}:{ok:false,code:answer.status===409?'business_date_changed':'source_unavailable'})}).catch(()=>{});
    }
    if(u.pathname==='/api/dashboard')return r.fulfill({contentType:'application/json',headers:cors,body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})}).catch(()=>{});
    return r.fulfill({contentType:'application/json',headers:cors,body:JSON.stringify({ok:true,item:{language:null},items:[],accounts:[],dates:[]})}).catch(()=>{});
   });
  };
  return {server,install};
 }
 async function openBorrower(page:import('@playwright/test').Page){
  await page.setViewportSize({width:1440,height:900});await page.goto(ownerBase);await page.getByRole('button',{name:'Continue with Google'}).click();
  await page.getByRole('button',{name:'Collection',exact:true}).filter({visible:true}).first().click();
  await page.locator('.collection-tile-main').first().click();
 }
 const receiptsRegion=(page:import('@playwright/test').Page)=>page.getByRole('region',{name:'Collection receipts'});
 const errorHeading=(page:import('@playwright/test').Page)=>page.getByRole('heading',{name:/^(Collection is unavailable|The business date has changed)$/});
 const bangkokDays=(urls:URL[])=>urls.map(url=>url.searchParams.get('businessDate'));

 test('a saved answer of yesterday with a live answer of today: receipts ask for today, no upcoming read for yesterday, no error',async({page})=>{
  const {server,install}=serve();await page.clock.install({time:noon});await install(page);
  // First visit: the server is still on yesterday (as an old saved answer would be); wait until the charges answer is saved.
  server.day=day.yesterday;await openBorrower(page);await expect(page.locator('.collection-charge')).toHaveCount(1);
  await expect.poll(()=>page.evaluate(async()=>{const names=(await indexedDB.databases()).map(d=>d.name!).filter(n=>n.startsWith('mw-credit-dev-owner:'));for(const name of names){const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});const keys=await new Promise<IDBValidKey[]>(resolve=>{const q=db.transaction('records').objectStore('records').getAllKeys();q.onsuccess=()=>resolve(q.result)});db.close();if(keys.some(key=>String(key).startsWith('cache:')&&String(key).includes('/charges?limit=10')))return true}return false})).toBe(true);
  // Reload on the new day: the saved charges (yesterday) show first while the live charges answer (today) is held.
  await expect.poll(()=>server.upcoming.includes(day.yesterday)).toBe(true);await page.waitForTimeout(300);
  server.day=day.today;server.upcoming.length=0;server.receipts.length=0;let release:()=>void=()=>{};server.holdCharges=new Promise<void>(resolve=>{release=resolve});
  await page.reload();await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByRole('button',{name:'Collection',exact:true}).filter({visible:true}).first().click();await page.locator('.collection-tile-main').first().click();
  await expect(page.locator('.collection-charge')).toHaveCount(1);await expect(receiptsRegion(page).locator('.collection-receipt-card')).toHaveCount(1);
  expect(server.upcoming,'the saved answer of yesterday starts no upcoming read').not.toContain(day.yesterday);
  release();await expect.poll(()=>server.upcoming.includes(day.today)).toBe(true);
  expect(server.upcoming).not.toContain(day.yesterday);expect(bangkokDays(server.receipts).every(value=>value===day.today),JSON.stringify(bangkokDays(server.receipts))).toBe(true);
  await expect(errorHeading(page)).toHaveCount(0);await expect(receiptsRegion(page).getByRole('alert')).toHaveCount(0);
 });

 test('a receipts 409 business_date_changed is asked again once, silently',async({page})=>{
  const {server,install}=serve();await page.clock.install({time:noon});await install(page);
  server.receiptsAnswer=count=>count===1?{status:409,body:{}}:{status:200,body:{ok:true,items:[{id:'R-1',paymentDate:'2026-10-05',amount:'10',manualReceiptPresent:true,agentReceiptPresent:false,receiptAt:'2026-10-07T05:00:00Z'}],nextCursor:null}};
  await openBorrower(page);
  await expect(receiptsRegion(page).locator('.collection-receipt-card')).toHaveCount(1);
  expect(server.receipts.length,'one request, one silent retry').toBe(2);expect(bangkokDays(server.receipts)).toEqual([day.today,day.today]);expect(server.answered).toEqual(['409','200']);
  await expect(page.getByText('Receipts unavailable.')).toHaveCount(0);await expect(receiptsRegion(page).getByRole('alert')).toHaveCount(0);
 });

 test('a second 409 shows the alert; Retry receipts asks for today again and recovers',async({page})=>{
  const {server,install}=serve();await page.clock.install({time:noon});await install(page);
  server.receiptsAnswer=()=>({status:409,body:{}});
  await openBorrower(page);
  await expect(page.getByText('Receipts unavailable.')).toBeVisible();expect(server.receipts.length).toBe(2);
  const before=server.receipts.length;server.receiptsAnswer=()=>({status:200,body:{ok:true,items:[{id:'R-1',paymentDate:'2026-10-05',amount:'10',manualReceiptPresent:true,agentReceiptPresent:false,receiptAt:'2026-10-07T05:00:00Z'}],nextCursor:null}});
  await page.getByRole('button',{name:'Retry receipts'}).click();
  await expect(receiptsRegion(page).locator('.collection-receipt-card')).toHaveCount(1);await expect(page.getByText('Receipts unavailable.')).toHaveCount(0);
  expect(server.receipts.length).toBe(before+1);expect(bangkokDays(server.receipts.slice(before))).toEqual([day.today]);
 });

 test('across Bangkok midnight, coming back to the app reloads the receipts quietly and the shown ones stay',async({page})=>{
  const {server,install}=serve();await page.clock.install({time:beforeMidnight});await install(page);
  await openBorrower(page);
  await expect(receiptsRegion(page).locator('.collection-receipt-card')).toHaveCount(1);expect(bangkokDays(server.receipts)).toEqual([day.today]);
  // The day turns while the app is in the background; the new day's answer is held so the intermediate state can be seen.
  let release:()=>void=()=>{};server.holdReceipts=new Promise<void>(resolve=>{release=resolve});
  await page.clock.setSystemTime(afterMidnight);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(()=>server.receipts.length).toBe(2);expect(bangkokDays(server.receipts)).toEqual([day.today,day.next]);
  await expect(receiptsRegion(page).locator('.collection-receipt-card'),'the shown receipts stay while the new day loads').toHaveCount(1);await expect(page.getByText('Receipts unavailable.')).toHaveCount(0);
  release();await expect(receiptsRegion(page).locator('.collection-receipt-card')).toHaveCount(1);await expect(page.getByText('Receipts unavailable.')).toHaveCount(0);
  // A second return on the same day asks nothing more.
  await expect.poll(()=>server.answered.length).toBe(2);await page.waitForTimeout(300);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(300);expect(server.receipts.length).toBe(2);
 });
});
// R182 (COL-OVD-01, COL-TOP-01): the overdue tile text and the active Collection tab going to the top of the board.
const r182Row=(id:string,name:string,status:string,extra:Record<string,unknown>={})=>({id,displayName:name,status,overdueDays:status.endsWith('overdue')?3:null,amountDue:'13.75',amountCollected:'3.25',amountRemaining:'10.50',prepaidToday:'0',prepaidOnly:false,...extra});
async function r182Shell(page:import('@playwright/test').Page,board:(u:URL)=>unknown,detail?:(u:URL)=>unknown){
 const envelope={ok:true,source:'dev',businessDate:'2026-10-07',timezone:'Asia/Bangkok',asOf:'2026-10-07T05:00:00Z'};
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async r=>{const u=new URL(r.request().url());
  const body=u.pathname==='/api/collection'?{...envelope,...(board(u) as object)}:u.pathname.endsWith('/charges')&&detail?{...envelope,...(detail(u) as object)}:{...envelope,horizonEnd:'2027-01-07',reviewRequired:false,items:[]};
  await r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)}).catch(()=>{})});
 await page.goto(base);await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByRole('button',{name:'Collection',exact:true}).click();
}
test('R182 an Overdue tile shows the since-last-payment text like a Long overdue tile; without a value it stays plain Overdue',async({page},info)=>{
 if(info.project.name.startsWith('desktop'))await page.setViewportSize({width:1440,height:900});
 const items=[r182Row('o-today','Paid today','overdue',{sinceLastPaymentDays:0,neverPaid:false}),r182Row('o-yesterday','Paid yesterday','overdue',{sinceLastPaymentDays:1,neverPaid:false}),
  r182Row('o-three','Paid three days ago','overdue',{sinceLastPaymentDays:3,neverPaid:false}),r182Row('o-seven','Paid seven days ago','overdue',{sinceLastPaymentDays:7,neverPaid:false}),
  r182Row('o-never1','Never paid one day','overdue',{sinceLastPaymentDays:1,neverPaid:true}),r182Row('o-never5','Never paid five days','overdue',{sinceLastPaymentDays:5,neverPaid:true}),
  r182Row('o-null','No usable date','overdue',{sinceLastPaymentDays:null,neverPaid:null}),r182Row('o-old','Older payload','overdue'),
  r182Row('l-ten','Long ten','long_overdue',{sinceLastPaymentDays:10,neverPaid:false}),r182Row('l-old','Long older payload','long_overdue',{overdueDays:12})];
 await r182Shell(page,()=>({items,nextCursor:null}));
 const status=page.locator('.collection-compact-tile .collection-tile-status');await expect(status).toHaveCount(10);
 await expect(status).toHaveText(['Overdue · Last paid today','Overdue · Last paid yesterday','Overdue · No payment for 3 days','Overdue · No payment for 7 days','Overdue · Never paid · 1 day','Overdue · Never paid · 5 days','Overdue','Overdue','Long overdue · No payment for 10 days','Long overdue · 12 days']);
 // The text wraps naturally: no ellipsis and no sideways page scroll at 320px.
 await page.setViewportSize({width:320,height:700});
 expect(await status.nth(5).evaluate(e=>[getComputedStyle(e).textOverflow,e.scrollWidth<=e.clientWidth+1])).toEqual(['clip',true]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await chooseLanguagePreservingForm(page,'ไทย');
 await expect(status).toHaveText(['เกินกำหนด · ชำระล่าสุดวันนี้','เกินกำหนด · ชำระล่าสุดเมื่อวาน','เกินกำหนด · ไม่ได้ชำระมา 3 วัน','เกินกำหนด · ไม่ได้ชำระมา 7 วัน','เกินกำหนด · ยังไม่เคยชำระ · 1 วัน','เกินกำหนด · ยังไม่เคยชำระ · 5 วัน','เกินกำหนด','เกินกำหนด','เกินกำหนดนาน · ไม่ได้ชำระมา 10 วัน','เกินกำหนดนาน · 12 วัน']);
});
test('R182 tapping the active Collection tab goes to the top: page 1 again from a later page with the search kept, a scroll only on page 1, and out of an open borrower on the stacked layout',async({page},info)=>{
 if(info.project.name.startsWith('desktop'))await page.setViewportSize({width:1440,height:900});
 const requests:URLSearchParams[]=[],charges:string[]=[];
 const all=Array.from({length:130},(_,i)=>r182Row('top-'+i,'Board '+String(i).padStart(3,'0'),'not_paid'));
 await r182Shell(page,u=>{requests.push(u.searchParams);const second=u.searchParams.get('cursor')==='board-2';return {items:second?all.slice(100):all.slice(0,100),nextCursor:second?null:'board-2'}},
  u=>{charges.push(u.pathname);return {borrower:all[40],items:[{id:'top-charge',loanId:'top-loan',loanDisplayKey:'Synthetic loan',chargeDate:'2026-10-07',paymentStatus:'รอชำระ',paymentDate:null,amountRemaining:'10.50',totalPaid:'0',receivedToday:'0'}],nextCursor:null}});
 const tile='.collection-compact-tile',count=page.locator('.collection-workspace .list-count'),tab=page.getByRole('button',{name:'Collection',exact:true}).filter({visible:true});
 const position=()=>page.evaluate(()=>[Math.round(scrollY),Math.round(document.querySelector('.collection-workspace .list-panel')!.scrollTop)]);
 const scrollDown=async()=>{await page.evaluate(()=>{const panel=document.querySelector('.collection-workspace .list-panel')!;panel.scrollTop=panel.scrollHeight;scrollTo(0,document.documentElement.scrollHeight)});expect((await position()).some(value=>value>200)).toBe(true)};
 await expect(page.locator(tile)).toHaveCount(100);
 // A search, then page 2, scrolled down.
 await page.getByRole('button',{name:'Search borrowers',exact:true}).click();await page.getByRole('searchbox',{name:'Search Thai or English name',exact:true}).fill('Board');await page.getByRole('button',{name:'Submit search',exact:true}).click();
 await expect.poll(()=>requests.at(-1)!.get('q')).toBe('Board');await page.getByRole('button',{name:'Back from search',exact:true}).click();
 const next=page.getByRole('button',{name:'Next borrowers page',exact:true});await next.scrollIntoViewIfNeeded();await next.click();await expect(count).toHaveText('Borrowers 101–130');
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
 // The tab on a later page: page 1 again, search kept, at the top; focus stays on the tab.
 await tab.click();await expect(count).toHaveText('Borrowers 1–100');expect([requests.at(-1)!.get('q'),requests.at(-1)!.has('cursor')]).toEqual(['Board',false]);
 await expect.poll(position).toEqual([0,0]);await expect(tab).toBeFocused();
 // The tab on page 1: a scroll to the top only, no read.
 await scrollDown();const reads=requests.length;await tab.click();await expect.poll(position).toEqual([0,0]);expect(requests.length).toBe(reads);await expect(page.locator(tile)).toHaveCount(100);
 // An open borrower: the stacked layout returns to the board at the top; wider layouts keep the selection and scroll the list.
 await page.locator(tile).nth(40).scrollIntoViewIfNeeded();await page.locator('.collection-tile-main').nth(40).click();await expect(page.locator('.collection-charge')).toHaveCount(1);expect(charges.length).toBeGreaterThan(0);
 const before=requests.length;
 if(stacked(page)){await expect(page.locator(tile).first()).toBeHidden();await tab.click();await expect(page.locator(tile+'.selected')).toHaveCount(0);await expect(page.locator(tile).first()).toBeVisible();await expect(page.locator('.collection-charge')).toHaveCount(0)}
 else{await scrollDown();await tab.click();await expect(page.locator(tile+'.selected')).toHaveCount(1);await expect(page.locator('.collection-charge')).toHaveCount(1)}
 await expect.poll(position).toEqual([0,0]);expect(requests.length).toBe(before);
});
