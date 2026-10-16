import test from 'node:test';import assert from 'node:assert/strict';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
// APP-PAY-06: nothing is applied before COMMIT. A write that fails and rolls back cleanly is a
// known non-outcome (command_unavailable, retry the same request id); only a started COMMIT or a
// failed ROLLBACK after the attempted write leaves the outcome unknown.
const command={schemaVersion:3,requestId:'a1111111-1111-4111-8111-111111111111',borrowerId:'synthetic-borrower',selectedChargeIds:['synthetic-charge'],cashAccountId:'synthetic-account',paymentDate:'2026-10-08',amountReceived:'330',paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:'',receiptId:null};
const actor={issuer:'synthetic-issuer',subject:'synthetic-subject',partnerId:'synthetic-partner',loginEmail:'synthetic@example.invalid'};
function store({submitFails=false,commitFails=false,rollbackFails=false}){
 const released=[];
 const client={async query(sql){
  if(sql.includes('FROM public.pwa_payment_commands'))return {rows:[]};
  if(sql.startsWith('SELECT public.pwa_submit_selected_charges_v1')){if(submitFails)throw Object.assign(Error('canceling statement due to statement timeout'),{code:'57014'});return {rows:[{result:{kind:'recorded',originalOutcome:{status:'posted'}}}]};}
  if(sql==='COMMIT'&&commitFails)throw Object.assign(Error('connection lost'),{code:'08006'});
  if(sql==='ROLLBACK'&&rollbackFails)throw Object.assign(Error('connection lost'),{code:'08006'});
  return {rows:[]};
 },release(discard){released.push(discard);}};
 const s=createEnvironmentCommandStore({pool:{connect:async()=>client},guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>actor,actorIssuer:actor.issuer});
 return {released,submit:()=>s.submit({ok:true,subject:actor.subject,email:actor.loginEmail},command)};
}
test('statement timeout after the write was attempted, clean ROLLBACK: command_unavailable',async()=>{
 const s=store({submitFails:true});assert.deepEqual(await s.submit(),{ok:false,status:503,code:'command_unavailable'});assert.deepEqual(s.released,[false]);
});
test('failed COMMIT: command_outcome_unknown and the client is discarded',async()=>{
 const s=store({commitFails:true});assert.deepEqual(await s.submit(),{ok:false,status:503,code:'command_outcome_unknown'});assert.deepEqual(s.released,[true]);
});
test('failed ROLLBACK after the attempted write: command_outcome_unknown',async()=>{
 const s=store({submitFails:true,rollbackFails:true});assert.deepEqual(await s.submit(),{ok:false,status:503,code:'command_outcome_unknown'});assert.deepEqual(s.released,[true]);
});
test('failed ROLLBACK before any write was attempted stays command_unavailable',async()=>{
 const released=[];const client={async query(sql){if(sql.includes('FROM public.pwa_payment_commands'))throw Object.assign(Error('lock timeout'),{code:'55P03'});if(sql==='ROLLBACK')throw Error('connection lost');return {rows:[]};},release(discard){released.push(discard);}};
 const s=createEnvironmentCommandStore({pool:{connect:async()=>client},guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>actor,actorIssuer:actor.issuer});
 assert.deepEqual(await s.submit({ok:true,subject:actor.subject,email:actor.loginEmail},command),{ok:false,status:503,code:'command_unavailable'});assert.deepEqual(released,[true]);
});
