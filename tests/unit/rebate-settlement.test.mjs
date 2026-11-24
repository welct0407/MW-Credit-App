import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {canonicalRebateSettlementFields,sortedExpenseIds,rebateSettlementFields,rebateSettlementAllocationFields,REBATE_SETTLEMENT_MAX_EXPENSES} from '../../services/contracts/rebate-settlement-command.mjs';
import {canonicalOperation,operationIdentity} from '../../services/contracts/operation-command.mjs';
import {compareReferrers,compareReferees,settlementVersionSql,rebateStateSql,rebatePendingSql,rebateSettledSql} from '../../services/business/referrers.mjs';
import {readRebateOffsetPreview,readRebateSettlement,readReferrerRecord,readReferrers} from '../../services/business/referrers.mjs';
import {createPaymentCommandHandler,isReadRoute} from '../../services/payment-command/handler.mjs';
import {readFileSync} from 'node:fs';
import {bulkReadClient} from '../../services/business/offline-dataset.mjs';
import {settlementDates} from '../../services/business/referrers.mjs';
import {logUnavailable} from '../../services/lib/log.mjs';
// R129 (V137): the rebate settlement contract (the canonical text pwa_submit_operation_v2 checks byte for byte), the
// derived-state SQL shared by the reads, the Referrers sort and the three read routes.
const actor={issuer:'https://securetoken.google.com/x',subject:'s',partnerId:'P-1',loginEmail:'owner@example.invalid'};
const inputs=(over={})=>({referrerId:'RS-R',expenseIds:['rr1:L-1','rr1:L-2'],settlementDate:'2026-11-05',cashAccountId:'ca:lisa-scb',paymentMethod:'Bank Transfer',bankReference:'REF-1234',notes:null,...over});
const create=(over={},command={})=>({requestId:'b1111111-1111-4111-8111-111111111111',operation:'rebate-settlement.create',targetId:'c1111111-1111-4111-8111-111111111111',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:inputs(over),...command});

