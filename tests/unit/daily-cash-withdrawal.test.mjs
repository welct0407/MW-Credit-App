import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalOperation,operationIdentity} from '../../services/contracts/operation-command.mjs';
import {canonicalCashWithdrawal,managementFinancialOperations} from '../../services/contracts/management-financial-command.mjs';
import {readCashWithdrawal,CASH_WITHDRAWAL_HOLDER} from '../../services/business/management-position.mjs';
import {EventEmitter} from 'node:events';
import {createEnvironmentCommandHandler} from '../../services/payment-command/handler.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {businessEnv} from './business-env-fixture.mjs';
import {bangkokClock} from '../../apps/pwa/src/bangkok-clock.ts';

test('R123 the page defaults come from one Bangkok reading: today and the time rounded down to 10 minutes',()=>{
 for(const [at,expected] of [
  ['2026-11-04T16:59:59Z',{date:'2026-11-04',hour:'23',minute:'50'}],
  ['2026-11-04T17:05:00Z',{date:'2026-11-05',hour:'00',minute:'00'}],
  ['2026-11-04T03:19:59Z',{date:'2026-11-04',hour:'10',minute:'10'}],
  ['2026-11-04T03:20:00Z',{date:'2026-11-04',hour:'10',minute:'20'}],
  ['2026-12-31T17:00:00Z',{date:'2027-01-01',hour:'00',minute:'00'}],
 ])assert.deepEqual(bangkokClock(new Date(at)),expected,at);
 const now=bangkokClock();assert.match(now.date,/^\d{4}-\d{2}-\d{2}$/);assert.match(now.hour,/^([01]\d|2[0-3])$/);assert.match(now.minute,/^[0-5]0$/);
});

const base={movementDate:'2026-11-01',movementTime:'10:00',toAccountId:'WD-CASH'};
const request=inputs=>({requestId:'a1111111-1111-4111-8111-111111111111',operation:'cash-withdrawal.create',targetId:'b1111111-1111-4111-8111-111111111111',expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs});

test('R115 cash-withdrawal.create is a create operation whose zero lines are dropped in canonical order',()=>{
 assert.ok(managementFinancialOperations.includes('cash-withdrawal.create'));
 const value=canonicalCashWithdrawal({lines:[{amount:'950',fromAccountId:'WD-SCB'},{fromAccountId:'WD-KBANK',amount:'0'},{fromAccountId:'WD-TTB',amount:'200'}],toAccountId:'WD-CASH',movementTime:'10:00',movementDate:'2026-11-01'});
 assert.deepEqual(value,{...base,lines:[{fromAccountId:'WD-SCB',amount:'950'},{fromAccountId:'WD-TTB',amount:'200'}]});
 assert.deepEqual(Object.keys(value),['movementDate','movementTime','toAccountId','lines']);
 // The canonical JSON is byte-identical to the text Test-DailyCashWithdrawal.sql submits (and V127 rebuilds).
 const identity=operationIdentity(request({...base,lines:[{fromAccountId:'WD-SCB',amount:'950'},{fromAccountId:'WD-KBANK',amount:'0'},{amount:'200',fromAccountId:'WD-TTB'}]}),{issuer:'https://wd.invalid',subject:'wd-owner',partnerId:'WD-ACT',loginEmail:'wd-actor@example.invalid'});
 assert.equal(identity.canonicalJson,'{"contractVersion":2,"requestId":"a1111111-1111-4111-8111-111111111111","actor":{"issuer":"https://wd.invalid","subject":"wd-owner","partnerId":"WD-ACT","loginEmail":"wd-actor@example.invalid"},"command":{"schemaVersion":1,"operation":"cash-withdrawal.create","targetType":"cash-withdrawal","targetId":"b1111111-1111-4111-8111-111111111111","expectedVersion":null,"predecessorRequestId":null,"inputs":{"movementDate":"2026-11-01","movementTime":"10:00","toAccountId":"WD-CASH","lines":[{"fromAccountId":"WD-SCB","amount":"950"},{"fromAccountId":"WD-TTB","amount":"200"}]}},"receipt":null}');
 // A create: null expectedVersion and a UUID target only.
 assert.throws(()=>canonicalOperation({...request({...base,lines:[{fromAccountId:'WD-SCB',amount:'1'}]}),expectedVersion:'a'.repeat(64)}),/invalid_request/);
 assert.throws(()=>canonicalOperation({...request({...base,lines:[{fromAccountId:'WD-SCB',amount:'1'}]}),targetId:'not-a-uuid'}),/invalid_request/);
});

