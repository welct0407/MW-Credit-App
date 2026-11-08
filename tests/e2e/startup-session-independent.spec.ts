import {test,expect,chromium,devices,type Page} from './fixtures/test';
import {spawnSync} from 'node:child_process';import{mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{startCanonicalFixture,fixtureLaunchArgs,assertServed}from'./fixtures/canonical-server';
// R132: a reopened app shows its saved workspace before Firebase confirms the persisted user (real SDK; the account lookup is
// routed and held). Reads wait for the confirmation; an expired or different account goes straight to its existing path.
// These specs launch Chromium themselves (the live-dev fixture needs --host-resolver-rules), so the WebKit project would only repeat a Chromium run.
test.skip(({browserName})=>browserName==='webkit','Launches Chromium directly; covered by the Chromium projects');
let fixture:any,root:string,mobile=false;test.beforeEach(async({},info)=>{mobile=info.project.name.startsWith('mobile')});
test.beforeAll(async()=>{root=mkdtempSync(join(tmpdir(),'mw-startup-session-'));const transform=(code:string,id:string)=>{if(id.endsWith('/apps/pwa/src/live-main.tsx'))return code+';import {getAuth as fixtureGetAuth,signInWithCustomToken as fixtureSignIn} from "firebase/auth";globalThis.__syntheticSdk={fixtureGetAuth,fixtureSignIn};import {ownerOfflineRepository as fixtureRepository} from "./owner-offline";globalThis.__syntheticRepo=fixtureRepository;'};const script='import{build}from"vite";await build(Object.assign('+JSON.stringify({mode:'live-dev',build:{outDir:join(root,'public'),emptyOutDir:true}})+',{plugins:[{name:"synthetic-sdk-bridge",enforce:"pre",transform:'+transform.toString()+'}]}));';const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'}});expect(result.status,result.stderr).toBe(0);fixture=await startCanonicalFixture(join(root,'public'))});
test.afterAll(async()=>{await fixture?.close();if(root)rmSync(root,{recursive:true,force:true})});test.setTimeout(60000);
const uid='synthetic-startup-session-owner',otherUid='synthetic-startup-session-other',issuer='https://securetoken.google.com/clever-oasis-508610-n7',firebaseKey='firebase:authUser:synthetic-public-key:[DEFAULT]',requestId='5b0a2c1e-7f4d-4b1a-9c3e-2d6f8a9b0c1d';
const borrower={id:'S-borrower',borrowerDisplayName:'SYNTHETIC session borrower',createdDate:null,hasActiveLoan:true,outstandingPrincipal:'110',totalProfitEarned:'0'};
const dashboard={collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]};
const account=(localId:string)=>({users:[{localId,email:'synthetic@example.test',emailVerified:true,providerUserInfo:[]}]});
async function repo(page:Page,owner:string,method:'authorized'|'list'|'purge'|'cached',argument?:unknown){return page.evaluate(async({issuer,owner,method,argument})=>{const repository=(window as any).__syntheticRepo({issuer,uid:owner});return method==='list'?repository.list(argument):method==='purge'?repository.purge(argument):method==='cached'?repository.readCachedResponse(argument):repository.authorized()},{issuer,owner,method,argument})}
async function launch(){
 const context=await chromium.launchPersistentContext('',{headless:true,...(mobile?devices['Pixel 7']:devices['Desktop Chrome']),viewport:{width:390,height:900},args:fixtureLaunchArgs(fixture.port)});const page=await context.newPage();page.on('pageerror',e=>console.log('S synthetic pageerror: '+e.message));
 const now=Math.floor(Date.now()/1000),token=[{alg:'none',typ:'JWT'},{sub:uid,user_id:uid,aud:'clever-oasis-508610-n7',iss:issuer,iat:now,exp:now+3600,auth_time:now,email:'synthetic@example.test',email_verified:true,firebase:{sign_in_provider:'custom'}}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.synthetic';
 // The account lookup Firebase makes before it reports a persisted user: held, then answered with `reply`.
 const lookup={held:false,waiting:[] as (()=>void)[],reply:{status:200,body:account(uid) as unknown}};
 const release=()=>{lookup.held=false;for(const done of lookup.waiting.splice(0))done()};
 const reads:string[]=[];let dashboardStatus=200;
 context.on('request',(request:any)=>{if(!/mw-credit-app-(command|read)-dev-test/.test(request.url()))return;let owner:any=null;try{owner=request.frame().page()}catch{}if(!owner||owner===page)reads.push(new URL(request.url()).pathname)});
 const json=(body:unknown,status=200)=>({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
 await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname==='dev-lm.mw-credit.com')return r.continue();
  if(u.hostname==='identitytoolkit.googleapis.com'){if(u.pathname.includes('signInWithCustomToken'))return r.fulfill(json({idToken:token,refreshToken:'synthetic-refresh',expiresIn:'3600',isNewUser:false}));if(lookup.held)await new Promise<void>(done=>lookup.waiting.push(done));return r.fulfill(json(lookup.reply.body,lookup.reply.status)).catch(()=>{})}
  if(u.hostname==='mw-credit-app-read-dev-test.run.app')return r.fulfill(json({ok:true,source:'dev',businessDate:'2026-10-09',items:[borrower],item:borrower,nextCursor:null,asOf:new Date().toISOString()}));
  if(u.hostname==='mw-credit-app-command-dev-test.run.app'){if(r.request().method()!=='GET')return r.abort('failed');if(u.pathname==='/api/dashboard')return r.fulfill(json(dashboard,dashboardStatus));if(u.pathname==='/api/preferences')return r.fulfill(json({item:{id:'S-partner',version:'a'.repeat(64),language:'English',statementAccountId:null,statementDate:null},accounts:[],dates:[]}));return r.fulfill(json({ok:true,items:[],nextCursor:null}))}
  return r.abort()});
 await page.goto('https://dev-lm.mw-credit.com');assertServed(fixture);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await page.evaluate(async()=>{const sdk=(window as any).__syntheticSdk;await sdk.fixtureSignIn(sdk.fixtureGetAuth(),'synthetic-custom-token')});
 const kpis=page.getByRole('heading',{name:'KPIs',exact:true});await expect(kpis).toBeVisible();await expect.poll(()=>repo(page,uid,'authorized')).toBe(true);
 // The first read ran before the device lease existed; one confirmed reopen saves the Dashboard copy a device would hold.
 await page.reload();await expect(kpis).toBeVisible();await expect.poll(async()=>!!await repo(page,uid,'cached','json:https://mw-credit-app-command-dev-test.run.app/api/dashboard')).toBe(true);
 return {context,page,kpis,lookup,release,reads,setDashboard:(status:number)=>{dashboardStatus=status}};
}
const refresh=(page:Page)=>page.locator('.live-header-refresh.collection-update');
const connectingCard=(page:Page)=>page.locator('main .access-blocked[aria-busy="true"]').getByRole('heading',{name:'Connecting…',exact:true});

test('a held account lookup shows the saved Dashboard at once and sends no reads until Firebase confirms the same account',async()=>{
 const{context,page,kpis,lookup,release,reads}=await launch();
 try{
  lookup.held=true;reads.length=0;
  await page.reload();
  await expect(kpis).toBeVisible({timeout:1500});
  await expect.poll(()=>lookup.waiting.length).toBe(1);
  await expect(refresh(page)).toBeDisabled();await expect(refresh(page)).toHaveAttribute('aria-busy','true');await expect(refresh(page).locator('.live-status-text')).toHaveText('Connecting…');
  await expect(page.getByText('Checking app…')).toHaveCount(0);await expect(page.locator('main .access-blocked')).toHaveCount(0);await expect(page.getByRole('button',{name:'Continue with Google'})).toHaveCount(0);
  await page.waitForTimeout(1000);expect(reads).toEqual([]);await expect(kpis).toBeVisible();
  release();
  await expect.poll(()=>reads.filter(path=>path==='/api/dashboard').length).toBe(1);
  await expect(refresh(page).locator('.live-status-text')).not.toHaveText('Connecting…');
  await page.waitForTimeout(1500);
  // One read per route (the background dataset preparation pages through its own domains).
  const routes=reads.filter(path=>!path.endsWith('/offline-dataset'));expect(routes.filter(path=>path==='/api/dashboard')).toHaveLength(1);expect(routes.length).toBe(new Set(routes).size);
  await expect(kpis).toBeVisible();expect(await repo(page,uid,'authorized')).toBe(true);
 }finally{release();await context.close()}
});

test('an expired persisted session goes from the saved Dashboard straight to sign-in, clears the lease and keeps a pending row',async()=>{
 const{context,page,kpis,lookup,release,reads}=await launch();
 try{
  await page.evaluate(async({issuer,uid,requestId})=>{await(window as any).__syntheticRepo({issuer,uid}).savePending(requestId,{domain:'borrower',command:{requestId,operation:'borrower.update',inputs:{note:'unsynced'}}})},{issuer,uid,requestId});
  lookup.held=true;lookup.reply={status:400,body:{error:{code:400,message:'TOKEN_EXPIRED',errors:[{message:'TOKEN_EXPIRED',domain:'global',reason:'invalid'}]}}};reads.length=0;
  await page.reload();await expect(kpis).toBeVisible();await expect.poll(()=>lookup.waiting.length).toBe(1);
  release();
  await expect(page.getByRole('heading',{name:'Sign in to continue',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible();
  await expect(kpis).toHaveCount(0);expect(reads).toEqual([]);
  await expect.poll(()=>repo(page,uid,'authorized')).toBe(false);
  const pending=await repo(page,uid,'list','pending') as any[];expect(pending).toHaveLength(1);expect(pending[0].value.command.requestId).toBe(requestId);
  expect(await page.evaluate(key=>localStorage.getItem(key),firebaseKey)).toBeNull();
 }finally{release();await context.close()}
});

test('a lookup that answers another account purges the saved scope (pending kept) and shows none of its Dashboard',async()=>{
 const{context,page,kpis,lookup,release,setDashboard}=await launch();
 try{
  await page.evaluate(async({issuer,uid,requestId})=>{await(window as any).__syntheticRepo({issuer,uid}).savePending(requestId,{domain:'borrower',command:{requestId,operation:'borrower.update',inputs:{note:'unsynced'}}})},{issuer,uid,requestId});
  lookup.held=true;lookup.reply={status:200,body:account(otherUid)};
  await page.reload();await expect(kpis).toBeVisible();await expect.poll(()=>lookup.waiting.length).toBe(1);
  // The other account's Dashboard read fails, so any KPIs shown after the switch could only be the first account's saved copy.
  setDashboard(503);release();
  await expect(page.getByRole('button',{name:'Retry Dashboard',exact:true})).toBeVisible();await expect(kpis).toHaveCount(0);
  await expect.poll(()=>repo(page,uid,'authorized')).toBe(false);
  expect(await repo(page,uid,'list','pending')).toHaveLength(1);expect(await repo(page,otherUid,'list','pending')).toHaveLength(0);
 }finally{release();await context.close()}
});

test('without a device lease the app shows a plain Connecting card until Firebase confirms, then loads',async()=>{
 const{context,page,kpis,lookup,release,reads}=await launch();
 try{
  await repo(page,uid,'purge',{keepPending:true});expect(await repo(page,uid,'authorized')).toBe(false);
  lookup.held=true;reads.length=0;
  await page.reload();await expect.poll(()=>lookup.waiting.length).toBe(1);
  await expect(connectingCard(page)).toBeVisible();await expect(page.locator('main .access-blocked button')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Continue with Google'})).toHaveCount(0);await expect(kpis).toHaveCount(0);
  await expect(refresh(page).locator('.live-status-text')).toHaveText('Connecting…');
  await page.waitForTimeout(800);expect(reads).toEqual([]);
  release();
  await expect(kpis).toBeVisible();await expect(page.locator('main .access-blocked')).toHaveCount(0);
  expect(reads.filter(path=>path==='/api/dashboard')).toHaveLength(1);
 }finally{release();await context.close()}
});
