import {chooseLanguage,chooseLanguagePreservingForm,routeSyntheticPreferences} from './live-controls';
import {test,expect,type Page} from './fixtures/test';
import {spawn,type ChildProcess} from 'node:child_process';
// R146 group chat summary: the collection detail card and the list mark, on a mocked read API. Invented text only.
// R150: the card's times follow the browser's time zone. The device clock is fixed at 12 November 2026 08:00 UTC and the
// browser runs in America/Los_Angeles (00:00 on 12 November there, 15:00 in Bangkok), so a summary generated at 07:32 UTC
// is "yesterday" here (a date) though it would be "today 14:32" in Bangkok.
let server:ChildProcess;let base:string;let serverLog="";
test.beforeAll(async({},info)=>{
 const port=5600+info.workerIndex;base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-${port}-${Date.now()}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app'},stdio:'pipe'});
 server.stdout?.on("data",data=>{serverLog+=String(data)});server.stderr?.on("data",data=>{serverLog+=String(data)});
 await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200);
});
test.afterAll(()=>server?.kill()); test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)console.log(serverLog)});
const authMock=`let listener;export const browserLocalPersistence='local';export const inMemoryPersistence='memory';export const browserPopupRedirectResolver={};export function initializeAuth(a,o){if(o.persistence!=='local')throw Error('persistence');return {}};export function getAuth(){return {}};export async function setPersistence(a,p){if(p!=='local')throw Error('persistence');}export function onAuthStateChanged(a,fn){listener=fn;fn(null);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener({uid:'synthetic-owner',getIdToken:async()=>'synthetic-bearer'})};export async function signOut(){listener(null)};`;
test.use({timezoneId:'America/Los_Angeles'});
const NOW='2026-11-12T08:00:00Z';
const fresh='2026-11-12T06:10:00.000Z',stale='2026-11-08T03:00:00.000Z';
const long='ผู้กู้ตัวอย่างชื่อยาวมาก - Long synthetic borrower English name for wrapping';
const board=[
 {id:'chat-a',displayName:long,chatSummaryAt:fresh},
 {id:'chat-b',displayName:'Stale summary - Synthetic B',chatSummaryAt:stale},
 {id:'chat-c',displayName:'No summary - Synthetic C',chatSummaryAt:null},
 {id:'chat-d',displayName:'One language - Synthetic D',chatSummaryAt:fresh},
 {id:'chat-e',displayName:'Older payload - Synthetic E'},
 {id:'chat-f',displayName:'ผู้กู้ตัวอย่างชื่อยาวมากเป็นพิเศษสุดๆ',chatSummaryAt:fresh},
].map(row=>({status:'not_paid',overdueDays:null,sinceLastPaymentDays:null,neverPaid:null,amountDue:'1200',amountCollected:'0',amountRemaining:'1200',prepaidToday:'0',prepaidOnly:false,...row}));
const summaries:Record<string,unknown>={
 'chat-a':{headline:{th:'ผู้กู้ขอเลื่อนจ่าย 2,000 เป็นวันศุกร์ หุ้นส่วนตกลง',en:'Borrower asks to pay 2,000 on Friday instead of today; partner agreed.'},
  points:[{speaker:{role:'borrower',borrowerId:'chat-a'},th:'เงินเดือนออกช้า จะโอนวันศุกร์',en:'Salary is late this week, will transfer on Friday.'},
   {speaker:{role:'partner'},th:'ตกลง และเตือนว่าค่าปรับยังเดินอยู่',en:'Agreed, and reminded that the late charge keeps running.'},
   {speaker:{role:'referrer',borrowerId:'chat-x'},th:'บอกว่าจะไปตามเองถ้าวันศุกร์ยังไม่โอน',en:'Says they will follow up in person if Friday passes. See https://example.invalid/not-a-link'},
   {speaker:{role:'borrower',borrowerId:'chat-z'},th:'ผู้กู้อีกรายถามเรื่องยอดของตัวเอง',en:'Another borrower asked about their own balance.'}],
  lastSpeaker:{role:'referrer',borrowerId:'chat-x'},lastMessageAt:fresh,generatedAt:'2026-11-12T07:32:00.000Z',messageCount:14,shared:true},
 'chat-b':{headline:{th:'ผู้กู้ขอเลื่อนจ่ายเป็นวันศุกร์',en:'Borrower asked to pay on Friday.'},points:[{speaker:{role:'business'},th:'ขอให้ยืนยันวันใหม่',en:'Asked to confirm the new date.'}],
  lastSpeaker:{role:'business'},lastMessageAt:stale,generatedAt:'2026-11-08T03:20:00.000Z',messageCount:4,shared:false},
 'chat-d':{headline:{th:'มีเฉพาะภาษาไทยในหัวข้อนี้',en:''},points:[{speaker:{role:'other'},th:'',en:'Only English in this point.'},{speaker:{role:'partner'},th:'ตกลง',en:'Agreed.'}],
  lastSpeaker:{role:'partner'},lastMessageAt:fresh,generatedAt:'2026-11-11T09:00:00.000Z',messageCount:2,shared:false},
};
const envelope={ok:true,source:'dev',businessDate:'2026-11-12',timezone:'Asia/Bangkok',asOf:NOW};
// R158: links adds the group links (chatUrl, chatInviteUrl) to board items, as the read service does.
async function open(page:Page,{desktop,replace={},now=NOW,links={},width,boardRows=board}:{desktop:boolean;replace?:Record<string,unknown>;now?:string;links?:Record<string,Record<string,string>>;width?:number;boardRows?:typeof board}){
 const rows=boardRows.map(row=>({...row,...(links[row.id]??{})}));
 if(desktop)await page.setViewportSize({width:1440,height:900});if(width)await page.setViewportSize({width,height:780});
 await page.clock.setFixedTime(new Date(now));
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:authMock}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',async r=>{const u=new URL(r.request().url()),json=(body:unknown)=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)}).catch(()=>{});
  if(u.pathname==='/api/collection')return json({...envelope,items:rows,nextCursor:null});
  const charges=/^\/api\/collection\/([^/]+)\/charges$/.exec(u.pathname);
  if(charges){const id=decodeURIComponent(charges[1]),source={...summaries,...replace};
   // chat-e answers like a payload from before R146: no groupChat key at all.
   return json({...envelope,borrower:rows.find(row=>row.id===id),items:[{id:'charge-'+id,loanId:'loan-'+id,loanDisplayKey:'Synthetic loan',chargeDate:'2026-11-12',paymentStatus:'รอชำระ',paymentDate:null,amountRemaining:'1200',totalPaid:'0',receivedToday:'0'}],nextCursor:null,...(id==='chat-e'?{}:{groupChat:source[id]??null})});}
  return json({...envelope,horizonEnd:'2027-02-12',reviewRequired:false,items:[]});});
 await page.goto(base);await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByRole('button',{name:'Collection',exact:true}).click();
 await expect(page.locator('.collection-compact-tile')).toHaveCount(rows.length);
}
const tile=(page:Page,id:string)=>page.locator(`.collection-tile-main[data-record-id="${id}"]`);
const card=(page:Page)=>page.locator('.collection-chat-summary');
const back=(page:Page)=>page.getByRole('button',{name:/^(Back to Collection|กลับงานติดตาม)$/}).click();