test('R115 cash-withdrawal.create rejects all-zero, duplicate, self, malformed and oversized requests',()=>{
 const line=(fromAccountId,amount)=>({fromAccountId,amount});
 for(const inputs of [
  {...base,lines:[line('WD-SCB','0'),line('WD-TTB','0')]},
  {...base,lines:[]},
  {...base,lines:[line('WD-SCB','1'),line('WD-SCB','2')]},
  {...base,lines:[line('WD-SCB','0'),line('WD-SCB','2')]},
  {...base,lines:[line('WD-CASH','1')]},
  {...base,movementTime:'10:05',lines:[line('WD-SCB','1')]},
  {...base,movementTime:'24:00',lines:[line('WD-SCB','1')]},
  {...base,movementTime:'9:00',lines:[line('WD-SCB','1')]},
  {...base,movementDate:'2026-02-30',lines:[line('WD-SCB','1')]},
  {...base,lines:[line('WD-SCB','1.50')]},
  {...base,lines:[line('WD-SCB','01')]},
  {...base,lines:[line('WD-SCB','-1')]},
  {...base,lines:[line('WD-SCB',1)]},
  {...base,lines:[line('WD-SCB','92233720368547759')]},
  {...base,lines:[{...line('WD-SCB','1'),notes:null}]},
  {...base,lines:Array.from({length:11},(_,n)=>line('WD-'+n,'1'))},
  {...base,notes:null,lines:[line('WD-SCB','1')]},
  {movementDate:base.movementDate,movementTime:base.movementTime,lines:[line('WD-SCB','1')]},
 ])assert.throws(()=>canonicalOperation(request(inputs)),/invalid_request/,JSON.stringify(inputs));
});

function fakeClient(rows){const calls=[];return {calls,query:async(text,values)=>{calls.push({text,values});return {rows}}}}
const row=(id,label,initialized,availableAsOf,maxWithdrawable,extra={})=>({today:'2026-11-02',nowTime:'22:20',covered:true,future:false,id,label,initialized,availableAsOf,maxWithdrawable,...extra});

