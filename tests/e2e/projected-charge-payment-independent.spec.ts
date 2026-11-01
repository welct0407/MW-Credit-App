import {test,expect,type Page} from '@playwright/test';
import {chooseLanguagePreservingForm,routeSyntheticPreferences} from './live-controls';
import {spawn,type ChildProcess} from 'node:child_process';
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=7700+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/projected-independent-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(45000);
// Explicit synthetic auth/HTTP seams; this file never claims actual Firebase SDK/offline worker proof.
const auth=`let listener;const user={uid:'projected-independent-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(localStorage.getItem('projected-owner')?user:null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){localStorage.setItem('projected-owner','1');listener(user)};export async function signOut(){localStorage.removeItem('projected-owner');listener(null)};`;
// R104 Upcoming Charges: record a loan's next projected charge (R101's Pay ahead UI moved to pay-forward-independent.spec.ts). Synthetic seams only.
const borrower={id:'pc-B',displayName:'Projected ผู้กู้จำลอง / Synthetic borrower',borrowerDisplayName:'Projected ผู้กู้จำลอง / Synthetic borrower',status:'not_paid',amountDue:'60',amountCollected:'0',amountRemaining:'60',hasActiveLoan:true,outstandingPrincipal:'1000',totalProfitEarned:'0'};
const due=[{id:'pc-due',chargeDate:'2026-10-08',loanDisplayKey:'Due loan / เงินกู้จำลอง',principalRemaining:'50',interestRemaining:'10',amountRemaining:'60'}];
const nextA={id:'cg8:5:pc-LA:2026-10-12',loanId:'pc-LA',chargeDate:'2026-10-12',loanDisplayKey:'Next A / เงินกู้จำลอง',principalRemaining:'0',interestRemaining:'70',amountRemaining:'70'};
const nextB={id:'cg8:5:pc-LB:2026-10-10',loanId:'pc-LB',chargeDate:'2026-10-10',loanDisplayKey:'Next B / เงินกู้จำลอง',principalRemaining:'20',interestRemaining:'10',amountRemaining:'30'};
const upcoming=[nextB,nextA];
const draft={ok:true,mode:'dev-owner-testing',scope:'all',businessDate:'2026-10-08',asOf:'2026-10-08T05:00:00Z',borrower:{id:borrower.id,displayName:borrower.displayName},accounts:[{id:'pc-A',label:'Synthetic receiving account'}]};
// R110: the Pay ahead rows, their v9 posting and offline queue were replaced by the Remainder block (pay-forward-independent.spec.ts).
// What remains here is Upcoming Charges (R104), which is unchanged.
// R104 (Echo UPC-01..07): Upcoming Charges date detail records a loan's next projected charge. Offers come from the
// command payment draft (with bookVersion); the button shows only on the matching Projected row.
test('Upcoming Charges records the next projected charge: button only on the offered row, confirm content, refresh on plan_changed, refetch when applied, then the next date',async({page})=>{
 const version='b'.repeat(64),version2='c'.repeat(64),businessDate='2026-10-08',dueDate='2026-10-12',nextDate='2026-10-19';
 const envelope={ok:true,source:'dev',businessDate,timezone:'Asia/Bangkok',asOf:'2026-10-08T05:00:00Z',horizonEnd:'2027-01-08',reviewRequired:false};
 const items=[{id:'ev-A',loanId:'pc-LA',loanDisplayKey:'Next A / เงินกู้จำลอง',principalRemaining:'0.00',interestRemaining:'70.00',amountRemaining:'70.00',basis:'Projected'},
  {id:'ev-C',loanId:'pc-LC',loanDisplayKey:'Later C / เงินกู้จำลอง',principalRemaining:'0',interestRemaining:'40',amountRemaining:'40',basis:'Projected'},
  {id:'ev-D',loanId:'pc-LD',loanDisplayKey:'Recorded D / เงินกู้จำลอง',principalRemaining:'0',interestRemaining:'90',amountRemaining:'90',basis:'Recorded'}];
 const s={details:0,drafts:0,posts:[] as any[],outcome:'rejected' as 'rejected'|'applied',booked:false};
 // V117: `bookable` (not Pay ahead's `upcoming`) offers 10-12 until it is booked, then the loan's next date 10-19.
 const offer=()=>s.booked?{...nextA,id:'cg8:5:pc-LA:'+nextDate,chargeDate:nextDate,bookVersion:version2}:{...nextA,bookVersion:version};
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>{const path=new URL(r.request().url()).pathname;
  if(path.endsWith('/upcoming/'+dueDate)){s.details++;return r.fulfill({json:{...envelope,dueDate,totalCharge:'200',items:items.map(row=>row.id==='ev-A'&&s.booked?{...row,basis:'Recorded'}:row),nextCursor:null}})}
  if(path.endsWith('/upcoming/'+nextDate))return r.fulfill({json:{...envelope,dueDate:nextDate,totalCharge:'70',items:[{...items[0],id:'ev-A2'}],nextCursor:null}});
  if(path.endsWith('/upcoming'))return r.fulfill({json:{...envelope,items:[{id:'date-12',dueDate,totalCharge:'200'},{id:'date-19',dueDate:nextDate,totalCharge:'70'}],previews:[]}});
  return r.fulfill({json:{...envelope,items:path.endsWith('/charges')?[]:[borrower],borrower,nextCursor:null}})});
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{const path=new URL(r.request().url()).pathname;
  if(path.startsWith('/api/payment-drafts/')){s.drafts++;return r.fulfill({json:{...draft,charges:[],upcoming:[],bookable:[offer()],nextCursor:null}})}
  if(path==='/api/operations'&&r.request().method()==='POST'){const body=r.request().postDataJSON();s.posts.push(body);if(s.outcome==='applied')s.booked=true;return r.fulfill({json:{ok:true,kind:'recorded',originalOutcome:{status:s.outcome,code:s.outcome==='rejected'?'plan_changed':null,result:s.outcome==='applied'?{operation:body.operation,targetType:'loan',targetId:body.targetId,paymentId:null,plan:null,predecessorRequestId:null,sourceCreatedBy:null}:null,recordedAt:envelope.asOf}}})}
  return r.fulfill({contentType:'application/json',body:'{"ok":true,"kind":"unresolved","safeToUseNewRequestId":false}'});
 });
 await routeSyntheticPreferences(page);await page.route('https://mw-credit-app-command-dev-test.run.app/api/dashboard',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]})}));
 await page.goto(base);await page.getByRole('button',{name:/Google/}).click();await chooseLanguagePreservingForm(page,'EN');await page.getByRole('button',{name:'Collection',exact:true}).click();await page.locator('.collection-tile-main').first().click();
 await page.locator('.upcoming-date-row').first().click();
 const upcomingRegion=page.getByRole('region',{name:'Upcoming Charges'}),record=upcomingRegion.getByRole('button',{name:/^Record charge/});
 await expect(upcomingRegion.locator('article.collection-charge')).toHaveCount(3);
 await expect(record).toHaveCount(1,{timeout:10000});
 await expect(upcomingRegion.locator('article.collection-charge').filter({hasText:'Next A'}).getByRole('button',{name:/^Record charge/})).toBeVisible();
 await expect(record).toHaveAccessibleName('Record charge · Next A / เงินกู้จำลอง');
 // UPC-R01: the caption stays visible at phone width, full width under the row.
 await expect(record).toContainText('Record charge');const box=await record.boundingBox(),article=await upcomingRegion.locator('article.collection-charge').filter({hasText:'Next A'}).boundingBox();expect(box!.width).toBeGreaterThan(article!.width*0.9);
 const confirm=async(shown='12-Oct')=>{await record.click();const section=page.getByRole('region',{name:'Record charge'});await expect(section).toContainText('Next A / เงินกู้จำลอง');
  await expect(section.locator('dl')).toContainText('Charge date');await expect(section.locator('dl')).toContainText(shown);await expect(section.locator('dl')).toContainText('Principal');await expect(section.locator('dl')).toContainText('Interest');await expect(section.locator('dl')).toContainText('70');
  await expect(section).toContainText(`Not yet due: this records the charge now for ${shown}.`);await section.getByRole('button',{name:'Confirm',exact:true}).click()};
 // The projection moved on (recorded as plan_changed): the refresh message, no automatic retry.
 await confirm();
 await expect(page.getByText('This projected charge is no longer available. Refresh upcoming charges.')).toBeVisible();
 await expect(record).toHaveCount(0);// UPC-R02: the refused row keeps no button until the detail is refreshed
 expect(s.posts).toHaveLength(1);expect(s.posts[0]).toMatchObject({operation:'loan.book-projected-charge',targetId:'pc-LA',expectedVersion:version,predecessorRequestId:null,receiptId:null,inputs:{chargeDate:dueDate,principalDue:'0',interestDue:'70'}});
 const before={details:s.details,drafts:s.drafts};
 await page.getByRole('button',{name:'Refresh upcoming charges',exact:true}).click();
 await expect.poll(()=>[s.details>before.details,s.drafts>before.drafts]).toEqual([true,true]);
 await expect(page.getByText('This projected charge is no longer available. Refresh upcoming charges.')).toHaveCount(0);expect(s.posts).toHaveLength(1);
 // Applied: the detail and the offers are read again; no toast.
 s.outcome='applied';const applied={details:s.details,drafts:s.drafts};
 await confirm();
 await expect.poll(()=>[s.details>applied.details,s.drafts>applied.drafts]).toEqual([true,true]);
 expect(s.posts).toHaveLength(2);expect(s.posts[1].requestId).not.toBe(s.posts[0].requestId);
 await expect(upcomingRegion.locator('article.collection-charge')).toHaveCount(3);
 // V117: the booked row is Recorded now and has no button; the loan's next date 10-19 is recordable.
 await expect(record).toHaveCount(0);
 await page.getByRole('button',{name:'Back to borrower summary',exact:true}).click();await page.locator('.upcoming-date-row').nth(1).click();
 await expect(record).toHaveCount(1,{timeout:10000});await expect(record).toHaveAccessibleName('Record charge · Next A / เงินกู้จำลอง');
 await record.click();const second=page.getByRole('region',{name:'Record charge'});await expect(second).toContainText('Not yet due: this records the charge now for 19-Oct.');await page.getByRole('button',{name:'Back to details',exact:true}).click();await expect(record).toHaveCount(1);
 // UPC-06/R03: offline, the button is disabled and its help line sits directly under it.
 await expect(record).toBeEnabled();await page.context().setOffline(true);
 await expect(record).toBeDisabled();const help=record.locator('xpath=following-sibling::*[1]');
 await expect(help).toHaveText('Recording a charge needs a connection.');expect(await record.getAttribute('aria-describedby')).toBe(await help.getAttribute('id'));
 await page.context().setOffline(false);await expect(record).toBeEnabled();
});