test('list mark and card: hidden without a summary, everything shown without an expander, role colours, local times, stale, language fallback, mark cleared when the card renders',async({page},info)=>{
 const desktop=info.project.name.startsWith('desktop');await open(page,{desktop});
 // The mark: a fresh summary this device has not shown. Not for a stale summary, none, or an older payload.
 for(const id of ['chat-a','chat-d']){await expect(tile(page,id).locator('strong .collection-chat-mark')).toHaveCount(1);await expect(tile(page,id).locator('.visually-hidden')).toHaveText(', New group chat summary')}
 for(const id of ['chat-b','chat-c','chat-e'])await expect(tile(page,id).locator('.collection-chat-mark')).toHaveCount(0);
 // R157 (owner, 14 November 2026: "the new summary icon is not obvious enough"; Echo's variant B): a 22px blue circle with
 // the chat icon in white, a heavier stroke; still hidden from readers (the visually hidden text names it).
 expect(await tile(page,'chat-a').locator('.collection-chat-mark').evaluate(node=>{const s=getComputedStyle(node);return {background:s.backgroundColor,color:s.color,radius:s.borderTopLeftRadius,stroke:s.strokeWidth,padding:s.paddingTop}})).toEqual({background:'rgb(11, 87, 208)',color:'rgb(255, 255, 255)',radius:'50%',stroke:'2.5px',padding:'4px'});
 // The mark does not make a tile taller: a short name with the mark is as tall as a short name without it.
 {const [marked,plain]=await Promise.all([tile(page,'chat-d'),tile(page,'chat-b')].map(async locator=>(await locator.boundingBox())!.height));expect(Math.abs(marked-plain)).toBeLessThanOrEqual(1)}
 // The badge is drawn whole: inside its tile, and no clipping ancestor cuts it.
 {const mark=tile(page,'chat-d').locator('.collection-chat-mark'),box=(await mark.boundingBox())!,row=(await tile(page,'chat-d').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(row.y);expect(box.y+box.height).toBeLessThanOrEqual(row.y+row.height);
  // No ancestor that clips its overflow (up to the page) cuts the badge's box.
  expect(await mark.evaluate(node=>{const own=node.getBoundingClientRect();for(let parent=node.parentElement;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(style.overflowX==='visible'&&style.overflowY==='visible')continue;const box=parent.getBoundingClientRect();if(own.top<box.top-0.5||own.bottom>box.bottom+0.5||own.left<box.left-0.5||own.right>box.right+0.5)return parent.className||parent.tagName}return 'none'})).toBe('none')}
 await expect(tile(page,'chat-a').locator('.collection-chat-mark')).toHaveAttribute('aria-hidden','true');
 {const mark=(await tile(page,'chat-a').locator('.collection-chat-mark').boundingBox())!;expect(Math.round(mark.width)).toBe(22);expect(Math.round(mark.height)).toBe(22);
  // The mark adds no column: it sits inside the name, within the tile's left part.
  const name=(await tile(page,'chat-a').locator('strong').boundingBox())!;expect(mark.x).toBeGreaterThanOrEqual(name.x-1);expect(mark.x+mark.width).toBeLessThanOrEqual(name.x+name.width+1);
  // UX-CHAT-06: the icon is glued to the name's last word (same line), whatever the width; the row keeps its height when the mark clears.
  const end=tile(page,'chat-a').locator('.collection-chat-name-end');await expect(end).toHaveText('wrapping');expect(await end.evaluate(node=>getComputedStyle(node).whiteSpace)).toBe('nowrap');
  // A long name without a space is cut on a grapheme boundary: the no-wrap tail starts on a Thai base letter, never on a
  // vowel or tone mark, and the whole name still reads unchanged.
  const thaiEnd=tile(page,'chat-f').locator('.collection-chat-name-end'),tail=(await thaiEnd.textContent())!;expect(tail).toMatch(/^[\u0E01-\u0E2E]/);expect(tail).not.toMatch(/^\p{M}/u);expect([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(tail)].length).toBe(8);
  await expect(tile(page,'chat-f').locator('strong')).toHaveText('ผู้กู้ตัวอย่างชื่อยาวมากเป็นพิเศษสุดๆ');
  const original=page.viewportSize()!;for(const width of [320,360,390,412,440,original.width]){await page.setViewportSize({width,height:original.height});const word=(await end.boundingBox())!,icon=(await tile(page,'chat-a').locator('.collection-chat-mark').boundingBox())!;/* R157: the 22px circle is taller than the text box, so its centre (not its edges) lies on the last word's line. */const middle=icon.y+icon.height/2;expect(middle,'mark on the last word\'s line at '+width).toBeGreaterThanOrEqual(word.y);expect(middle).toBeLessThanOrEqual(word.y+word.height);expect(word.height).toBeLessThan(40)}}
 // No summary: no card, no placeholder.
 await tile(page,'chat-c').click();await expect(page.locator('.collection-charge')).toHaveCount(1);await expect(card(page)).toHaveCount(0);await expect(page.getByRole('heading',{name:'Group chat summary'})).toHaveCount(0);
 if(!desktop)await back(page);
 await tile(page,'chat-e').click();await expect(page.locator('.collection-charge')).toHaveCount(1);await expect(card(page)).toHaveCount(0);if(!desktop)await back(page);
 // R150: title, freshness, headline, all four points and the last-message line, always; no expander. Both times fall on
 // 11 November in this browser's zone (today is the 12th here), so both show the date.
 await tile(page,'chat-a').click();await expect(card(page)).toBeVisible();
 await expect(card(page).getByRole('heading',{level:3,name:'Group chat summary'})).toBeVisible();
 const meta=card(page).locator('.collection-chat-meta');
 await expect(meta.first()).toHaveText('Updated 11-Nov · last 3 days');await expect(meta.last()).toHaveText('Last message: Referrer · 11-Nov');
 await expect(card(page).getByRole('button')).toHaveCount(0);await expect(card(page)).not.toContainText(/Show (more|less)/);
 await expect(card(page).locator('[aria-expanded],[aria-controls]')).toHaveCount(0);await expect(card(page).locator('.collection-chat-foot,.collection-chat-toggle')).toHaveCount(0);
 // UX-CHAT-04: the point tags are 13px; the shared tag rule (the Shared group label) stays 12px.
 expect(await card(page).locator('.collection-chat-points .expense-payee-tag').first().evaluate(node=>getComputedStyle(node).fontSize)).toBe('13px');expect(await card(page).locator('.collection-chat-heading .expense-payee-tag').evaluate(node=>getComputedStyle(node).fontSize)).toBe('12px');
 await expect(card(page).locator('.collection-chat-headline')).toHaveText('Borrower asks to pay 2,000 on Friday instead of today; partner agreed.');
 await expect(card(page).locator('.collection-chat-heading .expense-payee-tag')).toHaveText('Shared group');
 const points=card(page).locator('.collection-chat-points li');await expect(points).toHaveCount(4);
 await expect(points.nth(0).locator('.expense-payee-tag')).toHaveText('Borrower');await expect(points.nth(1).locator('.expense-payee-tag')).toHaveText('Partner');
 await expect(points.nth(0).locator('.visually-hidden')).toHaveText('Borrower: ');await expect(points.nth(0).locator('.expense-payee-tag')).toHaveAttribute('aria-hidden','true');
 // Position: below the amounts, above today's charges; no border, shadow or tint.
 {const amounts=(await page.locator('.collection-amounts').boundingBox())!,box=(await card(page).boundingBox())!,heading=(await page.locator('.collection-charges-heading').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(amounts.y+amounts.height-1);expect(heading.y).toBeGreaterThanOrEqual(box.y+box.height-1);
  expect(await card(page).evaluate(node=>{const s=getComputedStyle(node);return [s.borderTopWidth,s.boxShadow,s.backgroundColor]})).toEqual(['0px','none','rgba(0, 0, 0, 0)'])}
 await expect(points.nth(2).locator('.expense-payee-tag')).toHaveText('Referrer');await expect(points.nth(3).locator('.expense-payee-tag')).toHaveText('Other borrower');
 // R150 role colours: each tag carries its role class, keeps the outline pill and takes its colour (text and border)
 // from that role's custom property; the role in the last-message line has the same class and colour. Every colour is
 // at least 4.5:1 on the panel, differs from the others and is none of the payment-status colours.
 {const tags=card(page).locator('.collection-chat-points .expense-payee-tag');
  await expect(tags).toHaveClass([/(^| )chat-role chat-role-borrower( |$)/,/(^| )chat-role chat-role-partner( |$)/,/(^| )chat-role chat-role-referrer( |$)/,/(^| )chat-role chat-role-other-borrower( |$)/]);
  const style=(locator:import('@playwright/test').Locator)=>locator.evaluate(node=>{const s=getComputedStyle(node);return {color:s.color,border:s.borderTopColor,width:s.borderTopWidth,radius:s.borderTopLeftRadius,background:s.backgroundColor,weight:s.fontWeight}});
  const seen=await Promise.all([0,1,2,3].map(index=>style(tags.nth(index))));
  expect(seen.map(tag=>tag.color)).toEqual(['rgb(29, 95, 168)','rgb(106, 98, 0)','rgb(163, 51, 111)','rgb(74, 79, 176)']);
  // UX-CHAT-10: Borrower and Partner, the two roles that speak most, are far apart (blue against olive).
  {const [a,b]=[seen[0].color,seen[1].color].map(value=>value.match(/\d+/g)!.slice(0,3).map(Number));expect(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])).toBeGreaterThan(150)}
  for(const tag of seen){expect(tag.border).toBe(tag.color);expect(tag.width).toBe('1px');expect(tag.radius).toBe('10px');expect(tag.background).toBe('rgba(0, 0, 0, 0)')}
  const role=card(page).locator('.collection-chat-last-role');await expect(role).toHaveText('Referrer');await expect(role).toHaveClass(/(^| )chat-role chat-role-referrer( |$)/);
  expect(await style(role)).toMatchObject({color:'rgb(163, 51, 111)',weight:'600'});
  // The six values as the stylesheet defines them, against the background the card is painted on.
  const palette=await card(page).evaluate(node=>{
   const names=['borrower','other-borrower','partner','referrer','business','other'],probe=document.createElement('span');node.appendChild(probe);
   const colours=names.map(name=>{probe.className='chat-role chat-role-'+name;return getComputedStyle(probe).color});probe.remove();
   let behind='rgba(0, 0, 0, 0)';for(let element:Element|null=node;element&&behind==='rgba(0, 0, 0, 0)';element=element.parentElement)behind=getComputedStyle(element).backgroundColor;
   return {colours,behind}});
  const rgb=(value:string)=>value.match(/\d+/g)!.slice(0,3).map(Number),luminance=(value:string)=>{const [r,g,b]=rgb(value).map(channel=>{const c=channel/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4});return 0.2126*r+0.7152*g+0.0722*b};
  const contrast=(a:string,b:string)=>{const [high,low]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (high+0.05)/(low+0.05)};
  expect(palette.behind).toBe('rgb(255, 255, 255)');expect(new Set(palette.colours).size).toBe(6);
  for(const colour of palette.colours)expect(contrast(colour,palette.behind),colour).toBeGreaterThanOrEqual(4.5);
  // Payment-status colours: not paid, partially paid (both shades), overdue, long overdue, fully paid.
  const status=['rgb(198, 40, 40)','rgb(160, 80, 0)','rgb(184, 92, 0)','rgb(123, 31, 162)','rgb(55, 71, 79)','rgb(35, 123, 57)'];
  for(const colour of palette.colours)for(const other of status){const [a,b]=[rgb(colour),rgb(other)];expect(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]),colour+' against '+other).toBeGreaterThan(40)}
 }
 // Plain text: a URL in the summary is not a link; long text wraps inside the panel.
 await expect(card(page).locator('a')).toHaveCount(0);await expect(points.nth(2)).toContainText('https://example.invalid/not-a-link');
 {const panel=(await page.locator('.detail-panel').boundingBox())!,box=(await card(page).boundingBox())!;expect(box.x+box.width).toBeLessThanOrEqual(panel.x+panel.width+1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true)}
 // The card rendering this version cleared the mark (without a reload); other borrowers keep theirs.
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('mw-credit.chat-seen:')).map(key=>JSON.parse(localStorage.getItem(key)!)))).toEqual([{'chat-a':'2026-11-12T06:10:00.000Z'}]);
 if(!desktop)await back(page);
 await expect(tile(page,'chat-a').locator('.collection-chat-mark')).toHaveCount(0);await expect(tile(page,'chat-a').locator('.visually-hidden')).toHaveCount(0);await expect(tile(page,'chat-d').locator('.collection-chat-mark')).toHaveCount(1);
 // Stale: muted, "Last conversation" replaces the freshness line, headline and points still readable, no expander.
 await tile(page,'chat-b').click();await expect(card(page)).toHaveClass(/stale/);
 await expect(card(page).locator('.collection-chat-meta').first()).toHaveText('Last conversation 07-Nov');await expect(card(page)).not.toContainText('Updated');
 await expect(card(page).locator('.collection-chat-headline')).toHaveText('Borrower asked to pay on Friday.');await expect(card(page).locator('.collection-chat-points li')).toHaveCount(1);
 await expect(card(page).locator('.collection-chat-points .expense-payee-tag')).toHaveText('MW Credit');await expect(card(page).locator('.collection-chat-points .expense-payee-tag')).toHaveClass(/chat-role-business/);
 // UX-CHAT-02: a stale card has no last-message line (the Last conversation line carries the date).
 await expect(card(page).locator('.collection-chat-meta')).toHaveCount(1);await expect(card(page)).not.toContainText('Last message');await expect(card(page).locator('.collection-chat-foot')).toHaveCount(0);
 await expect(card(page).getByRole('button')).toHaveCount(0);await expect(card(page).locator('.collection-chat-heading .expense-payee-tag')).toHaveCount(0);
 if(!desktop)await back(page);
 // Language fallback: a missing language shows the other one; generated on another day shows the date.
 await tile(page,'chat-d').click();await expect(card(page).locator('.collection-chat-headline')).toHaveText('มีเฉพาะภาษาไทยในหัวข้อนี้');
 await expect(card(page).locator('.collection-chat-meta').first()).toHaveText('Updated 11-Nov · last 3 days');
 await expect(card(page).locator('.collection-chat-points li').first()).toContainText('Only English in this point.');await expect(card(page).locator('.collection-chat-points .expense-payee-tag').first()).toHaveText('Other');await expect(card(page).locator('.collection-chat-points .expense-payee-tag').first()).toHaveClass(/chat-role-other( |$)/);
 if(!desktop)await back(page);
 // Thai copy.
 await chooseLanguage(page,'ไทย');
 await expect(tile(page,'chat-d').locator('.visually-hidden')).toHaveCount(0); // shown above: its mark is cleared too
 await tile(page,'chat-a').click();
 await expect(card(page).getByRole('heading',{level:3,name:'สรุปแชทกลุ่ม'})).toBeVisible();
 await expect(card(page).locator('.collection-chat-meta').first()).toHaveText('อัปเดต 11-พ.ย. · 3 วันล่าสุด');await expect(card(page).locator('.collection-chat-meta').last()).toHaveText('ข้อความล่าสุด: ผู้แนะนำ · 11-พ.ย.');
 await expect(card(page).locator('.collection-chat-heading .expense-payee-tag')).toHaveText('กลุ่มร่วม');
 await expect(card(page).locator('.collection-chat-points .expense-payee-tag')).toHaveText(['ผู้กู้','หุ้นส่วน','ผู้แนะนำ','ผู้กู้อื่น']);
 await expect(card(page).getByRole('button')).toHaveCount(0);await expect(card(page).locator('.collection-chat-points li')).toHaveCount(4);
 if(!desktop)await back(page);
 await tile(page,'chat-b').click();await expect(card(page).locator('.collection-chat-meta').first()).toHaveText('คุยล่าสุด 07-พ.ย.');await expect(card(page).locator('.collection-chat-points .expense-payee-tag')).toHaveText('MW Credit');
});

