import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';

const id='00000000-0000-4000-8000-000000000001';
const input={requestId:id,operation:'payment.create',targetId:id,expectedVersion:null,predecessorRequestId:null,receiptId:null,
 inputs:{borrowerId:'b',amountReceived:'100',paymentDate:'2026-01-01',createdAt:'2026-01-01 12:34:56',paymentMethod:'Cash',allocationMethod:'Lump Sum',bankReference:null,notes:null,targetChargeId:null,targetLoanId:null,cashAccountId:'a',cashHolderId:'h'}};

test('machine native operations retain acknowledged COMMIT then release then bounded no-throw wake',async()=>{
 const events=[];
 const client={async query(sql){events.push(sql);return {rows:sql.includes('pwa_submit_agent_operation_v1')?[{result:{kind:'recorded',originalOutcome:{status:'applied'}}}]:[]};},release(q){events.push(['release',q]);}};
 const store=createEnvironmentCommandStore({pool:{connect:async()=>client},guardConnection:async()=>{},actorIssuer:'https://accounts.google.com',
  principalAllowed:()=>true,resolveActor:async()=>({issuer:'https://accounts.google.com',subject:'123',partnerId:'actor',loginEmail:'actor@example.invalid'}),
  afterCommit:async()=>{events.push('wake');throw Error('provider unavailable');}});
 const result=await store.nativeOperation({},input);
 assert.equal(result.status,200);
 assert(events.indexOf('COMMIT')<events.findIndex(e=>Array.isArray(e)&&e[0]==='release'));
 assert.equal(events.at(-1),'wake');
 assert.equal(events.includes('ROLLBACK'),false);
});

test('lost machine COMMIT acknowledgement is unknown and never wakes or retries',async()=>{
 const events=[];
 const client={async query(sql){events.push(sql);if(sql==='COMMIT')throw Error('lost acknowledgement');return {rows:sql.includes('pwa_submit_agent_operation_v1')?[{result:{kind:'recorded',originalOutcome:{status:'applied'}}}]:[]};},release(q){events.push(['release',q]);}};
 const store=createEnvironmentCommandStore({pool:{connect:async()=>client},guardConnection:async()=>{},actorIssuer:'https://accounts.google.com',
  principalAllowed:()=>true,resolveActor:async()=>({issuer:'https://accounts.google.com',subject:'123',partnerId:'actor',loginEmail:'actor@example.invalid'}),afterCommit:async()=>events.push('wake')});
 const result=await store.nativeOperation({},input);
 assert.equal(result.code,'operation_outcome_unknown');
 assert.deepEqual(events.at(-1),['release',true]);
 assert.equal(events.includes('wake'),false);
 assert.equal(events.filter(e=>typeof e==='string'&&e.includes('pwa_submit_agent_operation_v1')).length,1);
});
