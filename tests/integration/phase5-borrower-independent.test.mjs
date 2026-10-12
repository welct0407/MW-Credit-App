import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {canonicalBorrowerFields} from '../../services/business/borrowers.mjs';
import {OWNER_EMAIL} from '../../services/api/dev-read-config.mjs';
let admin,app,store,proof,fixture;const user='mw_app_dev_c_borrower_fixture';
const principal={ok:true,email:OWNER_EMAIL,subject:'independent-phase5-owner'};
const fields=(name='C borrower '+randomUUID())=>({name,description:'English synthetic',communicationName:'ช่องทางจำลอง',instagramUsername:'synthetic_test',city:'Bangkok',workingLocation:'Synthetic office',address:' line one\nบรรทัดสอง ',hidden:false,referrerId:null,preferredReceivingAccountId:fixture.receivingAccountId,note:' exact ไทย\n '});
before(async()=>{
 admin=await disposablePool(82);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:3});
 proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:82});
 fixture=await seedPaymentFixture(admin,'C-P5-B');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 const prerequisite=(await admin.query('SELECT a."Active" AS account_active,h."Active" AS holder_active FROM "Cash Accounts" a JOIN "Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Row ID"=$1',[fixture.receivingAccountId])).rows[0];assert.equal(prerequisite.account_active,true);assert.equal(prerequisite.holder_active,true);
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const role=(await app.query('SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.equal(role.name,user);assert.equal(role.rolsuper,false);assert.equal(role.rolbypassrls,false);
});
after(async()=>{await app?.end();await admin?.end()});
async function create(f=fields()){const id=randomUUID(),r=await store.borrowerRecord(principal,id,'create',{fields:f});assert.equal(r.status,200,JSON.stringify(r));return r.item}
async function assertReadMatchesWrite(read,write){assert.equal(read.status,200);const {asOf,businessDate,...business}=read.item;assert.match(asOf,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);assert.equal(new Date(asOf).toISOString(),asOf);const expectedDay=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;assert.equal(businessDate,expectedDay);assert.deepEqual(business,write)}
async function fingerprint(id){return(await admin.query('SELECT to_jsonb(b) AS value FROM "Borrowers" b WHERE "Row ID"=$1',[id])).rows[0]?.value}

test('B-C01 exact nullable and Unicode field roundtrip preserves immutable creation and AI fields',async()=>{
 const f=fields(),item=await create(f);for(const [key,value] of Object.entries(f))assert.deepEqual(item[key],value);
 const cleared={...f,description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:null};
 const changed=await store.borrowerRecord(principal,item.id,'edit',{expectedVersion:item.version,fields:cleared});assert.equal(changed.status,200);for(const [key,value] of Object.entries(cleared))assert.deepEqual(changed.item[key],value);assert.equal(changed.item.createdDate,item.createdDate);assert.equal(changed.item.aiCollectionEnabled,item.aiCollectionEnabled);assert.equal(changed.item.id,item.id);
 const read=await store.borrowerRecord(principal,item.id);await assertReadMatchesWrite(read,changed.item);
});

test('B-C02 closed editable fields reject forged identity, AI, date, missing and malformed values without writes',async()=>{
 const f=fields(),item=await create(f),original=await fingerprint(item.id);
 for(const invalid of [{...f,id:randomUUID()},{...f,aiCollectionEnabled:true},{...f,createdDate:'1900-01-01'},{...f,hidden:'false'},{...f,note:'bad\0note'},{...f,note:'\ud800'},{...f,referrerId:''},{...f,note:'x'.repeat(65537)},Object.fromEntries(Object.entries(f).filter(([key])=>key!=='note'))]){
  assert.throws(()=>canonicalBorrowerFields(invalid));const r=await store.borrowerRecord(principal,item.id,'edit',{expectedVersion:item.version,fields:invalid});assert.equal(r.status,400,JSON.stringify(r));assert.deepEqual(await fingerprint(item.id),original);
 }
});