test('a newer summary relights the mark; with the seen storage blocked there are no marks and the card still shows',async({page},info)=>{
 const desktop=info.project.name.startsWith('desktop');
 // This device already showed an older summary of chat-a and the current one of chat-d.
 await page.addInitScript(()=>{const real=Storage.prototype.getItem;Storage.prototype.getItem=function(key:string){return key.startsWith('mw-credit.chat-seen:')&&(window as any).__seen?(window as any).__seen:real.call(this,key)};(window as any).__seen=JSON.stringify({'chat-a':'2026-11-11T02:00:00.000Z','chat-d':'2026-11-12T06:10:00.000Z'})});
 await open(page,{desktop});
 await expect(tile(page,'chat-a').locator('.collection-chat-mark')).toHaveCount(1);await expect(tile(page,'chat-d').locator('.collection-chat-mark')).toHaveCount(0);
 // Storage that cannot be read: no marks at all (never permanent marks); the card is unaffected and nothing throws.
 await page.addInitScript(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(key:string){if(key.startsWith('mw-credit.chat-seen:'))throw new DOMException('blocked','SecurityError');return get.call(this,key)};Storage.prototype.setItem=function(key:string,value:string){if(key.startsWith('mw-credit.chat-seen:'))throw new DOMException('blocked','SecurityError');return set.call(this,key,value)}});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.reload();await page.getByRole('button',{name:'Continue with Google'}).click();await page.getByRole('button',{name:'Collection',exact:true}).click();await expect(page.locator('.collection-compact-tile')).toHaveCount(6);
 await expect(page.locator('.collection-chat-mark')).toHaveCount(0);await expect(page.locator('.collection-tile-main .visually-hidden')).toHaveCount(0);
 await tile(page,'chat-a').click();await expect(card(page).locator('.collection-chat-headline')).toBeVisible();await expect(card(page).locator('.collection-chat-meta').first()).toHaveText('Updated 11-Nov · last 3 days');
 if(!desktop)await back(page);
 await expect(page.locator('.collection-chat-mark')).toHaveCount(0);expect(errors).toEqual([]);
});

