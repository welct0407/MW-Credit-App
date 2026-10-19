import {test,expect,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {encodeDeltaChunk} from '../../services/api/offline-dataset-delta.mjs';

// R078 follow-up (owner, 19 October 2026: post-write cycle under 3 s). A queued own payment with a receipt: the
// receipt is stored for the payment from the local file when the upload's sha256 and size match it (no download)
// or downloaded once otherwise, and the confirming records, collection and cash cycle takes 3 requests (inline values).
const requestId='20000000-0000-4000-8000-000000000001',receiptId='20000000-0000-4000-8000-000000000002',paymentId='pay-own';
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cfc000000301010018dd8db00000000049454e44ae426082','hex');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const asOf=new Date().toISOString(),receiptAt=new Date(Date.now()-60000).toISOString(),old='a'.repeat(64),next='b'.repeat(64);
const reference='manual-receipts/dev/pwa/'+'c'.repeat(32)+'/'+receiptId.replace(/-/g,'')+'.png';
const cursor={seq:'10',xmin:'500',businessDate:today};
async function fixture(page:Page,uid:string){
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/tests/e2e/fixtures/back-consumers-harness.tsx"></script>'}));
 await page.goto('/');
 await page.evaluate(async({uid,old,asOf,today,cursor,requestId,receiptId,png})=>{const w=window as any,repo=w.__offlineTest.ownerOfflineRepository({issuer:'https://securetoken.google.com/clever-oasis-508610-n7',uid},'synthetic');await repo.authorize();w.__syncRepo=repo;w.__syncAccess={origin:location.origin,offline:repo,token:async()=>'synthetic-only',authFailure:()=>{}};
  for(const domain of ['records','collection','cash','management','notifications'])await repo.saveDataset(domain,{schemaVersion:1,domain,complete:true,sourceVersion:old,generation:'initial',asOf,businessDate:today,...(domain==='notifications'?{}:{changes:cursor}),data:domain==='records'?{payments:[]}:domain==='collection'?{receipts:[]}:{}},await repo.readRevision());
  await repo.saveReconciledAt(Date.now());
  const command={schemaVersion:6,requestId,borrowerId:'borrower',receiptId,totalAmount:'25',charges:[]};
  await repo.savePending(requestId,{domain:'payment',command,receipt:{id:receiptId,borrowerId:'borrower',image:new Blob([new Uint8Array(png)],{type:'image/png'})}})},{uid,old,asOf,today,cursor,requestId,receiptId,png:[...png]});
}
/** The command service and the dataset service, counting receipt downloads and the confirming cycle's requests. */
async function server(page:Page,sha256:string){
 const counts={downloads:[] as string[],cycle:[] as string[]};
 await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
  if(path.endsWith('/receipts/'+receiptId)&&method==='POST')return route.fulfill({json:{ok:true,status:200,receipt:{receiptId,mimeType:'image/png',sizeBytes:png.length,sha256,generation:'1'}}});
  if(path.endsWith('/receipt')||path.includes('/receipts/')){counts.downloads.push(method+' '+path);return route.fulfill({body:png,contentType:'image/png'})}
  if(path==='/api/payment-commands/'+requestId)return route.fulfill({json:{kind:'unresolved'}});
  if(path==='/api/payment-commands'&&method==='POST')return route.fulfill({json:{kind:'recorded',originalOutcome:{status:'posted'}}});
  if(path==='/api/payment-commands/'+requestId+'/result')return route.fulfill({json:{currentSource:'present',payment:{id:paymentId,borrowerId:'borrower',status:'Posted',amountReceived:'25',postedAmount:'25',paymentDate:today,receiptReference:reference,receiptAt},allocations:[],repayments:[],cashMovements:[]}});
  if(path.endsWith('offline-dataset')){
   const domain=url.searchParams.get('domain')??'notifications',body=request.postDataJSON()??{};if(['records','collection','cash'].includes(domain))counts.cycle.push(domain+(body.need?.length?':need':':check'));
   const row={id:paymentId,borrowerId:'borrower',paymentDate:today,amountReceived:'25',receiptReference:'attached',receiptAt,agentReceiptPresent:false,allocations:[],repayments:[],cashMovements:[]};
   // The server's rows replace every locally applied one (the payment, its history row and its month group).
   const patches=domain==='records'?[{key:'payments',mode:'upsert',order:'id',value:[row]},{key:'paymentHistory',mode:'upsert',order:'id',value:[{borrowerId:'borrower',requestId,id:paymentId,status:'Posted',paymentDate:today,amountReceived:'25',postedAmount:'25',notes:null,receiptReference:'attached',receiptAt,accountLabel:null}]},{key:'paymentMonths',mode:'replace',value:[{borrowerId:'borrower',month:today.slice(0,7),amountReceived:'25',count:1}]}]:domain==='collection'?[{key:'receipts',mode:'replaceWhere',field:'borrowerId',values:['borrower'],value:[{id:paymentId,borrowerId:'borrower',paymentDate:today,amount:'25',manualReceiptPresent:true,agentReceiptPresent:false,receiptAt,chargeIds:[]}],sort:'id'}]:domain==='cash'?[{key:'overview',mode:'replace',value:{balance:'25'}}]:[];
   if(body.since&&domain!=='management')return route.fulfill({json:{...encodeDeltaChunk({domain,generation:'v4:20',startedAt:asOf,asOf,businessDate:today,sourceVersion:next,delta:true,patches,...(domain==='collection'?{scope:{borrowers:['borrower'],loans:[]}}:domain==='cash'?{scope:{ledgerIds:[],from:{}}}:{}),complete:true,nextCursor:null,progress:{completed:1,total:1},changes:{...cursor,seq:'20'}},body.need??[],{dates:true,inline:body.inlineValues===true}),schemaVersion:4}});
   return route.fulfill({json:{schemaVersion:3,domain,asOf,businessDate:today,sourceVersion:old,unchanged:true,patches:[],values:{},complete:true,nextCursor:null,progress:{completed:1,total:1}}});
  }
  return route.fulfill({json:{ok:true,items:[],nextCursor:null}});
 });
 return counts;
}
async function run(page:Page){
 await page.evaluate(async id=>{const w=window as any;await w.__offlineTest.syncSavedRequest(w.__syncAccess,id)},requestId);
 // The confirming cycle (the sync's own-write confirmation then the coordinator's check).
 await page.evaluate(()=>{const w=window as any;w.__stop=w.__datasetTest.startOfflinePreparation(w.__syncAccess)});
 await expect.poll(()=>page.evaluate(async()=>{const w=window as any,records=await w.__syncRepo.readDataset('records');return records?.sourceVersion}),{timeout:15000}).toBe(next);
 await expect.poll(()=>page.evaluate(()=>{const w=window as any,state=w.__datasetTest.getOfflinePreparation(w.__syncRepo.scopeName);return state.state==='ready'&&!state.syncActive}),{timeout:15000}).toBe(true);
 await page.waitForTimeout(500);
 return page.evaluate(async({origin,paymentId})=>{const saved=await (window as any).__syncRepo.readDatasetMedia('blob:'+origin+'/api/payment-records/'+paymentId+'/receipt?source=manual');return saved?{size:saved.data.size,savedAt:saved.savedAt}:null},{origin:'http://127.0.0.1:4173',paymentId});
}
test('a matching own receipt is stored for the payment with no download; the cycle takes 3 requests',async({page})=>{
 const counts=await server(page,createHash('sha256').update(png).digest('hex'));await fixture(page,'seed-match');
 const saved=await run(page);
 expect(saved).toEqual({size:png.length,savedAt:Date.parse(receiptAt)});
 expect(counts.downloads).toEqual([]);
 // Inline values (level 6): one request per domain, no need round trip.
 expect(counts.cycle.sort(),counts.cycle.join(' ')).toEqual(['cash:check','collection:check','records:check']);
});
test('a receipt the server stored differently is downloaded exactly once and stored for the payment',async({page})=>{
 const counts=await server(page,'0'.repeat(64));await fixture(page,'seed-differs');
 const saved=await run(page);
 expect(saved).toEqual({size:png.length,savedAt:Date.parse(receiptAt)});
 expect(counts.downloads).toEqual(['GET /api/payment-commands/'+requestId+'/receipts/'+receiptId]);
 expect(counts.cycle.sort()).toEqual(['cash:check','collection:check','records:check']);
});