test('R115 as-of read: Dad only, ties included at the chosen time, later balances cap the maximum, coverage and future flags',async()=>{
 const rows=[row('WD-CASH','Dad Cash',true,'1200.00','1200.00'),row('WD-SCB','Dad SCB',true,'950.00','650.00'),row('CI-DAD','Dad new',false,null,null)];
 const client=fakeClient(rows),value=await readCashWithdrawal(client,{date:'2026-11-01',time:'10:00'});
 assert.equal(CASH_WITHDRAWAL_HOLDER,'ch:dad');
 assert.deepEqual(client.calls[0].values,['ch:dad','2026-11-01','10:00']);
 const sql=client.calls[0].text;
 // As of: the opening balance of the day plus that day's entries up to and including the chosen time (ties included).
 assert.match(sql,/"Cash Account Daily Summary Recent"/);assert.match(sql,/s\."Sort Timestamp"<=\$2::date\+\$3::time/);assert.match(sql,/s\."Statement Date"=\$2::date AND s\."Sort Timestamp"<=/);
 // Maximum: never above the lowest running balance of any later entry (after the time that day, or a later day).
 assert.match(sql,/min\(s\."Balance After"\)/);assert.match(sql,/s\."Statement Date">\$2::date OR \(s\."Statement Date"=\$2::date AND s\."Sort Timestamp">\$2::date\+\$3::time\)/);assert.match(sql,/least\(as_of,later_min\)/);
 assert.match(sql,/h\."Row ID"=\$1 AND a\."Active" AND h\."Active"/);
 assert.deepEqual(value,{date:'2026-11-01',time:'10:00',holderId:'ch:dad',today:'2026-11-02',nowTime:'22:20',covered:true,future:false,accounts:[{id:'WD-CASH',label:'Dad Cash',initialized:true,availableAsOf:'1200.00',maxWithdrawable:'1200.00'},{id:'WD-SCB',label:'Dad SCB',initialized:true,availableAsOf:'950.00',maxWithdrawable:'650.00'},{id:'CI-DAD',label:'Dad new',initialized:false,availableAsOf:null,maxWithdrawable:null}]});
 const outside=await readCashWithdrawal(fakeClient(rows.map(r=>({...r,covered:false,availableAsOf:'5',maxWithdrawable:'5'}))),{date:'2026-10-01',time:'10:00'});
 assert.equal(outside.covered,false);assert.ok(outside.accounts.every(a=>a.availableAsOf===null&&a.maxWithdrawable===null));
 const none=await readCashWithdrawal(fakeClient([row(null,null,false,null,null,{future:true})]),{date:'2026-11-02',time:'23:50'});
 assert.equal(none.future,true);assert.deepEqual(none.accounts,[]);
 for(const options of [{date:'2026-11-01',time:'10:05'},{date:'2026-11-01',time:'24:00'},{date:'2026-13-01',time:'10:00'},{date:'2026-11-01'},{}])
  await assert.rejects(readCashWithdrawal(fakeClient(rows),options),/invalid_request/);
});

const call=(handler,url)=>{const res=new EventEmitter(),out={};res.setHeader=()=>{};res.once=res.once.bind(res);res.end=b=>{out.status=res.statusCode;out.body=b?JSON.parse(b):undefined;res.emit('finish')};const req=new EventEmitter();Object.assign(req,{method:'GET',url,headers:{authorization:'Bearer synthetic'}});return handler(req,res).then(()=>out);};
test('R115 GET /api/management/cash-withdrawal: exactly a valid date and a 10-minute time reach the store, anything else is a 400 first',async()=>{
 const seen=[];const handler=createEnvironmentCommandHandler({config:loadBusinessConfig(businessEnv('dev','command')),verifyPrincipal:async()=>({ok:true,subject:'s',email:'e@example.invalid'}),store:{management:async(_principal,kind,options)=>{seen.push([kind,options]);return {ok:true,value:{}}}}});
 for(const query of ['','?date=2026-11-01','?time=10:00','?date=2026-11-01&time=10:00&x=1','?date=2026-11-01&date=2026-11-01&time=10:00','?date=2026-11-01&time=10:00&time=10:10',
  '?date=2026-02-30&time=10:00','?date=26-11-01&time=10:00','?date=2026-11-01&time=10:05','?date=2026-11-01&time=24:00','?date=2026-11-01&time=9:00','?date=2026-11-01&time=10%3A00%3A00'])
  assert.equal((await call(handler,'/api/management/cash-withdrawal'+query)).status,400,query);
 assert.deepEqual(seen,[]);
 {const ok=await call(handler,'/api/management/cash-withdrawal?date=2026-11-01&time=10:00');assert.equal(ok.status??200,200);assert.equal(ok.body.ok,true);}
 assert.deepEqual(seen,[['cash-withdrawal',{date:'2026-11-01',time:'10:00'}]]);
});
test('R115 the as-of read is refused for a principal that is not the owner, before any database work',async()=>{
 let connects=0;const pool={connect:async()=>{connects++;throw Error('no database in this test')}};
 const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed:principal=>principal?.email==='owner@example.invalid',resolveActor:async()=>null,actorIssuer:'https://securetoken.google.com/synthetic'});
 const denied=await store.management({ok:true,subject:'x',email:'partner@example.invalid'},'cash-withdrawal',{date:'2026-11-01',time:'10:00'});
 assert.equal(denied.ok,false);assert.equal(denied.status,403);assert.equal(denied.code,'access_denied');
 assert.equal(connects,0);
});
