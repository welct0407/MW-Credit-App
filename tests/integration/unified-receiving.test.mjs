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
let admin,app,proof;const user='mw_app_dev_unified_fixture';
before(async()=>{
 admin=await disposablePool(82);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const client=await admin.connect();try{const plan=await planApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{client.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:2});
 proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:82});
});
after(async()=>{await app?.end();await admin?.end()});

test('v6 manual principal-first plan posts exact components and replays',async()=>{
 const prefix='4A-UNIFIED';await seedPaymentFixture(admin,prefix);await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'',[OWNER_EMAIL]);
 const principal={ok:true,email:OWNER_EMAIL,subject:'synthetic-owner'},borrowerId=prefix+'-B';
 const store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const draft=await store.draft(principal,borrowerId,{scope:'all'});assert.equal(draft.status,200,JSON.stringify(draft));
 const auto=await store.autoAssign(principal,borrowerId,{amountReceived:'50'});assert.equal(auto.status,200,JSON.stringify(auto));assert.equal(auto.allocations[0].interest,'20');assert.equal(auto.allocations[0].principal,'30');
 const row=draft.charges.find(row=>row.id===prefix+'-C1');
 const allocations=[{chargeId:row.id,principal:'40',interest:'0',expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate}];
 const review=await store.review(principal,borrowerId,{amountReceived:'40',allocations});assert.equal(review.status,200,JSON.stringify(review));
 const command={schemaVersion:6,requestId:randomUUID(),borrowerId,allocations,cashAccountId:'4A-RECEIVE',paymentDate:draft.businessDate,amountReceived:'40',paymentMethod:'Cash',notes:'manual ไทย',receiptId:null};
 const posted=await store.submit(principal,command);assert.equal(posted.status,200,JSON.stringify(posted));
 const result=await store.result(principal,command.requestId);assert.equal(result.currentSource,'present',JSON.stringify(result));assert.equal(result.allocations[0].principal,'40.00');assert.equal(result.allocations[0].interest,'0.00');
 assert.deepEqual(await store.submit(principal,command),posted);
 await assert.rejects(app.query('DELETE FROM public.pwa_payment_commands WHERE request_id=$1',[command.requestId]));
});
