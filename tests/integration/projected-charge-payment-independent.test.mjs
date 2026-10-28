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

test('V113: after a deleted early payment Loan Close bills only the days up to today on the booked charge',async()=>{
 await admin.query('INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval") VALUES(\'R101-D4\',$1,$2,(CURRENT_TIMESTAMP AT TIME ZONE \'Asia/Bangkok\')::date-3,1000::money,\'ยังไม่ปิดยอด\',\'ดอกเบี้ยรายวัน\',false,10::money,7)',[fixture.borrowerId,fixture.lendingAccountId]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='R101-D4'`);
 const next=await day(4),f1=key('R101-D4',next);
 const command={schemaVersion:9,requestId:randomUUID(),borrowerId:fixture.borrowerId,allocations:[projectedLine('R101-D4',next,'40')],cashAccountId:fixture.receivingAccountId,paymentDate:today,amountReceived:'40',paymentMethod:'Bank Transfer',notes:null,receiptId:null,bankReference:null,transferTime:null,payerLines:null,materialize:[entry('R101-D4',next)]};
 const posted=await store.submit(principal,command);assert.equal(posted.originalOutcome?.status,'posted',JSON.stringify(posted));
 const record=(await store.paymentRecord(principal,posted.originalOutcome.paymentId,{preview:true})).item;
 const deleted=await store.operation(principal,{requestId:randomUUID(),operation:'payment.delete',targetId:posted.originalOutcome.paymentId,expectedVersion:record.sourceVersion,predecessorRequestId:record.predecessorRequestId,receiptId:null,inputs:{}});
 assert.equal(deleted.originalOutcome?.status,'applied',JSON.stringify(deleted));
 assert.deepEqual((await admin.query('SELECT "Interest Due"::numeric::text AS i FROM "Charges" WHERE "Row ID"=$1',[f1])).rows[0],{i:'70.00'},'the booked charge stays after the payment is deleted');
 const preview=await store.loanClosePreview(principal,'R101-D4');assert.equal(preview.status,200,JSON.stringify(preview));
 assert.equal(preview.amount,'1030','principal plus the three days up to today, not the booked charge in full');
 assert.deepEqual([preview.principalAmount,preview.interestAmount],['1000.00','30.00']);
 assert.deepEqual(preview.plan.allocations.find(line=>line.chargeId===f1),{chargeId:f1,principal:'0',interest:'30',expectedPrincipalRemaining:'0',expectedInterestRemaining:'30',chargeDate:next});
 const client=await app.connect();try{
  await client.query('BEGIN');
  const value=(await client.query('SELECT public.loan_close_calculation_v83($1,$2) AS value',['R101-D4',today])).rows[0].value;
  assert.equal(value.planHash,preview.planHash);assert.deepEqual(value.mutation.futureInterest,[{chargeId:f1,interestDue:'30'}]);
  await client.query('SELECT public.apply_loan_close_calculation_v83($1,$2,$3)',['R101-D4',today,preview.planHash]);
  const second=(await client.query('SELECT public.apply_loan_close_calculation_v83($1,$2,NULL) AS value',['R101-D4',today])).rows[0].value;
  assert.equal(second.amount,preview.amount);assert.equal(second.mutation,null);
  await client.query('ROLLBACK');
 }finally{client.release()}
 const close={requestId:randomUUID(),operation:'loan.close',targetId:'R101-D4',expectedVersion:preview.sourceVersion,predecessorRequestId:null,receiptId:null,inputs:{paymentDate:today,cashAccountId:fixture.receivingAccountId,paymentMethod:'Cash',notes:null,expectedAmount:preview.amount,expectedPlanHash:preview.planHash}};
 const applied=await store.operation(principal,close);assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));assert.equal(applied.originalOutcome.result.plan.amountReceived,'1030');
 const charge=(await admin.query('SELECT "Interest Due"::numeric::text AS i,"Notes" AS notes FROM "Charges" WHERE "Row ID"=$1',[f1])).rows[0];
 assert.deepEqual(charge,{i:'30.00',notes:'Interest Due lowered from 70 by Loan Close '+today});
 const loan=(await admin.query('SELECT "Loan Status" AS status FROM "Loans" WHERE "Row ID"=$1',['R101-D4'])).rows[0];assert.equal(loan.status,'ปิดยอดแล้ว');
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM "Charges" c CROSS JOIN LATERAL public.vc_charge_values(c) v WHERE c."Ref Loans"=$1 AND v.remaining<>0',['R101-D4'])).rows[0].n,0,'every charge settled');
});

// R104 V116: loan.book-projected-charge records a loan's next projected charge as an actual charge on its future date,
// through the operation route as the real application role. Drift is recorded as plan_changed (P5B11; the journal CHECK
// has no projection code), a stale loan version as source_conflict, today or earlier as invalid_date.
test('V116: the next projected charge is booked with the generator key and amounts; drift, staleness and dates are refused',async()=>{
 await admin.query(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval")
  VALUES('R104-B1',$1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,7)`,[fixture.borrowerId,fixture.lendingAccountId]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='R104-B1'`);
 const next=await day(4),later=await day(11),version=async()=>(await admin.query('SELECT public.pwa_loan_version_v2($1) AS v',['R104-B1'])).rows[0].v;
 const draft=await store.draft(principal,fixture.borrowerId,{scope:'all'});assert.equal(draft.status,200,JSON.stringify(draft));
 const offer=draft.upcoming.find(row=>row.loanId==='R104-B1');
 assert.deepEqual([offer.id,offer.chargeDate,offer.principalRemaining,offer.interestRemaining,offer.bookVersion],[key('R104-B1',next),next,'0','70',await version()],'the draft offers the next charge with the loan version that books it');
 const book=(inputs,expectedVersion=offer.bookVersion,requestId=randomUUID())=>({requestId,operation:'loan.book-projected-charge',targetId:'R104-B1',expectedVersion,predecessorRequestId:null,receiptId:null,inputs:{chargeDate:next,principalDue:'0',interestDue:'70',...inputs}});
 const rejected=async(command,code)=>{const value=await store.operation(principal,command);assert.equal(value.originalOutcome?.status,'rejected',JSON.stringify(value));assert.equal(value.originalOutcome.code,code,JSON.stringify(value));};
 await rejected(book({chargeDate:later}),'plan_changed');
 await rejected(book({interestDue:'60'}),'plan_changed');
 await rejected(book({},'f'.repeat(64)),'source_conflict');
 await rejected(book({chargeDate:today}),'invalid_date');
 await rejected(book({chargeDate:await day(-1)}),'invalid_date');
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM "Charges" WHERE "Ref Loans"=$1',['R104-B1'])).rows[0].n,0,'a refusal books nothing');
 assert.equal((await store.operation(principal,{...book({}),inputs:{chargeDate:next,principalDue:'0',interestDue:'70',chargeId:key('R104-B1',next)}})).status,400,'the charge id is not an input');
 const command=book({}),applied=await store.operation(principal,command);
 assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));
 assert.deepEqual(applied.originalOutcome.result,{operation:'loan.book-projected-charge',targetType:'loan',targetId:'R104-B1',paymentId:null,plan:null,predecessorRequestId:null,sourceCreatedBy:null});
 const journal=(await admin.query('SELECT canonical_json FROM pwa_payment_commands WHERE request_id=$1',[command.requestId])).rows[0].canonical_json;
 assert.ok(journal.includes('"inputs":{"chargeDate":"'+next+'","principalDue":"0","interestDue":"70"}'),journal);
 assert.deepEqual((await admin.query(`SELECT "Row ID" AS id,"Charge Date"::text AS d,"Principal Due"::numeric::text AS p,"Interest Due"::numeric::text AS i FROM "Charges" WHERE "Ref Loans"=$1`,['R104-B1'])).rows,[{id:key('R104-B1',next),d:next,p:'0.00',i:'70.00'}]);
 assert.deepEqual(await store.operation(principal,command),applied,'the same request replays its recorded outcome');
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM "Charges" WHERE "Ref Loans"=$1',['R104-B1'])).rows[0].n,1,'replay books nothing more');
 const after=await store.draft(principal,fixture.borrowerId,{scope:'all'});assert.ok(!after.upcoming.some(row=>row.loanId==='R104-B1'),'one charge ahead: no further offer');
 await rejected(book({},await version()),'plan_changed');
 // V117 makes the following date (`later`) recordable next; the sequential test below covers it.
});

test('V116: PUBLIC executes neither operation function, and the application user cannot call the loan writer directly',async()=>{
 for(const routine of ['public.pwa_submit_operation_v2(text)','public.pwa_apply_loan_source_v2(text)'])
  assert.equal((await admin.query(`SELECT has_function_privilege('public',$1,'EXECUTE') AS x`,[routine])).rows[0].x,false,routine);
 const owner=(await admin.query(`SELECT pg_get_userbyid(proowner) AS owner,prosecdef FROM pg_proc WHERE oid='public.pwa_submit_operation_v2(text)'::regprocedure`)).rows[0];
 assert.deepEqual(owner,{owner:'mw_app_dev_journal_owner',prosecdef:true},'CREATE OR REPLACE kept the owner and SECURITY DEFINER');
 await assert.rejects(app.query('SELECT public.pwa_apply_loan_source_v2($1)',['{}']),error=>error.code==='42501');
});

// R104 V117: Upcoming Charges records future charges one after another in schedule order (pwa_next_bookable_charge_v1),
// while Pay ahead (`upcoming`, pwa_next_projected_charge_v1) stays one charge ahead. Each booked row equals the offer and
// the generator's arithmetic; skipping a date is plan_changed and a version read before a booking is source_conflict.
test('V117: future charges are recorded in schedule order for daily-interest and installment loans; Pay ahead stays one ahead',async()=>{
 const loans=[['R117-D1','ดอกเบี้ยรายวัน'],['R117-I1','ผ่อนชำระรายวัน']];
 await admin.query(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Due Date","Daily Payment Amount")
  SELECT id,$1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,CASE WHEN kind='ดอกเบี้ยรายวัน' THEN 1000 ELSE 1200 END::money,'ยังไม่ปิดยอด',kind,false,CASE WHEN kind='ดอกเบี้ยรายวัน' THEN 10 END::money,7,
   CASE WHEN kind='ผ่อนชำระรายวัน' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+40 END,CASE WHEN kind='ผ่อนชำระรายวัน' THEN 30 END::money FROM unnest($3::text[],$4::text[]) x(id,kind)`,[fixture.borrowerId,fixture.lendingAccountId,loans.map(l=>l[0]),loans.map(l=>l[1])]);
 // The installment schedule counts from a recorded first charge on the loan date (as its disbursement charge would be).
 await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('R117-I1-first','R117-I1',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,0::money,0::money)`);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" = ANY($1::text[])`,[loans.map(l=>l[0])]);
 const d4=await day(4),d11=await day(11),d18=await day(18);
 // Generator arithmetic: daily interest 10 a day since the latest charge; installment 1200 over 44 days (27 a day, the
 // first 12 days carry one more) at 30 a day.
 const expected={'R117-D1':{[d4]:['0','70'],[d11]:['0','70'],[d18]:['0','70']},'R117-I1':{[d4]:['196','14'],[d11]:['193','17'],[d18]:['189','21']}};
 const offers=async()=>{const draft=await store.draft(principal,fixture.borrowerId,{scope:'all'});assert.equal(draft.status,200,JSON.stringify(draft));return draft};
 const command=(loan,offer,inputs={})=>({requestId:randomUUID(),operation:'loan.book-projected-charge',targetId:loan,expectedVersion:offer.bookVersion,predecessorRequestId:null,receiptId:null,inputs:{chargeDate:offer.chargeDate,principalDue:offer.principalRemaining,interestDue:offer.interestRemaining,...inputs}});
 const outcome=async value=>(await store.operation(principal,value)).originalOutcome;
 for(const [loan] of loans){
  let first=null;
  for(const date of [d4,d11,d18]){
   const draft=await offers(),offer=draft.bookable.find(row=>row.loanId===loan);
   assert.deepEqual([offer?.id,offer?.chargeDate,offer?.principalRemaining,offer?.interestRemaining],[key(loan,date),date,...expected[loan][date]],loan+' offers '+date);
   // Pay ahead: only the first date, and nothing once a future charge is booked.
   assert.deepEqual(draft.upcoming.filter(row=>row.loanId===loan).map(row=>row.chargeDate),date===d4?[d4]:[],loan+' Pay ahead stays one ahead');
   if(date===d11){
    assert.equal((await outcome(command(loan,{...offer,bookVersion:first.bookVersion}))).code,'source_conflict','a version read before the previous booking');
    const skip=await outcome(command(loan,offer,{chargeDate:d18,principalDue:expected[loan][d18][0],interestDue:expected[loan][d18][1]}));
    assert.deepEqual([skip.status,skip.code],['rejected','plan_changed'],'a later date before its turn');
   }
   const booked=await outcome(command(loan,offer));assert.equal(booked?.status,'applied',JSON.stringify(booked));
   const row=(await admin.query(`SELECT "Principal Due"::numeric::text AS p,"Interest Due"::numeric::text AS i FROM "Charges" WHERE "Row ID"=$1 AND "Ref Loans"=$2 AND "Charge Date"=$3::date`,[key(loan,date),loan,date])).rows;
   assert.deepEqual(row,[{p:expected[loan][date][0]+'.00',i:expected[loan][date][1]+'.00'}],loan+' booked row equals the offer and the generator');
   first=offer;
  }
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM public.pwa_next_projected_charge_v1($1,$2::date) WHERE loan_id=$3',[fixture.borrowerId,today,loan])).rows[0].n,0,'the V112 read still offers nothing past a booked charge');
 }
 assert.equal((await admin.query(`SELECT has_function_privilege('public','public.pwa_next_bookable_charge_v1(text,date)','EXECUTE') AS x`)).rows[0].x,false,'no PUBLIC execute');
});