test('rebate-settlement.create: the canonical inputs in the fixed key order, whatever order the client sends',()=>{
 const shuffled=Object.fromEntries(Object.entries(inputs()).reverse());
 assert.deepEqual(Object.keys(canonicalRebateSettlementFields('rebate-settlement.create',shuffled)),rebateSettlementFields);
 const {canonicalJson}=operationIdentity(create(),actor);
 assert.equal(canonicalJson,'{"contractVersion":2,"requestId":"b1111111-1111-4111-8111-111111111111","actor":{"issuer":"https://securetoken.google.com/x","subject":"s","partnerId":"P-1","loginEmail":"owner@example.invalid"},'
  +'"command":{"schemaVersion":1,"operation":"rebate-settlement.create","targetType":"rebate-settlement","targetId":"c1111111-1111-4111-8111-111111111111","expectedVersion":null,"predecessorRequestId":null,'
  +'"inputs":{"referrerId":"RS-R","expenseIds":["rr1:L-1","rr1:L-2"],"settlementDate":"2026-11-05","cashAccountId":"ca:lisa-scb","paymentMethod":"Bank Transfer","bankReference":"REF-1234","notes":null}},"receipt":null}');
 // Cash, no reference, notes: accepted.
 assert.equal(canonicalOperation(create({paymentMethod:'Cash',bankReference:null,notes:'paid in person'})).inputs.notes,'paid in person');
 assert.equal(canonicalOperation(create({expenseIds:Array.from({length:REBATE_SETTLEMENT_MAX_EXPENSES},(_,k)=>'rr1:L-'+String(k).padStart(3,'0'))})).inputs.expenseIds.length,200);
});
test('rebate-settlement.create: the refusals mirror the SQL rules',()=>{
 const refused=[
  {expenseIds:[]},{expenseIds:['rr1:L-2','rr1:L-1']},{expenseIds:['rr1:L-1','rr1:L-1']},{expenseIds:Array.from({length:201},(_,k)=>'rr1:L-'+String(k).padStart(3,'0'))},
  {expenseIds:['rr1:\nL']},{expenseIds:'rr1:L-1'},{expenseIds:[1]},{referrerId:''},{referrerId:null},{cashAccountId:null},
  {settlementDate:'2026-02-30'},{settlementDate:'05/11/2026'},{paymentMethod:'Net-off at Disbursement'},{paymentMethod:'Referral Rebate Offset'},
  {paymentMethod:'Cash',bankReference:'REF'},{bankReference:' '},{bankReference:'A\nB'},{bankReference:'A\rB'},{bankReference:'x'.repeat(257)},{bankReference:'\0'},
  {notes:'a\0b'},{notes:'x'.repeat(65537)},{notes:42}];
 for(const over of refused)assert.throws(()=>canonicalOperation(create(over)),/invalid_request/,JSON.stringify(over).slice(0,80));
 // An extra or missing key, a version on create, a non-UUID target.
 assert.throws(()=>canonicalOperation(create({extra:1})),/invalid_request/);
 const {notes,...missing}=inputs();assert.throws(()=>canonicalOperation({...create(),inputs:missing}),/invalid_request/);
 assert.throws(()=>canonicalOperation(create({},{expectedVersion:'a'.repeat(64)})),/invalid_request/);
 assert.throws(()=>canonicalOperation(create({},{targetId:'RS-1'})),/invalid_request/);
 assert.throws(()=>canonicalOperation(create({},{predecessorRequestId:'b1111111-1111-4111-8111-111111111112'})),/invalid_request/);
 assert.throws(()=>canonicalOperation(create({},{receiptId:'b1111111-1111-4111-8111-111111111112'})),/invalid_request/);
});
test('rebate-settlement.delete: the version, no inputs; byte order of the id list is the SQL COLLATE "C" order',()=>{
 const del={requestId:'b1111111-1111-4111-8111-111111111111',operation:'rebate-settlement.delete',targetId:'c1111111-1111-4111-8111-111111111111',expectedVersion:'a'.repeat(64),predecessorRequestId:null,receiptId:null,inputs:{}};
 assert.deepEqual(canonicalOperation(del).inputs,{});
 assert.match(operationIdentity(del,actor).canonicalJson,/"targetType":"rebate-settlement".*"expectedVersion":"a{64}".*"inputs":\{\}/);
 assert.throws(()=>canonicalOperation({...del,inputs:{x:1}}),/invalid_request/);
 assert.throws(()=>canonicalOperation({...del,expectedVersion:null}),/invalid_request/);
 assert.deepEqual(sortedExpenseIds(['rr1:b','rr1:B','rr1:a','rr1:b','rr1:é','rr1:z']),['rr1:B','rr1:a','rr1:b','rr1:z','rr1:é']);
});
test('the SQL twins: the version mirror is the migration body; pending is the SQL rule and the state adds part-paid (R184)',()=>{
 const migration=readFileSync(new URL('../../database/migrations/V137__referral_rebate_settlement.sql',import.meta.url),'utf8');
 const body=/CREATE FUNCTION public\.pwa_rebate_settlement_version_v1\(p_id text\)[\s\S]*?AS \$\$\n([\s\S]*?);\n\$\$;/.exec(migration)[1];
 assert.equal(settlementVersionSql.replace('$1','p_id').replace(/\s+/g,' ').trim(),body.replace(/\s+/g,' ').trim(),'identical SQL text (the parameter aside)');
 // R184 (D2, D12): one pending rule, the SQL function, wherever a read needs it; no Node copy of the arithmetic.
 assert.equal(rebatePendingSql('e'),'public.pwa_rebate_pending_v1(e."Row ID")');
 const state=rebateStateSql('e','o').replace(/\s+/g,' ');
 assert.match(state,/to_jsonb\(e\)->>'Ref Rebate Settlement' IS NOT NULL THEN CASE WHEN public\.pwa_rebate_pending_v1\(e\."Row ID"\)>0 THEN 'part-paid' ELSE 'paid' END/);
 assert.match(state,/THEN 'offset' /);assert.match(state,/THEN 'pending' ELSE 'paid-at-close' END$/);
 // settled = Amount - close-time offset - pending (the allocations' sum, without reading them); null for a manual expense.
 const settled=rebateSettledSql('e','o').replace(/\s+/g,' ');
 assert.match(settled,/^CASE WHEN e\."Source Type" IS DISTINCT FROM 'Referral Rebate' THEN NULL WHEN e\."Rule Version"='REFERRAL_REBATE_V3' THEN greatest\(e\."Amount"::numeric-coalesce\(o\."Amount Received"::numeric,0\)-public\.pwa_rebate_pending_v1\(e\."Row ID"\),0\) ELSE 0 END$/);
 // With rules false (rebateRules: a database before V137) the expressions name no object of V137 or later.
 for(const sql of [rebatePendingSql('e',false),rebateStateSql('e','o',false),rebateSettledSql('e','o',false)]){assert.doesNotMatch(sql,/pwa_rebate|Ref Rebate Settlement|REFERRAL_REBATE_V3/);assert.match(sql,/'Referral Rebate'/);}
 assert.match(rebateStateSql('e','o',false),/THEN 'offset' ELSE 'paid-at-close' END$/);assert.equal(rebatePendingSql('e',false),`CASE WHEN e."Source Type"='Referral Rebate' THEN 0::numeric END`);
 for(const file of ['management-position','borrowers','expenses','payments'])assert.match(readFileSync(new URL('../../services/business/'+file+'.mjs',import.meta.url),'utf8'),/pwa_rebate_pending_v1|rebatePendingSql/,file+' reads the one pending rule');
});
test('Referrers sort: unpaid descending, then accruing descending, then the Thai name',()=>{
 const rows=[{id:'4',name:'ข',unpaidAmount:'0.00',accruingAmount:'10.00'},{id:'1',name:'ก',unpaidAmount:'900.00',accruingAmount:'0.00'},{id:'3',name:'ก',unpaidAmount:'0.00',accruingAmount:'10.00'},{id:'2',name:'ค',unpaidAmount:'900.00',accruingAmount:'420.00'},{id:'5',name:'ก',unpaidAmount:'0.00',accruingAmount:'0.00'}];
 assert.deepEqual(rows.sort(compareReferrers).map(r=>r.id),['2','1','3','4','5']);
});
test('Referred borrowers sort: unpaid descending, then accruing descending, then the Thai name, then the id',()=>{
 const rows=[{borrowerId:'B4',name:'ลี',unpaidAmount:'0.00',accruingAmount:'0.00'},{borrowerId:'B1',name:'นก',unpaidAmount:'300.00',accruingAmount:'0.00'},{borrowerId:'B3',name:'ต้น',unpaidAmount:'0.00',accruingAmount:'0.00'},
  {borrowerId:'B2',name:'ฝน',unpaidAmount:'0.00',accruingAmount:'450.00'},{borrowerId:'B0',name:'แก้ว',unpaidAmount:'100.00',accruingAmount:'0.00'},{borrowerId:'B5',name:'ต้น',unpaidAmount:'0.00',accruingAmount:'0.00'}];
 assert.deepEqual(rows.sort(compareReferees).map(r=>r.borrowerId),['B1','B0','B2','B3','B5','B4']);
});
test('reads refuse an invalid id and answer nothing before V137 (no settlement table)',async()=>{
 const before={query:async sql=>({rows:sql.includes('to_regclass')?[{present:false}]:[{day:'2026-11-05'}]})};
 assert.deepEqual(await readReferrers(before),{items:[],businessDate:'2026-11-05'});
 assert.equal(await readReferrerRecord(before,'RS-R'),null);assert.equal(await readRebateSettlement(before,'c1'),null);
 await assert.rejects(readReferrerRecord(before,'a\nb'),/invalid_request/);await assert.rejects(readRebateSettlement(before,''),/invalid_request/);
});
test('routes: GET /api/referrers, /api/referrers/:id and /api/rebate-settlements/:id are reads; other methods and queries are refused',async()=>{
 for(const operation of ['referrer_list','referrer_record','rebate_settlement_record']){assert.equal(isReadRoute({operation},'GET'),true,operation);assert.equal(isReadRoute({operation},'POST'),false,operation);}
 const reached=[];const ok=name=>async(_principal,...args)=>{reached.push([name,...args]);return {ok:true,status:200,value:{}};};
 const store={referrers:ok('referrers'),referrerRecord:ok('referrerRecord'),rebateSettlementRecord:ok('rebateSettlementRecord')};
 const handler=createPaymentCommandHandler({origins:['http://127.0.0.1:9'],verifyPrincipal:async()=>({ok:true,email:'owner@example.invalid',subject:'s'}),store});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const call=(path,method='GET')=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{authorization:'Bearer x'}});
 try{
  assert.equal((await call('/api/referrers')).status,200);
  assert.equal((await call('/api/referrers/RS%20R')).status,200);
  assert.equal((await call('/api/rebate-settlements/c1111111-1111-4111-8111-111111111111')).status,200);
  assert.deepEqual(reached,[['referrers',{owed:null}],['referrerRecord','RS R'],['rebateSettlementRecord','c1111111-1111-4111-8111-111111111111']]);
  assert.equal((await call('/api/referrers','POST')).status,405);assert.equal((await call('/api/rebate-settlements/x','DELETE')).status,405);
  assert.equal((await call('/api/referrers?q=Mai')).status,400);
  // R141: owed=1 is passed to the read (which refuses another value); a repeated or other parameter is 400 here.
  assert.equal((await call('/api/referrers?owed=1')).status,200);assert.deepEqual(reached.at(-1),['referrers',{owed:'1'}]);
  for(const path of ['/api/referrers?owed=1&owed=1','/api/referrers?owed=1&q=x'])assert.equal((await call(path)).status,400,path);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('PROD defect (R129): the record builders read through the offline bulk client, which takes scalar parameters only',async()=>{
 // Before the fix settlementDates (and the payments and cash reads) passed a text[] and the records walk failed with
 // "Invalid internal bulk read" (503 command_unavailable) once a V3 rebate or a settlement existed.
 const sent=[],fake={query:async(sql,params)=>{sent.push({sql,params});return {rows:[{batchIndex:1,values:[{id:'s1',date:'2026-11-05',accountLabel:'Lisa SCB',destination:'offset'},{id:'s0',date:'2026-11-04',accountLabel:'Lisa SCB'}]}],rowCount:1}}};
 const dates=await settlementDates(bulkReadClient(fake),['s1',null,'s1']);
 // R184: the destination travels with the date; a row without it (a database before V155) reads as paid to the referrer.
 assert.deepEqual(dates.get('s1'),{date:'2026-11-05',accountLabel:'Lisa SCB',destination:'offset'});assert.equal(dates.get('s0').destination,'referrer');
 assert.equal(sent.length,1);assert.match(sent[0].sql,/jsonb_array_elements_text\(\(batch\.args->>0\)::jsonb\)/);assert.deepEqual(JSON.parse(sent[0].params[0]),[['["s1"]']]);
 for(const file of ['payments','cash','expenses','borrowers','referrers'])
  assert.doesNotMatch(readFileSync(new URL('../../services/business/'+file+'.mjs',import.meta.url),'utf8'),/\$\d+::text\[\]/,file+' passes no array parameter');
});
test('a 503 names its cause in the log: error class, SQLSTATE, the first message line only; a cancelled offline read is quiet',()=>{
 const lines=[],write=line=>lines.push(JSON.parse(line));
 logUnavailable('command_store_unavailable',Object.assign(Error('Invalid internal bulk read\nsecond line'),{code:'P0001'}),{readonly:true},write);
 logUnavailable('command_store_unavailable',Error('offline_read_cancelled'),{},write);
 assert.deepEqual(lines,[{readonly:true,error:'Error',sqlState:'P0001',message:'Invalid internal bulk read',severity:'ERROR',event:'command_store_unavailable'}]);
});
test('R141 owed=1 lists referrers still owed rebates (pwa_rebates_owed_v1 > 0) with the owed total of every rebate payee',async()=>{
 const seen=[];const client={query:async sql=>{seen.push(sql);if(sql.includes('to_regclass'))return {rows:[{present:true}]};if(/AS day/.test(sql)||/BUSINESS|day/.test(sql)&&!/WITH referrers/.test(sql)&&!/count\(\*\)::int AS count/.test(sql))return {rows:[{day:'2026-11-05'}]};
  if(/count\(\*\)::int AS count/.test(sql))return {rows:[{count:2,amount:'400.00'}]};return {rows:[]}}};
 const owed=await readReferrers(client,{owed:'1'});
 const list=seen.find(sql=>sql.includes('WITH referrers'));assert.match(list,/ WHERE public\.pwa_rebates_owed_v1\(r\.id\)>0 ORDER BY r\.id COLLATE "C" LIMIT 201$/);
 const total=seen.find(sql=>/count\(\*\)::int AS count/.test(sql));
 assert.match(total,/public\.pwa_rebates_owed_v1\(p\.payee\) AS owed FROM \(SELECT DISTINCT x\."Ref Payee Borrower" AS payee FROM public\."Business Expenses" x WHERE x\."Source Type"='Referral Rebate'/);assert.match(total,/WHERE owed>0$/);
 assert.deepEqual(owed.filter,{owed:true,total:{count:2,amount:'400.00'}});
 seen.length=0;const all=await readReferrers(client);assert.equal(all.filter,undefined);assert.ok(!seen.some(sql=>/pwa_rebates_owed_v1\(r\.id\)>0/.test(sql)||/count\(\*\)::int AS count/.test(sql)));
 for(const bad of ['0','true','',' 1'])await assert.rejects(readReferrers(client,{owed:bad}),/invalid_request/,bad);
});
// R184 (V155): the nine-key create shape (per-rebate lines, the destination, the offset's plan hash) beside the seven-key
// shape, the offset preview route and read, and the tiles' rule.
const allocationInputs=(over={})=>({referrerId:'RS-R',destination:'referrer',allocations:[{expenseId:'rr1:L-1',amount:'300',expectedPending:'300'},{expenseId:'rr1:L-2',amount:'100',expectedPending:'300'}],
 settlementDate:'2026-11-24',cashAccountId:'ca:lisa-scb',paymentMethod:'Bank Transfer',bankReference:'REF-1234',notes:null,expectedPlanHash:null,...over});
const offsetInputs=(over={})=>allocationInputs({destination:'offset',cashAccountId:null,paymentMethod:null,bankReference:null,expectedPlanHash:'ab'.repeat(32),...over});
const createLines=(inputs,command={})=>({requestId:'b1111111-1111-4111-8111-111111111111',operation:'rebate-settlement.create',targetId:'c1111111-1111-4111-8111-111111111111',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs,...command});
test('R184 rebate-settlement.create with lines: the canonical inputs in the fixed key order, for both destinations; the SQL twin builds the same order',()=>{
 const shuffled=Object.fromEntries(Object.entries(allocationInputs()).reverse());shuffled.allocations=shuffled.allocations.map(line=>Object.fromEntries(Object.entries(line).reverse()));
 assert.deepEqual(Object.keys(canonicalRebateSettlementFields('rebate-settlement.create',shuffled)),rebateSettlementAllocationFields);
 const head='{"contractVersion":2,"requestId":"b1111111-1111-4111-8111-111111111111","actor":{"issuer":"https://securetoken.google.com/x","subject":"s","partnerId":"P-1","loginEmail":"owner@example.invalid"},'
  +'"command":{"schemaVersion":1,"operation":"rebate-settlement.create","targetType":"rebate-settlement","targetId":"c1111111-1111-4111-8111-111111111111","expectedVersion":null,"predecessorRequestId":null,';
 assert.equal(operationIdentity(createLines(shuffled),actor).canonicalJson,head+'"inputs":{"referrerId":"RS-R","destination":"referrer","allocations":[{"expenseId":"rr1:L-1","amount":"300","expectedPending":"300"},{"expenseId":"rr1:L-2","amount":"100","expectedPending":"300"}],'
  +'"settlementDate":"2026-11-24","cashAccountId":"ca:lisa-scb","paymentMethod":"Bank Transfer","bankReference":"REF-1234","notes":null,"expectedPlanHash":null}},"receipt":null}');
 assert.equal(operationIdentity(createLines(offsetInputs({allocations:[{expenseId:'rr1:L-1',amount:'250',expectedPending:'300'}],notes:'offset'})),actor).canonicalJson,head+'"inputs":{"referrerId":"RS-R","destination":"offset","allocations":[{"expenseId":"rr1:L-1","amount":"250","expectedPending":"300"}],'
  +'"settlementDate":"2026-11-24","cashAccountId":null,"paymentMethod":null,"bankReference":null,"notes":"offset","expectedPlanHash":"'+'ab'.repeat(32)+'"}},"receipt":null}');
 // The SQL twin (V155, the rebate-settlement.create branch of pwa_submit_operation_v2) writes its canonical text in the same
 // key order; the integration test proves the two texts byte for byte against a database.
 const migration=readFileSync(new URL('../../database/migrations/V155__partial_rebate_settlement.sql',import.meta.url),'utf8');
 const block=/ IF i \? 'allocations' THEN[\s\S]*?\n ELSE\n/.exec(migration)[0],text=block.slice(block.indexOf("input_text:="));
 assert.deepEqual([...text.matchAll(/"(\w+)":/g)].map(m=>m[1]),['referrerId','destination','allocations','expenseId','amount','expectedPending','settlementDate','cashAccountId','paymentMethod','bankReference','notes','expectedPlanHash']);
 assert.match(block,/ARRAY\['allocations','bankReference','cashAccountId','destination','expectedPlanHash','notes','paymentMethod','referrerId','settlementDate'\]/);
 assert.match(block,/ARRAY\['amount','expectedPending','expenseId'\]/);assert.match(block,/'\^\[1-9\]\[0-9\]\{0,11\}\$'/);assert.match(block,/'\^\[a-f0-9\]\{64\}\$'/);
 // The seven-key shape of V137 stays canonical (an un-updated phone): unchanged text.
 assert.match(operationIdentity(create(),actor).canonicalJson,/"inputs":\{"referrerId":"RS-R","expenseIds":\["rr1:L-1","rr1:L-2"\],"settlementDate":"2026-11-05","cashAccountId":"ca:lisa-scb","paymentMethod":"Bank Transfer","bankReference":"REF-1234","notes":null\}/);
 assert.equal(canonicalOperation(createLines(allocationInputs({allocations:Array.from({length:REBATE_SETTLEMENT_MAX_EXPENSES},(_,k)=>({expenseId:'rr1:L-'+String(k).padStart(3,'0'),amount:'1',expectedPending:'1'}))}))).inputs.allocations.length,200);
});
test('R184 rebate-settlement.create with lines: the refusals mirror the SQL rules',()=>{
 const line=(over={})=>({expenseId:'rr1:L-1',amount:'100',expectedPending:'300',...over});
 const refused=[
  allocationInputs({allocations:[]}),allocationInputs({allocations:[line({expenseId:'rr1:L-2'}),line()]}),allocationInputs({allocations:[line(),line()]}),
  allocationInputs({allocations:Array.from({length:201},(_,k)=>line({expenseId:'rr1:L-'+String(k).padStart(3,'0')}))}),
  ...[{amount:'0'},{amount:'1.5'},{amount:100},{amount:'01'},{amount:'-1'},{amount:'1'.repeat(13)},{expectedPending:'0'},{expectedPending:null},{expenseId:''},{expenseId:'a\nb'},{note:'x'}].map(over=>allocationInputs({allocations:[line(over)]})),
  allocationInputs({allocations:[{expenseId:'rr1:L-1',amount:'100'}]}),allocationInputs({allocations:['rr1:L-1']}),allocationInputs({allocations:'rr1:L-1'}),
  allocationInputs({destination:'loan'}),allocationInputs({destination:null}),allocationInputs({referrerId:''}),allocationInputs({settlementDate:'2026-02-30'}),allocationInputs({notes:'a\0b'}),
  // paid to the referrer: Lisa's account and a method are required, a reference only with Bank Transfer, no plan hash
  allocationInputs({cashAccountId:null}),allocationInputs({paymentMethod:null}),allocationInputs({paymentMethod:'Referral Rebate Offset'}),allocationInputs({paymentMethod:'Cash'}),allocationInputs({bankReference:' '}),allocationInputs({expectedPlanHash:'ab'.repeat(32)}),
  // offset: no account, method or reference, and the plan hash is required
  offsetInputs({cashAccountId:'ca:lisa-scb'}),offsetInputs({paymentMethod:'Cash'}),offsetInputs({bankReference:'REF'}),offsetInputs({expectedPlanHash:null}),offsetInputs({expectedPlanHash:'abc'}),offsetInputs({expectedPlanHash:'AB'.repeat(32)})];
 for(const inputs of refused)assert.throws(()=>canonicalOperation(createLines(inputs)),/invalid_request/,JSON.stringify(inputs).slice(0,140));
 // A key of the other shape, a missing key, an extra key.
 assert.throws(()=>canonicalOperation(createLines({...allocationInputs(),expenseIds:['rr1:L-1']})),/invalid_request/);
 const {expectedPlanHash,...missing}=allocationInputs();assert.throws(()=>canonicalOperation(createLines(missing)),/invalid_request/);
 assert.throws(()=>canonicalOperation(createLines({...inputs(),destination:'referrer'})),/invalid_request/,'the seven-key shape takes no destination');
 // Accepted: Cash without a reference; an offset.
 assert.equal(canonicalOperation(createLines(allocationInputs({paymentMethod:'Cash',bankReference:null}))).inputs.paymentMethod,'Cash');
 assert.equal(canonicalOperation(createLines(offsetInputs())).inputs.destination,'offset');
});
test('R184 routes: GET /api/referrers/:id/offset-preview is a read with the amount passed through; other methods are refused',async()=>{
 assert.equal(isReadRoute({operation:'referrer_offset_preview'},'GET'),true);assert.equal(isReadRoute({operation:'referrer_offset_preview'},'POST'),false);
 const reached=[];const ok=name=>async(_principal,...args)=>{reached.push([name,...args]);return {ok:true,status:200,value:{}};};
 const handler=createPaymentCommandHandler({origins:['http://127.0.0.1:9'],verifyPrincipal:async()=>({ok:true,email:'owner@example.invalid',subject:'s'}),store:{referrerRecord:ok('referrerRecord'),referrerOffsetPreview:ok('referrerOffsetPreview')}});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const call=(path,method='GET')=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{authorization:'Bearer x'}});
 try{
  assert.equal((await call('/api/referrers/RS%20R/offset-preview?amount=250')).status,200);assert.equal((await call('/api/referrers/RS-R/offset-preview')).status,200);
  assert.equal((await call('/api/referrers/RS-R')).status,200);
  assert.deepEqual(reached,[['referrerOffsetPreview','RS R','250'],['referrerOffsetPreview','RS-R',null],['referrerRecord','RS-R']]);
  assert.equal((await call('/api/referrers/RS-R/offset-preview?amount=250','POST')).status,405);
  for(const path of ['/api/referrers/RS-R/offset-preview?amount=250&amount=1','/api/referrers/RS-R/offset-preview?amount=250&q=x'])assert.equal((await call(path)).status,400,path);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('R184 offset preview read: the amount is a whole-baht string; nothing before V155; the plan function is called with the business date',async()=>{
 const sent=[];const plan={available:true,dueAmount:'14',maxAmount:'479',amount:'250',covered:'250',planHash:'cd'.repeat(32),paidThrough:{'L-R':'2027-01-10'},
  lines:[{chargeId:'C-1',loanId:'L-R',chargeDate:'2026-11-24',principal:'0',interest:'14',lateCharge:'0',amount:'14',remaining:'14',due:true,booked:false},{chargeId:'cg8:3:L-R:2026-11-25',loanId:'L-R',chargeDate:'2026-11-25',principal:'0',interest:'5',lateCharge:'0',amount:'5',remaining:'5',due:false,booked:true}]};
 const client={query:async(sql,params)=>{sent.push({sql,params});if(sql.includes('to_regclass'))return {rows:[{present:true}]};if(sql.includes('pwa_rebate_offset_plan_v1'))return {rows:[{value:plan}]};
  if(sql.startsWith('SELECT 1 FROM public."Borrowers"'))return {rows:[{}]};if(sql.includes('FROM public."Loans" l JOIN public."Borrowers" b'))return {rows:[{id:'L-R',loanPrincipal:'1000',loanDate:'2026-11-21',loanRate:'3',borrowerName:'มาย',borrowerDescription:'Mai'}]};return {rows:[{day:'2026-11-24'}]}}};
 const preview=await readRebateOffsetPreview(client,'RS-R','250');
 assert.deepEqual(sent.find(q=>q.sql.includes('pwa_rebate_offset_plan_v1')).params,['RS-R','250','2026-11-24']);
 assert.deepEqual({...preview,lines:preview.lines.length,loans:Object.keys(preview.loans)},{available:true,dueAmount:'14',maxAmount:'479',amount:'250',covered:'250',planHash:'cd'.repeat(32),lines:2,loans:['L-R'],paidThrough:{'L-R':'2027-01-10'},businessDate:'2026-11-24'});
 assert.deepEqual(preview.lines[1],{chargeId:'cg8:3:L-R:2026-11-25',loanId:'L-R',chargeDate:'2026-11-25',amount:'5',remaining:'5',due:false,booked:true});
 for(const bad of [null,'','0','1.5','01','-1','1'.repeat(13),250])await assert.rejects(readRebateOffsetPreview(client,'RS-R',bad),/invalid_request/,String(bad));
 await assert.rejects(readRebateOffsetPreview(client,'a\nb','250'),/invalid_request/);
 const before={query:async sql=>({rows:sql.includes('to_regclass')?[{present:false}]:[{day:'2026-11-24'}]})};
 assert.equal(await readRebateOffsetPreview(before,'RS-R','250'),null);
});
test('R184 (D11) tiles: paid is the settlements paid to the referrer plus legacy paid-at-close; offset is the close-time offsets plus the offset settlements',async()=>{
 const seen=[];const client={query:async sql=>{seen.push(sql);if(sql.includes('to_regclass'))return {rows:[{present:true}]};if(sql.includes('WITH referrers'))return {rows:[]};return {rows:[{day:'2026-11-24'}]}}};
 await readReferrers(client);
 const list=seen.find(sql=>sql.includes('WITH referrers')).replace(/\s+/g,' ');
 assert.match(list,/FROM public\.pwa_rebate_settlements s WHERE s\.payee_borrower_id=r\.id AND s\.offset_payment_id IS NULL\),0\) \+coalesce\(\(SELECT sum\(greatest\(x\.amount-x\.offset_amount,0\)\) FROM rebates x WHERE x\.payee=r\.id AND x\.rule IS DISTINCT FROM 'REFERRAL_REBATE_V3'\),0\)\)::numeric\(20,2\)::text AS "paidToDate"/);
 assert.match(list,/sum\(least\(x\.offset_amount,x\.amount\)\) FROM rebates x WHERE x\.payee=r\.id\),0\) \+coalesce\(\(SELECT sum\(s\.amount\) FROM public\.pwa_rebate_settlements s WHERE s\.payee_borrower_id=r\.id AND s\.offset_payment_id IS NOT NULL\),0\)\)::numeric\(20,2\)::text AS "offsetToDate"/);
 assert.match(list,/public\.pwa_rebates_owed_v1\(r\.id\)\)::numeric\(20,2\)::text AS "unpaidAmount"/);
});
test('R184 rebateRules: only an absent function reads as the legacy rules; any other error surfaces',async()=>{
 const {rebateRules}=await import('../../services/business/rebate-state.mjs');
 assert.equal(await rebateRules({query:async()=>({rows:[{present:true}]})}),true);assert.equal(await rebateRules({query:async()=>({rows:[{present:false}]})}),false);
 assert.equal(await rebateRules({query:async()=>{throw Object.assign(Error('function does not exist'),{code:'42883'})}}),false);
 await assert.rejects(rebateRules({query:async()=>{throw Object.assign(Error('connection lost'),{code:'08006'})}}),/connection lost/);
 await assert.rejects(rebateRules({query:async()=>{throw Error('boom')}}),/boom/);
});
