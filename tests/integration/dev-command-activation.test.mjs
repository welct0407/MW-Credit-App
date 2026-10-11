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
let admin,app,proof;const user='mw_app_dev_g_fixture';
before(async()=>{
 admin=await disposablePool(79);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const client=await admin.connect();try{const plan=await planApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{client.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:2});
 proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user});
});
after(async()=>{await app?.end();await admin?.end()});
test('true application login posts via guarded definer while direct journal writes fail',async()=>{
 await seedPaymentFixture(admin,'4A-ACT-B');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'',[OWNER_EMAIL]);
 const row=(await app.query('SELECT current_user AS principal,session_user AS session')).rows[0];assert.deepEqual(row,{principal:user,session:user});
 const fixture={borrowerId:'4A-ACT-B-B',chargeIds:['4A-ACT-B-C1','4A-ACT-B-C2'],cashAccountIds:['4A-RECEIVE']}; const store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,fixture});
 const draft=await store.draft({ok:true,email:OWNER_EMAIL,subject:'synthetic-owner'},fixture.borrowerId);assert.equal(draft.status,200,JSON.stringify(draft));assert.equal(draft.charges.reduce((n,c)=>n+BigInt(c.amountRemaining),0n),330n);const day=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
 const command={schemaVersion:3,requestId:randomUUID(),borrowerId:'4A-ACT-B-B',selectedChargeIds:['4A-ACT-B-C1','4A-ACT-B-C2'],cashAccountId:'4A-RECEIVE',paymentDate:day,amountReceived:'330',paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:null,receiptId:null};
 const principal={ok:true,email:OWNER_EMAIL,subject:'synthetic-owner'};assert.equal((await store.submit(principal,{...command,requestId:randomUUID(),borrowerId:'not-fixture'})).status,403);const result=await store.submit(principal,command);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.originalOutcome.status,'posted');assert.deepEqual(await store.status(principal,command.requestId),result);const changedFixtureStore=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,fixture:{...fixture,borrowerId:'another'}});assert.deepEqual(await changedFixtureStore.submit(principal,command),result);
 for(const sql of ['DELETE FROM pwa_payment_commands','TRUNCATE pwa_payment_commands','UPDATE pwa_payment_commands SET outcome=outcome','SET ROLE mw_app_dev_journal_owner'])await assert.rejects(app.query(sql),e=>e.code==='42501');
 assert.throws(()=>createApplicationRoleCommandStore({pool:app,targetAttestation:{...proof}}));
});
