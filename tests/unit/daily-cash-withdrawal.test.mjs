import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalOperation,operationIdentity} from '../../services/contracts/operation-command.mjs';
import {canonicalCashWithdrawal,managementFinancialOperations} from '../../services/contracts/management-financial-command.mjs';
import {readCashWithdrawal,CASH_WITHDRAWAL_HOLDER} from '../../services/business/management-position.mjs';

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

test('R115 as-of read: Dad only, ties included at the chosen time, coverage and future flags, null when uninitialized',async()=>{
 const rows=[{today:'2026-11-02',nowTime:'22:20',covered:true,future:false,id:'WD-CASH',label:'Dad Cash',initialized:true,available:'1200.00'},{today:'2026-11-02',nowTime:'22:20',covered:true,future:false,id:'WD-SCB',label:'Dad SCB',initialized:true,available:'950.00'},{today:'2026-11-02',nowTime:'22:20',covered:true,future:false,id:'CI-DAD',label:'Dad new',initialized:false,available:null}];
 const client=fakeClient(rows),value=await readCashWithdrawal(client,{date:'2026-11-01',time:'10:00'});
 assert.equal(CASH_WITHDRAWAL_HOLDER,'ch:dad');
 assert.deepEqual(client.calls[0].values,['ch:dad','2026-11-01','10:00']);
 const sql=client.calls[0].text;
 // The opening balance of the day plus that day's entries up to and including the chosen time (ties included).
 assert.match(sql,/"Cash Account Daily Summary Recent"/);assert.match(sql,/"Cash Account Statement Recent"/);
 assert.match(sql,/s\."Sort Timestamp"<=\$2::date\+\$3::time/);assert.match(sql,/s\."Statement Date"=\$2::date/);
 assert.match(sql,/h\."Row ID"=\$1 AND a\."Active" AND h\."Active"/);
 assert.deepEqual(value,{date:'2026-11-01',time:'10:00',holderId:'ch:dad',today:'2026-11-02',nowTime:'22:20',covered:true,future:false,accounts:[{id:'WD-CASH',label:'Dad Cash',initialized:true,available:'1200.00'},{id:'WD-SCB',label:'Dad SCB',initialized:true,available:'950.00'},{id:'CI-DAD',label:'Dad new',initialized:false,available:null}]});
 // Outside the 15 Recent days every balance is null; no Dad account still answers with an empty list.
 const outside=await readCashWithdrawal(fakeClient(rows.map(row=>({...row,covered:false,available:'5'}))),{date:'2026-10-01',time:'10:00'});
 assert.equal(outside.covered,false);assert.ok(outside.accounts.every(account=>account.available===null));
 const none=await readCashWithdrawal(fakeClient([{today:'2026-11-02',nowTime:'22:20',covered:true,future:true,id:null,label:null,initialized:false,available:null}]),{date:'2026-11-02',time:'23:50'});
 assert.equal(none.future,true);assert.deepEqual(none.accounts,[]);
 for(const options of [{date:'2026-11-01',time:'10:05'},{date:'2026-11-01',time:'24:00'},{date:'2026-13-01',time:'10:00'},{date:'2026-11-01'},{}])
  await assert.rejects(readCashWithdrawal(fakeClient(rows),options),/invalid_request/);
});
