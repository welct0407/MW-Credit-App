import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {canonicalRebateSettlementFields,sortedExpenseIds,rebateSettlementFields,REBATE_SETTLEMENT_MAX_EXPENSES} from '../../services/contracts/rebate-settlement-command.mjs';
import {canonicalOperation,operationIdentity} from '../../services/contracts/operation-command.mjs';
import {compareReferrers,compareReferees,settlementVersionSql,rebateStateSql,rebatePendingSql} from '../../services/business/referrers.mjs';
import {readRebateSettlement,readReferrerRecord,readReferrers} from '../../services/business/referrers.mjs';
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
test('the SQL twins: the version mirror is the migration body; the derived state reads the link through to_jsonb',()=>{
 const migration=readFileSync(new URL('../../database/migrations/V137__referral_rebate_settlement.sql',import.meta.url),'utf8');
 const body=/CREATE FUNCTION public\.pwa_rebate_settlement_version_v1\(p_id text\)[\s\S]*?AS \$\$\n([\s\S]*?);\n\$\$;/.exec(migration)[1];
 assert.equal(settlementVersionSql.replace('$1','p_id').replace(/\s+/g,' ').trim(),body.replace(/\s+/g,' ').trim(),'identical SQL text (the parameter aside)');
 for(const sql of [rebateStateSql('e','o'),rebatePendingSql('e','o')]){assert.match(sql,/to_jsonb\(e\)->>'Ref Rebate Settlement'/);assert.doesNotMatch(sql,/e\."Ref Rebate Settlement"/,'a database before V137 still reads');}
 assert.match(rebatePendingSql('e','o'),/REFERRAL_REBATE_V3/);assert.match(rebateStateSql('e','o'),/'paid-at-close'/);
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
  assert.deepEqual(reached,[['referrers'],['referrerRecord','RS R'],['rebateSettlementRecord','c1111111-1111-4111-8111-111111111111']]);
  assert.equal((await call('/api/referrers','POST')).status,405);assert.equal((await call('/api/rebate-settlements/x','DELETE')).status,405);
  assert.equal((await call('/api/referrers?q=Mai')).status,400);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('PROD defect (R129): the record builders read through the offline bulk client, which takes scalar parameters only',async()=>{
 // Before the fix settlementDates (and the payments and cash reads) passed a text[] and the records walk failed with
 // "Invalid internal bulk read" (503 command_unavailable) once a V3 rebate or a settlement existed.
 const sent=[],fake={query:async(sql,params)=>{sent.push({sql,params});return {rows:[{batchIndex:1,values:[{id:'s1',date:'2026-11-05',accountLabel:'Lisa SCB'}]}],rowCount:1}}};
 const dates=await settlementDates(bulkReadClient(fake),['s1',null,'s1']);
 assert.deepEqual(dates.get('s1'),{date:'2026-11-05',accountLabel:'Lisa SCB'});
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
