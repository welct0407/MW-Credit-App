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
let admin,app,proof;const user='mw_app_dev_b_fixture';
before(async()=>{
 admin=await disposablePool(79);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const client=await admin.connect();try{const plan=await planApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{client.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:2});
 proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user});
});
after(async()=>{await app?.end();await admin?.end()});
test('true application login posts via guarded definer while direct journal writes fail',async()=>{
 await seedPaymentFixture(admin,'4A-ROLE-B');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'',[OWNER_EMAIL]);
 const row=(await app.query('SELECT current_user AS principal,session_user AS session')).rows[0];assert.deepEqual(row,{principal:user,session:user});
 const store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof});const day=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
 const command={schemaVersion:3,requestId:randomUUID(),borrowerId:'4A-ROLE-B-B',selectedChargeIds:['4A-ROLE-B-C1','4A-ROLE-B-C2'],cashAccountId:'4A-RECEIVE',paymentDate:day,amountReceived:'330',paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:null,receiptId:null};
 const principal={ok:true,email:OWNER_EMAIL,subject:'synthetic-owner'};const result=await store.submit(principal,command);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.originalOutcome.status,'posted');assert.deepEqual(await store.status(principal,command.requestId),result);
 for(const sql of ['DELETE FROM pwa_payment_commands','TRUNCATE pwa_payment_commands','UPDATE pwa_payment_commands SET outcome=outcome','SET ROLE mw_app_dev_journal_owner'])await assert.rejects(app.query(sql),e=>e.code==='42501');
 assert.throws(()=>createApplicationRoleCommandStore({pool:app,targetAttestation:{...proof}}));
});
test('future ordinary objects reconcile without policy edit; tagged governance stays private',async()=>{
 await admin.query('CREATE TABLE public.future_b_demo(id integer, value text); CREATE VIEW public.future_b_view AS SELECT * FROM public.future_b_demo; CREATE SEQUENCE public.future_b_seq');
 await admin.query("CREATE FUNCTION public.future_b_echo(v text) RETURNS text LANGUAGE sql AS 'SELECT v'; CREATE TABLE public.secret_b_demo(id integer); CREATE TABLE public.future_b_governance(id integer); COMMENT ON TABLE public.future_b_governance IS 'mw-access:governance journal'");
 await assert.rejects(app.query('SELECT * FROM future_b_demo'),e=>e.code==='42501');
 const client=await admin.connect();try{await reconcileApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{client.release()}
 await app.query("INSERT INTO future_b_demo VALUES(1,'ok')");assert.equal((await app.query('SELECT * FROM future_b_view')).rows[0].value,'ok');assert.equal((await app.query("SELECT future_b_echo('ok') AS v")).rows[0].v,'ok');await app.query("SELECT nextval('future_b_seq')");
 for(const table of ['secret_b_demo','future_b_governance','flyway_schema_history'])await assert.rejects(app.query(`SELECT * FROM ${table}`),e=>e.code==='42501');
 await assert.rejects(app.query('CREATE TABLE public.forbidden_b(id integer)'),e=>e.code==='42501');await assert.rejects(app.query('TRUNCATE future_b_demo'),e=>e.code==='42501');
});
