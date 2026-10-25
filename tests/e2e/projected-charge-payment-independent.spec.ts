import {test,expect,type Page} from '@playwright/test';
import {chooseLanguagePreservingForm,routeSyntheticPreferences} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=7700+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/projected-independent-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(45000);
// Explicit synthetic auth/HTTP seams; this file never claims actual Firebase SDK/offline worker proof.
const auth=`let listener;const user={uid:'projected-independent-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(localStorage.getItem('projected-owner')?user:null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){localStorage.setItem('projected-owner','1');listener(user)};export async function signOut(){localStorage.removeItem('projected-owner');listener(null)};`;
// R101: pay the next charge early in Receive payment (Echo's wording and layout; Archie's v9 contract). Synthetic seams only.
const borrower={id:'pc-B',displayName:'Projected ผู้กู้จำลอง / Synthetic borrower',borrowerDisplayName:'Projected ผู้กู้จำลอง / Synthetic borrower',status:'not_paid',amountDue:'60',amountCollected:'0',amountRemaining:'60',hasActiveLoan:true,outstandingPrincipal:'1000',totalProfitEarned:'0'};
const due=[{id:'pc-due',chargeDate:'2026-10-08',loanDisplayKey:'Due loan / เงินกู้จำลอง',principalRemaining:'50',interestRemaining:'10',amountRemaining:'60'}];
const nextA={id:'cg8:5:pc-LA:2026-10-12',loanId:'pc-LA',chargeDate:'2026-10-12',loanDisplayKey:'Next A / เงินกู้จำลอง',principalRemaining:'0',interestRemaining:'70',amountRemaining:'70'};
const nextB={id:'cg8:5:pc-LB:2026-10-10',loanId:'pc-LB',chargeDate:'2026-10-10',loanDisplayKey:'Next B / เงินกู้จำลอง',principalRemaining:'20',interestRemaining:'10',amountRemaining:'30'};
const upcoming=[nextB,nextA];
const draft={ok:true,mode:'dev-owner-testing',scope:'all',businessDate:'2026-10-08',asOf:'2026-10-08T05:00:00Z',borrower:{id:borrower.id,displayName:borrower.displayName},accounts:[{id:'pc-A',label:'Synthetic receiving account'}]};
type State={posts:any[],reviews:any[],autos:any[],reviewStatus:number,reviewCharges?:any[],reviewUpcoming?:any[],lost:boolean};
async function setup(page:Page){
 const state:State={posts:[],reviews:[],autos:[],reviewStatus:200,lost:false};
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>{const u=new URL(r.request().url()),charges=u.pathname.endsWith('/charges'),list=u.pathname.endsWith('/upcoming');return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:draft.businessDate,timezone:'Asia/Bangkok',asOf:draft.asOf,items:list?[]:charges?due.map(x=>({...x,loanId:'pc-LD',paymentStatus:'ยังไม่ชำระ',paymentDate:null,totalPaid:'0',receivedToday:'0'})):[borrower],borrower,nextCursor:null,horizonEnd:'2027-01-08',reviewRequired:false})})});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
  const u=new URL(r.request().url()),path=u.pathname;
  if(path.includes('/payment-drafts/')){
   // Auto-assign reads due charges only (scope=due on the server), so it never allocates a next charge.
   if(path.endsWith('/auto-assign')){const body=r.request().postDataJSON();state.autos.push(body);let remain=BigInt(body.amountReceived);const allocations=[];for(const row of due){const interest=remain<BigInt(row.interestRemaining)?remain:BigInt(row.interestRemaining);remain-=interest;const principal=remain<BigInt(row.principalRemaining)?remain:BigInt(row.principalRemaining);remain-=principal;if(principal+interest>0n)allocations.push({chargeId:row.id,principal:principal.toString(),interest:interest.toString(),expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate})}return r.fulfill({contentType:'application/json',body:JSON.stringify({...draft,charges:due,allocations,amountReceived:body.amountReceived,allocated:(BigInt(body.amountReceived)-remain).toString(),unallocated:remain.toString(),nextCursor:null})})}
   if(path.endsWith('/review')){const body=r.request().postDataJSON();state.reviews.push(body);return r.fulfill({status:state.reviewStatus,contentType:'application/json',body:JSON.stringify(state.reviewStatus===200?{...draft,charges:due.filter(row=>body.allocations.some((line:any)=>line.chargeId===row.id)),upcoming,allocations:body.allocations,...(body.materialize?{materialize:body.materialize}:{}),total:body.amountReceived,nextCursor:null}:{ok:false,code:'plan_changed',charges:state.reviewCharges??due,upcoming:state.reviewUpcoming??upcoming,businessDate:draft.businessDate})})}
   return r.fulfill({contentType:'application/json',body:JSON.stringify({...draft,charges:due,upcoming,nextCursor:null})});
  }
  if(path.endsWith('/payments'))return r.fulfill({contentType:'application/json',body:'{"ok":true,"items":[],"nextCursor":null}'});
  if(path.endsWith('/api/payment-commands')&&r.request().method()==='POST'){state.posts.push(r.request().postDataJSON());if(state.lost)return r.abort('failed');return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,kind:'recorded',originalOutcome:{status:'posted',paymentId:'synthetic-projected',code:null,recordedAt:draft.asOf}})});}
  return r.fulfill({contentType:'application/json',body:'{"ok":true,"kind":"unresolved","safeToUseNewRequestId":false}'});
 });
 await routeSyntheticPreferences(page);await page.route('https://mw-credit-app-command-dev-test.run.app/api/dashboard',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})}));
 await page.goto(base);await expect(page.getByRole('button',{name:/Google/})).toBeVisible();await page.getByRole('button',{name:/Google/}).click();await chooseLanguagePreservingForm(page,'EN');await page.getByRole('button',{name:'Collection',exact:true}).click();await page.locator('.collection-tile-main').first().click();await page.getByRole('button',{name:'Receive selected charges',exact:true}).click();await expect(page.getByRole('textbox',{name:/^Amount received(?: \*)?$/})).toBeVisible();const account=page.getByRole('combobox',{name:/^Receiving account(?: \*)?$/});if(!await account.inputValue())await account.selectOption('pc-A');return state;
}
const rowFor=(page:Page,key:string)=>page.locator('.payment-allocation-row').filter({hasText:key});
const amount=(page:Page)=>page.getByRole('textbox',{name:/^Amount received(?: \*)?$/});
const review=(page:Page)=>page.getByRole('button',{name:'Review payment',exact:true});
const badge='Next charge · not yet due';

