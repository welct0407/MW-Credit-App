import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {OWNER_EMAIL} from '../../services/api/dev-read-config.mjs';
let admin,app,proof;const user='mw_app_dev_phase5_fixture';
before(async()=>{
 admin=await disposablePool(82);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const client=await admin.connect();try{const plan=await planApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{client.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:2});
 proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:82});
});
after(async()=>{await app?.end();await admin?.end()});

test('borrower full snapshot CRUD, creation replay, CAS and reference guard',async()=>{
 await seedPaymentFixture(admin,'4A-P5');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'',[OWNER_EMAIL]);
 const principal={ok:true,email:OWNER_EMAIL,subject:'phase5-owner'},store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const id=randomUUID(),fields={name:'ชื่อจำลอง',description:'Synthetic name',communicationName:'Alias',instagramUsername:null,city:'City',workingLocation:'Work',address:'line1\nline2',hidden:false,referrerId:null,preferredReceivingAccountId:'4A-RECEIVE',note:' exact ไทย\n '};
 const created=await store.borrowerRecord(principal,id,'create',{fields});assert.equal(created.status,200,JSON.stringify(created));assert.equal(created.item.note,fields.note);assert.match(created.item.createdDate,/^\d{4}-\d{2}-\d{2}$/);
 assert.deepEqual(await store.borrowerRecord(principal,id,'create',{fields}),created);
 const modified=await store.borrowerRecord(principal,id,'edit',{expectedVersion:created.item.version,fields:{...fields,hidden:true}});assert.equal(modified.status,200);assert.equal(modified.item.hidden,true);
 assert.equal((await store.borrowerRecord(principal,id,'edit',{expectedVersion:created.item.version,fields})).status,409);
 assert.equal((await store.borrowerRecord(principal,id,'create',{fields})).status,409);
 assert.equal((await store.borrowerRecord(principal,randomUUID(),'create',{fields:{...fields,name:' ชื่อจำลอง '}})).code,'borrower_name_exists');
 assert.equal((await store.borrowerRecord(principal,id,'edit',{expectedVersion:modified.item.version,fields:{...fields,unexpected:'no'}})).status,400);
 assert.equal((await store.borrowerRecord(principal,id,'delete',{expectedVersion:modified.item.version})).status,200);
 assert.equal((await store.borrowerRecord(principal,id)).status,404);
});
