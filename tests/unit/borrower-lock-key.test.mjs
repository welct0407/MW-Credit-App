import test from 'node:test';import assert from 'node:assert/strict';
import {mutateBorrowerRecord} from '../../services/business/borrowers.mjs';
// DB-LOCK-03: Node never derives an advisory-lock key itself. The key is computed by
// public.pwa_lock_key_v1(kind, target) (V93) inside the statement that takes the lock, so the
// Node and pwa_submit_operation_v2 sites share one definition. Deploy order: V93 before this app.
// The borrower-name guard and key text (nullif/btrim/lower) are SQL too, matching
// pwa_submit_operation_v2 exactly; Node passes the raw name.
const id='3f2d6e4a-1b2c-4d5e-8f90-123456789abc';
const rowLockSql='SELECT pg_advisory_xact_lock(public.pwa_lock_key_v1($1,$2))';
const nameLockSql="SELECT pg_advisory_xact_lock(public.pwa_lock_key_v1($1,lower(btrim($2)))) WHERE nullif(btrim($2),'') IS NOT NULL";
const fieldsFor=name=>({name,description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:null});
function client(){
 const calls=[];
 return {calls,async query(sql,params){calls.push({sql,params});
  if(sql.includes('FROM public."Borrowers" b WHERE b."Row ID"=$1'))return {rows:[]};
  if(sql.includes('lower(btrim(coalesce("Borrower Name",$3)))'))return {rowCount:0,rows:[]};
  return {rowCount:0,rows:[]};
 }};
}
async function locksFor(name){
 const c=client();const result=await mutateBorrowerRecord(c,'create',id,{fields:fieldsFor(name)},()=>{});
 assert.equal(result.ok,true);
 return c.calls.filter(call=>call.sql.includes('pg_advisory_xact_lock'));
}
for(const name of ['  Synthetic Borrower ','\tÉmile ','  ',null]){
 test(`borrower create passes the raw name ${JSON.stringify(name)} to the SQL-side borrower-name key`,async()=>{
  const locks=await locksFor(name);
  assert.deepEqual(locks.map(call=>call.sql),[rowLockSql,nameLockSql]);
  assert.deepEqual(locks.map(call=>call.params),[['borrower',id],['borrower-name',name??'']]);
 });
}
test('the borrower-name lock statement matches the pwa_submit_operation_v2 guard and key expression',()=>{
 // SQL body: IF nullif(btrim(i->>'name'),'') IS NOT NULL THEN PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower-name',lower(btrim(i->>'name'))));
 assert.equal(nameLockSql.replaceAll('$2',"i->>'name'"),"SELECT pg_advisory_xact_lock(public.pwa_lock_key_v1($1,lower(btrim(i->>'name')))) WHERE nullif(btrim(i->>'name'),'') IS NOT NULL");
});
test('no Node-side key derivation remains',async()=>{
 for(const name of ['  Synthetic Borrower ','\tÉmile ']){
  const c=client();await mutateBorrowerRecord(c,'create',id,{fields:fieldsFor(name)},()=>{});
  assert.ok(c.calls.every(call=>!call.sql.includes('hashtextextended')&&!(call.params??[]).some(value=>typeof value==='string'&&/^borrower(-name)?:/.test(value))));
  assert.ok(c.calls.filter(call=>call.sql.includes('pg_advisory_xact_lock')).every(call=>!call.params.includes(name.trim().toLowerCase())||name.trim().toLowerCase()===name));
 }
});