test('B-C03 self/missing referrer and inactive cash account or holder are rejected atomically',async()=>{
 const item=await create(),original=await fingerprint(item.id),f=fields();
 for(const referrerId of [item.id,'missing-C-referrer']){assert.equal((await store.borrowerRecord(principal,item.id,'edit',{expectedVersion:item.version,fields:{...f,referrerId}})).code,'invalid_reference');assert.deepEqual(await fingerprint(item.id),original)}
 await admin.query('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name","Active","Default Account") VALUES($1,$2,$3,$4,false,false)',['C-P5-INACTIVE','ch:dad','C synthetic inactive','Synthetic']);
 assert.equal((await store.borrowerRecord(principal,item.id,'edit',{expectedVersion:item.version,fields:{...f,preferredReceivingAccountId:'C-P5-INACTIVE'}})).code,'invalid_reference');
 assert.deepEqual(await fingerprint(item.id),original);
 const holder=(await admin.query('SELECT h."Row ID" AS id,h."Active" AS active FROM "Cash Accounts" a JOIN "Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Row ID"=$1',[fixture.receivingAccountId])).rows[0];
 try{await admin.query('UPDATE "Cash Holders" SET "Active"=false WHERE "Row ID"=$1',[holder.id]);assert.equal((await store.borrowerRecord(principal,item.id,'edit',{expectedVersion:item.version,fields:f})).code,'invalid_reference')}finally{await admin.query('UPDATE "Cash Holders" SET "Active"=$1 WHERE "Row ID"=$2',[holder.active,holder.id])}
 assert.deepEqual(await fingerprint(item.id),original);
 const referenced=await create();const valid=await store.borrowerRecord(principal,item.id,'edit',{expectedVersion:item.version,fields:{...f,referrerId:referenced.id}});assert.equal(valid.status,200);assert.equal(valid.item.referrerId,referenced.id);
});

test('B-C04 referenced borrower deletion preserves full financial graph and stale delete cannot remove edited row',async()=>{
 const id=fixture.borrowerId,read=await store.borrowerRecord(principal,id),original=await fingerprint(id),loans=(await admin.query('SELECT to_jsonb(l) AS value FROM "Loans" l WHERE "Ref Borrowers"=$1 ORDER BY "Row ID"',[id])).rows;
 const rejected=await store.borrowerRecord(principal,id,'delete',{expectedVersion:read.item.version});assert.equal(rejected.status,422,JSON.stringify(rejected));assert.equal(rejected.code,'record_requires_reconciliation');assert.deepEqual(await fingerprint(id),original);assert.deepEqual((await admin.query('SELECT to_jsonb(l) AS value FROM "Loans" l WHERE "Ref Borrowers"=$1 ORDER BY "Row ID"',[id])).rows,loans);
 const item=await create(),edited=await store.borrowerRecord(principal,item.id,'edit',{expectedVersion:item.version,fields:{...fields(),note:'new note'}});assert.equal(edited.status,200);assert.equal((await store.borrowerRecord(principal,item.id,'delete',{expectedVersion:item.version})).status,409);await assertReadMatchesWrite(await store.borrowerRecord(principal,item.id),edited.item);
});

test('B-C05 simultaneous edits share one CAS winner and normalized duplicate creates never produce two rows',async()=>{
 const item=await create(),one=fields(),two=fields(),responses=await Promise.all([store.borrowerRecord(principal,item.id,'edit',{expectedVersion:item.version,fields:one}),store.borrowerRecord(principal,item.id,'edit',{expectedVersion:item.version,fields:two})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);const winner=responses.find(r=>r.status===200);await assertReadMatchesWrite(await store.borrowerRecord(principal,item.id),winner.item);
 const name='Concurrent C '+randomUUID(),f=fields(name),ids=[randomUUID(),randomUUID()],creates=await Promise.all(ids.map((id,i)=>store.borrowerRecord(principal,id,'create',{fields:{...f,name:i?' '+name.toUpperCase()+' ':name}})));assert.deepEqual(creates.map(r=>r.status).sort(),[200,409]);assert.equal((await admin.query('SELECT count(*)::int AS n FROM "Borrowers" WHERE "Row ID"=ANY($1::text[])',[ids])).rows[0].n,1);
});

test('B-C06 owner, actor mapping and owner-testing boundary deny access without changes',async()=>{
 const item=await create(),original=await fingerprint(item.id);for(const p of [{...principal,ok:false},{...principal,email:'other@example.invalid'},{...principal,subject:''}])assert.equal((await store.borrowerRecord(p,item.id,'edit',{expectedVersion:item.version,fields:fields()})).status,403);
 const disabled=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:false});assert.equal((await disabled.borrowerRecord(principal,item.id)).status,403);
 try{await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',['unmapped@example.invalid',fixture.actorId]);assert.equal((await store.borrowerRecord(principal,item.id,'edit',{expectedVersion:item.version,fields:fields()})).status,403)}finally{await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId])}
 assert.deepEqual(await fingerprint(item.id),original);
});




