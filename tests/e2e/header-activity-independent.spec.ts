import {test,expect,chromium,devices,type Page} from './fixtures/test';
import {spawnSync} from 'node:child_process';import{mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{startCanonicalFixture,fixtureLaunchArgs,assertServed}from'./fixtures/canonical-server';
// R133 (owner, 6 November 2026): whenever the header refresh icon spins, the header sync cell shows the ongoing activity
// (`span.live-sync-status.activity`, no role, no aria-live) instead of "Updated HH:MM": Connecting… while a provisional session
// awaits Firebase, Loading… for any other spin. It appears only after the spin lasts 200 ms and is held 600 ms; the first-download /
// tap-sync percentage and bar win over any label; the hidden `.sync-announcement` live region is unchanged and the refresh
// button's hidden `.live-status-text` reads the same text. Like the R132 startup spec this launches Chromium itself (real Firebase SDK,
// routed account lookup), emulating a phone; the WebKit project skips it (only mobile-chromium runs it).
test.skip(({browserName})=>browserName==='webkit','Launches Chromium directly (the WebKit CI jobs install only WebKit); covered by the mobile-chromium project');
test.beforeEach(async({},info)=>{test.skip(!info.project.name.startsWith('mobile'),'Header cell width is a phone concern; one phone emulation is enough')});
let fixture:any,root:string;
test.beforeAll(async()=>{root=mkdtempSync(join(tmpdir(),'mw-header-activity-'));const transform=(code:string,id:string)=>{if(id.endsWith('/apps/pwa/src/live-main.tsx'))return code+';import {getAuth as fixtureGetAuth,signInWithCustomToken as fixtureSignIn} from "firebase/auth";globalThis.__syntheticSdk={fixtureGetAuth,fixtureSignIn};import {ownerOfflineRepository as fixtureRepository} from "./owner-offline";globalThis.__syntheticRepo=fixtureRepository;'};const script='import{build}from"vite";await build(Object.assign('+JSON.stringify({mode:'live-dev',build:{outDir:join(root,'public'),emptyOutDir:true}})+',{plugins:[{name:"synthetic-sdk-bridge",enforce:"pre",transform:'+transform.toString()+'}]}));';const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'}});expect(result.status,result.stderr).toBe(0);fixture=await startCanonicalFixture(join(root,'public'))});
test.afterAll(async()=>{await fixture?.close();if(root)rmSync(root,{recursive:true,force:true})});test.setTimeout(60000);
const uid='synthetic-header-activity-owner',issuer='https://securetoken.google.com/clever-oasis-508610-n7';
const borrower={id:'S-borrower',borrowerDisplayName:'SYNTHETIC activity borrower',createdDate:null,hasActiveLoan:true,outstandingPrincipal:'110',totalProfitEarned:'0'};
const dashboard={collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]};
const account=(localId:string)=>({users:[{localId,email:'synthetic@example.test',emailVerified:true,providerUserInfo:[]}]});
async function repo(page:Page,method:'authorized'|'cached',argument?:unknown){return page.evaluate(async({issuer,uid,method,argument})=>{const repository=(window as any).__syntheticRepo({issuer,uid});return method==='cached'?repository.readCachedResponse(argument):repository.authorized()},{issuer,uid,method,argument})}
async function launch(language:'English'|'ไทย'='English'){
 const context=await chromium.launchPersistentContext('',{headless:true,...devices['Pixel 7'],viewport:{width:390,height:900},args:fixtureLaunchArgs(fixture.port)});const page=await context.newPage();page.on('pageerror',e=>console.log('S synthetic pageerror: '+e.message));
 const now=Math.floor(Date.now()/1000),token=[{alg:'none',typ:'JWT'},{sub:uid,user_id:uid,aud:'clever-oasis-508610-n7',iss:issuer,iat:now,exp:now+3600,auth_time:now,email:'synthetic@example.test',email_verified:true,firebase:{sign_in_provider:'custom'}}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.synthetic';
 // The Firebase account lookup (lookup) and any command-API path (gate) can be held; delay slows the Dashboard read without holding it.
 const lookup={held:false,waiting:[] as (()=>void)[]};const gate={paths:new Set<string>(),waiting:[] as (()=>void)[],delay:0};
 const release=()=>{lookup.held=false;for(const done of lookup.waiting.splice(0))done();gate.paths.clear();for(const done of gate.waiting.splice(0))done()};
 const json=(body:unknown,status=200)=>({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
 await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname==='dev-lm.mw-credit.com')return r.continue();
  if(u.hostname==='identitytoolkit.googleapis.com'){if(u.pathname.includes('signInWithCustomToken'))return r.fulfill(json({idToken:token,refreshToken:'synthetic-refresh',expiresIn:'3600',isNewUser:false}));if(lookup.held)await new Promise<void>(done=>lookup.waiting.push(done));return r.fulfill(json(account(uid))).catch(()=>{})}
  if(u.hostname==='mw-credit-app-read-dev-test.run.app')return r.fulfill(json({ok:true,source:'dev',businessDate:'2026-10-09',items:[borrower],item:borrower,nextCursor:null,asOf:new Date().toISOString()}));
  if(u.hostname==='mw-credit-app-command-dev-test.run.app'){if(r.request().method()!=='GET')return r.abort('failed');
   if(gate.paths.has(u.pathname))await new Promise<void>(done=>gate.waiting.push(done));else if(u.pathname==='/api/dashboard'&&gate.delay)await new Promise(done=>setTimeout(done,gate.delay));
   if(u.pathname==='/api/dashboard')return r.fulfill(json(dashboard)).catch(()=>{});if(u.pathname==='/api/preferences')return r.fulfill(json({item:{id:'S-partner',version:'a'.repeat(64),language,statementAccountId:null,statementDate:null},accounts:[],dates:[]})).catch(()=>{});return r.fulfill(json({ok:true,items:[],nextCursor:null})).catch(()=>{})}
  return r.abort()});
 await page.goto('https://dev-lm.mw-credit.com');assertServed(fixture);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await page.evaluate(async()=>{const sdk=(window as any).__syntheticSdk;await sdk.fixtureSignIn(sdk.fixtureGetAuth(),'synthetic-custom-token')});
 const kpis=page.getByRole('heading',{name:'KPIs',exact:true});await expect(refresh(page)).toBeVisible();await expect.poll(()=>repo(page,'authorized')).toBe(true);
 await page.reload();await expect(refresh(page)).toBeVisible();await expect.poll(async()=>!!await repo(page,'cached','json:https://mw-credit-app-command-dev-test.run.app/api/dashboard')).toBe(true);
 // Records every moment a `.activity` label or a `.syncing` bar exists in the header cell, even for a few milliseconds.
 await page.addInitScript(()=>{const seen={activity:[] as string[],syncing:0,percent:false};(window as any).__headerSeen=seen;const scan=()=>{for(const el of document.querySelectorAll('.header-sync-cell .live-sync-status.activity'))if(!seen.activity.includes(el.textContent??''))seen.activity.push(el.textContent??'');const bar=document.querySelector('.header-sync-cell .live-sync-status.syncing');if(bar){seen.syncing++;if(bar.querySelector('.header-load-percent')&&bar.querySelector('progress'))seen.percent=true}};new MutationObserver(scan).observe(document,{subtree:true,childList:true,characterData:true,attributes:true});scan()});
 return {context,page,kpis,lookup,gate,release};
}
const refresh=(page:Page)=>page.locator('.live-header-refresh.collection-update');
const cell=(page:Page)=>page.locator('.header-sync-cell');
const activity=(page:Page)=>page.locator('.header-sync-cell .live-sync-status.activity');
const announcement=(page:Page)=>page.locator('.sync-announcement').textContent();
const seen=(page:Page)=>page.evaluate(()=>(window as any).__headerSeen as {activity:string[];syncing:number;percent:boolean});
async function geometry(page:Page){return page.evaluate(()=>{const box=document.querySelector('.header-sync-cell')!.getBoundingClientRect(),label=document.querySelector('.header-sync-cell .live-sync-status.activity')!.getBoundingClientRect();return {cellWidth:box.width,cellHeight:box.height,labelWidth:label.width,labelHeight:label.height,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}})}
async function expectShape(page:Page,label:string){
 const text=activity(page);await expect(text).toHaveText(label);await expect(text).toBeVisible();
 expect(await text.getAttribute('role')).toBeNull();expect(await text.getAttribute('aria-live')).toBeNull();expect(await text.locator('[role],[aria-live]').count()).toBe(0);
 const box=await geometry(page);expect(box.cellWidth).toBeLessThanOrEqual(88.5);expect(box.cellHeight).toBeLessThanOrEqual(44.5);expect(box.labelWidth).toBeLessThanOrEqual(88.5);expect(box.overflow).toBeLessThanOrEqual(0);
 await expect(refresh(page).locator('.live-status-text')).toHaveText(label);
}
// The synthetic read API never completes the offline data set, so the base status is 'Download incomplete' (or the time once a check
// completes): either way a normal non-activity status, which is what must return after a label.
const updated=/^(Updated \d\d:\d\d|Download incomplete.*)$/,updatedThai=/^(อัปเดต \d\d:\d\d|ดาวน์โหลดไม่ครบ.*)$/;

test('a held Firebase account lookup shows Connecting… in the header cell, then the time returns once it is answered',async()=>{
 const{context,page,kpis,lookup,release}=await launch();
 try{
  await expect(cell(page).locator('.live-sync-status')).toHaveText(updated);
  lookup.held=true;await page.reload();await expect(kpis).toBeVisible({timeout:1500});await expect.poll(()=>lookup.waiting.length).toBe(1);
  await expectShape(page,'Connecting…');
  expect(await announcement(page)).not.toMatch(/Connecting|Loading/);
  release();
  // Held at least 600 ms once shown, then the time comes back and the label is gone.
  await expect(activity(page)).toHaveCount(0,{timeout:5000});await expect(cell(page).locator('.live-sync-status')).toHaveText(updated);
  await expect(refresh(page).locator('.live-status-text')).not.toHaveText('Connecting…');
 }finally{release();await context.close()}
});

test('the same hold reads กำลังเชื่อมต่อ… in Thai and the time returns as อัปเดต',async()=>{
 const{context,page,lookup,release}=await launch('ไทย');
 try{
  lookup.held=true;await page.reload();await expect.poll(()=>lookup.waiting.length).toBe(1);
  await expectShape(page,'กำลังเชื่อมต่อ…');
  release();await expect(activity(page)).toHaveCount(0,{timeout:5000});await expect(cell(page).locator('.live-sync-status')).toHaveText(updatedThai);
 }finally{release();await context.close()}
});

test('a held Dashboard read shows Loading…, leaves the live region alone, and the time returns when it answers',async()=>{
 const{context,page,kpis,gate,release}=await launch();
 try{
  await expect(cell(page).locator('.live-sync-status')).toHaveText(updated);
  gate.paths.add('/api/dashboard');await page.reload();
  await expectShape(page,'Loading…');
  expect(await announcement(page)).not.toMatch(/Connecting|Loading/);
  release();await expect(kpis).toBeVisible();
  await expect(activity(page)).toHaveCount(0,{timeout:5000});await expect(cell(page).locator('.live-sync-status')).toHaveText(updated);
 }finally{release();await context.close()}
});

test('a Dashboard read that answers in about 50 ms never shows a label (200 ms rule)',async()=>{
 const{context,page,kpis,gate}=await launch();
 try{
  gate.delay=50;await page.reload();await expect(kpis).toBeVisible();await page.waitForTimeout(400);
  expect((await seen(page)).activity).toEqual([]);await expect(activity(page)).toHaveCount(0);
  // A short spin never blanked the time either.
  await expect(cell(page).locator('.live-sync-status')).toHaveText(updated);
 }finally{await context.close()}
});

test('tapping refresh shows the percentage and bar and no activity label, even while the Dashboard read is held',async()=>{
 const{context,page,kpis,gate,release}=await launch();
 try{
  // The recorder is an init script, so it only exists in a document loaded after launch().
  await page.reload();await expect(kpis).toBeVisible();await expect(cell(page).locator('.live-sync-status')).toHaveText(updated);
  gate.paths.add('/api/dashboard');
  await refresh(page).click();
  await expect(cell(page).locator('.live-sync-status.syncing .header-load-percent')).toBeVisible();await expect(cell(page).locator('.live-sync-status.syncing progress')).toBeVisible();
  await page.waitForTimeout(900);
  expect((await seen(page)).activity).toEqual([]);await expect(activity(page)).toHaveCount(0);
  release();await expect(cell(page).locator('.live-sync-status')).toHaveText(updated,{timeout:8000});
  const afterwards=await seen(page);expect(afterwards.activity).toEqual([]);expect(afterwards.percent).toBe(true);
 }finally{release();await context.close()}
});