// R153 (owner, 13 November 2026): points come oldest first, so the last point of a current card with two or more points is
// bold with a hidden "Latest:"; a stale card or a lone point has none. R158: the card carries no link.
test('R153 the latest point is bold on a current card; R158 the card has no link',async({page},info)=>{
 const desktop=info.project.name.startsWith('desktop'),d=summaries['chat-d'] as {points:unknown[]};
 await open(page,{desktop,replace:{'chat-d':{...d,points:[d.points[1]]}},links:{'chat-a':{chatUrl:'https://www.instagram.com/direct/t/100000000000001/',chatInviteUrl:'https://ig.me/j/AbCdEfGh12345678/'}}});
 await tile(page,'chat-a').click();await expect(card(page)).toBeVisible();
 const points=card(page).locator('.collection-chat-points li');await expect(points).toHaveCount(4);await expect(card(page).locator('strong')).toHaveCount(1);
 for(const index of [0,1,2])await expect(points.nth(index).locator('strong')).toHaveCount(0);
 const latest=points.nth(3).locator('strong.collection-chat-latest');await expect(latest).toHaveText('Latest: Another borrower asked about their own balance.');await expect(latest.locator('.visually-hidden')).toHaveText('Latest: ');
 expect(await latest.evaluate(node=>getComputedStyle(node).fontWeight)).toBe('700');
 // UX-CHAT-LATEST-01: not weight alone: a 3px accent bar (the MW Credit role colour) on the latest point's left.
 expect(await points.nth(3).evaluate(node=>{const s=getComputedStyle(node);return [s.borderLeftWidth,s.borderLeftStyle,s.borderLeftColor,s.paddingLeft]})).toEqual(['3px','solid','rgb(11, 107, 122)','6px']);
 for(const index of [0,1,2])expect(await points.nth(index).evaluate(node=>getComputedStyle(node).borderLeftWidth)).toBe('0px');
 // R158 case 2: the borrower has links, the card shows none (the header does).
 await expect(card(page).locator('a')).toHaveCount(0);await expect(header(page).locator('a.collection-header-chat')).toHaveCount(1);
 if(!desktop)await back(page);
 // Stale: nothing is bold.
 await tile(page,'chat-b').click();await expect(card(page)).toHaveClass(/stale/);await expect(card(page).locator('strong')).toHaveCount(0);await expect(card(page).locator('.collection-chat-latest-point')).toHaveCount(0);
 if(!desktop)await back(page);
 // One point on a current card: not bold.
 await tile(page,'chat-d').click();await expect(card(page).locator('.collection-chat-points li')).toHaveCount(1);await expect(card(page).locator('strong')).toHaveCount(0);
 if(!desktop)await back(page);
 await chooseLanguage(page,'ไทย');await tile(page,'chat-a').click();
 await expect(card(page).locator('strong.collection-chat-latest .visually-hidden')).toHaveText('ล่าสุด: ');
});

