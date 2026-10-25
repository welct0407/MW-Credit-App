import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {commandIdentity} from '../../services/contracts/payment-command.mjs';
import {OWNER_EMAIL,PROJECT_ID} from '../../services/lib/identity.mjs';
import {migrationHead} from '../migration-head.mjs';
// R101 V112: pay the next charge early, through the real application role (DEV capability policy), the draft and
// review reads, the v9 command and the offline dataset, on the migration head. Synthetic data only.
let admin,app,proof,store,fixtureStore,fixture,today;const user='mw_app_dev_r101_fixture';
const principal={ok:true,email:OWNER_EMAIL,subject:'r101-projected-owner'};
const actor=()=>({issuer:`https://securetoken.google.com/${PROJECT_ID}`,subject:principal.subject,partnerId:fixture.actorId,loginEmail:OWNER_EMAIL});
const day=offset=>(admin.query("SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+$1::integer)::text AS day",[offset])).then(r=>r.rows[0].day);
const key=(loan,date)=>'cg8:'+Array.from(loan).length+':'+loan+':'+date;
before(async()=>{
 const head=migrationHead();
 admin=await disposablePool(head);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:3});
 proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:head});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 fixture=await seedPaymentFixture(admin,'R101-PAY');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 fixtureStore=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,fixture:{borrowerId:fixture.borrowerId,cashAccountIds:[fixture.receivingAccountId],chargeIds:[...fixture.chargeIds]}});
 today=await day(0);
 // Two automatic daily-interest loans of the fixture borrower: next charge four days ahead, 7 days at 10 a day.
 await admin.query(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval")
  SELECT id,$1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,7 FROM unnest(ARRAY['R101-D1','R101-D2']) id`,[fixture.borrowerId,fixture.lendingAccountId]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('R101-D1','R101-D2')`);
});
after(async()=>{await app?.end();await admin?.end()});

test('upcoming is returned only on the first scope=all page and the review read, never by Auto-assign or scope=due',async()=>{
 const next=await day(4);
 const all=await store.draft(principal,fixture.borrowerId,{scope:'all'});assert.equal(all.status,200,JSON.stringify(all));
 assert.deepEqual(all.upcoming.map(row=>[row.id,row.loanId,row.chargeDate,row.principalRemaining,row.interestRemaining,row.amountRemaining]),
  [[key('R101-D1',next),'R101-D1',next,'0','70','70'],[key('R101-D2',next),'R101-D2',next,'0','70','70']]);
 assert.ok(all.upcoming.every(row=>typeof row.loanDisplayKey==='string'&&row.loanDisplayKey.length>0));
 assert.ok(!all.charges.some(row=>row.id.startsWith('cg8:')),'projected rows are not charges');
 const due=await store.draft(principal,fixture.borrowerId,{scope:'due'});assert.equal(due.upcoming,undefined);
 const assigned=await store.autoAssign(principal,fixture.borrowerId,{amountReceived:'1000'});assert.equal(assigned.status,200,JSON.stringify(assigned));
 assert.ok(!assigned.allocations.some(line=>line.chargeId.startsWith('cg8:')),'Auto-assign never allocates a next charge');
 const selected=await store.selectAll(principal,fixture.borrowerId,{});assert.ok(!selected.charges.some(row=>row.id.startsWith('cg8:')));
});

const projectedLine=(loan,date,interest='70')=>({chargeId:key(loan,date),principal:'0',interest,expectedPrincipalRemaining:'0',expectedInterestRemaining:'70',chargeDate:date});
const entry=(loan,date)=>({loanId:loan,chargeId:key(loan,date),chargeDate:date,principalDue:'0',interestDue:'70'});

