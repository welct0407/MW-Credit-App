import{test,expect,type Page}from'@playwright/test';
// R116: Cash Ledger Recent names the borrower counterparty (viewer language, other language as fallback) on both sides.
const html='<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/daily-cash-withdrawal-harness.tsx"></script>';
const items=[
 {id:'pay',date:'2026-10-09',createdAt:'2026-10-09 15:40:00',movementType:'Payment Receipt',amount:'2400',fromAccountId:null,fromAccountLabel:null,toAccountId:'dad-ttb',toAccountLabel:'SYNTHETIC Dad TTB',borrowerId:'B-1',borrowerName:'ผู้กู้จำลอง',borrowerDescription:'Synthetic Borrower'},
 {id:'loan',date:'2026-10-09',createdAt:'2026-10-09 13:07:00',movementType:'Loan Disbursement',amount:'5000',fromAccountId:'dad-scb',fromAccountLabel:'SYNTHETIC Dad SCB',toAccountId:null,toAccountLabel:null,borrowerId:'B-2',borrowerName:null,borrowerDescription:'English Only Borrower'},
 {id:'none',date:'2026-10-09',createdAt:'2026-10-09 12:00:00',movementType:'Opening Balance',amount:'10',fromAccountId:null,fromAccountLabel:null,toAccountId:'dad-ttb',toAccountLabel:'SYNTHETIC Dad TTB',borrowerId:null,borrowerName:null,borrowerDescription:null}];
async function open(page:Page,thai:boolean){
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({contentType:'application/json',body:JSON.stringify(p==='/api/management/cash-movements'?{items,nextCursor:null}:{items:[],nextCursor:null})})});
 if(thai)await page.addInitScript(()=>{(window as any).__dcwThai=true});
 await page.goto('/');await page.waitForFunction(()=>(window as any).__dcwReady===true);await expect(page.locator('.cash-ledger-row')).toHaveCount(3);
}
const counterparty=(page:Page,n:number)=>page.locator('.cash-ledger-row').nth(n).locator('.cash-ledger-counterparty');
test('English: payment from the borrower, disbursement to the borrower, no borrower stays "—"; label and title match',async({page})=>{
 await open(page,false);
 await expect(counterparty(page,0)).toHaveText('Synthetic Borrower→ SYNTHETIC Dad TTB');await expect(counterparty(page,0)).toHaveAttribute('title','Synthetic Borrower → SYNTHETIC Dad TTB');
 await expect(page.locator('.cash-ledger-row').nth(0)).toHaveAccessibleName(/· Synthetic Borrower → SYNTHETIC Dad TTB$/);
 await expect(counterparty(page,1)).toHaveText('SYNTHETIC Dad SCB→ English Only Borrower');await expect(page.locator('.cash-ledger-row').nth(1)).toHaveAccessibleName(/· SYNTHETIC Dad SCB → English Only Borrower$/);
 await expect(counterparty(page,2)).toHaveText('—→ SYNTHETIC Dad TTB');
});
test('Thai: the Thai name, else the English name as fallback',async({page})=>{
 await open(page,true);
 await expect(counterparty(page,0)).toHaveAttribute('title','ผู้กู้จำลอง → SYNTHETIC Dad TTB');
 await expect(counterparty(page,1)).toHaveAttribute('title','SYNTHETIC Dad SCB → English Only Borrower');
});
test('a ledger cursor refused with 400 restarts once from the first page, without an error',async({page})=>{
 const reads:string[]=[];let refuse=true;
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.route('**/api/**',r=>{const u=new URL(r.request().url());if(u.pathname!=='/api/management/cash-movements')return r.fulfill({contentType:'application/json',body:JSON.stringify({items:[],nextCursor:null})});reads.push(u.search);
  if(u.searchParams.has('cursor')&&refuse)return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({ok:false,code:'invalid_request'})});
  return r.fulfill({contentType:'application/json',body:JSON.stringify({items:u.searchParams.has('cursor')?[items[2]]:items.slice(0,2),nextCursor:u.searchParams.has('cursor')?null:'pre-r116-cursor'})})});
 await page.goto('/');await page.waitForFunction(()=>(window as any).__dcwReady===true);await expect(page.locator('.cash-ledger-row')).toHaveCount(2);
 reads.length=0;await page.getByRole('button',{name:'Next transactions',exact:true}).click();
 await expect.poll(()=>reads).toEqual(['?limit=20&cursor=pre-r116-cursor','?limit=20']);
 await expect(page.locator('.cash-ledger-row')).toHaveCount(2);await expect(page.getByText('Transactions unavailable.')).toHaveCount(0);await expect(page.getByRole('button',{name:'Previous transactions',exact:true})).toHaveCount(0);
 // A fresh cursor then pages normally.
 refuse=false;await page.getByRole('button',{name:'Next transactions',exact:true}).click();await expect(page.locator('.cash-ledger-row')).toHaveCount(1);
});