// R158 (owner, 14 November 2026: "i want the link to the group to be moved out of the summary card. maybe just next to the
// borrower's name. i want to open the group even there's no conversation"): "Open chat" in the Collection page header after
// the borrower's name, with or without a summary, read-only included (this page is read-only; the owner shell below has
// command access); the device picks the link (R154 rule). Invented links only.
const web='https://www.instagram.com/direct/t/100000000000001/',invite='https://ig.me/j/AbCdEfGh12345678/';
const header=(page:Page)=>page.locator('.collection-context');
const isPhone=(page:Page)=>page.evaluate(()=>/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1));
// UX-HDR-CHAT-02/03: wider than 480px the visible "Open chat" names the link (no aria-label); at 480px and below (the phone
// projects) it is an icon button named by its aria-label. The title is always the full purpose.
const purpose={en:'Open group chat in Instagram',th:'เปิดแชทกลุ่มใน Instagram'};
const linkName=(narrow:boolean,lang:'en'|'th'='en')=>narrow?purpose[lang]:lang==='en'?'Open chat':'เปิดแชท';
// UX-HDR-CHAT-01: the link's left edge is within 16px of the name's right edge on the name's row, or it starts the next
// line directly after the name.
async function expectAfterName(page:Page,label:string){
 const [name,link]=await header(page).evaluate(row=>{const box=(node:Element)=>{const r=node.getBoundingClientRect(),o=row.getBoundingClientRect();return {left:r.left-o.left,right:r.right-o.left,top:r.top,bottom:r.bottom}};
  return [box(row.querySelector(':scope>strong,:scope>.collection-name-link')!),box(row.querySelector(':scope>.collection-header-chat')!)]});
 if(link.top<name.bottom&&link.bottom>name.top){expect(link.left-name.right,label+': gap after the name').toBeGreaterThanOrEqual(0);expect(link.left-name.right,label+': gap after the name').toBeLessThanOrEqual(16)}
 else{expect(link.top,label+': the next line').toBeGreaterThanOrEqual(name.bottom-1);expect(link.left,label+': the next line starts with it').toBeLessThanOrEqual(16)}
 return link;
}
test('R158 Open chat sits after the name with no summary, picks the link per device and falls back; none without a valid link',async({page},info)=>{
 const desktop=info.project.name.startsWith('desktop');
 await open(page,{desktop,links:{'chat-c':{chatUrl:web,chatInviteUrl:invite},'chat-b':{chatInviteUrl:invite},'chat-d':{chatUrl:web},'chat-e':{chatUrl:'javascript:alert(1)',chatInviteUrl:'https://ig.me/m/invented_user/'}}});
 const phone=await isPhone(page);expect(phone).toBe(!desktop);
 // Case 1 and 4: chat-c has no summary at all; the header link is there, after the name, the link for this device.
 await tile(page,'chat-c').click();await expect(page.locator('.collection-charge')).toHaveCount(1);await expect(card(page)).toHaveCount(0);
 const link=header(page).getByRole('link',{name:linkName(!desktop),exact:true});await expect(link).toHaveAttribute('href',phone?invite:web);
 await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');await expect(link).toHaveAttribute('title',purpose.en);
 // UX-HDR-CHAT-03: no aria-label beside the visible text; UX-HDR-CHAT-02: the phone's icon button, framed like Payment history.
 if(desktop)expect(await link.getAttribute('aria-label')).toBeNull();else await expect(link).toHaveAttribute('aria-label',purpose.en);
 await expect(link.locator('svg')).toHaveAttribute('data-icon','chat');await expect(link.locator('svg')).toHaveAttribute('aria-hidden','true');
 expect(await link.evaluate(node=>{const s=getComputedStyle(node);return [s.color,s.textDecorationLine]})).toEqual(['rgb(11, 87, 208)',desktop?'underline':'none']);
 if(!desktop)expect(await link.evaluate(node=>{const s=getComputedStyle(node);return [s.borderTopWidth,s.borderTopStyle,s.borderTopColor,s.borderRadius,s.backgroundColor]})).toEqual(['1px','solid','rgb(222, 222, 222)','5px','rgb(255, 255, 255)']);
 await expectAfterName(page,`read-only ${page.viewportSize()!.width}px`);
 // After the name, before anything else in the row.
 expect(await header(page).evaluate(row=>[...row.children].slice(1).map(child=>child.tagName.toLowerCase()+(child.classList.contains('collection-header-chat')?'.chat':'')))).toEqual(['strong','a.chat']);
 {const box=(await link.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44)}
 if(!desktop)await back(page);
 // Fallbacks: only an invite link opens it everywhere; only the instagram.com link opens it everywhere.
 await tile(page,'chat-b').click();await expect(header(page).getByRole('link',{name:linkName(!desktop),exact:true})).toHaveAttribute('href',invite);if(!desktop)await back(page);
 await tile(page,'chat-d').click();await expect(header(page).getByRole('link',{name:linkName(!desktop),exact:true})).toHaveAttribute('href',web);if(!desktop)await back(page);
 // Case 3: no valid link (a script URL, an ig.me link that is not an invite) or none at all: no element.
 await tile(page,'chat-e').click();await expect(page.locator('.collection-charge')).toHaveCount(1);await expect(header(page).locator('a')).toHaveCount(0);if(!desktop)await back(page);
 await tile(page,'chat-a').click();await expect(card(page)).toBeVisible();await expect(header(page).locator('a')).toHaveCount(0);if(!desktop)await back(page);
 // Thai copy.
 await chooseLanguage(page,'ไทย');await tile(page,'chat-c').click();await expect(header(page).getByRole('link',{name:linkName(!desktop,'th'),exact:true})).toHaveAttribute('title',purpose.th);
});
// Case 7: a long Thai name at 320 and 390px: the page never scrolls sideways, the name wraps, the link (icon only at 480px
// and below, named by aria-label and title) keeps a 44px target right after the name (UX-HDR-CHAT-01).
for(const width of [320,390])test(`R158 the header link at ${width}px with a long name: no overflow, 44px target, icon only, the name wraps`,async({page},info)=>{
 test.skip(info.project.name.startsWith('desktop'),'phone widths');
 await open(page,{desktop:false,width,links:{'chat-f':{chatUrl:web,chatInviteUrl:invite}}});
 await tile(page,'chat-f').click();const link=header(page).getByRole('link',{name:purpose.en,exact:true});await expect(link).toBeVisible();
 await expect(link.locator('span')).toBeHidden();
 const box=(await link.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x+box.width).toBeLessThanOrEqual(width);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 const name=(await header(page).locator('strong').boundingBox())!;expect(name.x+name.width).toBeLessThanOrEqual(width);
 expect(await header(page).locator('strong').evaluate(node=>getComputedStyle(node).overflowWrap)).toBe('anywhere');
 await expectAfterName(page,`read-only ${width}px`);
});