test('next charges render after the due rows with the badge, caps and one help line; Auto-assign leaves them at 0',async({page})=>{
 const s=await setup(page);
 const region=page.getByRole('region',{name:'Payment allocation'});
 await expect(region.getByRole('heading',{name:'Pay ahead',level:4})).toBeVisible();
 await expect(region.locator('#next-charge-help')).toHaveText('Not yet due: confirming creates this charge and pays it.');await expect(page.locator('#next-charge-help')).toHaveCount(1);
 // Due rows first, then the next charges sorted by date (B on the 10th before A on the 12th).
 await expect(region.locator('.payment-allocation-row strong')).toHaveText(['Due loan / เงินกู้จำลอง','Next B / เงินกู้จำลอง','Next A / เงินกู้จำลอง']);
 await expect(rowFor(page,'Next A').locator('small.next-charge-badge')).toHaveText(badge);await expect(rowFor(page,'Due loan').locator('.next-charge-badge')).toHaveCount(0);
 await expect(rowFor(page,'Next A')).toContainText('Interest (Max ฿70)');await expect(rowFor(page,'Next B')).toContainText('Principal (Max ฿20)');
 const tick=page.getByRole('checkbox',{name:'Allocate to Next A / เงินกู้จำลอง 2026-10-12, next charge, not yet due',exact:true});
 await expect(tick).toHaveAttribute('aria-describedby','next-charge-help');
 await expect(page.getByRole('textbox',{name:'Interest for Next A / เงินกู้จำลอง 2026-10-12, next charge, not yet due',exact:true})).toHaveValue('0');
 await amount(page).fill('60');await page.getByRole('button',{name:'Auto-assign',exact:true}).click();
 await expect(rowFor(page,'Due loan').getByRole('textbox',{name:/Principal for/})).toHaveValue('50');await expect(rowFor(page,'Due loan').getByRole('textbox',{name:/Interest for/})).toHaveValue('10');
 for(const key of ['Next A','Next B'])for(const field of ['Principal','Interest'])await expect(rowFor(page,key).getByRole('textbox',{name:new RegExp('^'+field+' for')})).toHaveValue('0');
 expect(s.autos).toEqual([{amountReceived:'60'}]);
 await chooseLanguagePreservingForm(page,'ไทย');await expect(rowFor(page,'Next A').locator('small.next-charge-badge')).toHaveText('งวดถัดไป · ยังไม่ครบกำหนด');
 await expect(page.getByRole('heading',{name:'ชำระล่วงหน้า',level:4})).toBeVisible();
 expect(s.posts).toHaveLength(0);
});

