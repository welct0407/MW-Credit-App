import {test,expect,type Page,type TestInfo,emitSyntheticUser,deviceClass,layout,narrow,touchDevice} from './fixtures/test';
import {chooseLanguage} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
import {encodeDeltaChunk} from '../../services/api/offline-dataset-delta.mjs';
// R161 (owner, 15 November 2026): "if they're AI collection enabled, and if there's no group url filled in ... create the
// similar chat button ... link to their chat ... Keep the same icon but change to another color ... And also add the same
// buttons in borrower list (put on the left of new loan) and borrower details (put on the left of new loan)". The Borrowers
// list and details, read-only and with command access, online from the read service's row fields, and offline from the
// held records bundle (fetches aborted), which also drives the Collection list and header. Invented handles and links only.
let reader:ChildProcess,command:ChildProcess,readerBase:string,commandBase:string;
const env={VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-test-key',VITE_FIREBASE_APP_ID:'synthetic-app-id',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app'};
const serve=(port:number,extra:Record<string,string>)=>spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/playwright-borrower-chat-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,...env,...extra},stdio:'pipe'});
const ready=(base:string)=>expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200);
test.beforeAll(async({},info)=>{
 const a=5800+info.workerIndex,b=5850+info.workerIndex;readerBase=`http://127.0.0.1:${a}`;commandBase=`http://127.0.0.1:${b}`;
 reader=serve(a,{});command=serve(b,{VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'});
 await ready(readerBase);await ready(commandBase);
});
test.afterAll(()=>{reader?.kill();command?.kill()});test.setTimeout(60000);
const auth=`let listener;export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function getAuth(){return {}};export async function setPersistence(){};const user={uid:'synthetic-chat-member',getIdToken:async()=>'synthetic'};export function onAuthStateChanged(a,fn){listener=fn;window.emitUser=()=>fn(user);return()=>{listener=null}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){listener(user)};export async function signOut(){listener(null)};`;
const web='https://www.instagram.com/direct/t/100000000000001/',invite='https://ig.me/j/AbCdEfGh12345678/';
const DM='rgb(199, 21, 133)',GROUP='rgb(11, 87, 208)',BORDER={[DM]:'rgb(240, 179, 214)',[GROUP]:'rgb(222, 222, 222)'};
const purpose={dm:{en:'Open Instagram direct message',th:'เปิดแชทส่วนตัวใน Instagram'},group:{en:'Open group chat in Instagram',th:'เปิดแชทกลุ่มใน Instagram'}};
const longThai='ผู้กู้ตัวอย่างชื่อยาวมากสำหรับทดสอบปุ่มแชท';
// The borrowers: detail records (instagramUsername, aiCollectionEnabled, group links) and the list rows the read service
// sends for them (chatDmUrl and the group links, as markGroupLinks gives them with the reader grants).
const people=[
 {id:'b-dm',name:'Synthetic borrower DM',username:'@invented.dm',ai:true,dm:'https://ig.me/m/invented.dm'},
 {id:'b-group',name:'Synthetic borrower GR',username:'invented_group',ai:true,url:web,inviteUrl:invite,dm:'https://ig.me/m/invented_group'},
 {id:'b-off',name:'Synthetic borrower OF',username:'invented_off',ai:false},
 {id:'b-bad',name:'Synthetic borrower BD',username:'a b',ai:true},
 {id:'b-long',name:longThai,username:'https://www.instagram.com/invented.long/',ai:true,dm:'https://ig.me/m/invented.long'},
];
const rows=(withLinks:boolean)=>people.map((p,index)=>({id:p.id,name:p.name,borrowerDisplayName:p.name,description:null,totalProfitEarned:'10',createdDate:'2026-11-0'+(index+1),hasActiveLoan:true,outstandingPrincipal:'1000',note:null,
 ...(withLinks?{...(p.url?{chatUrl:p.url}:{}),...(p.inviteUrl?{chatInviteUrl:p.inviteUrl}:{}),...(p.dm?{chatDmUrl:p.dm}:{})}:{})}));
const record=(p:typeof people[number])=>({id:p.id,version:'a'.repeat(64),createdDate:'2026-11-01',name:p.name,description:null,communicationName:null,instagramUsername:p.username,city:null,workingLocation:null,address:null,hidden:false,referrerId:null,preferredReceivingAccountId:null,note:null,
 aiCollectionEnabled:p.ai,referralRebateRate:null,referralRebateCap:null,igGroupUrl:p.url??null,igGroupInviteLink:p.inviteUrl??null,details:{}});
const envelope={ok:true,source:'dev',businessDate:'2026-11-15',asOf:'2026-11-15T03:00:00.000Z'};
const json=(r:import('@playwright/test').Route,body:unknown)=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)}).catch(()=>{});
const tileOf=(page:Page,id:string)=>page.locator('article.borrower-tile').filter({has:page.locator(`.borrower-tile-main[data-record-id="${id}"]`)});
const chatIn=(page:Page,id:string)=>tileOf(page,id).locator('a.borrower-tile-chat');
const nameOf=(id:string)=>people.find(p=>p.id===id)!.name;
// The windows measured: 1440 on the computer, the given phone widths at 800 tall on the phones; an iPad keeps its own.
const sizes=(page:Page,info:TestInfo,phone:number[])=>{const device=deviceClass(info);return device==='tablet'?[page.viewportSize()!]:(device==='computer'?[1440]:phone).map(width=>({width,height:800}))};
async function boot(page:Page,base:string,{links=true,dataset}:{links?:boolean;dataset?:boolean}={}){
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.context().route(/^https:\/\/(www\.instagram\.com|ig\.me)\//,r=>r.fulfill({contentType:'text/html',body:'<title>Invented chat</title>'}));
 const reads:string[]=[];
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>{const u=new URL(r.request().url());reads.push(u.pathname);
  if(u.pathname==='/api/borrowers')return json(r,{...envelope,items:rows(links),nextCursor:null});
  const item=/^\/api\/borrowers\/([^/]+)$/.exec(u.pathname);if(item)return json(r,{...envelope,item:rows(links).find(row=>row.id===decodeURIComponent(item[1]))});
  return json(r,{...envelope,horizonEnd:'2027-02-15',reviewRequired:false,items:[],nextCursor:null});});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{const u=new URL(r.request().url()),path=u.pathname,method=r.request().method();
  if(method==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}}).catch(()=>{});
  if(path.endsWith('offline-dataset')){
   if(!dataset)return json(r,{ok:false,code:'command_unavailable'});
   const body=method==='POST'?r.request().postDataJSON():{},domain=u.searchParams.get('domain')??'notifications',version='c'.repeat(64);
   // The held bundle: detail records and list rows WITHOUT any chat field (v12); the collection items without links.
   const data:Record<string,Record<string,unknown>>={records:{borrowers:people.map(record),borrowerList:rows(false),borrowerLoans:[],dashboard:{collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]}},
    collection:{items:people.map(p=>({id:p.id,displayName:p.name,status:'not_paid',amountDue:'100',amountCollected:'0',amountRemaining:'100',prepaidToday:'0',chatSummaryAt:null})),charges:people.map(p=>({borrowerId:p.id,id:'c-'+p.id,loanId:'l-'+p.id,loanDisplayKey:'Synthetic loan',chargeDate:'2026-11-15',paymentStatus:'รอชำระ',paymentDate:null,amountRemaining:'100',totalPaid:'0',receivedToday:'0'})),groupChatByBorrower:[],receipts:[]}};
   const chunk={schemaVersion:2,domain,generation:'g-'+domain,startedAt:envelope.asOf,asOf:envelope.asOf,businessDate:envelope.businessDate,sourceVersion:version,patches:Object.entries(data[domain]??{}).map(([key,value])=>({key,mode:Array.isArray(value)?'append':'replace',value})),complete:true,nextCursor:null,progress:{completed:1,total:1}};
   if(method!=='POST')return r.fulfill({json:chunk});
   if(body.sourceVersion===version&&!body.need?.length)return r.fulfill({json:{...chunk,schemaVersion:3,patches:[],values:{},unchanged:true}});
   return r.fulfill({json:encodeDeltaChunk(chunk,body.need??[])});
  }
  const borrower=/^\/api\/borrower-records\/([^/]+)$/.exec(path);if(borrower){const p=people.find(row=>row.id===decodeURIComponent(borrower[1]));return json(r,{...envelope,item:p?record(p):null})}
  if(path==='/api/borrower-options')return json(r,{...envelope,referrers:[],accounts:[]});
  if(path==='/api/preferences')return json(r,{ok:true,item:{language:null}});
  if(path==='/api/dashboard')return json(r,{collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]});
  return json(r,{...envelope,items:[],nextCursor:null,months:[],item:null});});
 await page.goto(base);await emitSyntheticUser(page);
 return reads;
}
// The workspace button: in the open navigation menu when there is one, else the visible one (opening the menu if needed).
async function go(page:Page,name:string,tiles:string){
 await expect(async()=>{
  const menu=page.locator('dialog.live-menu-dialog[open]');
  if(await menu.count())await menu.getByRole('button',{name,exact:true}).first().click({timeout:1000});
  else{const nav=page.getByRole('button',{name,exact:true}).filter({visible:true});if(await nav.count())await nav.first().click({timeout:1000});else await page.getByRole('button',{name:/^(Open navigation|เปิดเมนู)$/}).click({timeout:1000})}
  await expect(page.locator(tiles)).toHaveCount(people.length,{timeout:2000});
 }).toPass({timeout:20000});
 // A menu still open (the current workspace chosen again) is closed, so it covers nothing.
 await expect(async()=>{if(await page.locator('dialog.live-menu-dialog[open]').count())await page.keyboard.press('Escape');await expect(page.locator('dialog.live-menu-dialog[open]')).toHaveCount(0,{timeout:1000})}).toPass({timeout:10000});
}
const borrowers=(page:Page)=>go(page,'Borrowers','article.borrower-tile');
async function expectLook(link:import('@playwright/test').Locator,color:string){
 await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');await expect(link.locator('svg')).toHaveAttribute('data-icon','chat');await expect(link.locator('svg')).toHaveAttribute('aria-hidden','true');
 expect(await link.evaluate(node=>{const s=getComputedStyle(node);return [s.color,s.borderTopColor,s.borderRadius,s.backgroundColor,s.textDecorationLine]})).toEqual([color,BORDER[color],'5px','rgb(255, 255, 255)','none']);
 const box=(await link.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
}

test('R161 read-only Borrowers list and details: the DM button (pink), the group button when there is a group link, none otherwise; it never opens the borrower',async({page},info)=>{
 const desktop=info.project.name.startsWith('desktop');if(desktop)await page.setViewportSize({width:1440,height:900});
 const reads=await boot(page,readerBase);await borrowers(page);const onPhone=touchDevice(info);
 const dm=page.getByRole('link',{name:purpose.dm.en+', '+nameOf('b-dm'),exact:true});
 await expect(dm).toHaveAttribute('href','https://ig.me/m/invented.dm');await expect(dm).toHaveAttribute('title',purpose.dm.en);await expectLook(dm,DM);
 // A group link wins over the DM (blue, group name); not enabled or an invalid handle (the server sends no DM link): none.
 const group=chatIn(page,'b-group');await expect(group).toHaveAttribute('href',onPhone?invite:web);await expect(group).toHaveAttribute('title',purpose.group.en);await expectLook(group,GROUP);
 for(const id of ['b-off','b-bad'])await expect(chatIn(page,id),id).toHaveCount(0);
 await expect(chatIn(page,'b-long')).toHaveAttribute('href','https://ig.me/m/invented.long');
 // Read-only: no New loan; a sibling of the tile button.
 await expect(page.locator('article.borrower-tile button.icon-action')).toHaveCount(0);
 expect(await dm.evaluate(node=>[node.parentElement!.className,node.closest('button')===null])).toEqual(['borrower-tile-actions',true]);
 // Opening it opens a new page; the borrower does not open (no loans read, no selection).
 const before=reads.filter(path=>path.includes('/loans')).length;
 const popup=page.context().waitForEvent('page');await dm.click();const opened=await popup;await opened.waitForLoadState();expect(opened.url()).toBe('https://ig.me/m/invented.dm');await opened.close();
 await expect(page.locator('article.borrower-tile.selected')).toHaveCount(0);expect(reads.filter(path=>path.includes('/loans')).length).toBe(before);
 // Tiles with and without a button (names of one length) are equally tall; nothing scrolls sideways (320, 390, this width).
 for(const size of sizes(page,info,[320,390])){
  const width=size.width;await page.setViewportSize(size);
  const heights=await page.locator('article.borrower-tile').evaluateAll(nodes=>nodes.slice(0,4).map(node=>Math.round(node.getBoundingClientRect().height)));
  expect(new Set(heights).size,`${width}px ${JSON.stringify(heights)}`).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${width}px`).toBeLessThanOrEqual(width);
  const long=(await chatIn(page,'b-long').boundingBox())!,main=(await tileOf(page,'b-long').locator('.borrower-tile-main').boundingBox())!;expect(main.x+main.width).toBeLessThanOrEqual(long.x+1);
 }
 // Thai names for both kinds.
 if(deviceClass(info)==='phone')await page.setViewportSize({width:390,height:800});
 await chooseLanguage(page,'ไทย');
 await expect(page.getByRole('link',{name:purpose.dm.th+', '+nameOf('b-dm'),exact:true})).toHaveAttribute('title',purpose.dm.th);
 await expect(chatIn(page,'b-group')).toHaveAttribute('title',purpose.group.th);await expect(chatIn(page,'b-group')).toHaveAttribute('aria-label',purpose.group.th+', '+nameOf('b-group'));
 await chooseLanguage(page,'EN');
 // The read-only details (UX-R161-RO-01): the button on the name's line, right; the name takes the rest.
 await tileOf(page,'b-dm').locator('.borrower-tile-main').click();
 const detail=page.locator('.detail-panel').getByRole('link',{name:purpose.dm.en,exact:true});await expect(detail).toHaveAttribute('href','https://ig.me/m/invented.dm');await expectLook(detail,DM);
 await expect(page.locator('.detail-panel .borrower-direct-actions')).toHaveCount(0);
 for(const size of sizes(page,info,[320,390])){
  const width=size.width;await page.setViewportSize(size);
  const heading=page.locator('.detail-panel .borrower-readonly-heading'),name=(await heading.locator('h2').boundingBox())!,link=(await detail.boundingBox())!,row=(await heading.boundingBox())!;
  expect(link.y,`${width}px on the name's line`).toBeLessThan(name.y+name.height);expect(link.y+link.height,`${width}px on the name's line`).toBeGreaterThan(name.y);
  expect(Math.abs(row.x+row.width-(link.x+link.width)),`${width}px right`).toBeLessThanOrEqual(1);expect(name.x+name.width).toBeLessThanOrEqual(link.x);
  expect(name.width,`${width}px the name takes the rest`).toBeGreaterThanOrEqual(row.width-44-8-1);
  console.log(`R161 read-only details ${info.project.name} ${width}px: name ${Math.round(name.width)}px of ${Math.round(row.width)}px, chat ${Math.round(link.width)}x${Math.round(link.height)}`);
 }
});

test('R161 Borrowers list with command access: the chat button left of New loan on one row, tab order tile, chat, New loan; details left of New loan',async({page},info)=>{
 const desktop=info.project.name.startsWith('desktop');if(desktop)await page.setViewportSize({width:1440,height:900});
 await boot(page,commandBase);await borrowers(page);
 const tile=tileOf(page,'b-dm'),chat=chatIn(page,'b-dm'),newLoan=page.getByRole('button',{name:'New loan for '+nameOf('b-dm'),exact:true});
 await expect(chat).toHaveAttribute('href','https://ig.me/m/invented.dm');await expectLook(chat,DM);
 expect(await tile.evaluate(node=>[...node.querySelectorAll('button,a')].map(item=>item.className))).toEqual(['borrower-tile-main','borrower-tile-chat chat-link-dm','icon-action']);
 await tile.locator('.borrower-tile-main').focus();await page.keyboard.press('Tab');await expect(chat).toBeFocused();await page.keyboard.press('Tab');await expect(newLoan).toBeFocused();
 for(const size of sizes(page,info,[320,390])){
  const width=size.width;await page.setViewportSize(size);
  const a=(await chat.boundingBox())!,b=(await newLoan.boundingBox())!;
  expect(Math.abs(a.y-b.y),`${width}px same row`).toBeLessThanOrEqual(1);expect(b.x-(a.x+a.width),`${width}px 8px left of New loan`).toBeCloseTo(8,0);
  const heights=await page.locator('article.borrower-tile').evaluateAll(nodes=>nodes.slice(0,4).map(node=>Math.round(node.getBoundingClientRect().height)));
  expect(new Set(heights).size,`${width}px ${JSON.stringify(heights)}`).toBe(1);
  const actions=await page.locator('.borrower-tile-actions').evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().width)));
  expect(new Set(actions).size,`${width}px one actions width ${JSON.stringify(actions)}`).toBe(1);
  // UX-R161-COL-01: New loan in one straight column on rows with and without a chat button.
  const loans=await page.getByRole('button',{name:/^New loan for /}).evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().x)));
  expect(new Set(loans).size,`${width}px New loan x ${JSON.stringify(loans)}`).toBe(1);
  console.log(`R161 Borrowers New loan x ${info.project.name} ${width}px: ${JSON.stringify(loans)}`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${width}px`).toBeLessThanOrEqual(width);
 }
 if(desktop)await page.setViewportSize({width:1440,height:900});else if(deviceClass(info)==='phone')await page.setViewportSize({width:390,height:800});
 // The details (the borrower record): first in the actions row, left of New loan; from the record (no list fields needed).
 await tileOf(page,'b-long').locator('.borrower-tile-main').click();
 const record=page.getByRole('region',{name:'Borrower record',exact:true});await expect(record.getByRole('button',{name:'Edit borrower',exact:true})).toBeVisible();
 const detail=record.getByRole('link',{name:purpose.dm.en,exact:true});await expect(detail).toHaveAttribute('href','https://ig.me/m/invented.long');await expectLook(detail,DM);
 expect(await record.locator('.borrower-direct-actions').evaluate(node=>node.firstElementChild!.className)).toBe('borrower-detail-chat chat-link-dm');
 // UX-R161-BRD-01: at 480px and below the actions take their own right-aligned row under the name, which keeps the full
 // width beside Back; wider, one line as before. Measured with the long Thai name.
 for(const size of sizes(page,info,[320,390,480])){
  const width=size.width;await page.setViewportSize(size);
  const heading=record.locator('.related-loans-heading').first(),name=(await heading.locator('h2').boundingBox())!,row=(await heading.boundingBox())!,actions=(await heading.locator('.borrower-direct-actions').boundingBox())!;
  const a=(await detail.boundingBox())!,b=(await record.getByRole('button',{name:'New loan',exact:true}).boundingBox())!;
  expect(a.x+a.width,`${width}px chat left of New loan`).toBeLessThanOrEqual(b.x);expect(Math.abs(a.y-b.y)).toBeLessThanOrEqual(1);
  // IPAD-BORR-01: also at 768-1050px (iPad portrait) the actions take their own row and the name keeps the record's width.
  if(narrow(page)||layout(page)==='tablet'){
   expect(actions.y,`${width}px actions under the name`).toBeGreaterThanOrEqual(name.y+name.height-1);
   expect(Math.abs(actions.x+actions.width-(row.x+row.width)),`${width}px actions right-aligned`).toBeLessThanOrEqual(2);
   expect(name.width,`${width}px the name keeps the width beside Back`).toBeGreaterThanOrEqual(row.width-44-24);
   if(layout(page)==='tablet')expect(name.width,`${width}px the name takes most of the record`).toBeGreaterThanOrEqual((await record.boundingBox())!.width*.6);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${width}px`).toBeLessThanOrEqual(width);
  console.log(`R161 borrower details ${info.project.name} ${width}px: name ${Math.round(name.width)}px of ${Math.round(row.width)}px; actions row at y ${Math.round(actions.y-row.y)} (name ends ${Math.round(name.y+name.height-row.y)})`);
 }
});

test('R161 offline from the held records bundle (fetches aborted): DM buttons on the Collection list and header and the Borrowers list and details',async({page},info)=>{
 const desktop=info.project.name.startsWith('desktop');if(desktop)await page.setViewportSize({width:1440,height:900});
 // Online the rows carry no chat fields at all: every button below comes from the held borrower records.
 await boot(page,commandBase,{links:false,dataset:true});
 await expect.poll(()=>page.evaluate(async()=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');const repo=ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-chat-member'});const [records,collection]=await Promise.all([repo.readDataset('records'),repo.readDataset('collection')]);return !!records?.complete&&records.data?.borrowers?.length===5&&!!collection?.complete}),{timeout:20000}).toBe(true);
 await page.route('**/api/**',r=>r.abort());
 const onPhone=touchDevice(info);
 await borrowers(page);
 await expect(chatIn(page,'b-dm')).toHaveAttribute('href','https://ig.me/m/invented.dm');await expectLook(chatIn(page,'b-dm'),DM);
 await expect(chatIn(page,'b-group')).toHaveAttribute('href',onPhone?invite:web);await expect(chatIn(page,'b-long')).toHaveAttribute('href','https://ig.me/m/invented.long');
 for(const id of ['b-off','b-bad'])await expect(chatIn(page,id),id).toHaveCount(0);
 await tileOf(page,'b-dm').locator('.borrower-tile-main').click();
 await expect(page.getByRole('region',{name:'Borrower record',exact:true}).getByRole('link',{name:purpose.dm.en,exact:true})).toHaveAttribute('href','https://ig.me/m/invented.dm');
 // Collection: the list tile and the header.
 await go(page,'Collection','.collection-compact-tile');
 const tile=page.locator('.collection-compact-tile').filter({has:page.locator('.collection-tile-main[data-record-id="b-dm"]')});
 const listLink=tile.getByRole('link',{name:'Copy reminder and open Instagram direct message, '+nameOf('b-dm'),exact:true});await expect(listLink).toHaveAttribute('href','https://ig.me/m/invented.dm');await expect(listLink).toHaveClass('collection-tile-chat chat-link-dm');
 expect(await listLink.evaluate(node=>getComputedStyle(node).color)).toBe(DM);
 for(const id of ['b-off','b-bad'])await expect(page.locator('.collection-compact-tile').filter({has:page.locator(`.collection-tile-main[data-record-id="${id}"]`)}).locator('a'),id).toHaveCount(0);
 await tile.locator('.collection-tile-main').click();await expect(page.locator('.collection-charge')).toHaveCount(1);
 const header=page.locator('.collection-context a.collection-header-chat');await expect(header).toHaveAttribute('href','https://ig.me/m/invented.dm');await expect(header).toHaveAttribute('title','Copy reminder and open Instagram direct message');
 expect(await header.evaluate(node=>getComputedStyle(node).color)).toBe(DM);
});
