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
let admin,app,proof;const user='mw_app_dev_phase4_fixture';
before(async()=>{
 admin=await disposablePool(80);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const client=await admin.connect();try{const plan=await planApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{client.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:2});
 proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:80});
});
after(async()=>{await app?.end();await admin?.end()});
test('owner mode review, committed result and metadata-only CAS use existing engine',async()=>{
 await seedPaymentFixture(admin,'4A-PHASE4-B');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'',[OWNER_EMAIL]);
 const principal={ok:true,email:OWNER_EMAIL,subject:'synthetic-owner'},borrowerId='4A-PHASE4-B-B';
 const store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const draft=await store.draft(principal,borrowerId);assert.equal(draft.status,200,JSON.stringify(draft));assert.ok(draft.charges.length>=2);
 const ids=['4A-PHASE4-B-C1','4A-PHASE4-B-C2'];const review=await store.review(principal,borrowerId,{selectedChargeIds:ids});assert.equal(review.total,'330');
 const command={schemaVersion:3,requestId:randomUUID(),borrowerId,selectedChargeIds:ids,cashAccountId:'4A-RECEIVE',paymentDate:draft.businessDate,amountReceived:review.total,paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:'original',receiptId:null};
 const posted=await store.submit(principal,command);assert.equal(posted.status,200,JSON.stringify(posted));
 const result=await store.result(principal,command.requestId);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.currentSource,'present');assert.equal(result.allocations.length,2);assert.equal(result.repayments.length,2);assert.equal(result.cashMovements.length,1);
 const changed=await store.metadata(principal,command.requestId,{expectedVersion:result.payment.version,notes:'updated notes',receiptId:null});assert.equal(changed.status,200,JSON.stringify(changed));assert.equal(changed.payment.notes,'updated notes');assert.deepEqual(changed.allocations,result.allocations);assert.deepEqual(changed.cashMovements,result.cashMovements);
 assert.equal((await store.metadata(principal,command.requestId,{expectedVersion:result.payment.version,notes:'stale edit',receiptId:null})).status,409);
 assert.deepEqual(await store.submit(principal,command),posted);
 const history=await store.history(principal,borrowerId);assert.equal(history.items.length,1);assert.equal(history.items[0].notes,'updated notes');
});
