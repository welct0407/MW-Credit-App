import {test,expect,type Page,type BrowserContext} from '@playwright/test';

// UX-CHK-04 (Echo, 19 October 2026): while a payment shows "Confirming…" (an own write applied locally,
// localPending), the disabled Correct, Move interest and Delete actions say why; other disabled titles stay.
const row=(id:string,extra:any={})=>({id,status:'Posted',allocationMethod:'Lump Sum',borrowerId:'borrower',paymentDate:'2026-10-14',amountReceived:'10',receiptReference:null,agentReceiptPresent:false,allocations:[],repayments:[],cashMovements:[],...extra});
async function show(page:Page,context:BrowserContext,uid:string,payment:any){
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/back-consumers-harness.tsx"></script>'}));
 await page.route('**/api/**',route=>route.abort());
 await page.goto('/');
 await page.evaluate(async({uid,payment})=>{const w=window as any;const repo=w.__offlineTest.ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid},'synthetic');await repo.authorize();w.__syncRepo=repo;
  await repo.saveDataset('records',{schemaVersion:1,domain:'records',complete:true,sourceVersion:'a'.repeat(64),generation:'initial',asOf:'2026-10-14T01:00:00.000Z',businessDate:'2026-10-14',data:{payments:[payment]}},await repo.readRevision());
  w.__paymentId=payment.id},{uid,payment});
 // Offline once the harness has loaded: the page reads the stored bundle.
 await context.setOffline(true);await page.evaluate(()=>(window as any).selectBackCase('prepared-payment'));
}
const actions=['Correct payment','Move interest','Delete payment'];
test('a confirming payment titles its disabled actions "Available once confirmed"; an offline one keeps its titles',async({page,context})=>{
 await show(page,context,'confirming-titles',row('pending',{localPending:{requestId:'own-request',at:1}}));
 await expect(page.getByRole('status').filter({hasText:'Confirming…'})).toBeVisible();
 for(const name of actions){const button=page.getByRole('button',{name,exact:true});await expect(button).toBeDisabled();await expect(button).toHaveAttribute('title','Available once confirmed')}
 await page.evaluate(()=>(window as any).selectBackCase(null));
 await page.evaluate(async()=>{const w=window as any,bundle=await w.__syncRepo.readDataset('records');bundle.data.payments=[{...bundle.data.payments[0],id:'settled',localPending:undefined}];await w.__syncRepo.saveDataset('records',bundle,await w.__syncRepo.readRevision());w.__paymentId='settled';w.selectBackCase('prepared-payment')});
 await expect(page.getByRole('button',{name:'Correct payment',exact:true})).toBeVisible();await expect(page.getByRole('status').filter({hasText:'Confirming…'})).toHaveCount(0);
 for(const name of actions){const button=page.getByRole('button',{name,exact:true});await expect(button).toBeDisabled();await expect(button).toHaveAttribute('title',name)}
});
