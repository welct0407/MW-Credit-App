import {test,expect,type Page} from './fixtures/test';
import {chooseLanguage} from './live-controls';
import {referrerMaiDetail,referrerRoute,settlementS1} from './fixtures/referrers-fixture';
import {spawn,type ChildProcess} from 'node:child_process';
// R129 (V137) Referrers page: list and search, a referrer's tiles and sections, Pay rebates with a subset unticked through
// Review, Confirm and the result, and the Delete settlement confirm. Synthetic auth and HTTP seams with the real DOM; it
// does not claim live authentication, the durable operation journal or any SQL rule (those are the database tests).
let server:ChildProcess,base:string;
test.beforeAll(async({},info)=>{const port=8100+info.workerIndex;base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({mode:'live-dev',cacheDir:'node_modules/.cache/referrers-independent-${port}',server:{host:'127.0.0.1',port:${port},strictPort:true}});await s.listen();`],{env:{...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-test.run.app',VITE_COMMAND_API_ORIGIN:'https://mw-credit-app-command-dev-test.run.app',VITE_COMMAND_MODE:'dev-owner-testing'},stdio:'pipe'});await expect.poll(async()=>{try{return(await fetch(base)).status}catch{return 0}},{timeout:20000}).toBe(200)});
test.afterAll(()=>server?.kill());test.setTimeout(60000);test.use({actionTimeout:7000});
const auth=`let listener;const user={uid:'referrers-independent-owner',getIdToken:async()=>'synthetic-bearer'};export const browserLocalPersistence='local',inMemoryPersistence='memory',browserPopupRedirectResolver={};export function initializeAuth(){return {}};export function onAuthStateChanged(a,fn){listener=fn;fn(localStorage.getItem('referrers-owner')?user:null);return()=>{}};export class GoogleAuthProvider{setCustomParameters(){}};export async function signInWithPopup(){localStorage.setItem('referrers-owner','1');listener(user)};export async function signOut(){localStorage.removeItem('referrers-owner');listener(null)};`;
type Seam={writes:any[],reads:string[]};
/** `outcome` (R184) adds fields to an applied command's result, as the server's D13 rebateSettlement. */
async function setup(page:Page,outcome:(body:any)=>Record<string,unknown>=()=>({})){
 const s:Seam={writes:[],reads:[]};
 await page.route('**/deps/firebase_app.js*',r=>r.fulfill({contentType:'text/javascript',body:'export function initializeApp(){return {}}'}));
 await page.route('**/deps/firebase_auth.js*',r=>r.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('https://mw-credit-app-read-dev-test.run.app/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,source:'dev',businessDate:'2026-11-05',asOf:'2026-11-05T05:00:00Z',items:[],nextCursor:null})}));
 await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{
  const path=new URL(r.request().url()).pathname,method=r.request().method();let status=200,result:any={ok:true,items:[],nextCursor:null};
  if(method==='GET')s.reads.push(path);
  const referrer=method==='GET'?referrerRoute(path,new URL(r.request().url()).search):null;
  if(referrer){status=referrer.status;result=referrer.body;}
  else if(path==='/api/preferences')result={ok:true,item:{id:'R-partner',version:'b'.repeat(64),language:null,statementAccountId:null,statementDate:null}};
  else if(path==='/api/expense-options')result={ok:true,businessDate:'2026-11-05',categories:[],accounts:[]};
  else if(path==='/api/dashboard')result={collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]};
  else if(path.startsWith('/api/operations/')&&method==='GET')result={ok:true,kind:'unresolved',safeToUseNewRequestId:false};
  else if(path==='/api/operations'&&method==='POST'){const body=r.request().postDataJSON();s.writes.push(body);
   result={ok:true,kind:'recorded',originalOutcome:{status:'applied',code:null,result:{operation:body.operation,targetType:'rebate-settlement',targetId:body.targetId,paymentId:null,plan:null,predecessorRequestId:null,...outcome(body)}}};}
  return r.fulfill({status,contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
 });
 await page.goto(base);await page.getByRole('button',{name:/Google/}).click();await chooseLanguage(page,'EN');
 return s;
}
async function openReferrers(page:Page){
 if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 await page.getByRole('button',{name:'Referrers',exact:true}).filter({visible:true}).click();
 // The page's own h2, not the header h1 that shows the view title once signed in (both read "Referrers").
 await expect(page.getByRole('heading',{name:'Referrers',exact:true,level:2})).toBeVisible();
}
const noHorizontalScroll=(page:Page)=>expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
const sizes=[{label:'phone 390px',viewport:{width:390,height:844}},{label:'desktop',viewport:{width:1280,height:900}}];
for(const size of sizes)test.describe(size.label,()=>{
 test.use({viewport:size.viewport});

 test('Referrers list shows who is owed and accruing, sorted, and searches the Thai or English name',async({page})=>{
  await setup(page);await openReferrers(page);
  await expect(page.getByRole('status').filter({hasText:'2 referrers'})).toBeVisible();
  const rows=page.locator('.referrer-row');await expect(rows).toHaveCount(2);
  // Sorted unpaid first: Mai (฿400) before Pond (฿0).
  await expect(rows.nth(0)).toContainText('Mai');await expect(rows.nth(1)).toContainText('Pond');
  await expect(rows.nth(0)).toContainText('15% · max ฿2,000');await expect(rows.nth(1)).not.toContainText('max');
  await expect(rows.nth(0)).toContainText('Unpaid ฿400 · 2 rebates · since');await expect(rows.nth(0)).toContainText('Accruing ฿450 · 2 open loans');
  await expect(rows.nth(1)).toContainText('Unpaid ฿0');await expect(rows.nth(1).locator('.referrer-unpaid')).toHaveClass(/muted/);await expect(rows.nth(1)).toContainText('No open loans');/* Echo RF-2: no open loans reads as such, muted */
  await noHorizontalScroll(page);
  // Search: every typed word must appear in the Thai or English name.
  const search=page.getByRole('searchbox',{name:'Search referrers'});
  await search.fill('pond');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Pond');await expect(page.getByRole('status').filter({hasText:'1 referrer'})).toBeVisible();
  await search.fill('มาย');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Mai');
  await search.fill('mai pond');await expect(rows).toHaveCount(0);await expect(page.getByText('No referrers match.')).toBeVisible();
  await search.fill('');await expect(rows).toHaveCount(2);
 });

 test('Referrer detail shows the four tiles, terms and the three sections; Pond has empty states and no Pay button',async({page})=>{
  await setup(page);await openReferrers(page);
  await page.locator('.referrer-row').filter({hasText:'Mai'}).click();
  await expect(page.getByRole('heading',{name:/Mai/}).first()).toBeVisible();
  const tiles=page.locator('.referrer-tile');await expect(tiles).toHaveCount(4);
  await expect(tiles.nth(0)).toContainText('Unpaid');await expect(tiles.nth(0)).toContainText('฿400');
  await expect(tiles.nth(1)).toContainText('Accruing on open loans');await expect(tiles.nth(1)).toContainText('฿450');
  await expect(tiles.nth(2)).toContainText('Paid to date');await expect(tiles.nth(2)).toContainText('฿750');
  await expect(tiles.nth(3)).toContainText('Settled by offset');await expect(tiles.nth(3)).toContainText('฿200');
  // Two by two on a phone, four across on a desktop.
  const tops=await tiles.evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));
  if(size.viewport.width<=500){expect(tops[0]).toBe(tops[1]);expect(tops[2]).toBe(tops[3]);expect(tops[2]).toBeGreaterThan(tops[0]);}else{expect(new Set(tops).size).toBe(1);}
  await expect(page.getByText('Custom terms 15%, max ฿2,000')).toBeVisible();await expect(page.getByRole('button',{name:'Borrower record'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Pay rebates ฿400'})).toBeEnabled();
  await expect(page.getByRole('heading',{name:'Unpaid rebates'})).toBeVisible();
  const unpaid=page.locator('.referrer-line').filter({hasText:'rebate ฿300'});
  await expect(unpaid).toHaveCount(2);await expect(unpaid.nth(0)).toContainText('นก - Nok');await expect(unpaid.nth(0)).toContainText('฿300');
  await expect(unpaid.nth(1)).toContainText('฿200 offset');await expect(unpaid.nth(1).locator('strong')).toHaveText('฿100');
  await expect(page.getByRole('heading',{name:'Unsettled on open loans'})).toBeVisible();
  await expect(page.getByText('Estimated at the current terms from interest and late charges already received. The rebate is booked when the loan closes.')).toBeVisible();
  const accruing=page.locator('.referrer-line').filter({hasText:'received'});await expect(accruing).toHaveCount(2);
  await expect(accruing.nth(0)).toContainText('received ฿3,000');await expect(accruing.nth(0).locator('strong')).toHaveText('฿450');
  await expect(accruing.nth(1)).toContainText('received ฿0');await expect(accruing.nth(1).locator('strong')).toHaveText('฿0');
  await expect(page.getByRole('heading',{name:'Settlement history'})).toBeVisible();
  const history=page.locator('.referrer-line').filter({hasText:/^(Offset|Paid|Paid at close)/});
  await expect(history).toHaveCount(3);
  await expect(history.nth(0)).toContainText('Offset ฿200 to');
  await expect(history.nth(1)).toContainText('Paid ฿450 · 1 rebate · Lisa SCB · Bank transfer · ref 1234');
  await expect(history.nth(2)).toContainText('Paid at close ฿300');
  await noHorizontalScroll(page);
  // An unpaid row opens its expense record; Back returns to the referrer.
  await unpaid.nth(0).click();await expect(page.getByText('Pending payment').first()).toBeVisible();
  await page.getByRole('button',{name:'Back to referrer',exact:true}).first().click();await expect(page.getByRole('heading',{name:'Settlement history'})).toBeVisible();
  // Back to the list, then Pond: nothing unpaid, so no Pay button and the empty states.
  await page.getByRole('button',{name:'Back to referrers',exact:true}).click();
  await page.locator('.referrer-row').filter({hasText:'Pond'}).click();
  await expect(page.getByRole('heading',{name:/Pond/}).first()).toBeVisible();
  await expect(page.getByText('Default terms (10%, max ฿1,000)')).toBeVisible();
  await expect(page.getByRole('button',{name:/^Pay rebates/})).toHaveCount(0);
  await expect(page.getByText('No unpaid rebates',{exact:true})).toBeVisible();await expect(page.getByText('No open referred loans')).toBeVisible();await expect(page.getByText('No settlements yet')).toBeVisible();
 });

 test('Referred borrowers: one row each with the loans and the non-zero rebate parts, sorted; a row opens the Borrower record and an accruing row the loan, Back returns',async({page})=>{
  await setup(page);await openReferrers(page);
  await page.locator('.referrer-row').filter({hasText:'Mai'}).click();
  const heading=page.getByRole('heading',{name:'Referred borrowers · 5',exact:true});await expect(heading).toBeVisible();
  // After the tiles and terms, before Unpaid rebates.
  const order=await page.locator('.referrer-tiles, h3').evaluateAll(nodes=>nodes.map(n=>n.classList.contains('referrer-tiles')?'tiles':n.textContent));
  expect(order.slice(0,3)).toEqual(['tiles','Referred borrowers · 5','Unpaid rebates']);
  const rows=page.locator('.referrer-referee');await expect(rows).toHaveCount(5);
  // Unpaid descending (Nok ฿300, Kaew ฿100), then accruing (Fon), then the Thai name (ต้น before ลี).
  const texts=await rows.allTextContents();
  expect(texts).toEqual(['นก - Nok1 loan · Unpaid ฿300','แก้ว - Kaew1 loan · Unpaid ฿100 · Offset ฿200','ฝน - Fon2 loans · 2 open · Accruing ฿450','ต้น - Ton1 loan · Paid ฿450','ลี - Lee1 loan · Paid ฿300']);
  for(let k=0;k<5;k++)expect((await rows.nth(k).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await noHorizontalScroll(page);
  // A row opens that borrower's record in place; Back returns to this referrer.
  await rows.first().click();
  await expect(page.getByRole('button',{name:'Back to referrer',exact:true}).first()).toBeVisible();
  await expect(page.locator('section[aria-label="Borrower record"]').getByRole('heading',{name:'นก - Nok'})).toBeVisible();await expect(heading).toHaveCount(0);
  await page.getByRole('button',{name:'Back to referrer',exact:true}).first().click();
  await expect(heading).toBeVisible();await expect(page.getByRole('heading',{name:/Mai/}).first()).toBeVisible();
  // An accruing row opens the full loan record; Back returns to this referrer.
  await page.locator('.referrer-line').filter({hasText:'received ฿3,000'}).click();
  await expect(page.locator('section[aria-label="Full loan details"]')).toBeVisible();
  await expect(page.getByText('ฝน - Fon').first()).toBeVisible();
  await page.getByRole('button',{name:'Back to referrer',exact:true}).first().click();
  await expect(page.getByRole('heading',{name:'Unsettled on open loans'})).toBeVisible();await expect(heading).toBeVisible();
  // Pond's only referee has no rebates: "No rebates yet", muted.
  await page.getByRole('button',{name:'Back to referrers',exact:true}).click();
  await page.locator('.referrer-row').filter({hasText:'Pond'}).click();
  await expect(page.getByRole('heading',{name:'Referred borrowers · 1',exact:true})).toBeVisible();
  await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('พลอย - Ploy1 loan · ');await expect(rows.first().locator('.muted')).toHaveText('No rebates yet');
  // Thai: the heading and the breakdown words.
  await page.getByRole('button',{name:'Back to referrers',exact:true}).click();
  await chooseLanguage(page,'ไทย');
  await page.locator('.referrer-row').filter({hasText:'Mai'}).click();
  await expect(page.getByRole('heading',{name:'ผู้ที่แนะนำ · 5',exact:true})).toBeVisible();
  await expect(rows.nth(1)).toHaveText('แก้ว - Kaewสินเชื่อ 1 รายการ · ค้างจ่าย ฿100 · หัก ฿200');
  await expect(rows.nth(2)).toHaveText('ฝน - Fonสินเชื่อ 2 รายการ · ยังไม่ปิด 2 · กำลังสะสม ฿450');
  await noHorizontalScroll(page);
  await page.getByRole('button',{name:'กลับรายชื่อผู้แนะนำ',exact:true}).click();
  await page.locator('.referrer-row').filter({hasText:'Pond'}).click();
  await expect(page.getByRole('heading',{name:'ผู้ที่แนะนำ · 1',exact:true})).toBeVisible();
  await expect(rows).toHaveCount(1);await expect(rows.first().locator('.muted')).toHaveText('ยังไม่มีค่าแนะนำ');await noHorizontalScroll(page);
 });

 test('Pay rebates with one rebate unticked: Review lists the ticked row, Confirm sends one command, the result names what stays unpaid',async({page})=>{
  const s=await setup(page);await openReferrers(page);
  await page.locator('.referrer-row').filter({hasText:'Mai'}).click();
  await page.getByRole('button',{name:'Pay rebates ฿400'}).click();
  await expect(page.getByRole('heading',{name:/Pay rebates/})).toBeVisible();
  const group=page.getByRole('group',{name:'Unpaid rebates'});
  const boxes=group.getByRole('checkbox');await expect(boxes).toHaveCount(3);
  for(let k=0;k<3;k++)await expect(boxes.nth(k)).toBeChecked();
  for(let k=0;k<3;k++)expect((await boxes.nth(k).locator('xpath=ancestor::label').boundingBox())!.height).toBeGreaterThanOrEqual(43);
  const footer=page.locator('.rebate-settle-footer button');await expect(footer).toHaveText('Pay ฿400 · 2 rebates');
  // Defaults: today (the server's business date), Lisa's default account, Bank transfer.
  await expect(page.getByLabel('Settlement date',{exact:true})).toHaveValue('2026-11-05');
  await expect(page.getByLabel('Paying account')).toHaveValue('ca:lisa-cash');await expect(page.getByLabel('Method')).toHaveValue('Bank Transfer');
  // Untick the partly offset rebate: the footer follows; Select all toggles the whole list.
  await group.getByRole('checkbox',{name:/แก้ว|Kaew/}).uncheck();
  await expect(footer).toHaveText('Pay ฿300 · 1 rebate');await expect(group.getByRole('checkbox',{name:'Select all'})).not.toBeChecked();
  await group.getByRole('checkbox',{name:'Select all'}).check();await expect(footer).toHaveText('Pay ฿400 · 2 rebates');await group.getByRole('checkbox',{name:'Select all'}).uncheck();await expect(footer).toBeDisabled();await expect(footer).toHaveText('Pay ฿0 · 0 rebates');
  await group.getByRole('checkbox',{name:'Select all'}).check();await expect(footer).toHaveText('Pay ฿400 · 2 rebates');
  await group.getByRole('checkbox',{name:/แก้ว|Kaew/}).uncheck();await expect(footer).toHaveText('Pay ฿300 · 1 rebate');
  // Cash hides the bank reference; an unusable reference or a future date blocks Review.
  await page.getByLabel('Method').selectOption('Cash');await expect(page.getByLabel('Bank reference (optional)')).toHaveCount(0);
  await page.getByLabel('Method').selectOption('Bank Transfer');
  await page.getByLabel('Settlement date',{exact:true}).fill('2026-11-06');await expect(footer).toBeDisabled();await expect(page.getByText('Choose today or an earlier day, not before the newest close.')).toBeVisible();
  await page.getByLabel('Settlement date',{exact:true}).fill('2026-10-11');await expect(footer).toBeDisabled();
  await page.getByLabel('Settlement date',{exact:true}).fill('2026-11-05');await expect(footer).toBeEnabled();
  await page.getByLabel('Paying account').selectOption('ca:lisa-scb');
  await page.getByLabel('Bank reference (optional)').fill('R129-REF');
  await noHorizontalScroll(page);
  await footer.click();
  // Review: the ticked row and the totals, then Confirm.
  const review=page.locator('.rebate-settle-review');await expect(review.locator('li')).toHaveCount(1);await expect(review).toContainText('นก - Nok');await expect(review).toContainText('฿300');await expect(review).not.toContainText('แก้ว');
  const summary=page.locator('dl').filter({hasText:'Paying account'});
  await expect(summary).toContainText('฿300');await expect(summary).toContainText('Lisa SCB');await expect(summary).toContainText('Bank transfer');await expect(summary).toContainText('R129-REF');
  expect(s.writes).toHaveLength(0);
  await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Paid ฿300 to'})).toContainText('1 rebate');
  await expect(page.getByText('฿100 still owed to มาย - Mai')).toBeVisible();await expect(page.getByText('Lisa SCB').first()).toBeVisible();
  // Exactly one rebate-settlement.create, ticked ids only, the screen's date, account, method and reference.
  expect(s.writes).toHaveLength(1);
  const command=s.writes[0];
  expect(command).toMatchObject({operation:'rebate-settlement.create',expectedVersion:null,predecessorRequestId:null,receiptId:null});
  expect(command.requestId).toMatch(/^[0-9a-f-]{36}$/);expect(command.targetId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);expect(command.requestId).not.toBe(command.targetId);
  // R184: per-rebate lines and the destination (the whole pending amount of the one ticked rebate, paid to the referrer).
  expect(command.inputs).toEqual({referrerId:'R-MAI',destination:'referrer',allocations:[{expenseId:'rr1:L-PEND',amount:'300',expectedPending:'300'}],settlementDate:'2026-11-05',cashAccountId:'ca:lisa-scb',paymentMethod:'Bank Transfer',bankReference:'R129-REF',notes:null,expectedPlanHash:null});
  // Back to the referrer page, which reads the referrer again.
  const before=s.reads.filter(p=>p==='/api/referrers/R-MAI').length;
  await page.getByRole('button',{name:'Back to referrer page',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Settlement history'})).toBeVisible();
  await expect.poll(()=>s.reads.filter(p=>p==='/api/referrers/R-MAI').length).toBeGreaterThan(before);
 });

 test('Delete settlement: history opens the settlement, the destructive confirm names the effect, Confirm sends one delete with its version',async({page})=>{
  const s=await setup(page);await openReferrers(page);
  await page.locator('.referrer-row').filter({hasText:'Mai'}).click();
  await page.locator('.referrer-line:not(.referrer-referee)').filter({hasText:'Paid ฿450'}).click();
  await expect(page.getByRole('heading',{name:'Rebate settlement'})).toBeVisible();
  const details=page.locator('dl');
  await expect(details).toContainText('฿450');await expect(details).toContainText('Lisa SCB');await expect(details).toContainText('Bank transfer');await expect(details).toContainText('1234');await expect(details).toContainText('owner@example.invalid');
  await expect(page.getByRole('heading',{name:'Rebates paid'})).toBeVisible();await expect(page.locator('.referrer-line').filter({hasText:'ต้น - Ton'})).toContainText('฿450');
  await noHorizontalScroll(page);
  await page.getByRole('button',{name:'Delete settlement',exact:true}).click();
  await expect(page.getByRole('note')).toHaveText('Delete settlement ฿450? ฿450 returns to unpaid on 1 rebate. The cash entry is removed.');
  expect(s.writes).toHaveLength(0);
  // Back keeps the settlement; a second visit to the confirm and Confirm deletes it.
  await page.getByRole('button',{name:'Back to details',exact:true}).click();await expect(page.getByRole('heading',{name:'Rebate settlement'})).toBeVisible();expect(s.writes).toHaveLength(0);
  await page.getByRole('button',{name:'Delete settlement',exact:true}).click();
  await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect.poll(()=>s.writes.length).toBe(1);
  expect(s.writes[0]).toMatchObject({operation:'rebate-settlement.delete',targetId:settlementS1.item.id,expectedVersion:settlementS1.item.version,inputs:{},predecessorRequestId:null,receiptId:null});
  // After the delete the page returns to the referrer.
  await expect(page.getByRole('heading',{name:'Settlement history'})).toBeVisible();
 });
});

// R184 (V155), the design's one UI path on a phone (CI runs it on iPhone WebKit, mobile-webkit): choose the offset, lower the
// amount, Review shows what each rebate gets and the plan, Confirm sends one command, the result shows the server's owedAfter,
// then the settlement opens from the history and is deleted. Synthetic seams as above; the plan and its hash are the fixture's.
test.describe('phone 390px offset',()=>{
 test.use({viewport:{width:390,height:844}});
 test('Pay rebates by offset: lower the amount, Review per rebate and the plan, Confirm once, owedAfter, then delete the offset',async({page})=>{
  const OFFSET_ID='rs155:';
  // The server answers owedAfter 275 (not the page's 400 - 120): the result must show the server's figure (PAY-DEST-08).
  const s=await setup(page,body=>body.operation==='rebate-settlement.create'&&body.inputs.destination==='offset'?{rebateSettlement:{destination:'offset',amount:body.inputs.allocations.reduce((n:number,l:any)=>n+Number(l.amount),0).toString(),owedAfter:'275',offsetPaymentId:OFFSET_ID+body.targetId,
   lines:body.inputs.allocations.map((l:any)=>({expenseId:l.expenseId,amount:l.amount,pendingAfter:String(Number(l.expectedPending)-Number(l.amount))}))}}:{});
  await openReferrers(page);
  await page.locator('.referrer-row').filter({hasText:'Mai'}).click();
  await page.getByRole('button',{name:'Pay rebates ฿400'}).click();
  await expect(page.getByRole('heading',{name:/Pay rebates/})).toBeVisible();
  const footer=page.locator('.rebate-settle-footer button');await expect(footer).toHaveText('Pay ฿400 · 2 rebates');
  // Choose the offset: account, method and reference go, the date is today and locked, the amount defaults to what is due.
  await page.getByRole('radio',{name:"Offset to referrer's loan"}).check();
  await expect(page.getByLabel('Paying account')).toHaveCount(0);await expect(page.getByLabel('Method')).toHaveCount(0);await expect(page.getByLabel('Bank reference (optional)')).toHaveCount(0);
  await expect(page.getByLabel('Settlement date',{exact:true})).toHaveValue('2026-11-05');await expect(page.getByLabel('Settlement date',{exact:true})).toBeDisabled();
  const amount=page.getByLabel('Amount to offset');await expect(amount).toHaveValue('150');await expect(footer).toHaveText('Offset ฿150 · 1 rebate');
  // Lower it to 120: oldest close first, Nok's rebate gets 120 and Kaew's nothing; the preview follows the amount.
  await amount.fill('120');await expect(footer).toHaveText('Offset ฿120 · 1 rebate');
  await expect(page.getByText('฿120 now · ฿180 stays unpaid')).toBeVisible();await expect(page.getByText('Not paid this time')).toBeVisible();
  const preview=page.locator('.rebate-offset-preview');await expect(preview).toContainText('มาย - Mai-฿3,000-20/10-2%');await expect(preview).toContainText('(฿120)');
  await expect.poll(()=>s.reads.filter(p=>p==='/api/referrers/R-MAI/offset-preview').length).toBeGreaterThan(0);
  await noHorizontalScroll(page);
  await footer.click();
  // Review: the applied amount of the one rebate it reaches, of its pending amount, the totals, the loan and the plan's charge.
  const review=page.locator('.rebate-settle-review');await expect(review.locator('li')).toHaveCount(1);
  await expect(review.locator('li').first()).toContainText('นก - Nok');await expect(review.locator('li').first()).toContainText('฿120');await expect(review.locator('li').first()).toContainText('of ฿300');
  const summary=page.locator('dl').filter({hasText:'Offsetting now'});
  await expect(summary).toContainText('Offsetting now฿120');await expect(summary).toContainText('Owed to มาย - Mai after this฿280');await expect(summary).toContainText("Settle byOffset to referrer's loan");
  await expect(summary).toContainText('มาย - Mai-฿3,000-20/10-2%');await expect(summary.locator('.rebate-offset-run')).toHaveCount(1);await expect(summary).not.toContainText('Paying account');
  await expect(page.getByRole('note').filter({hasText:'No transfer from Lisa'})).toBeVisible();
  await noHorizontalScroll(page);
  expect(s.writes).toHaveLength(0);
  await page.getByRole('button',{name:'Confirm',exact:true}).click();
  // The result: what was offset, to which loan, and the server's owedAfter.
  await expect(page.getByRole('heading',{name:'Rebates offset'})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'Offset ฿120 to'})).toContainText('1 rebate');
  await expect(page.getByText('฿275 still owed to มาย - Mai')).toBeVisible();await expect(page.getByRole('button',{name:'Pay the rest ฿275'})).toBeVisible();
  expect(s.writes).toHaveLength(1);
  const command=s.writes[0];
  expect(command).toMatchObject({operation:'rebate-settlement.create',expectedVersion:null,predecessorRequestId:null,receiptId:null});
  expect(command.inputs).toEqual({referrerId:'R-MAI',destination:'offset',allocations:[{expenseId:'rr1:L-PEND',amount:'120',expectedPending:'300'}],settlementDate:'2026-11-05',cashAccountId:null,paymentMethod:null,bankReference:null,notes:null,
   expectedPlanHash:(120).toString(16).padStart(64,'0')});
  // The server now lists the offset settlement; its record opens from the history and is deleted with its version.
  const id=command.targetId,version='f'.repeat(64),label='มาย - Mai-฿3,000-20/10-2%';
  const record={item:{id,referrerId:'R-MAI',referrerLabel:'มาย - Mai',settlementDate:'2026-11-05',amount:'120.00',accountId:'ca:lisa-cash',accountLabel:null,paymentMethod:'Referral Rebate Offset',bankReference:null,notes:null,createdBy:'owner@example.invalid',createdAt:'2026-11-05T05:00:00.000Z',version,
   destination:'offset',offsetPaymentId:OFFSET_ID+id,offsetLoanLabel:label,paidThrough:null,deleteBlocked:null,
   rebates:[{expenseId:'rr1:L-PEND',loanDisplayKey:'นก - Nok-฿10,000-01/09-2%',borrowerLabel:'นก - Nok',closeDate:'2026-10-12',amount:'300.00',offsetAmount:'0.00',appliedAmount:'120.00',paidAmount:'120.00',partial:true,pendingAmount:'180.00'}]}};
  const detail={...referrerMaiDetail,history:[{kind:'settlement',date:'2026-11-05',amount:'120.00',settlementId:id,rebateCount:1,partialCount:1,destination:'offset',offsetPaymentId:OFFSET_ID+id,offsetLoanLabel:label,accountLabel:null,paymentMethod:'Referral Rebate Offset',bankReference:null},...referrerMaiDetail.history]};
  await page.route('https://mw-credit-app-command-dev-test.run.app/**',async r=>{const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET')return r.fallback();
   if(path==='/api/referrers/R-MAI'){s.reads.push(path);return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,...detail})});}
   if(path==='/api/rebate-settlements/'+encodeURIComponent(id)){s.reads.push(path);return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,...record})});}
   return r.fallback();});
  await page.getByRole('button',{name:'Back to referrer page',exact:true}).click();
  await page.locator('.referrer-line:not(.referrer-referee)').filter({hasText:'Offset ฿120 to'}).click();
  await expect(page.getByRole('heading',{name:'Rebate settlement'})).toBeVisible();await expect(page.getByRole('heading',{name:'Rebates offset'})).toBeVisible();
  const details=page.locator('dl');await expect(details).toContainText('Settle byOffset to '+label);await expect(details).not.toContainText('Paying account');
  await expect(page.getByRole('button',{name:'Offset payment',exact:true})).toBeVisible();await expect(page.locator('.referrer-line').filter({hasText:'นก - Nok'})).toContainText('฿120');
  await noHorizontalScroll(page);
  await page.getByRole('button',{name:'Delete offset',exact:true}).click();
  await expect(page.getByRole('note')).toHaveText('Delete offset ฿120? ฿120 returns to unpaid. The payment on '+label+' is removed and its charges become unpaid again.');
  expect(s.writes).toHaveLength(1);
  await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect.poll(()=>s.writes.length).toBe(2);
  expect(s.writes[1]).toMatchObject({operation:'rebate-settlement.delete',targetId:id,expectedVersion:version,inputs:{},predecessorRequestId:null,receiptId:null});
  await expect(page.getByRole('heading',{name:'Settlement history'})).toBeVisible();
 });
});