test('one payment spreads over a due charge and two loans\' next charges and posts v9 with materialize',async({page})=>{
 const s=await setup(page);await amount(page).fill('160');
 await rowFor(page,'Due loan').getByRole('textbox',{name:/Principal for/}).fill('50');await rowFor(page,'Due loan').getByRole('textbox',{name:/Interest for/}).fill('10');
 await rowFor(page,'Next A').getByRole('textbox',{name:/Interest for/}).fill('70');
 await page.getByRole('checkbox',{name:/^Allocate to Next B .*, next charge, not yet due$/}).check();
 await expect(rowFor(page,'Next B').getByRole('textbox',{name:/Principal for/})).toHaveValue('20');await expect(rowFor(page,'Next B').getByRole('textbox',{name:/Interest for/})).toHaveValue('10');
 await review(page).click();await expect(page.getByRole('button',{name:'Confirm payment',exact:true})).toBeEnabled();
 const sent=s.reviews.at(-1);expect(sent.amountReceived).toBe('160');
 expect([...sent.materialize].sort((a:any,b:any)=>a.chargeId.localeCompare(b.chargeId))).toEqual([{loanId:'pc-LA',chargeId:nextA.id,chargeDate:'2026-10-12',principalDue:'0',interestDue:'70'},{loanId:'pc-LB',chargeId:nextB.id,chargeDate:'2026-10-10',principalDue:'20',interestDue:'10'}]);
 // R-01/R-02: the review list names each loan (no "Loan unavailable") and badges the next charges; the help shows once.
 const items=page.locator('.selected-payment ul li');await expect(items).toHaveCount(3);
 await expect(page.locator('.selected-payment ul')).not.toContainText('Loan unavailable');
 await expect(items.filter({hasText:'Next A'}).locator('.next-charge-badge')).toHaveText(badge);await expect(items.filter({hasText:'Due loan'}).locator('.next-charge-badge')).toHaveCount(0);
 await expect(page.getByText('Not yet due: confirming creates this charge and pays it.',{exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Confirm payment',exact:true}).click();await expect.poll(()=>s.posts.length).toBe(1);
 const posted=s.posts[0];expect(posted.schemaVersion).toBe(9);expect(posted.payerLines).toBeNull();expect(posted.amountReceived).toBe('160');
 expect(posted.allocations.map((line:any)=>line.chargeId).sort()).toEqual([nextA.id,nextB.id,'pc-due'].sort());
 expect(posted.materialize.map((row:any)=>row.loanId).sort()).toEqual(['pc-LA','pc-LB']);
});

test('a due-only payment stays v7; a changed plan marks a vanished next charge unavailable and adopts one booked meanwhile',async({page})=>{
 const s=await setup(page);await amount(page).fill('100');
 await rowFor(page,'Next A').getByRole('textbox',{name:/Interest for/}).fill('70');await page.getByRole('checkbox',{name:/^Allocate to Next B /}).check();
 // Meanwhile Next B was booked (now a recorded charge) and Next A is no longer offered.
 s.reviewStatus=409;s.reviewCharges=[...due,{id:nextB.id,chargeDate:nextB.chargeDate,loanDisplayKey:nextB.loanDisplayKey,principalRemaining:'20',interestRemaining:'10',amountRemaining:'30'}];s.reviewUpcoming=[];
 await review(page).click();await expect(page.getByRole('alert')).toContainText('The allocation plan changed');
 await page.getByRole('button',{name:'Use current balances',exact:true}).click();
 // S-02: Next B shows once, without the badge; S-01: Next A stays in Pay ahead as unavailable with a working checkbox.
 await expect(rowFor(page,'Next B')).toHaveCount(1);await expect(rowFor(page,'Next B').locator('.next-charge-badge')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Pay ahead',level:4})).toBeVisible();
 await expect(rowFor(page,'Next A')).toContainText('Unavailable — remove this allocation before review');await expect(rowFor(page,'Next A').locator('.next-charge-badge')).toHaveText(badge);
 await expect(review(page)).toBeDisabled();
 await page.getByRole('checkbox',{name:/^Allocate to Next A .*, next charge, not yet due$/}).click();await expect(rowFor(page,'Next A')).toHaveCount(0);
 await amount(page).fill('30');s.reviewStatus=200;await expect(review(page)).toBeEnabled();await review(page).click();
 await expect(page.locator('.selected-payment ul li')).toHaveText([/^Next B \/ เงินกู้จำลอง · /]);await expect(page.locator('.selected-payment ul .next-charge-badge')).toHaveCount(0);
 expect(s.reviews.at(-1).materialize).toBeUndefined();
 await page.getByRole('button',{name:'Confirm payment',exact:true}).click();await expect.poll(()=>s.posts.length).toBe(1);
 expect(s.posts[0].schemaVersion).toBe(7);expect(Object.hasOwn(s.posts[0],'materialize')).toBe(false);
});

test('the offline queue keeps and resends the same v9 command',async({page,context})=>{
 const s=await setup(page);await amount(page).fill('70');await rowFor(page,'Next A').getByRole('textbox',{name:/Interest for/}).fill('70');
 s.lost=true;await review(page).click();await expect(page.getByRole('button',{name:'Confirm payment',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Confirm payment',exact:true}).click();
 await expect(page.getByText('Saved on this device. Will sync when connected.')).toBeVisible();
 await expect.poll(()=>s.posts.length).toBeGreaterThanOrEqual(2);await context.setOffline(true);
 const original=s.posts[0];expect(original.schemaVersion).toBe(9);expect(original.materialize).toEqual([{loanId:'pc-LA',chargeId:nextA.id,chargeDate:'2026-10-12',principalDue:'0',interestDue:'70'}]);
 expect(s.posts.every(value=>JSON.stringify(value)===JSON.stringify(original))).toBe(true);
 const pending=await page.evaluate(async()=>{const {ownerOfflineRepository}=await import('/apps/pwa/src/owner-offline.ts');return ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid:'projected-independent-owner'}).list('pending')});
 expect(pending).toHaveLength(1);expect(pending[0].value.command).toEqual(original);
});
