import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeCommandMetadata} from '../../services/agent-conversations/command-metadata.mjs';

async function quick(resource,overrides={}){
 const calls=[];
 const client={async query(sql,params){calls.push({sql,params});return {rows:calls.length===1
  ?[{borrowerId:'borrower:synthetic'}]
  :[{paymentDate:'2026-10-12',amountReceived:'92233720368547758.00',invalid:false,blocked:false,...overrides}]};}};
 return {value:await readNativeCommandMetadata(client,resource,'source:synthetic',{partnerId:'p'}),calls};
}
test('quick receiving retains ordinary source modes, exact money and Bangkok date',async()=>{
 for(const resource of ['Borrowers','Charges']){
  const {value,calls}=await quick(resource);
  assert.deepEqual(value,{quickPayment:{borrowerId:'borrower:synthetic',amountReceived:'92233720368547758',paymentDate:'2026-10-12',
   allocationMethod:resource==='Charges'?'Single Full':'Receive All',targetChargeId:resource==='Charges'?'source:synthetic':null,targetLoanId:null}});
  assert.deepEqual(calls[1].params,['borrower:synthetic',resource==='Charges'?'source:synthetic':null]);
  assert.match(calls[1].sql,/CASE WHEN \$2::text IS NULL THEN c\."Charge Date"<=clock\.day ELSE c\."Row ID"=\$2 END/);
  assert.ok(calls.every(c=>!/(?:INSERT INTO|UPDATE |DELETE FROM|FOR UPDATE)/.test(c.sql)));
 }
});
test('no stale/negative/fractional/incomplete/blocked balance becomes a payment proposal',async()=>{
 for(const row of [{amountReceived:null},{amountReceived:'0.00'},{amountReceived:'-1'},{amountReceived:'1.01'},
  {amountReceived:'92233720368547759'},{invalid:true},{blocked:true}]){
  const {value}=await quick('Borrowers',row);assert.deepEqual(value,{quickPayment:null});
 }
 let count=0;
 assert.deepEqual(await readNativeCommandMetadata({async query(){count++;return {rows:[]};}},'Charges','missing',{}),{quickPayment:null});
 assert.equal(count,1);
});
test('allocation metadata binds exact parent and canonical version/head without authorizing a move',async()=>{
 const expected={id:'payment:synthetic',status:'Posted',version:'a'.repeat(64),predecessorRequestId:null};
 const calls=[];
 const client={async query(sql,params){calls.push({sql,params});return {rows:[expected]};}};
 assert.deepEqual(await readNativeCommandMetadata(client,'Payment Allocations','allocation:synthetic',{}),{allocationParent:expected});
 assert.deepEqual(calls[0].params,['allocation:synthetic']);
 assert.match(calls[0].sql,/pwa_payment_version_v2/);assert.match(calls[0].sql,/pwa_payment_head_v2/);
 assert.deepEqual(await readNativeCommandMetadata({async query(){return {rows:[]};}},'Payment Allocations','missing',{}),{allocationParent:null});
});
