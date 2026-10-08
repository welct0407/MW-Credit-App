import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {OWNER_EMAIL} from '../../services/api/dev-read-config.mjs';

// Maintained runner hook: call only against attested disposable V82 BEFORE applying V83.
// Caller owns actual application LOGIN, provisioning, exact migration and restoration lifecycle.
export async function seedPopulatedJournal82({adminPool,applicationPool,targetAttestation,outputPath}){
 const version=(await adminPool.query('SELECT max(version::int)::int AS v FROM flyway_schema_history WHERE success')).rows[0].v;assert.equal(version,82);
 const role=(await applicationPool.query('SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.equal(role.rolsuper,false);assert.equal(role.rolbypassrls,false);
 const principal={ok:true,email:OWNER_EMAIL,subject:'phase5-populated82-owner'},store=createApplicationRoleCommandStore({pool:applicationPool,targetAttestation,ownerTesting:true}),cases=[];
 for(const schemaVersion of [3,4,5,6]){
  const fixture=await seedPaymentFixture(adminPool,'C-UPGRADE82-V'+schemaVersion);await adminPool.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
  const draft=await store.draft(principal,fixture.borrowerId,{scope:'all'});assert.equal(draft.status,200,JSON.stringify(draft));const selected=fixture.chargeIds.slice(0,2);const rows=selected.map(id=>draft.charges.find(row=>row.id===id));assert.ok(rows.every(Boolean));
  const common={schemaVersion,requestId:randomUUID(),borrowerId:fixture.borrowerId,cashAccountId:fixture.receivingAccountId,paymentDate:draft.businessDate,amountReceived:'330',paymentMethod:schemaVersion>=5?'Cash':'Bank Transfer',notes:'V82 populated compatibility ไทย\nexact bytes',receiptId:null};
  const command=schemaVersion===6?{...common,allocations:rows.map(row=>({chargeId:row.id,principal:row.principalRemaining,interest:row.interestRemaining,expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate}))}:{...common,selectedChargeIds:selected,allocationMethod:'Selected Charges'};
  const posted=await store.submit(principal,command);assert.equal(posted.status,200,JSON.stringify(posted));assert.equal(posted.originalOutcome.status,'posted');
  // A distinct date-invalid request avoids changing any source after the posted fixture.
  const rejectedCommand={...command,requestId:randomUUID(),paymentDate:'9999-12-31'};const rejected=await store.submit(principal,rejectedCommand);assert.equal(rejected.status,422,JSON.stringify(rejected));assert.equal(rejected.originalOutcome.status,'rejected');assert.equal(rejected.originalOutcome.code,'invalid_date');
  for(const [input,submitResult] of [[command,posted],[rejectedCommand,rejected]]){
   const journal=(await adminPool.query('SELECT to_jsonb(j) AS row FROM pwa_payment_commands j WHERE request_id=$1',[input.requestId])).rows[0].row;
   const statusResult=await store.status(principal,input.requestId);assert.equal(statusResult.status,200);
   const paymentId=submitResult.originalOutcome.paymentId;const effects=paymentId?(await adminPool.query(`SELECT jsonb_build_object('payment',(SELECT to_jsonb(p) FROM "Payments" p WHERE "Row ID"=$1),'allocations',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY "Row ID"),'[]') FROM "Payment Allocations" a WHERE "Ref Payment"=$1),'repayments',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY "Row ID"),'[]') FROM "Repayments" r WHERE "Ref Payment"=$1),'cash',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY "Row ID"),'[]') FROM "Cash Ledger" c WHERE "Ref Payment"=$1)) AS value`,[paymentId])).rows[0].value:null;
   cases.push({schemaVersion,input,submitResult,statusResult,journal,effects});
  }
 }
 const snapshot={format:'populated-v82-compatibility-v1',principal,runtimeUser:role.name,cases};assert.equal(cases.length,8);if(outputPath)writeFileSync(outputPath,JSON.stringify(snapshot,null,2)+'\n');return snapshot;
}

export async function verifyPopulatedJournalAfter83({adminPool,applicationPool,targetAttestation,snapshot}){
 assert.equal(snapshot.format,'populated-v82-compatibility-v1');const store=createApplicationRoleCommandStore({pool:applicationPool,targetAttestation,ownerTesting:true});
 for(const entry of snapshot.cases){const after=(await adminPool.query('SELECT to_jsonb(j)-\'result_json\' AS row,result_json FROM pwa_payment_commands j WHERE request_id=$1',[entry.input.requestId])).rows[0];assert.deepEqual(after.row,entry.journal);assert.equal(after.result_json,null);assert.deepEqual(await store.status(snapshot.principal,entry.input.requestId),entry.statusResult);assert.deepEqual(await store.submit(snapshot.principal,entry.input),entry.submitResult);
  if(entry.effects){const effects=(await adminPool.query(`SELECT jsonb_build_object('payment',(SELECT to_jsonb(p) FROM "Payments" p WHERE "Row ID"=$1),'allocations',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY "Row ID"),'[]') FROM "Payment Allocations" a WHERE "Ref Payment"=$1),'repayments',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY "Row ID"),'[]') FROM "Repayments" r WHERE "Ref Payment"=$1),'cash',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY "Row ID"),'[]') FROM "Cash Ledger" c WHERE "Ref Payment"=$1)) AS value`,[entry.submitResult.originalOutcome.paymentId])).rows[0].value;assert.deepEqual(effects,entry.effects)}
 }
 return {schemas:[3,4,5,6],posted:4,rejected:4,rowsCompared:8};
}

// CLI adapter for the existing owned-cluster runner; never accepts a DSN or live credentials.
if(process.argv[2]==='seed'||process.argv[2]==='verify'){
 const {resolve,dirname}=await import('node:path');const {readFileSync}=await import('node:fs');const {default:pg}=await import('pg');const {disposablePool}=await import('../../scripts/rehearsal/disposable-pool.mjs');const {attestDisposableApplicationTarget}=await import('../../services/payment-command/application-target.mjs');const {planApplicationRole,reconcileApplicationRole}=await import('../../scripts/database/app-role-policy.mjs');
 const phase=process.argv[2],expectedVersion=phase==='seed'?82:83,runtimeUser='mw_app_dev_populated82_fixture';
 const outputPath=process.env.PHASE5_POPULATED_JOURNAL_SNAPSHOT;assert.ok(outputPath);assert.equal(dirname(resolve(outputPath)),dirname(resolve(process.env.PAYMENT_REHEARSAL_DIRECTORY)));
 const adminPool=await disposablePool(expectedVersion);let applicationPool;
 try{
  if(phase==='seed'){await adminPool.query(`CREATE ROLE ${runtimeUser} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await adminPool.query(`GRANT mw_app_dev TO ${runtimeUser}`);const client=await adminPool.connect();try{const plan=await planApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{client.release()}}
  applicationPool=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user:runtimeUser,password:'',max:2});
  const targetAttestation=await attestDisposableApplicationTarget({adminPool,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser,expectedVersion});
  if(phase==='seed'){await seedPopulatedJournal82({adminPool,applicationPool,targetAttestation,outputPath});process.stdout.write('Populated V82:4 posted +4 rejected, schemas3–6; synthetic snapshot saved under owned TEMP.\n')}
  else{const result=await verifyPopulatedJournalAfter83({adminPool,applicationPool,targetAttestation,snapshot:JSON.parse(readFileSync(outputPath,'utf8'))});process.stdout.write(JSON.stringify(result)+'\n')}
 }finally{await applicationPool?.end();await adminPool.end()}
}
