import {test,expect,type Page,type Route} from './fixtures/test';
import {encodeDeltaChunk} from '../../services/api/offline-dataset-delta.mjs';
import {referrerRoute,referrerMaiDetail,referrerMai,referrerPond,rebateExpenses,accruingLoans,REFERRERS_BUSINESS_DATE} from './fixtures/referrers-fixture';

// R140 (owner, 11 November 2026): "after insert/update, then go back to previous page, the numbers should be reflecting
// the updated result" without a manual refresh. A list whose saved data changed while a form or a record was on top
// applies that change when it is shown again (read-cache replay); a page without a saved-data path reloads (the
// dataset-refresh hook); an own write confirms the Management data too once a Management page was opened. Synthetic
// harness: a real IndexedDB repository, the real offline-data coordinator where named, and HTTP seams. No page reload.
const domains=['records','collection','cash','management','notifications'];
const OLD='a'.repeat(64),NEW='b'.repeat(64),asOf='2026-10-14T01:00:00.000Z',businessDate='2026-10-14';
async function fixture(page:Page,uid:string,data:Record<string,any>={}){
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/back-consumers-harness.tsx"></script>'}));
 await page.goto('/');
 await page.evaluate(async({uid,data,domains,OLD,asOf,businessDate})=>{const w=window as any,repo=w.__offlineTest.ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid},'synthetic');await repo.authorize();w.__syncRepo=repo;w.__syncAccess={origin:location.origin,offline:repo,token:async()=>'synthetic-only',authFailure:()=>{}};for(const domain of domains)await repo.saveDataset(domain,{schemaVersion:1,domain,complete:true,sourceVersion:OLD,generation:'initial',asOf,businessDate,data:data[domain]??{}},await repo.readRevision())},{uid,data,domains,OLD,asOf,businessDate});
}
/** Commits a new bundle for one domain and announces it the way a completed check does (the write landed meanwhile). */
const publish=(page:Page,domain:string,data:any)=>page.evaluate(async({domain,data,asOf,businessDate})=>{const repo=(window as any).__syncRepo;await repo.saveDataset(domain,{schemaVersion:1,domain,complete:true,sourceVersion:null,generation:'g-'+Math.random(),asOf,businessDate,data},await repo.readRevision());window.dispatchEvent(new CustomEvent('mw-offline-dataset-ready',{detail:{scopeName:repo.scopeName,domain,changed:true}}))},{domain,data,asOf,businessDate});
const select=(page:Page,name:string)=>page.evaluate(name=>(window as any).selectBackCase(name),name);
type Reads=(path:string,method:string,url:URL)=>any;
/** One seam for every request: the dataset protocol answered from `server`, operations, then the page's reads. */
async function serve(page:Page,reads:Reads,server:{versions:Record<string,string>;data:Record<string,any>}={versions:Object.fromEntries(domains.map(d=>[d,OLD])),data:{}},log:string[]=[],onWrite?:(body:any)=>void){
 const chunk=(domain:string,patches:any[],sourceVersion:string)=>({schemaVersion:2,domain,generation:'g-'+sourceVersion.slice(0,4),startedAt:asOf,asOf,businessDate,sourceVersion,patches,nextCursor:null,complete:true,progress:{completed:1,total:1}});
 const patches=(data:any)=>Object.entries(data??{}).map(([key,value])=>({key,mode:Array.isArray(value)?'append':'replace',value}));
 let posted=false;
 await page.route('**/api/**',async(r:Route)=>{
  const url=new URL(r.request().url()),path=url.pathname,method=r.request().method();
  if(path.endsWith('offline-dataset')){
   const body=r.request().postDataJSON()??{},domain=url.searchParams.get('domain')??'notifications',current=server.versions[domain];log.push(domain);
   const versions=body.versions&&!body.cursor?{versions:Object.fromEntries(domains.filter(d=>d!=='notifications').map(d=>[d,server.versions[d]]))}:{};
   if(body.sourceVersion===current&&!body.cursor)return r.fulfill({json:{...chunk(domain,[],current),schemaVersion:3,unchanged:true,values:{},...versions}});
   return r.fulfill({json:{...encodeDeltaChunk(chunk(domain,patches(server.data[domain]),current),body.need),...versions}});
  }
  if(path.startsWith('/api/operations')){if(method==='POST'){posted=true;onWrite?.(r.request().postDataJSON());return r.fulfill({json:{kind:'recorded',originalOutcome:{status:'applied'}}})}return r.fulfill({json:posted?{kind:'recorded',originalOutcome:{status:'applied'}}:{kind:'unresolved'}})}
  const body=await reads(path,method,url);
  return body===undefined?r.fulfill({json:{ok:true,items:[],nextCursor:null}}):body.__status?r.fulfill({status:body.__status,json:body}):r.fulfill({json:body});
 });
}
const start=(page:Page)=>page.evaluate(()=>{const w=window as any;w.__stopPreparation=w.__datasetTest.startOfflinePreparation(w.__syncAccess)});
const settled=async(page:Page)=>expect.poll(()=>page.evaluate(()=>{const w=window as any,s=w.__datasetTest.getOfflinePreparation(w.__syncRepo.scopeName);return s.state==='ready'&&!s.updating})).toBe(true);
/** The row's screen top and the window scroll; the focused row after Back. */
const where=(page:Page,selector:string)=>page.evaluate(sel=>{const el=document.querySelector(sel) as HTMLElement|null;let scrolled=Math.round(scrollY);for(let node=el?.parentElement??null;node&&node!==document.body;node=node.parentElement)scrolled+=Math.round(node.scrollTop);
 return {top:el?Math.round(el.getBoundingClientRect().top):null,scrolled,focus:(document.activeElement as HTMLElement|null)?.closest('[data-record-id]')?.getAttribute('data-record-id')??null}},selector);