test('review accepts materialize, then reports plan_changed once the next charge is booked meanwhile',async()=>{
 const next=await day(4),line=projectedLine('R101-D2',next);
 const reviewed=await store.review(principal,fixture.borrowerId,{amountReceived:'70',allocations:[line],materialize:[entry('R101-D2',next)]});
 assert.equal(reviewed.status,200,JSON.stringify(reviewed));assert.deepEqual(reviewed.materialize,[entry('R101-D2',next)]);
 assert.equal((await store.review(principal,fixture.borrowerId,{amountReceived:'70',allocations:[line],materialize:[{...entry('R101-D2',next),interestDue:'60'}]})).status,400,'an entry must match its line');
 // Booked meanwhile (the generator, as the jobs worker or another payment would): no longer projected, now a charge.
 assert.equal((await admin.query('SELECT public.generate_loan_charge($1,$2::date) AS id',['R101-D2',next])).rows[0].id,key('R101-D2',next));
 const changed=await store.review(principal,fixture.borrowerId,{amountReceived:'70',allocations:[line],materialize:[entry('R101-D2',next)]});
 assert.equal(changed.status,409);assert.equal(changed.code,'plan_changed');
 assert.ok(changed.charges.some(row=>row.id===key('R101-D2',next)),'the booked charge comes back as a charge');
 assert.ok(!changed.upcoming.some(row=>row.loanId==='R101-D2'),'and leaves upcoming');
 // The same line without materialize now reviews as an ordinary charge.
 assert.equal((await store.review(principal,fixture.borrowerId,{amountReceived:'70',allocations:[line]})).status,200);
});

test('a v9 command books and pays the next charge; replay is idempotent; the synthetic fixture route denies v9',async()=>{
 const next=await day(4);
 const command={schemaVersion:9,requestId:randomUUID(),borrowerId:fixture.borrowerId,allocations:[projectedLine('R101-D1',next,'50')],cashAccountId:fixture.receivingAccountId,paymentDate:today,amountReceived:'50',paymentMethod:'Bank Transfer',notes:null,receiptId:null,bankReference:null,transferTime:null,payerLines:null,materialize:[entry('R101-D1',next)]};
 assert.equal((await fixtureStore.submit(principal,{...command,requestId:randomUUID()})).status,403,'fixture mode never books a projected charge');
 const posted=await store.submit(principal,command);assert.equal(posted.status,200,JSON.stringify(posted));assert.equal(posted.originalOutcome.status,'posted',JSON.stringify(posted));
 const journal=(await admin.query('SELECT canonical_json FROM pwa_payment_commands WHERE request_id=$1',[command.requestId])).rows[0].canonical_json;
 assert.equal(journal,commandIdentity(command,actor(),null).canonicalJson);
 const charge=(await admin.query(`SELECT "Principal Due"::numeric::text AS p,"Interest Due"::numeric::text AS i,"Charge Date"::text AS d FROM "Charges" WHERE "Row ID"=$1`,[key('R101-D1',next)])).rows[0];
 assert.deepEqual(charge,{p:'0.00',i:'70.00',d:next});
 const paid=(await admin.query(`SELECT sum("Interest Paid"::numeric)::text AS paid FROM "Repayments" WHERE "Ref Payment"=$1 AND "Ref Charges"=$2`,[posted.originalOutcome.paymentId,key('R101-D1',next)])).rows[0].paid;
 assert.equal(paid,'50.00');
 assert.deepEqual(await store.submit(principal,command),posted);
 const after=await store.draft(principal,fixture.borrowerId,{scope:'all'});assert.ok(!after.upcoming.length,'one charge ahead per loan: nothing more is offered');
 const result=await store.result(principal,command.requestId);assert.equal(result.currentSource,'present',JSON.stringify(result));
});

test('the offline dataset carries upcoming with the first scope=all payment draft',async()=>{
 await admin.query('INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval") VALUES(\'R101-D3\',$1,$2,(CURRENT_TIMESTAMP AT TIME ZONE \'Asia/Bangkok\')::date-3,1000::money,\'ยังไม่ปิดยอด\',\'ดอกเบี้ยรายวัน\',false,10::money,7)',[fixture.borrowerId,fixture.lendingAccountId]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='R101-D3'`);
 const id=key('R101-D3',await day(4));let cursor=null,found=false;
 for(let index=0;index<500&&!found;index++){
  const chunk=await store.offlineDataset(principal,'records',undefined,{protocol:2,cursor});assert.equal(chunk.status,200,JSON.stringify(chunk).slice(0,500));
  found=JSON.stringify(chunk.patches).includes('"upcoming"')&&JSON.stringify(chunk.patches).includes(id);
  cursor=chunk.nextCursor;if(!cursor)break;
 }
 assert.ok(found,'a paymentDrafts patch carries the next charge');
});
