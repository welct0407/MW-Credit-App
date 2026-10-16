import test from 'node:test';import assert from 'node:assert/strict';
import {mutateBorrowerRecord} from '../../services/business/borrowers.mjs';
// DB-LOCK-03: Node never derives an advisory-lock key itself. The key is computed by
// public.pwa_lock_key_v1(kind, target) (V93) inside the statement that takes the lock, so the
// Node and pwa_submit_operation_v2 sites share one definition. Deploy order: V93 before this app.
const id='3f2d6e4a-1b2c-4d5e-8f90-123456789abc';
const fields={name:'  Synthetic Borrower ',description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:null};
function client(){
 const calls=[];
 return {calls,async query(sql,params){calls.push({sql,params});
  if(sql.includes('FROM public."Borrowers" b WHERE b."Row ID"=$1'))return {rows:[]};
  if(sql.includes('lower(btrim(coalesce("Borrower Name",$3)))'))return {rowCount:0,rows:[]};
  return {rowCount:0,rows:[]};
 }};
}
test('borrower create takes both advisory locks through pwa_lock_key_v1 with kind and target as separate parameters',async()=>{
 const c=client();const result=await mutateBorrowerRecord(c,'create',id,{fields},()=>{});
 assert.equal(result.ok,true);
 const locks=c.calls.filter(call=>call.sql.includes('pg_advisory_xact_lock'));
 assert.deepEqual(locks.map(call=>call.sql),Array(2).fill('SELECT pg_advisory_xact_lock(public.pwa_lock_key_v1($1,$2))'));
 assert.deepEqual(locks.map(call=>call.params),[['borrower',id],['borrower-name','synthetic borrower']]);
 assert.ok(c.calls.every(call=>!call.sql.includes('hashtextextended')&&!(call.params??[]).some(value=>typeof value==='string'&&/^borrower(-name)?:/.test(value))),'no Node-side key derivation remains');
});