// R104 V117 with the existing close and default rules (asserted, not changed): a daily-interest loan (100 principal, within
// the fixture cashpool) with two booked
// future charges. Loan Close (V113) bills only the days up to today on the first future charge and lowers the second to
// the interest paid on it (0); Default writes every charge, future ones included, down to its paid components, as it does
// with one future charge.
async function loanWithFutureCharges(loan,count){
 await admin.query(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval")
  VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,7)`,[loan,fixture.borrowerId,fixture.lendingAccountId]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[loan]);
 const ids=[];
 for(let index=0;index<count;index++){
  const offer=(await store.draft(principal,fixture.borrowerId,{scope:'all'})).bookable.find(row=>row.loanId===loan);
  const applied=await store.operation(principal,{requestId:randomUUID(),operation:'loan.book-projected-charge',targetId:loan,expectedVersion:offer.bookVersion,predecessorRequestId:null,receiptId:null,inputs:{chargeDate:offer.chargeDate,principalDue:offer.principalRemaining,interestDue:offer.interestRemaining}});
  assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));ids.push(offer.id);
 }
 assert.deepEqual(ids,[key(loan,await day(4)),key(loan,await day(11))].slice(0,count));
 return ids;
}
test('V117: Loan Close with two booked future charges bills only the days up to today and reconciles',async()=>{
 const [f1,f2]=await loanWithFutureCharges('R117-C1',2);
 const preview=await store.loanClosePreview(principal,'R117-C1');assert.equal(preview.status,200,JSON.stringify(preview));
 assert.equal(preview.amount,'130','principal plus the three days up to today; neither future charge is billed in full');
 assert.deepEqual([preview.principalAmount,preview.interestAmount],['100.00','30.00']);
 assert.deepEqual(preview.plan.allocations.filter(line=>[f1,f2].includes(line.chargeId)).map(line=>[line.chargeId,line.interest,line.expectedInterestRemaining]),[[f1,'30','30']]);
 const close={requestId:randomUUID(),operation:'loan.close',targetId:'R117-C1',expectedVersion:preview.sourceVersion,predecessorRequestId:null,receiptId:null,inputs:{paymentDate:today,cashAccountId:fixture.receivingAccountId,paymentMethod:'Cash',notes:null,expectedAmount:preview.amount,expectedPlanHash:preview.planHash}};
 const applied=await store.operation(principal,close);assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));assert.equal(applied.originalOutcome.result.plan.amountReceived,'130');
 const charges=(await admin.query('SELECT "Row ID" AS id,"Interest Due"::numeric::text AS i,"Notes" AS notes FROM "Charges" WHERE "Row ID"=ANY($1::text[]) ORDER BY "Charge Date"',[[f1,f2]])).rows;
 assert.deepEqual(charges,[{id:f1,i:'30.00',notes:'Interest Due lowered from 70 by Loan Close '+today},{id:f2,i:'0.00',notes:'Interest Due lowered from 70 by Loan Close '+today}]);
 assert.equal((await admin.query('SELECT "Loan Status" AS status FROM "Loans" WHERE "Row ID"=$1',['R117-C1'])).rows[0].status,'ปิดยอดแล้ว');
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM "Charges" c CROSS JOIN LATERAL public.vc_charge_values(c) v WHERE c."Ref Loans"=$1 AND v.remaining<>0',['R117-C1'])).rows[0].n,0,'every charge settled');
 const paid=(await admin.query('SELECT sum("Principal Paid"::numeric)::text AS p,sum("Interest Paid"::numeric)::text AS i FROM "Repayments" WHERE "Ref Loans"=$1',['R117-C1'])).rows[0];
 assert.deepEqual(paid,{p:'100.00',i:'30.00'},'repayments reconcile with the close amount');
});
test('V117: Default with two booked future charges writes both down as it does with one',async()=>{
 const results={};
 for(const [loan,count] of [['R117-F1',1],['R117-F2',2]]){
  const ids=await loanWithFutureCharges(loan,count),version=(await admin.query('SELECT public.pwa_loan_version_v2($1) AS v',[loan])).rows[0].v;
  const applied=await store.operation(principal,{requestId:randomUUID(),operation:'loan.default',targetId:loan,expectedVersion:version,predecessorRequestId:null,receiptId:null,inputs:{businessDate:today}});
  assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));
  const rows=(await admin.query(`SELECT "Principal Due"::numeric::text AS p,"Interest Due"::numeric::text AS i,("Notes" LIKE 'Default write-off %') AS noted,("Notes")::text AS notes FROM "Charges" WHERE "Row ID"=ANY($1::text[]) ORDER BY "Charge Date"`,[ids])).rows;
  for(const row of rows){assert.deepEqual([row.p,row.i,row.noted],['0.00','0.00',true],loan+' future charge written down to its paid components');const note=JSON.parse(row.notes.slice('Default write-off '.length));assert.deepEqual([note.original_interest,note.written_off_interest,note.date],[70,70,today]);}
  const loss=(await admin.query(`SELECT c."Principal Due"::numeric::text AS p,c."Interest Due"::numeric::text AS i,l."Defaulted" AS defaulted FROM "Charges" c JOIN "Loans" l ON l."Row ID"=c."Ref Loans" WHERE c."Row ID"=$1`,['df10:'+Array.from(loan).length+':'+loan])).rows[0];
  results[count]={written:rows.length,loss};
 }
 assert.deepEqual(results[2].loss,results[1].loss,'the same loss posting with two future charges as with one');
 assert.deepEqual(results[1].loss,{p:'100.00',i:'-100.00',defaulted:true});assert.deepEqual([results[1].written,results[2].written],[1,2]);
});