test('B-C07 optional assessment references unlink on deletion while complete existing snapshots survive',async()=>{
 const item=await create(),assessmentId=randomUUID(),labId=randomUUID();
 await admin.query('INSERT INTO "Loan Assessment"("Row ID","Ref Borrower","Proposed Loan Amount","Minimum Daily Profit Rate") VALUES($1,$2,100::money,0.01)',[assessmentId,item.id]);
 await admin.query('INSERT INTO "Loan Assessment SQL Lab"("Row ID","Ref Borrower","Proposed Loan Amount","Minimum Daily Profit Rate","SQL Forecast Start","SQL Forecast End") VALUES($1,$2,100::money,0.01,(CURRENT_TIMESTAMP AT TIME ZONE \'Asia/Bangkok\')::date-1,(CURRENT_TIMESTAMP AT TIME ZONE \'Asia/Bangkok\')::date+10)',[labId,item.id]);
 const snapshots=[];for(const [table,id] of [['Loan Assessment',assessmentId],['Loan Assessment SQL Lab',labId]])snapshots.push((await admin.query(`SELECT to_jsonb(a)-'Ref Borrower' AS value FROM "${table}" a WHERE "Row ID"=$1`,[id])).rows[0].value);
 const removed=await store.borrowerRecord(principal,item.id,'delete',{expectedVersion:item.version});assert.equal(removed.status,200,JSON.stringify(removed));assert.equal((await store.borrowerRecord(principal,item.id)).status,404);
 for(const [index,[table,id]] of [['Loan Assessment',assessmentId],['Loan Assessment SQL Lab',labId]].entries()){const row=(await admin.query(`SELECT "Ref Borrower" AS ref,to_jsonb(a)-'Ref Borrower' AS value FROM "${table}" a WHERE "Row ID"=$1`,[id])).rows[0];assert.equal(row.ref,null);assert.deepEqual(row.value,snapshots[index]);}
});

test('B-C08 first-screen derived metrics and reference labels agree with actual source and prototype formulas',async()=>{
 const f=fields(),referrer=await create();const item=await create({...f,referrerId:referrer.id});let response=await store.borrowerRecord(principal,item.id);assert.equal(response.item.details.referrerName,referrer.name);assert.equal(response.item.details.preferredReceivingAccountLabel,'Synthetic receiving account');assert.equal(response.item.details.coverageDate,null);assert.equal(Number(response.item.details.activeReturn),0);assert.equal(Number(response.item.details.closedReturn),0);
 response=await store.borrowerRecord(principal,fixture.borrowerId);const d=response.item.details;const raw=(await admin.query('SELECT "Total Amount Loaned" AS total,"Total Interest Earned" AS interest,"Total Number of Loans" AS count,"Total Outstanding Principal" AS outstanding,"Active Loan Interest Earned" AS active,"Has Closed Loan" AS closed,"Active Daily Interest" AS daily,(CURRENT_TIMESTAMP AT TIME ZONE \'Asia/Bangkok\')::date::text AS today FROM "Borrowers" WHERE "Row ID"=$1',[fixture.borrowerId])).rows[0];
 assert.equal(Number(d.totalAmountLoaned),Number(raw.total));assert.equal(Number(d.totalInterestEarned),Number(raw.interest));assert.equal(d.totalNumberOfLoans,raw.count);assert.equal(Number(d.activeReturn),Number(raw.outstanding)>0?Number(raw.active)/Number(raw.outstanding):0);assert.equal(Number(d.activeProfit),Number(raw.active)-Number(raw.outstanding));assert.equal(Number(d.closedPrincipal),Number(raw.total)-Number(raw.outstanding));assert.equal(Number(d.closedInterest),Number(raw.interest)-Number(raw.active));assert.equal(Number(d.closedReturn),raw.closed&&Number(raw.total)>Number(raw.outstanding)?(Number(raw.interest)-Number(raw.active))/(Number(raw.total)-Number(raw.outstanding)):0);
 assert.equal(Number(d.totalNumberOfLoans),2);assert.equal(Number(d.outstandingPrincipal),2000);assert.equal(d.coverageDate,null);
 const firstNull=await create({...fields(),name:null}),secondNull=await create({...fields(),name:null});assert.equal(firstNull.name,null);assert.equal(secondNull.name,null);assert.notEqual(firstNull.id,secondNull.id);
});
