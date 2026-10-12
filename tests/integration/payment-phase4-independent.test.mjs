import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {canonicalCommand,commandIdentity} from '../../services/contracts/payment-command.mjs';
import {OWNER_EMAIL,DEV_PROJECT} from '../../services/api/dev-read-config.mjs';
let admin,app,proof,store;const user='mw_app_dev_phase4_independent';
const principal={ok:true,email:OWNER_EMAIL,subject:'independent-owner'};
before(async()=>{
 admin=await disposablePool(81);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const client=await admin.connect();try{const plan=await planApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{client.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:3});
 proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:81});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
});
after(async()=>{await app?.end();await admin?.end()});
async function seed(prefix){await seedPaymentFixture(admin,prefix);await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'',[OWNER_EMAIL]);return prefix+'-B'}
function command(borrowerId,ids,total,day,method='Selected Charges'){return {schemaVersion:4,requestId:randomUUID(),borrowerId,selectedChargeIds:ids,cashAccountId:'4A-RECEIVE',paymentDate:day,amountReceived:total,paymentMethod:'Bank Transfer',allocationMethod:method,notes:'ไทย\nindependent 🧪',receiptId:null}}
test('P4-01 normal borrower accepted; synthetic scope and different owner deny',async()=>{
 const id=await seed('4C-SCOPE');assert.equal((await store.draft(principal,id)).status,200);
 assert.equal((await store.draft({...principal,email:'other@example.invalid'},id)).status,403);
 const restricted=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,fixture:{borrowerId:'different',chargeIds:[],cashAccountIds:[]}});
 assert.equal((await restricted.draft(principal,id)).status,403);
});
test('P4-02 101+ paging, cross-borrower cursor, all due set and future Single Full',async()=>{
 const id=await seed('4C-PAGING');
 await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") SELECT '4C-PAGING-X'||lpad(n::text,3,'0'),'4C-PAGING-L1',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-4,0::money,1::money FROM generate_series(1,101)n`);
 let page=await store.draft(principal,id),seen=[];const first=page.nextCursor;
 while(page.ok){seen.push(...page.charges.map(x=>x.id));if(!page.nextCursor)break;page=await store.draft(principal,id,{cursor:page.nextCursor})}
 assert.equal(seen.length,104);assert.equal(new Set(seen).size,104);
 assert.equal((await store.draft(principal,'4C-PAGING-OTHER',{cursor:first})).status,400);
 const decoded=JSON.parse(Buffer.from(first,'base64url'));decoded.businessDate='2000-01-01';
 assert.equal((await store.draft(principal,id,{cursor:Buffer.from(JSON.stringify(decoded)).toString('base64url')})).status,409);
 const all=await store.selectAll(principal,id,{});assert.equal(all.charges.length,104);assert.equal(all.total,'486');
 const review=await store.review(principal,id,{selectedChargeIds:seen});assert.equal(review.charges.length,104);
 assert.equal((await store.review(principal,id,{selectedChargeIds:['4C-PAGING-FUTURE']})).status,409);
 const future=await store.review(principal,id,{selectedChargeIds:['4C-PAGING-FUTURE'],allocationMethod:'Single Full'});assert.equal(future.total,'10');
 const cmd=command(id,['4C-PAGING-FUTURE'],'10',future.businessDate,'Single Full');assert.equal((await store.submit(principal,cmd)).status,200);
 assert.equal((await store.result(principal,cmd.requestId)).currentSource,'present');
 const large=command(id,seen,all.total,all.businessDate,'Receive All');const started=performance.now();const largePost=await store.submit(principal,large);assert.equal(largePost.status,200,JSON.stringify(largePost));const largeResult=await store.result(principal,large.requestId);assert.equal(largeResult.allocations.length,104);assert.equal(largeResult.repayments.length,104);assert.equal(largeResult.currentSource,'present');console.log('Independent104-row post ms',Math.round(performance.now()-started));
});
test('P4-02 v3 count compatibility, v4 count and complete envelope limits',()=>{
 const base=command('synthetic',Array.from({length:101},(_,i)=>'id'+i),'101','2026-10-08');
 assert.equal(canonicalCommand(base).selectedChargeIds.length,101);assert.throws(()=>canonicalCommand({...base,schemaVersion:3}));
 assert.throws(()=>canonicalCommand({...base,selectedChargeIds:Array.from({length:10001},(_,i)=>'id'+i)}));
 const tenK={...base,selectedChargeIds:Array.from({length:10000},(_,i)=>'id'+i)};assert.equal(canonicalCommand(tenK).selectedChargeIds.length,10000);
 const actor={issuer:`https://securetoken.google.com/${DEV_PROJECT}`,subject:'independent-owner',partnerId:'4A-ACTOR',loginEmail:OWNER_EMAIL};
 assert.throws(()=>commandIdentity({...tenK,selectedChargeIds:tenK.selectedChargeIds.map(x=>x+'x'.repeat(100))},actor,null));
});
test('P4-04/05/07 posted effects, exact replay, notes-only legacy preservation and CAS conflict',async()=>{
 const id=await seed('4C-META');const ids=['4C-META-C1','4C-META-C2'];const review=await store.review(principal,id,{selectedChargeIds:ids});const cmd=command(id,ids,'330',review.businessDate);
 const posted=await store.submit(principal,cmd);assert.equal(posted.status,200,JSON.stringify(posted));
 const result=await store.result(principal,cmd.requestId);assert.equal(result.currentSource,'present');assert.equal(result.allocations.length,2);assert.equal(result.repayments.length,2);assert.equal(result.cashMovements.length,1);
 assert.equal(result.allocations.reduce((n,x)=>n+Number(x.amount),0),330);assert.deepEqual(await store.submit(principal,cmd),posted);
 assert.equal((await store.submit(principal,{...cmd,notes:'altered'})).status,409);
 await admin.query('UPDATE "Payments" SET "Uploaded Receipt"=$2 WHERE "Row ID"=$1',[posted.originalOutcome.paymentId,'legacy/manual.png']);
 const legacy=await store.result(principal,cmd.requestId);const changed=await store.metadata(principal,cmd.requestId,{expectedVersion:legacy.payment.version,notes:'ใหม่\nline'});
 assert.equal(changed.status,200,JSON.stringify(changed));assert.equal(changed.payment.receiptReference,'legacy/manual.png');assert.equal(changed.payment.receiptAt,legacy.payment.receiptAt);
 assert.deepEqual(changed.allocations,result.allocations);assert.deepEqual(changed.repayments,result.repayments);assert.deepEqual(changed.cashMovements,result.cashMovements);assert.deepEqual(changed.originalCommand,cmd);
 assert.equal((await store.metadata(principal,cmd.requestId,{expectedVersion:legacy.payment.version,notes:'competing'})).status,409);
 const removed=await store.metadata(principal,cmd.requestId,{expectedVersion:changed.payment.version,notes:'ใหม่\nline',receiptId:null});assert.equal(removed.payment.receiptReference,null);assert.equal(removed.payment.receiptAt,null);
 assert.equal((await store.history(principal,id)).items[0].notes,'ใหม่\nline');
});
test('P4-02 Receive All rejects changed same-total membership then posts complete set',async()=>{
 const id=await seed('4C-ALL');const all=await store.selectAll(principal,id,{});const cmd=command(id,all.charges.map(x=>x.id),all.total,all.businessDate,'Receive All');
 await admin.query('UPDATE "Charges" SET "Charge Date"=(CURRENT_TIMESTAMP AT TIME ZONE \'Asia/Bangkok\')::date+1 WHERE "Row ID"=\'4C-ALL-UNSELECTED\'');
 await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('4C-ALL-REPLACEMENT','4C-ALL-L1',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,50::money,5::money)`);
 const reject=await store.submit(principal,cmd);assert.equal(reject.status,422);assert.equal(reject.originalOutcome.code,'selection_unavailable');
 const fresh=await store.selectAll(principal,id,{});assert.equal(fresh.total,all.total);
 const accepted=command(id,fresh.charges.map(x=>x.id),fresh.total,fresh.businessDate,'Receive All');assert.equal((await store.submit(principal,accepted)).status,200);
 assert.equal((await store.result(principal,accepted.requestId)).currentSource,'present');
});


test('P4-03 current review changes; P4-06 current source changed stays distinct from original; P4-14 actor audit',async()=>{
 const id=await seed('4C-REFRESH'),ids=['4C-REFRESH-C1'];const initial=await store.review(principal,id,{selectedChargeIds:ids});assert.equal(initial.total,'110');
 await admin.query('UPDATE "Charges" SET "Charge Date"=(CURRENT_TIMESTAMP AT TIME ZONE \'Asia/Bangkok\')::date+1 WHERE "Row ID"=$1',[ids[0]]);assert.equal((await store.review(principal,id,{selectedChargeIds:ids})).status,409);
 await admin.query('UPDATE "Charges" SET "Charge Date"=(CURRENT_TIMESTAMP AT TIME ZONE \'Asia/Bangkok\')::date WHERE "Row ID"=$1',[ids[0]]);
 await admin.query('UPDATE "Cash Accounts" SET "Active"=false,"Default Account"=false WHERE "Row ID"=\'4A-RECEIVE\'');const noAccount=await store.review(principal,id,{selectedChargeIds:ids});assert.ok(!noAccount.accounts.some(x=>x.id==='4A-RECEIVE'));await admin.query('UPDATE "Cash Accounts" SET "Active"=true WHERE "Row ID"=\'4A-RECEIVE\'');
 const fresh=await store.review(principal,id,{selectedChargeIds:ids}),cmd=command(id,ids,fresh.total,fresh.businessDate,'Single Full');const posted=await store.submit(principal,cmd);assert.equal(posted.status,200);
 const original=(await admin.query('SELECT canonical_json,payload_sha256,outcome,actor_partner_id,actor_login_email FROM pwa_payment_commands WHERE request_id=$1',[cmd.requestId])).rows[0];assert.equal(original.actor_partner_id,'4A-ACTOR');assert.equal(original.actor_login_email,OWNER_EMAIL);
 assert.equal((await admin.query('SELECT "Created By" AS actor FROM "Payments" WHERE "Row ID"=$1',[posted.originalOutcome.paymentId])).rows[0].actor,OWNER_EMAIL);
 await admin.query('UPDATE "Payments" SET "Payment Date"="Payment Date"-1 WHERE "Row ID"=$1',[posted.originalOutcome.paymentId]);const changed=await store.result(principal,cmd.requestId);assert.equal(changed.originalOutcome.status,'posted');assert.equal(changed.currentSource,'changed');assert.equal((await store.metadata(principal,cmd.requestId,{expectedVersion:changed.payment.version,notes:'forbidden'})).status,409);
 assert.deepEqual((await admin.query('SELECT canonical_json,payload_sha256,outcome,actor_partner_id,actor_login_email FROM pwa_payment_commands WHERE request_id=$1',[cmd.requestId])).rows[0],original);
 assert.equal((await store.result({...principal,subject:'another-subject'},cmd.requestId)).status,404);
});

