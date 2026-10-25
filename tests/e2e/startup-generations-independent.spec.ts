import {test,expect,chromium,devices,type Page} from '@playwright/test';
import {spawnSync} from 'node:child_process';import{createHash}from'node:crypto';import{mkdtempSync,rmSync,readFileSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{startCanonicalFixture,fixtureLaunchArgs,assertServed}from'./fixtures/canonical-server';
let fixture:any,root:string,owned=false,mobile=false;const builds:Record<string,string>={};test.beforeEach(async({},info)=>{mobile=info.project.name.startsWith('mobile')});
test.beforeAll(async()=>{root=mkdtempSync(join(tmpdir(),'mw-startup-generations-'));owned=true;for(const label of ['A','B','C']){builds[label]=join(root,label);const transform=(code:string,id:string)=>{if(id.endsWith('/apps/pwa/src/live-main.tsx'))return code+';import {getAuth as fixtureGetAuth,signInWithCustomToken as fixtureSignIn} from "firebase/auth";globalThis.__syntheticSdk={fixtureGetAuth,fixtureSignIn};import {ownerOfflineRepository as fixtureRepository} from "./owner-offline";globalThis.__syntheticRepo=fixtureRepository;globalThis.__syntheticBuildLabel='+JSON.stringify(label)+';';};const script='import{build}from"vite";await build(Object.assign('+JSON.stringify({mode:'live-dev',build:{outDir:builds[label],emptyOutDir:true}})+',{plugins:[{name:"synthetic-sdk-bridge",enforce:"pre",transform:'+transform.toString().replace('JSON.stringify(label)',JSON.stringify(JSON.stringify(label)))+'}]}));';const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'}});expect(result.status,result.stderr).toBe(0)}fixture=await startCanonicalFixture(builds.A)});
test.afterAll(async()=>{await fixture?.close();if(owned)rmSync(root,{recursive:true,force:true})});test.setTimeout(45000);
const v='a'.repeat(64),_v2='b'.repeat(64),uid='synthetic-phase5-final-owner',requestId='07eae274-c4e9-44e9-bff4-900c3bf37c9b',receiptId='fe93a8d6-3050-449e-9bba-949da4acf246';
const borrower={id:'C-borrower',borrowerDisplayName:'SYNTHETIC final borrower',createdDate:null,hasActiveLoan:true,outstandingPrincipal:'110',totalProfitEarned:'0'};
const accounts=[{id:'C-account',label:'Synthetic account',holderId:'ch:lisa',holderLabel:'Lisa'}];
const loan={id:'C-loan',borrowerId:borrower.id,borrowerDisplayName:borrower.borrowerDisplayName,principal:'110',principalAmount:'110',originalRate:'2',originalDailyInterestRate:'2',loanDate:'2026-10-09',status:'ยังไม่ปิดยอด',type:'ดอกเบี้ยรายวัน',autoChargeEnabled:true,defaulted:false,version:v};
const closeA={ok:true,businessDate:'2026-10-09',sourceVersion:v,amount:'115',planHash:v,accounts};
const closeDraft={kind:'close',item:{id:'C-loan',borrowerId:borrower.id,borrowerDisplayName:borrower.borrowerDisplayName},requestId,preview:closeA,account:'C-account',method:'Cash',notes:'exact saved close ไทย',receipt:receiptId,receiptName:'synthetic.png'};
const fields={borrowerId:borrower.id,amountReceived:'10',paymentDate:'2026-10-09',paymentMethod:'Cash',cashAccountId:'C-account',notes:'exact saved correction ไทย',allocationMethod:'Selected Charges',targetChargeId:null,targetLoanId:null};
const line={chargeId:'C-charge',principal:'8',interest:'2',expectedPrincipalRemaining:'10',expectedInterestRemaining:'5',chargeDate:'2026-10-09'};
const previewA={origin:'pwa-plan',sourceVersion:v,predecessorRequestId:requestId,source:{id:'C-payment',borrowerName:borrower.borrowerDisplayName,...fields,receiptReference:'synthetic-reference',allocations:[]},balances:[{chargeId:'C-charge',loanId:'C-loan',chargeDate:'2026-10-09',principalRemaining:'10',interestRemaining:'5'}],loans:[]};
const _correctionDraft={kind:'correction',id:'C-payment',requestId,preview:previewA,fields,accounts,lines:{'C-charge':line},closeHash:null,receiptMode:'replace',receiptId};
const preferenceA={item:{id:'C-partner',version:v,language:'English',statementAccountId:'C-account',statementDate:'2026-10-09'},accounts,dates:['2026-10-09']};
type S={posts:any[],pendingAtPost:any[],close:any,correction:any,preferences:any,deleted:boolean,receiptReads:string[],manualFail:boolean,record:any};
// R083: a failed build check shows the startup card, or, when the saved workspace was already shown during the check
// (which happens when the check runs slower than the restore, as under load), keeps it with the paused-changes banner.
// Both are the failed check; either offers Retry.
const checkFailed=(page:Page)=>page.getByRole('heading',{name:'Unable to check app version',exact:true}).or(page.getByText(/^Couldn.t check the app version\. Changes are paused\./));
// A route handler may read the saved store while the page navigates (a build activation reloads it); that read waits until
// the new page has loaded its app bundle and reads again.
async function repo(page:Page,kind:string){for(let attempt=0;;attempt++){try{return await page.evaluate(async kind=>(window as any).__syntheticRepo({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-phase5-final-owner'}).list(kind),kind)}catch(error){if(attempt>=5||!/Execution context was destroyed|__syntheticRepo is not a function/.test(String(error)))throw error;await page.waitForLoadState('load');await page.waitForFunction(()=>typeof (window as any).__syntheticRepo==='function').catch(()=>{})}}}
async function seed(page:Page,domain:string,id:string,draft:any){await page.evaluate(async({domain,id,draft})=>{await(window as any).__syntheticRepo({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-phase5-final-owner'}).saveDraft(domain+':'+id,{domain,label:'Synthetic '+domain+' final draft',draft})},{domain,id,draft})}
async function reopenCloseDraft(page:Page){await page.getByRole('button',{name:'Borrowers',exact:true}).filter({visible:true}).click();await page.locator('.borrower-tile-main').click();await page.locator('.loan-record').click();await page.getByRole('button',{name:'Close Loan',exact:true}).click();await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue(closeDraft.notes)}
async function launch(setup?:(context:any,page:Page)=>Promise<void>){console.log('C static stage: launch');
 const context=await chromium.launchPersistentContext('',{headless:true,...(mobile?devices['Pixel 7']:devices['Desktop Chrome']),viewport:{width:320,height:900},args:fixtureLaunchArgs(fixture.port)});console.log('C static stage: context ready');const page=await context.newPage();page.on('pageerror',e=>console.log('C synthetic pageerror: '+e.message));const now=Math.floor(Date.now()/1000),token=[{alg:'none',typ:'JWT'},{sub:uid,user_id:uid,aud:'clever-oasis-508610-n7',iss:'https://securetoken.google.com/clever-oasis-508610-n7',iat:now,exp:now+3600,auth_time:now,email:'synthetic@example.test',email_verified:true,firebase:{sign_in_provider:'custom'}}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.synthetic';
 const s:S={posts:[],pendingAtPost:[],close:closeA,correction:previewA,preferences:preferenceA,deleted:false,receiptReads:[],manualFail:true,record:null};
 await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname==='dev-lm.mw-credit.com')return r.continue();if(u.hostname==='identitytoolkit.googleapis.com')return r.fulfill({contentType:'application/json',body:JSON.stringify(u.pathname.includes('signInWithCustomToken')?{idToken:token,refreshToken:'synthetic-refresh',expiresIn:'3600',isNewUser:false}:{users:[{localId:uid,email:'synthetic@example.test',emailVerified:true,providerUserInfo:[]}]})});if(u.hostname==='mw-credit-app-read-dev-test.run.app')return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:'2026-10-09',horizonEnd:'2027-01-09',reviewRequired:false,items:u.pathname.includes('/loans')?[loan]:u.pathname.endsWith('/upcoming')?[]:[borrower],item:borrower,borrower,nextCursor:null,asOf:new Date().toISOString()})});
 if(u.hostname==='mw-credit-app-command-dev-test.run.app'){
 let data:any={ok:true,items:[],nextCursor:null};
 if(r.request().method()!=='GET'){s.posts.push({path:u.pathname,body:r.request().postDataJSON()});s.pendingAtPost.push(await repo(page,'pending'));return r.abort('failed')}
 if(u.pathname==='/api/borrower-records/C-borrower')data={ok:true,item:{...borrower,name:borrower.borrowerDisplayName,version:v}};
 else if(u.pathname==='/api/loan-records/C-loan')data={ok:true,item:loan};
 else if(u.pathname.endsWith('/close-preview'))data=s.close;
 else if(u.pathname.endsWith('/correction-preview')){if(s.deleted)return r.fulfill({status:404,body:'{}'});data={ok:true,item:s.correction}}
 else if(u.pathname==='/api/preferences')data=s.preferences;
 else if(u.pathname==='/api/cash-overview')data={dashboard:{},accounts:[]};
 else if(u.pathname==='/api/cash-statements')data={summary:{openingBalance:'20',moneyIn:'5',moneyOut:'10',netMovement:'-5',closingBalance:'15',transactionCount:1},items:[{id:'C-ledger',date:'2026-10-09',transactionType:'Payment details',amount:'5',balanceAfter:'15',paymentId:'C-payment',notes:'synthetic ledger note'}],nextCursor:null};
 else if(u.pathname.endsWith('/receipt')){const source=u.searchParams.get('source')??'preferred';s.receiptReads.push(source);if(source!=='agent'&&s.manualFail)return r.fulfill({status:422,body:'{}'});return r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ZkAAAAASUVORK5CYII=','base64')})}
 else if(u.pathname.startsWith('/api/payment-records/'))data={ok:true,item:{...s.record,asOf:new Date().toISOString(),businessDate:'2026-10-09'}};
 else if(u.pathname==='/api/borrower-options')data={ok:true,accounts,referrers:[{id:'C-other',label:'Synthetic destination'}]};
 return r.fulfill({contentType:'application/json',body:JSON.stringify(data)})}return r.abort()});
 await context.route('https://mw-credit-app-command-dev-test.run.app/api/dashboard',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})}));if(setup)await setup(context,page);await page.goto('https://dev-lm.mw-credit.com');assertServed(fixture);console.log('C static stage: page loaded');await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);await page.evaluate(async()=>{const sdk=(window as any).__syntheticSdk;await sdk.fixtureSignIn(sdk.fixtureGetAuth(),'synthetic-custom-token')});console.log('C static stage: SDK signed in');return{context,page,s};
}


test('real startup gates reads across held metadata failed asset retry and three builds without forcing old edited tab',async()=>{fixture.hold('/build-version.json');let apiReads=0;
 // Reads made by the page under test. The second tab opened below runs its own offline-dataset
 // sync (the fixture serves no dataset, so its domains fail and are retried whenever a live read
 // there re-authorizes); that independent tab's background reads are not startup reads of this page.
 // A request with no page (service worker) still counts.
 const{context,page,s}=await launch(async(context,target)=>{context.on('request',(request:any)=>{if(!/mw-credit-app-(command|read)-dev-test/.test(request.url()))return;let owner:any=null;try{owner=request.frame().page()}catch{}if(!owner||owner===target)apiReads++})});let old:any;try{await expect(page.locator('.topbar .app-update-status')).toHaveText('Checking app…');expect(apiReads).toBe(0);fixture.release('/build-version.json');await expect(page.getByRole('heading',{name:'KPIs',exact:true})).toBeVisible();const initialReads=apiReads;expect(initialReads).toBeGreaterThan(0);await seed(page,'loan','close:C-loan',closeDraft);await page.evaluate(async({requestId})=>{await(window as any).__syntheticRepo({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-phase5-final-owner'}).savePending(requestId,{domain:'loan',command:{requestId,operation:'loan.close'}})},{requestId});old=await context.newPage();await old.goto('https://dev-lm.mw-credit.com');await expect(old.getByRole('heading',{name:'KPIs',exact:true})).toBeVisible();await reopenCloseDraft(old);await expect(old.getByRole('region',{name:'Closing amount',exact:true}).locator('dd').last()).toHaveText('฿115');await old.getByRole('textbox',{name:'Notes',exact:true}).fill('old tab exact latest ไทย');await expect.poll(async()=>(await repo(old,'draft'))[0].value.draft.notes).toBe('old tab exact latest ไทย');let oldLoads=0;old.on('load',()=>oldLoads++);const oldEntry=JSON.parse(readFileSync(join(builds.A,'build-version.json'),'utf8')).entry;
 const b=JSON.parse(readFileSync(join(builds.B,'build-version.json'),'utf8'));fixture.setBuildRoot(builds.B);fixture.fail(b.entry,503);const baseline=apiReads;await page.reload();await expect(checkFailed(page)).toBeVisible();expect(apiReads).toBe(baseline);expect(await page.evaluate(()=>(window as any).__syntheticBuildLabel)).toBe('A');const oldVersion=JSON.parse(readFileSync(join(builds.A,'build-version.json'),'utf8')).version;expect(await page.evaluate(()=>caches.keys())).toContain('mw-credit-dev-public-'+oldVersion);expect((await repo(page,'pending'))[0].value.command.requestId).toBe(requestId);fixture.fail(b.entry,null);fixture.hold(b.entry);await page.getByRole('button',{name:'Retry',exact:true}).click();
 // Chromium may start its own update of the registration (navigation soft update, queued behind
 // the failed install) before the retried register() resolves; register() then waits for that
 // install, which is held on the entry, so the retry shows "Checking app…" until release. Either
 // label is the retry in progress; the held entry proves an update is under way.
 // R083: this device is signed in with an authorized offline bundle, so the retry shows either the saved workspace or the upgrade status (a new build is installing, so the check turns into an upgrade at once) while the install is held; reads still wait.
 await expect.poll(()=>fixture.heldCount(b.entry)).toBeGreaterThan(0);await expect.poll(async()=>(await page.locator('.topbar .app-update-status').allTextContents()).join('')==='Updating app…'||await page.getByRole('heading',{name:'KPIs',exact:true}).isVisible()).toBe(true);await expect(checkFailed(page)).toHaveCount(0);expect(apiReads).toBe(baseline);let autoLoads=0;page.on('load',()=>autoLoads++);fixture.release(b.entry);await expect.poll(async()=>{try{return await page.evaluate(()=>(window as any).__syntheticBuildLabel)}catch{return null}}).toBe('B');await expect(page.getByRole('heading',{name:'KPIs',exact:true})).toBeVisible();expect(autoLoads).toBe(1);expect(oldLoads).toBe(0);await expect(old.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('old tab exact latest ไทย');expect((await repo(old,'pending'))[0].value.command.requestId).toBe(requestId);
 fixture.setBuildRoot(builds.C);await page.reload();await expect.poll(async()=>{try{return await page.evaluate(()=>(window as any).__syntheticBuildLabel)}catch{return null}}).toBe('C');await expect(page.getByRole('heading',{name:'KPIs',exact:true})).toBeVisible();expect(oldLoads).toBe(0);await expect(old.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('old tab exact latest ไทย');const response=await old.evaluate(async(path:string)=>{const response=await fetch(path);return{status:response.status,body:await response.text()}},oldEntry);expect(response.status).toBe(200);expect(response.body).toContain('__syntheticBuildLabel');expect((await repo(old,'pending'))[0].value.command.requestId).toBe(requestId);const entries=await old.evaluate(async()=>Promise.all((await caches.keys()).map(async name=>(await(await caches.open(name)).keys()).map(r=>new URL(r.url).pathname))));expect(entries.flat().filter(path=>/^\/(api|auth|receipt)\//.test(path))).toEqual([]);expect(s.posts).toHaveLength(0);
 // R072: activation with tabs open keeps the current and previous builds plus the build an open tab reports running, and prunes the rest.
 // A new build's activation reloads the page by itself (R072/R083); a read that lands in that navigation waits for the new page and reads again.
 const publicCaches=async()=>{for(let attempt=0;;attempt++){try{return(await page.evaluate(()=>caches.keys())).filter((name:string)=>name.startsWith('mw-credit-dev-public-'))}catch(error){if(attempt>=5||!/Execution context was destroyed/.test(String(error)))throw error;await page.waitForLoadState('load')}}},cacheOf=(label:string)=>'mw-credit-dev-public-'+JSON.parse(readFileSync(join(builds[label],'build-version.json'),'utf8')).version;
 expect(await publicCaches()).toEqual(expect.arrayContaining([cacheOf('A'),cacheOf('C')]));expect((await publicCaches()).length).toBeLessThanOrEqual(3);
 await old.close();old=null;fixture.setVersion('D');const fourth='mw-credit-dev-public-'+createHash('sha256').update('fixture_D').digest('hex').slice(0,24);await page.reload();await expect.poll(async()=>{try{return await publicCaches()}catch{return[]}},{timeout:20000}).toEqual(expect.arrayContaining([fourth]));await expect(page.getByRole('heading',{name:'KPIs',exact:true})).toBeVisible();await expect.poll(async()=>(await publicCaches()).length).toBeLessThanOrEqual(2);expect(await publicCaches()).toContain(fourth)}finally{fixture.release('/build-version.json');for(const label of ['A','B','C'])fixture.release(JSON.parse(readFileSync(join(builds[label],'build-version.json'),'utf8')).entry);await context.close()}});



// R083: a warm launch (signed in, authorized offline bundle) renders the workspace from the device while the version check is
// in flight; network reads and writes wait for the check, and a failed check pauses changes without removing the workspace.
test('R083 warm launch shows cached workspace while the check is held, parks reads and writes, skips the redundant update, and pauses changes inline when the check fails',async()=>{
 test.skip(mobile,'Desktop-only: viewport is fixed by launch(); the mobile project adds no coverage for this flow');
 let apiReads=0;
 fixture.setBuildRoot(builds.A);fixture.fail('/build-version.json',null);
 const{context,page,s}=await launch(async(context,target)=>{await context.route(/mw-credit-app-command-dev-test\.run\.app\/api\/operations\/[^/?]+/,r=>r.request().method()==='GET'?r.fulfill({contentType:'application/json',body:JSON.stringify({kind:'unresolved'})}):r.fallback());context.on('request',(request:any)=>{if(!/mw-credit-app-(command|read)-dev-test/.test(request.url()))return;let owner:any=null;try{owner=request.frame().page()}catch{}if(!owner||owner===target)apiReads++})});
 const count=(path:string)=>fixture.requests.filter((r:any)=>r.path===path).length;
 const kpis=page.getByRole('heading',{name:'KPIs',exact:true}),status=page.locator('.app-update-status'),refresh=page.locator('.header-sync-cell ~ .live-header-refresh.collection-update, .live-header-refresh.collection-update').first();
 try{
  // First launch has no cache: the gate keeps "Checking app…" and nothing reads until the check passes (fixture is not held, so assert on a held first load below via the context's first page only when held).
  await expect(kpis).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__syntheticRepo({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'synthetic-phase5-final-owner'}).authorized())).toBe(true);
  await expect(status).toHaveCount(0);
  // 2. Fast path: the current page, no waiting or installing worker and an up-to-date active worker make no second sw.js fetch.
  // register() on an existing registration with the same script does not fetch; a navigation soft update is skipped by the browser
  // while the script was checked recently. The only remaining sw.js request in a reload was the explicit registration.update().
  const swBefore=count('/sw.js'),versionBefore=count('/build-version.json');
  await page.reload();
  await expect.poll(()=>count('/build-version.json')).toBe(versionBefore+1);
  await expect(kpis).toBeVisible();await expect(status).toHaveCount(0);
  await page.waitForTimeout(750);
  expect(count('/sw.js')-swBefore).toBe(0);
  expect(await page.evaluate(()=>(window as any).__syntheticBuildLabel)).toBe('A');
  // 1. Warm launch while the check is held.
  fixture.hold('/build-version.json');
  const readsBeforeReload=apiReads;
  await page.reload();
  await expect.poll(()=>fixture.heldCount('/build-version.json')).toBeGreaterThan(0);
  await expect(kpis).toBeVisible();
  const readsWhileHeld=apiReads;
  await expect(status).toHaveCount(0);await expect(page.getByText('Checking app…')).toHaveCount(0);
  await expect(refresh).toBeDisabled();
  await expect(page.locator('.refresh-failed')).toHaveCount(0);await expect(page.getByText(/Could not update|Couldn.t check the app version/)).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(apiReads).toBe(readsWhileHeld);expect(readsWhileHeld).toBe(readsBeforeReload);
  // 3a. A write submitted while the check is held waits (busy) and is sent once after the check passes.
  await page.getByRole('button',{name:'Borrowers',exact:true}).filter({visible:true}).click();
  await page.getByRole('button',{name:'Add borrower',exact:true}).click();
  const region=page.getByRole('region',{name:'Borrower record',exact:true});
  await region.getByRole('textbox',{name:/^Borrower name \(Thai\)(?: \*)?$/}).fill('SYNTHETIC parked borrower');
  await region.getByRole('button',{name:'Save borrower',exact:true}).click();
  await expect(region).toHaveAttribute('aria-busy','true');
  await page.waitForTimeout(500);
  expect(s.posts).toHaveLength(0);await expect(page.getByText(/Couldn.t check the app version/)).toHaveCount(0);
  fixture.release('/build-version.json');
  await expect.poll(()=>s.posts.length).toBeGreaterThanOrEqual(1);
  expect(s.posts[0].path).toBe('/api/operations');expect(s.posts[0].body).toMatchObject({inputs:{name:'SYNTHETIC parked borrower'}});
  await expect(status).toHaveCount(0);
  // 3b. A failed check on a warm launch keeps the rendered workspace and pauses changes inline, with Retry.
  // Hold the check until the cached workspace is shown, then fail it: the banner appears only for a workspace shown during the check.
  fixture.hold('/build-version.json');
  await page.reload();
  await expect.poll(()=>fixture.heldCount('/build-version.json')).toBeGreaterThan(0);
  await expect(kpis).toBeVisible();await expect(status).toHaveCount(0);
  fixture.fail('/build-version.json',503);fixture.release('/build-version.json');
  await expect(page.getByText("Couldn't check the app version. Changes are paused.")).toBeVisible();
  await expect(page.locator('main')).toBeVisible();await expect(page.getByRole('heading',{name:'Unable to check app version',exact:true})).toHaveCount(0);
  const banner=page.getByText("Couldn't check the app version. Changes are paused.").locator('xpath=ancestor-or-self::*[.//button[normalize-space()="Retry"]][1]');
  await expect(banner.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
  await expect(page.getByText(/Showing saved data/)).toHaveCount(0);await expect(page.locator('.refresh-failed, .refresh-failure-badge')).toHaveCount(0);
  fixture.fail('/build-version.json',null);
  await banner.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.getByText("Couldn't check the app version. Changes are paused.")).toHaveCount(0);
  await expect(status).toHaveCount(0);
 }finally{fixture.release('/build-version.json');fixture.fail('/build-version.json',null);await context.close()}
});