/** Scroll whatever scrolls the row (its nearest overflowing ancestor, else the window) so the row is about mid-view. */
const centre=(page:Page,selector:string)=>page.evaluate(sel=>{const el=document.querySelector(sel) as HTMLElement;
 for(let node=el.parentElement;node&&node!==document.body;node=node.parentElement){const overflow=getComputedStyle(node).overflowY;if(/^(auto|scroll)$/.test(overflow)&&node.scrollHeight>node.clientHeight+1){const r=el.getBoundingClientRect(),c=node.getBoundingClientRect();node.scrollTop+=r.top-c.top-c.height/2;return}}
 window.scrollBy(0,el.getBoundingClientRect().top-innerHeight/2)},selector);
/** The pointer leaves the rows: a mouse resting on a row holds a list update (UX-HOLD-03), as it should. */
const away=(page:Page)=>page.mouse.move(1,1);

const expense=(id:string,expenseDate:string,over:Record<string,any>={})=>({id,version:'d'.repeat(64),expenseDate,category:'Office supplies',amount:'10.00',payeeName:'Synthetic payee '+id,payeeBorrowerId:null,payeeBorrowerLabel:null,relatedBorrowerId:null,relatedBorrowerLabel:null,relatedLoanId:null,relatedLoanLabel:null,notes:null,paidByAccountId:null,paidByAccountLabel:null,paidByHolderId:null,paidByHolderLabel:null,sourceType:'Manual',sourceKey:null,grossProfitBasis:null,allocationBasis:'Expense Date Contribution Ratio',partnerAShare:'0.6',partnerBShare:'0.4',partnerAExpense:'6.00',partnerBExpense:'4.00',ruleVersion:null,createdAt:expenseDate+' 12:00:00',createdBy:'synthetic@example.invalid',canEdit:true,canDelete:true,reimbursements:[],paymentState:'pending',pendingAmount:'10.00',paidDate:null,storedPaidDate:null,...over});
const paid=(row:any)=>({...row,paymentState:'paid',pendingAmount:'0.00',paidByAccountId:'acc-dad',paidByAccountLabel:'Synthetic Dad account',paidByHolderId:'h-dad',paidByHolderLabel:'Dad',paidDate:row.expenseDate,version:'e'.repeat(64)});
const expenseReads=(rows:any[]):Reads=>path=>{
 if(path==='/api/expense-records')return {ok:true,items:rows,nextCursor:null};
 const one=/^\/api\/expense-records\/(.+)$/.exec(path);if(one){const item=rows.find(row=>row.id===decodeURIComponent(one[1]));return item?{ok:true,item}:{__status:404,ok:false,code:'not_found'}}
 if(path==='/api/expense-options')return {ok:true,businessDate,categories:['Office supplies'],accounts:[],holders:[]};
 return undefined;
};

test('Expenses: a new expense saved while the form was open is listed on Back',async({page})=>{
 const first=expense('E-1','2026-10-10'),added=expense('E-NEW','2026-10-13',{payeeName:'Synthetic new payee'});
 await fixture(page,'replay-expense-new',{records:{expenses:[first]}});await serve(page,expenseReads([first]));await select(page,'prepared-expenses');
 await expect(page.locator('[data-record-id="E-1"]')).toBeVisible();
 await page.getByRole('button',{name:'Add expense',exact:true}).click();await expect(page.getByRole('button',{name:'Back to expenses'})).toBeVisible();
 // The save reaches the server and the confirm cycle saves the new list while the form is still on top.
 await publish(page,'records',{expenses:[first,added]});
 await page.getByRole('button',{name:'Back to expenses'}).click();
 await expect(page.locator('[data-record-id="E-NEW"]')).toBeVisible();await expect(page.locator('.expense-tile').first()).toHaveAttribute('data-record-id','E-NEW');
});

