import {test,expect,chromium} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startCanonicalFixture} from './fixtures/canonical-server';

test('actual Firebase SDK restored owner can open saved payment draft after offline boot',async({},info)=>{
 test.skip(info.project.name.startsWith('mobile'),'Actual SDK and worker integration runs once');
 test.setTimeout(90000);
 const root=mkdtempSync(join(tmpdir(),'mw-offline-sdk-')),out=join(root,'public'),profile=join(root,'profile');
 const build=spawnSync(process.execPath,['--input-type=module','-e',`import {build} from 'vite';await build({mode:'live-dev',build:{outDir:${JSON.stringify(out)},emptyOutDir:true},plugins:[{name:'synthetic-sdk-bridge',enforce:'pre',transform(code,id){if(id.endsWith('/apps/pwa/src/live-main.tsx'))return code+";import {getAuth as fixtureGetAuth,signInWithCustomToken as fixtureSignIn} from 'firebase/auth';globalThis.__syntheticSdk={fixtureGetAuth,fixtureSignIn};";}}]});`],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'}});
 expect(build.status,build.stderr).toBe(0);
 const fixture=await startCanonicalFixture(out);let context:any;
 const now=Math.floor(Date.now()/1000),uid='synthetic-offline-sdk-owner';
 const token=[{alg:'none',typ:'JWT'},{sub:uid,user_id:uid,aud:'clever-oasis-508610-n7',iss:'https://securetoken.google.com/clever-oasis-508610-n7',iat:now,exp:now+3600,auth_time:now,email:'synthetic@example.test',email_verified:true,firebase:{sign_in_provider:'custom'}}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.synthetic';
 const borrower={id:'synthetic-offline-borrower',borrowerDisplayName:'SYNTHETIC OFFLINE SDK',createdDate:null,hasActiveLoan:true,outstandingPrincipal:'110',totalProfitEarned:'0',note:null};
 const draft={ok:true,mode:'dev-owner-testing',businessDate:'2026-10-08',asOf:'2026-10-08T05:00:00Z',borrower:{id:borrower.id,displayName:borrower.borrowerDisplayName},charges:[{id:'synthetic-charge',chargeDate:'2026-10-07',loanDisplayKey:'Synthetic loan',amountRemaining:'110',principalRemaining:'100',interestRemaining:'10'}],accounts:[{id:'synthetic-account',label:'Synthetic account'}],nextCursor:null};
 let posts=0;
 const launch=async(offline=false)=>{
  context=await chromium.launchPersistentContext(profile,{headless:true,offline,args:['--ignore-certificate-errors',`--host-resolver-rules=MAP dev-lm.mw-credit.com 127.0.0.1:${fixture.port}`,'--no-proxy-server']});
  context.setDefaultTimeout(5000);
  await context.route('**/*',async(route:any)=>{
   const url=new URL(route.request().url());
   if(url.hostname==='dev-lm.mw-credit.com')return route.continue();
   if(offline)return route.abort();
   if(url.hostname==='identitytoolkit.googleapis.com')return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(url.pathname.includes('signInWithCustomToken')?{idToken:token,refreshToken:'synthetic-refresh',expiresIn:'3600',isNewUser:false}:{users:[{localId:uid,email:'synthetic@example.test',emailVerified:true,providerUserInfo:[]}]})});
   if(url.hostname==='mw-credit-app-read-dev-test.run.app'&&url.pathname.startsWith('/api/collection'))return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:draft.businessDate,asOf:draft.asOf,items:url.pathname==='/api/collection'?[{...borrower,displayName:borrower.borrowerDisplayName,status:'not_paid',amountDue:'110',amountCollected:'0',amountRemaining:'110'}]:[],borrower:{...borrower,displayName:borrower.borrowerDisplayName,status:'not_paid',amountDue:'110',amountCollected:'0',amountRemaining:'110'},nextCursor:null,horizonEnd:'2027-01-08',reviewRequired:false})});
   if(url.hostname==='mw-credit-app-read-dev-test.run.app')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',items:url.pathname.includes('/loans')?[]:[borrower],item:borrower,borrower,nextCursor:null,asOf:draft.asOf})});
   if(url.hostname==='mw-credit-app-command-dev-test.run.app'){
    if(url.pathname==='/api/dashboard')return route.fulfill({contentType:'application/json',body:JSON.stringify({businessDate:draft.businessDate,asOf:draft.asOf,pendingPaymentAmount:'110',todayProfit:'0',yesterdayProfit:'0',netProfit:'0',collection:{notPaid:1,partiallyPaid:0,overdue:0,fullyPaid:0},forecast:{expectedDailyInterest:'0',realizedProfitMtd:'0',forecastRemainingInterest:'0',projectedMonthlyProfit:'0'},portfolio:{totalCashPool:'0',activeLoanProfit:'0',profitCoverageRatio:'0'},incomeMtd:{operatingIncomeMtd:'0',expensesMtd:'0',netProfitMtd:'0',tommyWithdrawnMtd:'0',lisaWithdrawnMtd:'0',unsettledProfitMtd:'0'},businessCashHeld:[]})});
    if(route.request().method()!=='GET')posts++;
    return route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname.includes('payment-drafts')?draft:{ok:true,items:[],nextCursor:null})});
   }
   return route.abort();
  });return context.newPage();
 };
 try{
  let page=await launch();await page.goto('https://dev-lm.mw-credit.com');await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(async()=>{const sdk=(window as any).__syntheticSdk;await sdk.fixtureSignIn(sdk.fixtureGetAuth(),'synthetic-custom-token')});
  await page.getByRole('button',{name:'Collection',exact:true}).click();await expect(page.locator('.collection-compact-tile')).toContainText('SYNTHETIC OFFLINE SDK');await page.locator('.collection-tile-main').click();await page.getByRole('button',{name:'Receive selected charges',exact:true}).click();
  await page.getByRole('textbox',{name:/^Amount received(?: \*)?$/}).fill('110');await page.locator('.payment-allocation-row input[type=checkbox]').check();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('offline ไทย\nexact notes');await expect.poll(()=>page.evaluate(async()=>{const names=await indexedDB.databases();for(const item of names){if(!item.name?.startsWith('mw-credit'))continue;const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(item.name!);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(!db.objectStoreNames.length){db.close();continue}const rows=await new Promise<any[]>((resolve,reject)=>{const r=db.transaction(db.objectStoreNames[0]).objectStore(db.objectStoreNames[0]).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();if(rows.some(row=>row.value?.notes==='offline ไทย\nexact notes'))return true}return false})).toBe(true);
  await page.getByRole('button',{name:'Saved payment drafts',exact:true}).click();await expect(page.getByText('Saved on this device — may be outdated',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Borrowers',exact:true}).click();await expect(page.getByRole('heading',{name:'Borrower directory',exact:true})).toBeVisible();await expect(page.getByText('Saved on this device — may be outdated',{exact:true})).toHaveCount(0);
  await context.close();page=await launch(true);await page.goto('https://dev-lm.mw-credit.com');
  await expect(page.getByText('Saved on this device — may be outdated',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/SYNTHETIC OFFLINE SDK/}).click();await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('offline ไทย\nexact notes');await expect(page.locator('.payment-allocation-row input[type=checkbox]')).toBeChecked();await expect(page.getByRole('button',{name:'Review payment',exact:true})).toBeDisabled();expect(posts).toBe(0);
 }finally{await context?.close();await fixture.close();rmSync(root,{recursive:true,force:true})}
});
