import test from 'node:test';import assert from 'node:assert/strict';
import {createEnvironmentCommandStore,commandBusy} from '../../services/payment-command/store.mjs';
// APP-PAY-06: nothing is applied before COMMIT. A write that fails and rolls back cleanly is a
// known non-outcome; only a started COMMIT or a failed ROLLBACK after the attempted write leaves
// the outcome unknown.
// DB-LOCK-01: within the clean-rollback subset, a lock wait (55P03), deadlock (40P01), statement
// timeout (57014) or a SQL try-lock refusal (P0001 "… busy; retry …") is 409 command_busy: the
// same request id is resent unchanged. Everything else keeps 503 command_unavailable.
const command={schemaVersion:3,requestId:'a1111111-1111-4111-8111-111111111111',borrowerId:'synthetic-borrower',selectedChargeIds:['synthetic-charge'],cashAccountId:'synthetic-account',paymentDate:'2026-10-08',amountReceived:'330',paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:'',receiptId:null};
const actor={issuer:'synthetic-issuer',subject:'synthetic-subject',partnerId:'synthetic-partner',loginEmail:'synthetic@example.invalid'};
const principal={ok:true,subject:actor.subject,email:actor.loginEmail};
const sqlError=(code,message='synthetic failure')=>Object.assign(Error(message),{code});
function store({submitFails=null,commitFails=null,rollbackFails=false,statusFails=null}){
 const released=[];
 const client={async query(sql){
  if(sql.includes('FROM public.pwa_payment_commands'))return {rows:[]};
  if(sql.startsWith('SELECT public.pwa_submit_selected_charges_v1')){if(submitFails)throw submitFails;return {rows:[{result:{kind:'recorded',originalOutcome:{status:'posted'}}}]};}
  if(sql.startsWith('SELECT public.pwa_operation_status_v2')){if(statusFails)throw statusFails;return {rows:[{result:{kind:'unresolved'}}]};}
  if(sql==='COMMIT'&&commitFails)throw commitFails;
  if(sql==='ROLLBACK'&&rollbackFails)throw sqlError('08006','connection lost');
  return {rows:[]};
 },release(discard){released.push(discard);}};
 const s=createEnvironmentCommandStore({pool:{connect:async()=>client},guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>actor,actorIssuer:actor.issuer});
 return {released,submit:()=>s.submit(principal,command),status:()=>s.operationStatus(principal,command.requestId)};
}
const busyMessages=[
 'Cash pool is busy; retry','Cashpool is busy; sync and retry','Borrower is busy; sync and retry','Analytics refresh is busy; sync and retry','Partner allocation is busy; sync and retry','Cash accounts are busy; sync and retry',
 'Borrower is busy; sync and retry Default Loan','Loan is busy; sync and retry charge correction','Loan is busy; sync and retry repayment correction',
 'Borrower is busy; sync and request payment again','Loan is busy; sync and request charge generation again',
];
test('busy predicate: lock codes, every SQL busy message form; other P0001 texts and codes are not busy',()=>{
 for(const code of ['55P03','40P01','57014'])assert.ok(commandBusy(sqlError(code)),code);
 for(const message of busyMessages)assert.ok(commandBusy(sqlError('P0001',message)),message);
 for(const message of ['Source changed','Payment is busy','busy; retry later','Cash pool is busy'])assert.equal(commandBusy(sqlError('P0001',message)),false,message);
 assert.equal(commandBusy(sqlError('23505','Cash pool is busy; retry')),false);assert.equal(commandBusy(sqlError('08006')),false);assert.equal(commandBusy(undefined),false);
});
for(const code of ['55P03','40P01','57014'])test(`${code} after the write was attempted, clean ROLLBACK: 409 command_busy, client kept`,async()=>{
 const s=store({submitFails:sqlError(code)});assert.deepEqual(await s.submit(),{ok:false,status:409,code:'command_busy'});assert.deepEqual(s.released,[false]);
});
for(const message of busyMessages)test(`P0001 "${message}" with clean ROLLBACK: 409 command_busy`,async()=>{
 const s=store({submitFails:sqlError('P0001',message)});assert.deepEqual(await s.submit(),{ok:false,status:409,code:'command_busy'});assert.deepEqual(s.released,[false]);
});
test('P0001 that is not a busy refusal keeps 503 command_unavailable after a clean ROLLBACK',async()=>{
 const s=store({submitFails:sqlError('P0001','Source changed')});assert.deepEqual(await s.submit(),{ok:false,status:503,code:'command_unavailable'});assert.deepEqual(s.released,[false]);
});
test('other failure codes after the attempted write keep 503 command_unavailable',async()=>{
 const s=store({submitFails:sqlError('08006','connection lost')});assert.deepEqual(await s.submit(),{ok:false,status:503,code:'command_unavailable'});assert.deepEqual(s.released,[false]);
});
test('busy code raised by COMMIT itself (commit started): command_outcome_unknown, never busy',async()=>{
 for(const code of ['40P01','57014','55P03']){const s=store({commitFails:sqlError(code)});assert.deepEqual(await s.submit(),{ok:false,status:503,code:'command_outcome_unknown'},code);assert.deepEqual(s.released,[true]);}
});
test('failed COMMIT: command_outcome_unknown and the client is discarded',async()=>{
 const s=store({commitFails:sqlError('08006','connection lost')});assert.deepEqual(await s.submit(),{ok:false,status:503,code:'command_outcome_unknown'});assert.deepEqual(s.released,[true]);
});
test('busy code followed by a failed ROLLBACK after the attempted write: command_outcome_unknown',async()=>{
 const s=store({submitFails:sqlError('55P03'),rollbackFails:true});assert.deepEqual(await s.submit(),{ok:false,status:503,code:'command_outcome_unknown'});assert.deepEqual(s.released,[true]);
});
test('readonly 55P03 with clean ROLLBACK stays 503 command_unavailable (busy is a command response)',async()=>{
 const s=store({statusFails:sqlError('55P03')});assert.deepEqual(await s.status(),{ok:false,status:503,code:'command_unavailable'});assert.deepEqual(s.released,[false]);
});
test('failed ROLLBACK before any write was attempted stays command_unavailable',async()=>{
 const released=[];const client={async query(sql){if(sql.includes('FROM public.pwa_payment_commands'))throw sqlError('55P03','lock timeout');if(sql==='ROLLBACK')throw Error('connection lost');return {rows:[]};},release(discard){released.push(discard);}};
 const s=createEnvironmentCommandStore({pool:{connect:async()=>client},guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>actor,actorIssuer:actor.issuer});
 assert.deepEqual(await s.submit(principal,command),{ok:false,status:503,code:'command_unavailable'});assert.deepEqual(released,[true]);
});
