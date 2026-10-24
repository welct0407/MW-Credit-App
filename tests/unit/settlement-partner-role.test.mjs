// R095: settlements (Partner profit payouts) are recorded only by the two Partners, roles A and B. Every
// settlement.* operation of a Partner with another role (the DEV test account's "Test") is 403 access_denied before
// anything is attempted; A and B, and non-settlement operations of any Partner, pass as before.
import test from 'node:test';import assert from 'node:assert/strict';
import {createEnvironmentCommandStore,SETTLEMENT_ROLES} from '../../services/payment-command/store.mjs';
import {managementFinancialOperations} from '../../services/contracts/management-financial-command.mjs';

const actor={issuer:'synthetic-issuer',subject:'synthetic-subject',partnerId:'synthetic-partner',loginEmail:'synthetic@example.invalid'};
const principal={ok:true,subject:actor.subject,email:actor.loginEmail};
const version='a'.repeat(64);
const settlement={settlementDate:'2026-10-24',partnerId:'synthetic-partner',amount:'100',status:'Pending',transferDate:null,notes:null,cashAccountId:'synthetic-account'};
let n=0;const id=()=>`b${String(++n).padStart(7,'0')}-1111-4111-8111-111111111111`;
const inputs={'settlement.create':[null,settlement],'settlement.update':[version,settlement],'settlement.complete':[version,{cashAccountId:'synthetic-account'}],
 'settlement.reverse':[version,{}],'settlement.cancel':[version,{}],'settlement.settle-all':[null,{partnerId:'synthetic-partner',reviewedAmount:'100',notes:null}]};
function operation(name){
 const [expectedVersion,fields]=name==='expense.delete'?[version,{}]:inputs[name];
 const create=name.endsWith('.create')||name==='settlement.settle-all';
 return {requestId:id(),operation:name,targetId:create?id():'synthetic-target',expectedVersion,predecessorRequestId:null,inputs:fields,receiptId:null};
}
function store(role){
 const statements=[];
 const client={async query(sql,params){
  statements.push(sql);
  if(sql.startsWith('SELECT "Partner Role" AS role FROM public."Partners"')){assert.deepEqual(params,[actor.partnerId]);return {rows:role===undefined?[]:[{role}]};}
  if(sql.includes('FROM public.pwa_payment_commands'))return {rows:[]};
  if(sql.startsWith('SELECT public.pwa_submit_operation_v2'))return {rows:[{result:{kind:'recorded',originalOutcome:{status:'applied'}}}]};
  return {rows:[]};
 },release(){}};
 const s=createEnvironmentCommandStore({pool:{connect:async()=>client},guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>actor,actorIssuer:actor.issuer});
 return {statements,run:name=>s.operation(principal,operation(name))};
}
const SETTLEMENTS=managementFinancialOperations.filter(op=>op.startsWith('settlement.'));

test('every settlement operation is covered and only roles A and B may record one',()=>{
 assert.deepEqual(SETTLEMENTS.sort(),Object.keys(inputs).sort());
 assert.deepEqual(SETTLEMENT_ROLES,['A','B']);
});
for(const role of ['Test','C','',null,undefined])test(`a Partner with role ${JSON.stringify(role)} is refused every settlement operation, nothing attempted`,async()=>{
 for(const name of SETTLEMENTS){
  const s=store(role);
  assert.deepEqual(await s.run(name),{ok:false,status:403,code:'access_denied'},name);
  assert.equal(s.statements.some(sql=>sql.includes('pwa_submit_operation_v2')||sql.includes('pwa_payment_commands')),false,name+' attempted');
  assert.equal(s.statements.at(-1),'ROLLBACK',name+' rolled back');
 }
});
for(const role of ['A','B'])test(`Partner ${role} records every settlement operation as before`,async()=>{
 for(const name of SETTLEMENTS){
  const s=store(role);const result=await s.run(name);
  assert.equal(result.ok,true,name+' '+JSON.stringify(result));
  assert.ok(s.statements.some(sql=>sql.startsWith('SELECT public.pwa_submit_operation_v2')),name+' submitted');
 }
});
test('a non-settlement operation does not read the Partner role, whatever it is',async()=>{
 const s=store('Test');
 assert.equal((await s.run('expense.delete')).ok,true);
 assert.equal(s.statements.some(sql=>sql.includes('"Partner Role"')),false);
});
