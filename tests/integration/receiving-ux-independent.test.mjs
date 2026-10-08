import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {canonicalCommand} from '../../services/contracts/payment-command.mjs';
import {OWNER_EMAIL} from '../../services/api/dev-read-config.mjs';
let admin,app,store;const runtimeUser='mw_app_dev_receiving_ux_independent';
const principal={ok:true,email:OWNER_EMAIL,subject:'receiving-ux-independent-owner'};
before(async()=>{
 admin=await disposablePool(81);await admin.query(`CREATE ROLE ${runtimeUser} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${runtimeUser}`);
 const client=await admin.connect();try{const plan=await planApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{client.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user:runtimeUser,password:'',max:3});
 const proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser,expectedVersion:81});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
});
after(async()=>{await app?.end();await admin?.end()});
async function seed(prefix){await seedPaymentFixture(admin,prefix);await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'',[OWNER_EMAIL]);return prefix+'-B'}
function command(borrowerId,ids,total,day,tender='Bank Transfer',allocation='Selected Charges',version=5){return {schemaVersion:version,requestId:randomUUID(),borrowerId,selectedChargeIds:ids,cashAccountId:'4A-RECEIVE',paymentDate:day,amountReceived:total,paymentMethod:tender,allocationMethod:allocation,notes:'UX ไทย\nindependent tender',receiptId:null}}
for(const [index,tender] of ['Bank Transfer','Cash','Net-off at Disbursement'].entries())for(const [allocation,suffixes,total] of [['Selected Charges',['C1','C2'],'330'],['Single Full',['FUTURE'],'10']]){
 test(`UX4 actual SQL ${tender} / ${allocation} preserves governed effects`,async()=>{
  const prefix=`UXC-T${index}-${allocation==='Single Full'?'F':'D'}`,borrower=await seed(prefix),ids=suffixes.map(x=>prefix+'-'+x);
  const review=await store.review(principal,borrower,{selectedChargeIds:ids,allocationMethod:allocation});assert.equal(review.status,200,JSON.stringify(review));assert.equal(review.total,total);
  const cmd=command(borrower,ids,total,review.businessDate,tender,allocation),posted=await store.submit(principal,cmd);assert.equal(posted.status,200,JSON.stringify(posted));assert.equal(posted.originalOutcome.status,'posted');
  const result=await store.result(principal,cmd.requestId);assert.equal(result.currentSource,'present');assert.equal(result.payment.paymentMethod,tender);assert.equal(result.payment.allocationMethod,allocation);assert.equal(Number(result.payment.postedAmount),Number(total));assert.deepEqual(result.originalCommand,canonicalCommand(cmd));
  assert.equal(result.allocations.length,ids.length);assert.equal(result.allocations.reduce((sum,x)=>sum+Number(x.amount),0),Number(total));assert.deepEqual(result.allocations.map(x=>x.chargeId).sort(),ids.sort());
  assert.equal(result.repayments.length,ids.length);assert.equal(result.repayments.reduce((sum,x)=>sum+Number(x.principal)+Number(x.interest),0),Number(total));
  assert.equal(result.cashMovements.length,1);assert.equal(result.cashMovements[0].movementType,'Payment Receipt');assert.equal(Number(result.cashMovements[0].amount),Number(total));assert.equal(result.cashMovements[0].toAccount,'Synthetic receiving account');
  assert.deepEqual(await store.submit(principal,cmd),posted);assert.equal((await store.submit(principal,{...cmd,paymentMethod:tender==='Cash'?'Bank Transfer':'Cash'})).status,409);
  const counts=(await admin.query('SELECT (SELECT count(*) FROM "Payments" WHERE "Row ID"=$1)::int AS payments,(SELECT count(*) FROM "Cash Ledger" WHERE "Ref Payment"=$1)::int AS cash',[posted.originalOutcome.paymentId])).rows[0];assert.deepEqual(counts,{payments:1,cash:1});
 });
}
test('UX5 existing v3/v4 canonical Bank Transfer and invalid v5 tender boundaries',async()=>{
 for(const version of [3,4]){const prefix='UXC-OLD'+version,borrower=await seed(prefix),review=await store.review(principal,borrower,{selectedChargeIds:[prefix+'-C1',prefix+'-C2']});const cmd=command(borrower,[prefix+'-C1',prefix+'-C2'],'330',review.businessDate,'Bank Transfer','Selected Charges',version);const posted=await store.submit(principal,cmd);assert.equal(posted.status,200,JSON.stringify(posted));assert.deepEqual(await store.submit(principal,cmd),posted);assert.throws(()=>canonicalCommand({...cmd,paymentMethod:'Cash'}));assert.throws(()=>canonicalCommand({...cmd,paymentMethod:'Net-off at Disbursement'}));}
 const cmd=command('synthetic',['charge'],'1','2026-10-08');for(const invalid of ['cash','Netoff','Card','',null])assert.throws(()=>canonicalCommand({...cmd,paymentMethod:invalid}));
});
test('UX2 all-scope stable paging includes future but master selection remains due only',async()=>{
 const prefix='UXC-PAGE',borrower=await seed(prefix);await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") SELECT 'UXC-PAGE-X'||lpad(n::text,3,'0'),'UXC-PAGE-L1',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,0::money,1::money FROM generate_series(1,30)n`);
 let page=await store.draft(principal,borrower,{scope:'all'}),seen=[];const cursor=page.nextCursor;assert.ok(cursor);while(page.ok){seen.push(...page.charges);if(!page.nextCursor)break;page=await store.draft(principal,borrower,{scope:'all',cursor:page.nextCursor})}assert.equal(seen.length,34);assert.equal(new Set(seen.map(x=>x.id)).size,34);assert.equal(seen.at(-1).id,prefix+'-FUTURE');
 const master=await store.selectAll(principal,borrower,{});assert.equal(master.charges.length,33);assert.ok(!master.charges.some(x=>x.id===prefix+'-FUTURE'));assert.equal(master.total,'415');
 assert.equal((await store.draft(principal,borrower,{scope:'due',cursor})).status,400);
 assert.equal((await store.review(principal,borrower,{selectedChargeIds:[prefix+'-C1',prefix+'-FUTURE'],allocationMethod:'Selected Charges'})).status,409);
});