// R160 (owner, 14 November 2026: "i want to add that chat button (same blue color one in the collection details page) into
// the collection borrowers list page, put it next to the payment receiving button, on its left side"): the tile's chat link,
// the narrow header look at every width, a sibling of the tile button (opening it never opens the borrower), shown to a
// read-only user too (this page; the owner shell below has Receive). Invented links only.
const tileChat=(page:Page,id:string)=>page.locator('.collection-compact-tile').filter({has:tile(page,id)}).locator('a.collection-tile-chat');
const tileChatName=(name:string,lang:'en'|'th'='en')=>purpose[lang]+', '+name;
const nameOf=(id:string)=>board.find(row=>row.id===id)!.displayName;
test('R160 list tile chat link: device link and fallbacks, none without a valid link, read-only without Receive, never opens the borrower, Thai',async({page},info)=>{
 const desktop=info.project.name.startsWith('desktop');
 await page.context().route(/^https:\/\/(www\.instagram\.com|ig\.me)\//,r=>r.fulfill({contentType:'text/html',body:'<title>Invented group</title>'}));
 const chargeReads:string[]=[];page.on('request',request=>{if(/\/api\/collection\/[^/]+\/charges/.test(request.url()))chargeReads.push(request.url())});
 await open(page,{desktop,links:{'chat-c':{chatUrl:web,chatInviteUrl:invite},'chat-b':{chatInviteUrl:invite},'chat-d':{chatUrl:web},'chat-e':{chatUrl:'javascript:alert(1)',chatInviteUrl:'https://ig.me/m/invented_user/'}}});
 const phone=await isPhone(page);expect(phone).toBe(!desktop);
 // Case 1 and 3: the link for this device, named per borrower, in a new tab; the header's narrow look (white box, grey
 // border, blue 24px icon, no text) at every width.
 const link=page.getByRole('link',{name:tileChatName(nameOf('chat-c')),exact:true});
 await expect(link).toHaveAttribute('href',phone?invite:web);await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');await expect(link).toHaveAttribute('title',purpose.en);
 await expect(link).toHaveClass('collection-tile-chat');await expect(link).toHaveText('');
 await expect(link.locator('svg')).toHaveAttribute('data-icon','chat');await expect(link.locator('svg')).toHaveAttribute('aria-hidden','true');
 expect(await link.evaluate(node=>{const s=getComputedStyle(node),icon=getComputedStyle(node.querySelector('svg')!);return [s.color,s.textDecorationLine,s.borderTopWidth,s.borderTopStyle,s.borderTopColor,s.borderRadius,s.backgroundColor,icon.width,icon.height]}))
  .toEqual(['rgb(11, 87, 208)','none','1px','solid','rgb(222, 222, 222)','5px','rgb(255, 255, 255)','24px','24px']);
 {const box=(await link.boundingBox())!;expect(box.width).toBeCloseTo(44,0);expect(box.height).toBeCloseTo(44,0)}
 // Fallbacks, and no element without a valid link (a script URL, a non-invite ig.me link) or without any link.
 await expect(tileChat(page,'chat-b')).toHaveAttribute('href',invite);await expect(tileChat(page,'chat-d')).toHaveAttribute('href',web);
 for(const id of ['chat-e','chat-a','chat-f'])await expect(tileChat(page,id),id).toHaveCount(0);
 await expect(page.locator('.collection-tile-chat')).toHaveCount(3);
 // Case 6: read-only: the chat link without a Receive button; a tile without either has no actions row.
 await expect(page.locator('.collection-compact-tile button.icon-action')).toHaveCount(0);await expect(page.locator('.collection-tile-actions')).toHaveCount(3);
 // A sibling of the tile button, inside the right column, after the paid amount.
 expect(await link.evaluate(node=>[node.parentElement!.className,node.parentElement!.parentElement!.className,node.closest('button')===null])).toEqual(['collection-tile-actions','collection-tile-right',true]);
 // Case 4: the link opens a new page; the list stays, no tile is selected and no charges are read.
 const popup=page.context().waitForEvent('page');await link.click();const opened=await popup;await opened.waitForLoadState();
 expect(opened.url()).toBe(phone?invite:web);await opened.close();
 await expect(page.locator('.collection-compact-tile.selected')).toHaveCount(0);await expect(page.locator('.collection-charge')).toHaveCount(0);expect(chargeReads).toEqual([]);
 await expect(page.locator('.collection-compact-tile')).toHaveCount(6);
 // The tile body still opens the borrower.
 await tile(page,'chat-c').click();await expect(page.locator('.collection-charge')).toHaveCount(1);expect(chargeReads.length).toBe(1);if(!desktop)await back(page);
 // Case 10: Thai copy.
 await chooseLanguage(page,'ไทย');await expect(page.getByRole('link',{name:tileChatName(nameOf('chat-c'),'th'),exact:true})).toHaveAttribute('title',purpose.th);
});

// R160 review (UX-R160-02, case 9): realistic names (25-35 characters, Latin and Thai), each as four tiles with the same
// name: no link, link, mark, mark and link. When any tile shows a link every tile reserves the same right column, so a
// tile's own link never changes its height, for a read-only and a command user, at 320 and 390px.
const heightNames=['Somchai Synthetic Borrower Name','ผู้กู้ตัวอย่างชื่อยาวสำหรับทดสอบ'];
const heightVariants=['none','link','mark','mark-link'];
const heightRows=heightNames.flatMap((name,index)=>heightVariants.map(variant=>({...board[0],id:`h${index}-${variant}`,displayName:name,chatSummaryAt:variant.startsWith('mark')?fresh:null})));
const heightLinked=heightRows.filter(row=>row.id.endsWith('link')).map(row=>row.id);
async function expectEqualHeights(page:Page,label:string){
 const measured:Record<string,Record<string,number>>={};
 for(const width of [320,390]){
  await page.setViewportSize({width,height:800});
  for(const [index] of heightNames.entries()){
   const heights=await Promise.all(heightVariants.map(async variant=>Math.round((await page.locator('.collection-compact-tile').filter({has:tile(page,`h${index}-${variant}`)}).boundingBox())!.height*10)/10));
   measured[`${width}px ${index?'thai':'latin'}`]=Object.fromEntries(heightVariants.map((variant,at)=>[variant,heights[at]]));
   // A link never changes the height: none = link and mark = mark-link. The mark's own width (R146/R157, unchanged) can wrap
   // the last word of a name near a line end, so mark vs no mark is measured and reported here, not asserted.
   expect(heights[1],`${label} ${width}px name ${index} link vs none: ${JSON.stringify(heights)}`).toBeCloseTo(heights[0],0);
   expect(heights[3],`${label} ${width}px name ${index} mark-link vs mark: ${JSON.stringify(heights)}`).toBeCloseTo(heights[2],0);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${label} ${width}px: no sideways scroll`).toBeLessThanOrEqual(width);
 }
 console.log(`R160 tile heights ${label} ${test.info().project.name}: ${JSON.stringify(measured)}`);
}
test('R160 read-only: with any link on the page, a tile with a link is as tall as one without (with or without the mark)',async({page},info)=>{
 await open(page,{desktop:info.project.name.startsWith('desktop'),boardRows:heightRows,links:Object.fromEntries(heightLinked.map(id=>[id,{chatUrl:web,chatInviteUrl:invite}]))});
 await expect(page.locator('.collection-tile-chat')).toHaveCount(heightLinked.length);await expect(page.locator('.collection-compact-tile button.icon-action')).toHaveCount(0);
 // The reserved space stays empty: no placeholder element.
 await expect(page.locator('.collection-tile-actions')).toHaveCount(heightLinked.length);
 await expectEqualHeights(page,'read-only');
});

// R150: every card time is the browser's own wall clock, and "today" is the browser's day. Same instants, three clocks.
test('card times follow the browser time zone: clock times for today here, dates for another day here',async({page},info)=>{
 const desktop=info.project.name.startsWith('desktop');
 // 12 November 12:00 in Los Angeles (20:00 UTC; already 03:00 on the 13th in Bangkok).
 const chat={...(summaries['chat-a'] as object),generatedAt:'2026-11-12T19:40:00.000Z',lastMessageAt:'2026-11-12T18:15:00.000Z'};
 await open(page,{desktop,replace:{'chat-a':chat,'chat-d':{...(summaries['chat-d'] as object),generatedAt:'2026-11-12T07:59:00.000Z',lastMessageAt:'2026-11-12T08:01:00.000Z'}},now:'2026-11-12T20:00:00Z'});
 await tile(page,'chat-a').click();
 // Today here: 11:40 and 10:15 (Bangkok would read 02:40 and 01:15).
 await expect(card(page).locator('.collection-chat-meta').first()).toHaveText('Updated 11:40 · last 3 days');await expect(card(page).locator('.collection-chat-meta').last()).toHaveText('Last message: Referrer · 10:15');
 if(!desktop)await back(page);
 // Either side of local midnight: generated at 23:59 on the 11th here (a date), last message at 00:01 today (a time,
 // 24-hour). In Bangkok both are 12 November afternoon, the day before its "today".
 await tile(page,'chat-d').click();
 await expect(card(page).locator('.collection-chat-meta').first()).toHaveText('Updated 11-Nov · last 3 days');await expect(card(page).locator('.collection-chat-meta').last()).toHaveText('Last message: Partner · 00:01');
});
test.describe('another time zone',()=>{
 test.use({timezoneId:'Asia/Tokyo'});
 test('the same summary read in Tokyo shows Tokyo times',async({page},info)=>{
  const desktop=info.project.name.startsWith('desktop');await open(page,{desktop});
  // 08:00 UTC is 17:00 on 12 November in Tokyo: generated 16:32 and last message 15:10 today (Bangkok: 14:32, 13:10).
  await tile(page,'chat-a').click();
  await expect(card(page).locator('.collection-chat-meta').first()).toHaveText('Updated 16:32 · last 3 days');await expect(card(page).locator('.collection-chat-meta').last()).toHaveText('Last message: Referrer · 15:10');
  if(!desktop)await back(page);
  // Stale: 8 November 03:00 UTC is 12:00 on the 8th in Tokyo (19:00 on the 7th in Los Angeles).
  await tile(page,'chat-b').click();await expect(card(page).locator('.collection-chat-meta').first()).toHaveText('Last conversation 08-Nov');
 });
});

// R148 (PROD defect, owner account): with owner testing on, the borrower note renders next to the card. Both were keyed by
// the borrower id as siblings, so React kept the previous borrower's card mounted on every navigation and the cards
// stacked up. The partner (no owner testing, the tests above) was unaffected. This runs the owner shell.
test.describe('owner testing shell',()=>{
 let owner:ChildProcess,ownerBase:string;
 test.beforeAll(async({},info)=>{
  const port=5650+info.workerIndex;ownerBase=`http://127.0.0.1:${port}`;
  owner=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-live-${port}-${Date.now()}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});
  await expect.poll(async()=>{try{return(await fetch(ownerBase)).status}catch{return 0}},{timeout:20000}).toBe(200);
 });
 test.afterAll(()=>owner?.kill());
 // The owner shell on the mocked read and command services; rows carry the group links when their id is in linkedIds.
 async function ownerOpen(page:Page,desktop:boolean,rows:typeof board=board,linkedIds:string[]=['chat-c','chat-f'],hold?:Promise<unknown>){
  if(desktop)await page.setViewportSize({width:1440,height:900});
  await page.clock.setFixedTime(new Date(NOW));
  const ownerAuth=`let listener;const user={uid:'chat-summary-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener(user)};export async function signOut(){listener(null)};`;
  await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:ownerAuth}));
  const json=(r:import('@playwright/test').Route,body:unknown)=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)}).catch(()=>{});
  await page.route('https://mw-credit-app-read-dev-test.run.app/**',async r=>{const u=new URL(r.request().url());
   // R158: chat-c carries the group links (no summary): the header link sits after the name button (command access).
   // chat-f (a long Thai name) too, for the header layout.
   const linked=(row:any)=>row&&linkedIds.includes(row.id)?{...row,chatUrl:web,chatInviteUrl:invite}:row;
   if(u.pathname==='/api/collection')return json(r,{...envelope,items:rows.map(linked),nextCursor:null});
   const charges=/^\/api\/collection\/([^/]+)\/charges$/.exec(u.pathname);
   if(charges){await hold;const id=decodeURIComponent(charges[1]);return json(r,{...envelope,borrower:linked(rows.find(row=>row.id===id)),items:[{id:'charge-'+id,loanId:'loan-'+id,loanDisplayKey:'Synthetic loan',chargeDate:'2026-11-12',paymentStatus:'รอชำระ',paymentDate:null,amountRemaining:'1200',totalPaid:'0',receivedToday:'0'}],nextCursor:null,groupChat:summaries[id]??null});}
   return json(r,{...envelope,horizonEnd:'2027-02-12',reviewRequired:false,items:[]});});
  // The command service: the borrower record the note reads, and empty answers for everything else the owner shell asks.
  await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{const u=new URL(r.request().url()),record=/^\/api\/borrower-records\/([^/]+)$/.exec(u.pathname);
   if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}}).catch(()=>{});
   if(record){const id=decodeURIComponent(record[1]);return json(r,{...envelope,item:{id,version:'v-'+id,name:id,description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:false,referrerId:null,preferredReceivingAccountId:null,note:'Synthetic note for '+id}});}
   return json(r,{...envelope,items:[],nextCursor:null,months:[],item:null});});
  await routeSyntheticPreferences(page);await page.route('https://mw-credit-app-command-dev-test.run.app/api/dashboard',r=>json(r,{collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]}));
  await page.goto(ownerBase);await page.getByRole('button',{name:/Google/}).click();await chooseLanguagePreservingForm(page,'EN');await page.getByRole('button',{name:'Collection',exact:true}).click();
  await expect(page.locator('.collection-compact-tile')).toHaveCount(rows.length);
 }
 test('one card per borrower with that borrower\'s own summary; none stays from the borrower opened before; no duplicate React keys',async({page},info)=>{
  const desktop=info.project.name.startsWith('desktop');
  const consoleText:string[]=[];page.on('console',message=>consoleText.push(message.text()));page.on('pageerror',error=>consoleText.push(error.message));
  await ownerOpen(page,desktop);
  const visit=async(id:string,headline:string|null)=>{
   await tile(page,id).click();await expect(page.locator('.collection-charge')).toHaveCount(1);
   // Owner testing is on: the note is there, right below where the card goes.
   await expect(page.locator('.collection-note')).toHaveCount(1);
   if(headline===null)await expect(card(page)).toHaveCount(0);
   else{await expect(card(page).locator('.collection-chat-headline')).toHaveText(headline);await expect(card(page)).toHaveCount(1);await expect(page.getByRole('heading',{level:3,name:'Group chat summary'})).toHaveCount(1)}
   if(!desktop)await back(page);
  };
  await visit('chat-a','Borrower asks to pay 2,000 on Friday instead of today; partner agreed.');
  await visit('chat-b','Borrower asked to pay on Friday.');
  await visit('chat-d','มีเฉพาะภาษาไทยในหัวข้อนี้');
  await visit('chat-c',null);
  // R158 case 5 with command access: the header link after the name button, the summary card absent.
  await tile(page,'chat-c').click();await expect(page.locator('.collection-charge')).toHaveCount(1);
  expect(await page.locator('.collection-context').evaluate(row=>[...row.children].slice(1,3).map(child=>child.tagName.toLowerCase()+(child.classList.contains('collection-header-chat')?'.chat':'')))).toEqual(['button','a.chat']);
  await expect(page.locator('.collection-context').getByRole('link',{name:linkName(!desktop),exact:true})).toHaveAttribute('href',desktop?web:invite);
  if(!desktop)await back(page);
  // UX-HDR-CHAT-01 with command access: the link right after the name button at 390 and 1440px, Payment history next on the
  // link's row at 390px; at 320px the page never scrolls sideways.
  const viewport=page.viewportSize()!;
  for(const id of ['chat-c','chat-f']){
   await tile(page,id).click();await expect(page.locator('.collection-charge')).toHaveCount(1);
   for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:800});const label=`command ${id} ${width}px`;
    const history=page.locator('.collection-context').getByRole('button',{name:'Payment history',exact:true});await expect(history).toBeVisible();
    const link=await expectAfterName(page,label);
    const after=await history.evaluate(node=>{const r=node.getBoundingClientRect(),o=node.parentElement!.getBoundingClientRect();return {left:r.left-o.left,right:r.right-o.left,top:r.top,bottom:r.bottom}});
    if(width===390){expect(after.top<link.bottom&&after.bottom>link.top,label+': Payment history on the link\'s row').toBe(true);expect(after.left-link.right,label).toBeGreaterThanOrEqual(0);expect(after.left-link.right,label).toBeLessThanOrEqual(16)}
    expect(await page.evaluate(()=>document.documentElement.scrollWidth),label+': no sideways scroll').toBeLessThanOrEqual(width);
   }
   await page.setViewportSize(viewport);if(!desktop)await back(page);
  }
  await visit('chat-a','Borrower asks to pay 2,000 on Friday instead of today; partner agreed.');
  expect(consoleText.filter(text=>/two children with the same key|same key/i.test(text))).toEqual([]);
 });
 // R160 with command access: the chat link left of Receive on one row, 8px apart (cases 1, 5, 8; UX-R160-01).
 test('R160 chat link left of Receive: same row, 8px gap, tab order, 44px targets, no overflow with a long Thai name',async({page},info)=>{
  const desktop=info.project.name.startsWith('desktop');
  await ownerOpen(page,desktop);
  const article=(id:string)=>page.locator('.collection-compact-tile').filter({has:tile(page,id)});
  const receive=(id:string)=>page.getByRole('button',{name:'Receive payment for '+nameOf(id),exact:true});
  // DOM and tab order: tile button, chat, Receive.
  expect(await article('chat-c').evaluate(node=>[...node.querySelectorAll('button,a')].map(item=>item.className))).toEqual(['collection-tile-main','collection-tile-chat','secondary-button icon-action']);
  await expect(article('chat-a').locator('.collection-tile-chat')).toHaveCount(0);await expect(receive('chat-a')).toBeVisible();
  await tile(page,'chat-c').focus();await page.keyboard.press('Tab');await expect(tileChat(page,'chat-c')).toBeFocused();
  await page.keyboard.press('Tab');await expect(receive('chat-c')).toBeFocused();
  const viewport=page.viewportSize()!;
  for(const width of desktop?[1440]:[390,320]){
   await page.setViewportSize({width,height:800});const label=`${width}px`;
   for(const id of ['chat-c','chat-f']){
    const chat=(await tileChat(page,id).boundingBox())!,pay=(await receive(id).boundingBox())!;
    expect(Math.abs(chat.y-pay.y),label+' '+id+': same row').toBeLessThanOrEqual(1);expect(pay.x-(chat.x+chat.width),label+' '+id+': 8px left of Receive').toBeCloseTo(8,0);
    for(const box of [chat,pay]){expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44)}
    expect(await article(id).evaluate(node=>node.scrollWidth<=node.clientWidth),label+' '+id+': no tile overflow').toBe(true);
   }
   // Every tile reserves the same right column (chat + gap + Receive), with or without its own link.
   const right=await page.locator('.collection-tile-right').evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().width)));
   expect(new Set(right).size,label+': one right-column width '+JSON.stringify(right)).toBe(1);expect(right[0]).toBeGreaterThanOrEqual(96);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth),label+': no sideways scroll').toBeLessThanOrEqual(width);
   // The long Thai name wraps inside its column.
   const name=article('chat-f').locator('.collection-tile-main strong');expect(await name.evaluate(node=>getComputedStyle(node).overflowWrap)).toBe('anywhere');
   const main=(await tile(page,'chat-f').boundingBox())!,text=(await name.boundingBox())!,chat=(await tileChat(page,'chat-f').boundingBox())!;
   expect(text.x+text.width,label+': the name stays in its column').toBeLessThanOrEqual(main.x+main.width+1);expect(main.x+main.width,label+': the name column ends before the chat link').toBeLessThanOrEqual(chat.x);
  }
  await page.setViewportSize(viewport);
 });
 test('R160 command user: with any link on the page, a tile with a link is as tall as one without (with or without the mark)',async({page},info)=>{
  await ownerOpen(page,info.project.name.startsWith('desktop'),heightRows,heightLinked);
  await expect(page.locator('.collection-tile-chat')).toHaveCount(heightLinked.length);await expect(page.locator('.collection-compact-tile button.icon-action')).toHaveCount(heightRows.length);
  await expectEqualHeights(page,'command');
 });
 // Chase Should 1: while a read is busy the tile button and Receive are disabled; the chat link stays usable.
 test('R160 busy: tile button and Receive disabled, the chat link stays enabled',async({page},info)=>{
  let release=()=>{};const hold=new Promise<void>(resolve=>{release=resolve});
  await ownerOpen(page,info.project.name.startsWith('desktop'),board,['chat-c','chat-f'],hold);
  const article=page.locator('.collection-compact-tile').filter({has:tile(page,'chat-c')});
  await tile(page,'chat-a').click();
  await expect(article.locator('.collection-tile-main')).toBeDisabled();await expect(article.locator('button.icon-action')).toBeDisabled();
  await expect(tileChat(page,'chat-c')).toBeEnabled();expect(await tileChat(page,'chat-c').evaluate(node=>[node.hasAttribute('disabled'),node.getAttribute('aria-disabled'),getComputedStyle(node).pointerEvents])).toEqual([false,null,'auto']);
  release();await expect(page.locator('.collection-charge')).toHaveCount(1);
  if(info.project.name.startsWith('desktop'))await expect(article.locator('button.icon-action')).toBeEnabled();
 });
});