test('Expenses: Mark as paid, then Back shows the paid chip on the record and on its tile',async({page})=>{
 const row=expense('E-PAY','2026-10-09');
 await fixture(page,'replay-expense-paid',{records:{expenses:[row]}});await serve(page,expenseReads([row]));await select(page,'prepared-expenses');
 await page.locator('[data-record-id="E-PAY"]').click();await expect(page.getByRole('button',{name:'Mark as paid'})).toBeVisible();
 await expect(page.locator('.expense-summary .rebate-chip-pending')).toBeVisible();
 await page.getByRole('button',{name:'Mark as paid'}).click();await expect(page.getByRole('button',{name:'Back to expenses'})).toBeVisible();
 await publish(page,'records',{expenses:[paid(row)]});
 await page.getByRole('button',{name:'Back to expenses'}).click();
 await expect(page.locator('.expense-summary .rebate-chip-paid')).toBeVisible();await expect(page.getByRole('button',{name:'Mark as paid'})).toHaveCount(0);
 await expect(page.locator('[data-record-id="E-PAY"]')).toHaveCount(0);await page.getByRole('button',{name:'Back to expenses'}).click();await away(page);
 // The tile drops its Pending payment chip (a manual expense paid on its date shows no chip in the list).
 await expect(page.locator('[data-record-id="E-PAY"]')).toBeVisible();await expect(page.locator('[data-record-id="E-PAY"] .rebate-chip-pending')).toHaveCount(0);
});

test('Expenses: Back keeps the list where it was while the missed change applies',async({page})=>{
 const rows=Array.from({length:25},(_,i)=>expense('E-'+String(i).padStart(2,'0'),'2026-10-'+String(28-(i%28)).padStart(2,'0'),{createdAt:'2026-10-01 '+String(10+(i%10))+':00:'+String(i).padStart(2,'0')}))
  // In the server's order (newest expense date, then created at, then id), as the saved list sorts them.
  .sort((a,b)=>b.expenseDate.localeCompare(a.expenseDate)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
 await fixture(page,'replay-expense-scroll',{records:{expenses:rows}});await serve(page,expenseReads(rows));await select(page,'prepared-expenses');
 await expect(page.locator('.expense-tile')).toHaveCount(25);const ids=await page.locator('.expense-tile').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-record-id')));
 const target=`[data-record-id="${ids[20]}"]`;await centre(page,target);
 const before=await where(page,target);expect(before.scrolled).toBeGreaterThan(300);
 await expect(page.locator(target+' .rebate-chip-pending')).toBeVisible();
 await page.locator(target).click();await expect(page.getByRole('button',{name:'Back to expenses'})).toBeVisible();
 await publish(page,'records',{expenses:rows.map(row=>row.id===ids[20]?paid(row):row)});
 await page.getByRole('button',{name:'Back to expenses'}).click();await away(page);
 await expect(page.locator(target)).toBeVisible();await expect(page.locator(target+' .rebate-chip-pending')).toHaveCount(0);
 await expect.poll(async()=>(await where(page,target)).focus).toBe(ids[20]);await page.waitForTimeout(400);
 const after=await where(page,target);expect(Math.abs(after.top!-before.top!)).toBeLessThanOrEqual(3);expect(Math.abs(after.scrolled-before.scrolled)).toBeLessThanOrEqual(3);
});

const loanRow=(id:string,over:Record<string,any>={})=>({id,borrowerId:'B-FON',borrowerDisplayName:'ฝน - Fon',rank:0,status:'ยังไม่ปิดยอด',loanDate:'2026-10-01',principalAmount:'20000',totalInterestReceived:'100',displayKey:id,...over});
test('Loans: a loan changed while its record was open shows the new values on Back, where the list was',async({page})=>{
 const rows=[loanRow('L-OPEN1'),...Array.from({length:30},(_,i)=>loanRow('L-X'+String(i).padStart(2,'0'),{borrowerId:'B-X'+i,borrowerDisplayName:'Synthetic '+i}))];
 await fixture(page,'replay-loans',{records:{loanList:rows}});
 // The read service lags behind (it still answers the old row), so only the saved data can show the change.
 await serve(page,path=>path==='/api/loan-records'?{ok:true,items:rows,nextCursor:null}:path==='/api/loan-records/L-X20'?{ok:true,item:{...accruingLoans['L-OPEN1'],id:'L-X20'}}:undefined);
 await select(page,'prepared-loans');
 const tile=page.locator('.standalone-records .borrower-card').filter({hasText:'Synthetic 20'});await expect(tile).toBeVisible();
 await tile.evaluate(node=>node.setAttribute('data-test-row','L-X20'));const target='[data-test-row="L-X20"]';await centre(page,target);
 const before=await where(page,target);expect(before.scrolled).toBeGreaterThan(200);
 await tile.click();await expect(page.getByRole('button',{name:'Back to loans'})).toBeVisible();
 await publish(page,'records',{loanList:rows.map(row=>row.id==='L-X20'?{...row,totalInterestReceived:'1500'}:row)});
 await page.getByRole('button',{name:'Back to loans'}).click();await away(page);
 await expect(tile).toContainText('฿1,500');await page.waitForTimeout(400);
 await tile.evaluate(node=>node.setAttribute('data-test-row','L-X20'));const after=await where(page,target);expect(Math.abs(after.top!-before.top!)).toBeLessThanOrEqual(3);expect(Math.abs(after.scrolled-before.scrolled)).toBeLessThanOrEqual(3);
});

test('Referrers: a rebate settled while a related record was open shows the new owed amount on Back',async({page})=>{
 let detail:any=referrerMaiDetail;
 await fixture(page,'replay-referrer');
 await serve(page,(path,method)=>{if(method!=='GET')return undefined;if(path==='/api/referrers/R-MAI')return {ok:true,...detail};const r=referrerRoute(path);return r?{...r.body,...(r.status!==200?{__status:r.status}:{})}:undefined});
 await select(page,'prepared-referrers');
 await page.getByRole('button',{name:/Mai/}).first().click();await expect(page.getByRole('heading',{name:'Settlement history'})).toBeVisible();
 await expect(page.locator('.referrer-records')).toContainText(/Unpaid\s?฿400(?![\d,])/);
 await page.locator('[data-record-id="rr1:L-PEND"]').first().evaluate(node=>(node as HTMLElement).click());await expect(page.getByRole('button',{name:'Back to referrer'})).toBeVisible();
 // Elsewhere (another device, the chat) the rebates are settled; the records check announces it.
 detail={...referrerMaiDetail,referrer:{...referrerMaiDetail.referrer,unpaidAmount:'0.00',unpaidCount:0,oldestUnpaidCloseDate:null},unpaid:[]};
 await publish(page,'records',{expenses:Object.values(rebateExpenses)});
 await page.getByRole('button',{name:'Back to referrer'}).click();
 await expect(page.locator('.referrer-records')).toContainText(/Unpaid\s?฿0(?![\d,])/);
});

const position=(count:number)=>({ok:true,source:'synthetic',businessDate,holders:[{id:'holder-A',label:'SYNTHETIC holder A',cashIn:'500',cashOut:'100',currentBalance:'100',businessCashHeld:'77',reimbursementDue:null}],accounts:[{id:'account-A',holderId:'holder-A',label:'SYNTHETIC account A',initialized:true,currentBalance:'30',cashIn:'90',cashOut:'60',openingBalance:'0'}],expensesPayable:{count,amount:String(count*10)+'.00'}});
test('Cash Position: an own write confirms the Management data too, so a new payable expense shows without the poll',async({page})=>{
 const server={versions:Object.fromEntries(domains.map(d=>[d,OLD])),data:{records:{},management:{position:position(1)}} as Record<string,any>},log:string[]=[];
 await fixture(page,'replay-position',{management:{position:position(1)}});
 await serve(page,path=>path==='/api/management/cash-position'?position(1):undefined,server,log);
 await select(page,'prepared-position');await expect(page.locator('.cash-expenses-payable')).toContainText('1 expense');
 await start(page);await settled(page);log.length=0;
 // An expense is added: the server's Management data changes, and the saved command invalidates the reads.
 server.data.management={position:position(2)};server.versions.management=NEW;
 const invalidated=Date.now();await page.evaluate(()=>window.dispatchEvent(new Event('mw-read-invalidated')));
 await expect(page.locator('.cash-expenses-payable')).toContainText('2 expenses',{timeout:8000});expect(Date.now()-invalidated).toBeLessThan(8000);
 expect(log).toContain('management');
 await page.evaluate(()=>(window as any).__stopPreparation());
});

test('Expenses: an expense saved offline appears when it syncs, on Back from the record that was open',async({page})=>{
 const first=expense('E-1','2026-10-10'),queued=expense('E-OFFLINE','2026-10-12',{payeeName:'Synthetic offline payee'});
 const server={versions:Object.fromEntries(domains.map(d=>[d,OLD])),data:{records:{expenses:[first]}} as Record<string,any>};
 await fixture(page,'replay-offline-sync',{records:{expenses:[first]}});
 // The server's reads answer its current rows (the write is applied before the request settles).
 await serve(page,(path,method,url)=>expenseReads(server.data.records.expenses)(path,method,url),server);
 await start(page);await settled(page);await select(page,'prepared-expenses');
 await page.locator('[data-record-id="E-1"]').click();await expect(page.getByRole('button',{name:'Back to expenses'})).toBeVisible();
 // The queued create syncs: the server applies it, the settled request invalidates the reads and the records check walks.
 server.data.records={expenses:[first,queued]};server.versions.records=NEW;
 const command={requestId:'30000000-0000-4000-8000-000000000001',operation:'expense.create',targetId:'30000000-0000-4000-8000-0000000000aa',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{expenseDate:'2026-10-12',category:'Office supplies',amount:'10'}};
 await page.evaluate(async command=>{const w=window as any;await w.__syncRepo.savePending(command.requestId,{domain:'expense',command});await w.__offlineTest.syncSavedRequests(w.__syncAccess)},command);
 expect(await page.evaluate(()=>(window as any).__syncRepo.list('pending'))).toEqual([]);
 await expect.poll(()=>page.evaluate(async()=>((await(window as any).__syncRepo.readDataset('records')).data.expenses??[]).length)).toBe(2);
 await page.getByRole('button',{name:'Back to expenses'}).click();
 await expect(page.locator('[data-record-id="E-OFFLINE"]')).toBeVisible();
 await page.evaluate(()=>(window as any).__stopPreparation());
});

// R141 (owner, 11 November 2026): the Cash Position "Expenses payable" line opens Expenses filtered to pending payment,
// with the line's count and amount on the filter bar; Clear filter shows every expense; Back returns to Cash Position.
test('R141 Cash Position: the Expenses payable line opens the pending expenses; Clear filter; Back returns to the line',async({page})=>{
 const pendingA=expense('E-P1','2026-10-12',{amount:'15.00'}),pendingB=expense('E-P2','2026-10-11',{amount:'5.00',payeeName:'Synthetic second payee'}),paidRow=paid(expense('E-PAID','2026-10-13'));
 const all=[paidRow,pendingA,pendingB],asked:string[]=[];
 const body=position(2);body.expensesPayable={count:2,amount:'20.00'};
 await fixture(page,'r141-position',{management:{position:body}});
 await serve(page,(path,_method,url)=>{if(path==='/api/management/cash-position')return body;if(path==='/api/expense-records'){asked.push(url.search);const pending=url.searchParams.get('payment')==='pending',rows=all.filter(row=>!pending||row.paymentState==='pending');
   return {ok:true,items:rows,nextCursor:null,...(pending?{filter:{payment:'pending',payeeBorrowerId:null,total:{count:rows.length,amount:'20.00'}}}:{})}}
  return expenseReads(all)(path,_method,url)});
 await select(page,'prepared-position');
 const line=page.getByRole('button',{name:'Show pending expenses',exact:true});await expect(line).toContainText('Expenses payable · 2 expenses');await expect(line).toContainText('฿20');
 expect((await line.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await line.click();
 const bar=page.getByRole('group',{name:'Filter',exact:true});await expect(bar).toContainText('Pending payment');await expect(bar).toContainText('2 expenses · ฿20');
 await expect(page.locator('.expense-tile')).toHaveCount(2);await expect(page.locator('[data-record-id="E-PAID"]')).toHaveCount(0);expect(asked).toContain('?payment=pending');
 const clear=bar.getByRole('button',{name:'Clear filter',exact:true});expect((await clear.boundingBox())!.height).toBeGreaterThanOrEqual(44);await clear.click();
 await expect(page.getByRole('group',{name:'Filter',exact:true})).toHaveCount(0);await expect(page.locator('.expense-tile')).toHaveCount(3);
 await page.getByRole('button',{name:'Back to Cash Position'}).click();
 await expect(page.getByRole('button',{name:'Show pending expenses',exact:true})).toBeVisible();await expect(page.locator('.expense-tile')).toHaveCount(0);
});
test('R141 a pending filter with nothing left says so',async({page})=>{
 const body=position(1);await fixture(page,'r141-empty',{management:{position:body}});
 await serve(page,(path,_method,url)=>path==='/api/management/cash-position'?body:path==='/api/expense-records'?{ok:true,items:[],nextCursor:null,...(url.searchParams.get('payment')?{filter:{payment:'pending',payeeBorrowerId:null,total:{count:0,amount:'0.00'}}}:{})}:undefined);
 await select(page,'prepared-position');await page.getByRole('button',{name:'Show pending expenses',exact:true}).click();
 await expect(page.getByText('No pending expenses.',{exact:true})).toBeVisible();await expect(page.getByRole('group',{name:'Filter',exact:true})).toContainText('0 expenses · ฿0');
});

// R141 (owner, 11 November 2026): the Cash Position "Rebates payable" line opens the referrers still owed rebates (owed=1)
// with the line's amount; settling from a referrer's page and Back leaves that referrer out, and Back to Cash Position shows
// the line re-read. Clear filter shows every referrer.
test('R141 Cash Position: the Rebates payable line opens the referrers owed rebates; settle, Back drops the referrer; Clear filter',async({page})=>{
 let owedMai='400.00';const asked:string[]=[];
 const body=()=>({...position(0),rebatesPayable:{count:Number(owedMai)>0?2:0,amount:owedMai}});
 const mai=()=>({...referrerMai,unpaidAmount:owedMai,unpaidCount:Number(owedMai)>0?2:0});
 await fixture(page,'r141-rebates',{management:{position:body()}});
 await serve(page,(path,method,url)=>{if(method!=='GET')return undefined;if(path==='/api/management/cash-position')return body();
  if(path==='/api/referrers'){asked.push(url.search);const items=[mai(),referrerPond],owed=url.searchParams.get('owed')==='1',rows=owed?items.filter(r=>Number(r.unpaidAmount)>0):items;
   return {ok:true,items:rows,businessDate:REFERRERS_BUSINESS_DATE,...(owed?{filter:{owed:true,total:{count:rows.length,amount:Number(owedMai).toFixed(2)}}}:{})}}
  if(path==='/api/referrers/R-MAI')return {ok:true,...referrerMaiDetail,referrer:mai(),unpaid:Number(owedMai)>0?referrerMaiDetail.unpaid:[]};
  const r=referrerRoute(path);return r?{...r.body,...(r.status!==200?{__status:r.status}:{})}:undefined},undefined,[],written=>{if(written?.operation==='rebate-settlement.create')owedMai='0.00'});
 await select(page,'prepared-position');
 const line=page.getByRole('button',{name:'Show referrers owed rebates',exact:true});await expect(line).toContainText('Rebates payable · 2 rebates');await expect(line).toContainText('฿400');
 expect((await line.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await line.click();
 const bar=page.getByRole('group',{name:'Filter',exact:true});await expect(bar).toContainText('Owed rebates');await expect(bar).toContainText('1 referrer · ฿400');
 expect(asked).toContain('?owed=1');await expect(page.locator('.referrer-row')).toHaveCount(1);
 // Clear filter shows every referrer; the line opens the filtered list again.
 await bar.getByRole('button',{name:'Clear filter',exact:true}).click();await expect(page.locator('.referrer-row')).toHaveCount(2);await expect(page.getByRole('group',{name:'Filter',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Back to Cash Position'}).click();await line.click();await expect(page.locator('.referrer-row')).toHaveCount(1);
 // Settle every owed rebate from the referrer's page, as today.
 await page.locator('.referrer-row').first().click();await page.getByRole('button',{name:'Pay rebates ฿400'}).click();
 await page.locator('.rebate-settle-footer button').click();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Paid ฿400 to'})).toBeVisible();
 await page.getByRole('button',{name:'Back to referrer page',exact:true}).click();await expect(page.getByRole('heading',{name:'Settlement history'})).toBeVisible();
 await page.getByRole('button',{name:'Back to referrers',exact:true}).click();
 await expect(page.locator('.referrer-row')).toHaveCount(0);await expect(page.getByText('No rebates owed.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back to Cash Position'}).click();
 await expect(page.getByRole('button',{name:'Show referrers owed rebates',exact:true})).toContainText('฿0');
});

// R155 (owner's PROD report of 14 November 2026): after R154 the borrower edit form hid "IG Group Invite Link (mobile)"
// for a borrower, also after a Full sync. The form shows each link field only when its record carries the key. This drives
// the real offline path: a records walk served by the dataset protocol (encodeDeltaChunk) carries the borrower with
// igGroupUrl set and igGroupInviteLink null; the record read from the network fails, so the form's record is the stored one.
// The form is mounted afresh: another case renders first (its own element seen), so React never folds the two switches
// into one render that keeps the earlier form and its state (seen once on WebKit: the conflict message stayed).
const reopenBorrower=async(page:Page)=>{await select(page,'queue-badge');await expect(page.locator('.waiting-sync-button').first()).toBeVisible();await select(page,'borrower-offline-record')};
const r155Borrower=(over:Record<string,any>={}):Record<string,any>=>({id:'B-R155',version:'a'.repeat(64),createdDate:'2026-10-01',aiCollectionEnabled:true,name:'ผู้กู้ทดสอบ',description:'Synthetic R155',communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:false,referrerId:null,preferredReceivingAccountId:null,note:null,referralRebateRate:null,referralRebateCap:null,details:{},...over});
test('R155 a borrower record from the offline dataset keeps igGroupInviteLink null and the edit form shows both link fields',async({page})=>{
 const before=r155Borrower({igGroupUrl:'https://www.instagram.com/direct/t/100000000000001/'}),after:Record<string,any>={...before,version:'b'.repeat(64),igGroupInviteLink:null};
 await fixture(page,'r155-borrower',{records:{borrowers:[before]}});
 await serve(page,path=>path.startsWith('/api/borrower-records/')?{__status:503,ok:false,code:'source_unavailable'}:path==='/api/borrower-options'?{ok:true,accounts:[],referrers:[]}:undefined,
  {versions:{...Object.fromEntries(domains.map(d=>[d,OLD])),records:NEW},data:{records:{borrowers:[after]}}});
 await start(page);await settled(page);
 const stored=await page.evaluate(async()=>(await (window as any).__syncRepo.readDataset('records')).data.borrowers);
 expect(stored).toEqual([after]);expect(Object.hasOwn(stored[0],'igGroupInviteLink')).toBe(true);
 await select(page,'borrower-offline-record');
 await expect(page.getByRole('link',{name:after.igGroupUrl,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit borrower',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'IG Group URL (computer)',exact:true})).toHaveValue(after.igGroupUrl);
 await expect(page.getByRole('textbox',{name:'IG Group Invite Link (mobile)',exact:true})).toHaveValue('');
 await page.evaluate(()=>(window as any).__stopPreparation());
});
// R155 root cause: tapping Edit autosaved a borrower draft holding the record as it was then, Cancel kept the draft, and
// every later open restored it (opening in edit mode, without reading the record again). A draft saved from a record read
// before V149 has no igGroupInviteLink, so the field stayed hidden through a Full sync. Now an Edit without a change saves
// no draft, Cancel discards it, and a restored draft with no change is dropped for the current record.
test('R155 an unchanged borrower draft from an older record never hides the invite link field after a Full sync',async({page})=>{
 const url='https://www.instagram.com/direct/t/100000000000001/',stale=r155Borrower({igGroupUrl:url}),fresh={...stale,version:'b'.repeat(64),igGroupInviteLink:null};
 let network:any={__status:503,ok:false,code:'source_unavailable'};
 await fixture(page,'r155-draft',{records:{borrowers:[stale]}});
 await serve(page,path=>path.startsWith('/api/borrower-records/')?network:path==='/api/borrower-options'?{ok:true,accounts:[],referrers:[]}:undefined,
  {versions:{...Object.fromEntries(domains.map(d=>[d,OLD])),records:NEW},data:{records:{borrowers:[fresh]}}});
 const drafts=()=>page.evaluate(async()=>(await (window as any).__syncRepo.list('draft')).map((row:any)=>row.key));
 // Before the walk: the stored record is the old one. Edit then Cancel leaves no draft behind.
 await select(page,'borrower-offline-record');await page.getByRole('button',{name:'Edit borrower',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'IG Group URL (computer)',exact:true})).toHaveValue(url);await expect(page.getByRole('textbox',{name:'IG Group Invite Link (mobile)',exact:true})).toHaveCount(0);
 await page.waitForTimeout(700);expect(await drafts(),'an Edit without a change saves no draft').toEqual([]);
 // A draft left by the earlier build (Edit autosaved one with the record; Cancel kept it): restored with no change, it is
 // dropped and the current record is read.
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.evaluate(async({stale})=>{const repo=(window as any).__syncRepo;const fields=Object.fromEntries(['aiCollectionEnabled','name','description','communicationName','instagramUsername','city','workingLocation','address','hidden','referrerId','preferredReceivingAccountId','note','referralRebateRate','referralRebateCap','igGroupUrl','igGroupInviteLink'].map(key=>[key,(stale as any)[key]]));
  await repo.saveDraft('borrower:B-R155',{domain:'borrower',label:'SYNTHETIC',draft:{id:'B-R155',record:stale,fields,accounts:[],referrers:[]}})},{stale});
 // The Full sync delivers the current record; the network answers it too.
 await start(page);await settled(page);network={ok:true,item:fresh};
 // On a phone or PC the stored records bundle is large, so reading the one draft row finishes before the record is read
 // from it: the draft wins and the form opened in edit mode on the draft's record. Reading the bundle is slowed here
 // to the same effect.
 await page.evaluate(()=>{const repo=(window as any).__syncRepo,read=repo.readDataset.bind(repo);repo.readDataset=async(domain:string)=>{if(domain==='records')await new Promise(done=>setTimeout(done,600));return read(domain)}});
 await reopenBorrower(page);
 const edit=page.getByRole('button',{name:'Edit borrower',exact:true});await expect(edit).toBeVisible();await edit.click();
 await expect(page.getByRole('textbox',{name:'IG Group Invite Link (mobile)',exact:true}),'the field of the current record is shown').toHaveValue('');await expect(page.getByRole('textbox',{name:'IG Group URL (computer)',exact:true})).toHaveValue(url);
 await expect.poll(drafts).toEqual([]);
 // A real change saves a draft as before; undoing it removes the draft; Cancel discards one.
 const invite=page.getByRole('textbox',{name:'IG Group Invite Link (mobile)',exact:true});
 await invite.fill('https://ig.me/j/AbCdEfGh12345678/');await expect.poll(drafts).toEqual(['draft:borrower:B-R155']);
 await invite.fill('');await expect.poll(drafts,{message:'undoing every change removes the draft'}).toEqual([]);
 await invite.fill('https://ig.me/j/AbCdEfGh12345678/');await expect.poll(drafts).toEqual(['draft:borrower:B-R155']);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect.poll(drafts,{message:'Cancel discards the draft'}).toEqual([]);
 await expect(page.getByRole('link',{name:url,exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).__stopPreparation());
});
// R156 (owner, PROD: the PC form restored an old Edit draft after the iPhone had saved the borrower). A draft with real
// edits is restored even when the stored record is read first (it is applied only after the draft check). Cancel drops it
// and shows the current record. Saved, it keeps its base version: the existing conflict path stops it (the sync reads the
// current record first) and nothing is saved over the newer record.
const r156Draft=async(page:Page,base:Record<string,any>)=>page.evaluate(async({base})=>{const repo=(window as any).__syncRepo;const fields:any=Object.fromEntries(['aiCollectionEnabled','name','description','communicationName','instagramUsername','city','workingLocation','address','hidden','referrerId','preferredReceivingAccountId','note','referralRebateRate','referralRebateCap','igGroupUrl','igGroupInviteLink'].map(key=>[key,(base as any)[key]]));
 await repo.saveDraft('borrower:B-R155',{domain:'borrower',label:'SYNTHETIC',draft:{id:'B-R155',record:base,fields:{...fields,city:'Changed city'},accounts:[],referrers:[]}})},{base});
for(const action of ['cancel','save'] as const)test(`R156 a draft with real edits is restored over the stored record; ${action==='cancel'?'Cancel shows the current record':'Save stops at the conflict, nothing saved over the newer record'}`,async({page})=>{
 const base=r155Borrower({igGroupUrl:null,igGroupInviteLink:null}),current={...base,version:'c'.repeat(64),igGroupInviteLink:'https://ig.me/j/ZyXwVuTs98765432'};
 const posts:any[]=[];
 await fixture(page,'r156-draft-'+action,{records:{borrowers:[current]}});
 await serve(page,path=>path.startsWith('/api/borrower-records/')?{ok:true,item:current}:path==='/api/borrower-options'?{ok:true,accounts:[],referrers:[]}:undefined,undefined,[],body=>posts.push(body));
 // The command service refuses a version that is not the current one (pwa_submit_operation_v2: source_conflict).
 await page.route('**/api/operations',async r=>{if(r.request().method()!=='POST')return r.fallback();const body=r.request().postDataJSON();posts.push(body);
  return body?.expectedVersion===current.version?r.fallback():r.fulfill({json:{kind:'recorded',originalOutcome:{status:'rejected',code:'source_conflict'}}})});
 await r156Draft(page,base);
 // The dataset coordinator runs, as in the app: the stored record is ready to apply as soon as the form subscribes.
 await start(page);await settled(page);
 await select(page,'borrower-offline-record');
 await expect(page.getByRole('textbox',{name:'City',exact:true})).toHaveValue('Changed city');await expect(page.getByRole('button',{name:'Edit borrower',exact:true})).toHaveCount(0);
 await page.waitForTimeout(800);await expect(page.getByRole('textbox',{name:'City',exact:true}),'the stored record does not replace the restored edit').toHaveValue('Changed city');
 const drafts=()=>page.evaluate(async()=>(await (window as any).__syncRepo.list('draft')).map((row:any)=>row.key));
 if(action==='cancel'){
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('link',{name:current.igGroupInviteLink,exact:true}),'the current record').toBeVisible();await expect(page.getByRole('button',{name:'Edit borrower',exact:true})).toBeVisible();
  await expect.poll(drafts).toEqual([]);
 }else{
  await page.getByRole('button',{name:'Save borrower',exact:true}).click();
  await expect(page.getByText(/The record changed/)).toBeVisible();
  expect(posts.map(body=>body?.expectedVersion),'sent with the draft\'s base version and refused').toEqual(['a'.repeat(64)]);
  // The existing conflict path: the refused request stays on Saved changes with its reference; the draft is gone, and the
  // borrower reopened shows the current record.
  await expect.poll(drafts).toEqual([]);await reopenBorrower(page);
  await expect(page.getByRole('link',{name:current.igGroupInviteLink,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Edit borrower',exact:true})).toBeVisible();
 }
 await page.evaluate(()=>(window as any).__stopPreparation());
});
