import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {createBorrowerReadStore} from '../../services/api/borrower-read-store.mjs';
import {receiptRequestId,agentIdentity} from '../../services/agent-receipts/contract.mjs';
import {OWNER_EMAIL} from '../../services/lib/identity.mjs';
import {migrationHead} from '../migration-head.mjs';
// R111 V122: the referral rebate offset through the real application role and the real API stores (preview, close, Expenses
// and Collection reads, corrections), on the migration head. Assertions are on behaviour (payments, charges, cash, links,
// refusals), not on incidental field order. Synthetic data only.
let admin,app,store,fixture,reader,today;const user='mw_app_dev_r111_fixture';
const principal={ok:true,email:OWNER_EMAIL,subject:'r111-rebate-owner'};
const day=offset=>(admin.query("SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+$1::integer)::text AS day",[offset])).then(r=>r.rows[0].day);
before(async()=>{
 const head=migrationHead();
 admin=await disposablePool(head);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:3});
 const proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:head});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 fixture=await seedPaymentFixture(admin,'R111-REB');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 await admin.query(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('R111-CAPITAL',$1,current_date,'Contribution',200000::money)`,[fixture.actorId]);
 // The Collection read store over the same database (owner mapped through the fixture Partner), as the read service runs it.
 reader=createBorrowerReadStore({pool:{connect:()=>admin.connect()},config:{ownerEmail:OWNER_EMAIL,database:'payment_rehearsal',dbUser:'postgres'}});
 today=await day(0);
});
after(async()=>{await app?.end();await admin?.end()});
let n=0;
// A referrer (open loan with the given daily interest, today's charge unpaid or none) and a referred borrower with a loan to close:
// principal 1000, interest `interest` due today, so the rebate is min(round(interest x 10%), 1000).
async function scenario({interest=300,referrerLoans=[{id:'L',cdi:10,due:10}],closedReferrerLoan=false}={}){
 const id='R111-S'+(++n),referrer=id+'-REF',borrower=id+'-BOR',loan=id+'-LOAN';
 await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES($1,$2)',[referrer,'SYNTHETIC REFERRER '+id]);
 await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES($1,$2,$3)',[borrower,'SYNTHETIC REFERRED '+id,referrer]);
 const loanSql=`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval") VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,1000::money,$4,'ดอกเบี้ยรายวัน',false,$5::money,1)`;
 const refLoans=[];
 for(const l of referrerLoans){const lid=id+'-R'+l.id;refLoans.push(lid);await admin.query(loanSql,[lid,referrer,fixture.lendingAccountId,'ยังไม่ปิดยอด',l.cdi]);
  if(l.due)await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,0::money,$3::money)`,[lid+'-today',lid,l.due])}
 if(closedReferrerLoan){await admin.query(loanSql,[id+'-RCLOSED',referrer,fixture.lendingAccountId,'ปิดยอดแล้ว',10])}
 await admin.query(loanSql,[loan,borrower,fixture.lendingAccountId,'ยังไม่ปิดยอด',100]);
 await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,0::money,$3::money)`,[loan+'-today',loan,interest]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Ref Borrowers" IN ($1,$2) AND "Loan Status"='ยังไม่ปิดยอด'`,[referrer,borrower]);
 return {id,referrer,borrower,loan,refLoans};
}
const closeCommand=(loan,preview,inputs={})=>({requestId:randomUUID(),operation:'loan.close',targetId:loan,expectedVersion:preview.sourceVersion,predecessorRequestId:null,receiptId:null,inputs:{paymentDate:preview.businessDate,cashAccountId:fixture.receivingAccountId,paymentMethod:'Cash',notes:'close synthetic',expectedAmount:preview.amount,expectedPlanHash:preview.planHash,...inputs}});
async function close(s,inputs){const preview=await store.loanClosePreview(principal,s.loan);assert.equal(preview.status,200,JSON.stringify(preview));const applied=await store.operation(principal,closeCommand(s.loan,preview,inputs));return {preview,applied};}
const offsetPayment=async referrer=>(await admin.query(`SELECT "Row ID" AS id,"Amount Received"::numeric::text AS amount,"Payment Date"::text AS d,"Notes" AS notes,"Ref Received By Cash Holder" AS holder,"Status" AS status FROM "Payments" WHERE "Ref Borrower"=$1 AND "Payment Method"='Referral Rebate Offset'`,[referrer])).rows;
const lisaNet=async(payment,expense)=>Number((await admin.query(`SELECT coalesce(sum(CASE WHEN "Ref To Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END)-sum(CASE WHEN "Ref From Cash Holder"='ch:lisa' THEN "Amount"::numeric ELSE 0 END),0)::text AS net FROM "Cash Ledger" WHERE "Ref Payment"=$1 OR "Ref Business Expense"=$2`,[payment,expense])).rows[0].net);
const paymentDelete=async paymentId=>{const record=(await store.paymentRecord(principal,paymentId,{preview:true})).item;return store.operation(principal,{requestId:randomUUID(),operation:'payment.delete',targetId:paymentId,expectedVersion:record.sourceVersion,predecessorRequestId:record.predecessorRequestId,receiptId:null,inputs:{}})};

test('preview offers the offset when the referrer has an open loan and states the plan; without one it states a transfer from Lisa',async()=>{
 const withLoan=await scenario(),preview=await store.loanClosePreview(principal,withLoan.loan);assert.equal(preview.status,200,JSON.stringify(preview));
 assert.ok(preview.rebate,'the preview carries the rebate');assert.equal(String(preview.rebate.amount),'30');assert.equal(preview.rebate.hasOpenLoan,true);
 assert.equal(preview.rebate.previousPath??null,null,'nothing chosen before');assert.match(preview.rebate.referrer.displayName,/SYNTHETIC REFERRER/,'the referrer is named');
 assert.ok(preview.rebate.offset,'the offset plan is previewed');assert.equal(Number(preview.rebate.offset.covered),30);assert.equal(Number(preview.rebate.offset.payable),0);assert.equal(preview.rebate.businessDate,today);
 const none=await scenario({referrerLoans:[],closedReferrerLoan:true}),previewNone=await store.loanClosePreview(principal,none.loan);
 assert.equal(previewNone.rebate.hasOpenLoan,false,'a closed loan is not an open loan');assert.equal(String(previewNone.rebate.amount),'30');assert.equal(previewNone.rebate.offset,null,'no offset plan without an open loan');
});

test('offset close: the rebate pays the referrer loan, Lisa cash nets to zero, Expenses and Collection show it, the journal keeps the path',async()=>{
 const s=await scenario(),{applied}=await close(s,{rebatePath:'offset'});assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));
 const off=await offsetPayment(s.referrer);assert.equal(off.length,1,'one offset payment');
 assert.deepEqual([off[0].amount,off[0].d,off[0].holder,off[0].status],['30.00',today,'ch:lisa','Posted']);
 assert.match(off[0].notes,new RegExp('^Rebate from loan SYNTHETIC REFERRED '+s.id+' - -฿1,000-\\d\\d/\\d\\d-.+%$'),'the notes name the loan by its app key (V123)');assert.ok(!off[0].notes.includes(s.loan));
 const expense=(await admin.query(`SELECT "Amount"::numeric::text AS amount,"Ref Offset Payment" AS off FROM "Business Expenses" WHERE "Row ID"=$1`,['rr1:'+s.loan])).rows[0];assert.deepEqual(expense,{amount:'30.00',off:off[0].id});
 assert.equal(await lisaNet(off[0].id,'rr1:'+s.loan),0,'Lisa cash nets to zero');
 const charges=(await admin.query(`SELECT "Charge Date"::text AS d,"Amount Remaining"::numeric::text AS r FROM "Charges" WHERE "Ref Loans"=$1 ORDER BY "Charge Date"`,[s.refLoans[0]])).rows;
 assert.deepEqual(charges.map(c=>c.r),['0.00','0.00','0.00'],'due 10 first, then two next charges of 10, all paid');assert.equal(charges[0].d,today);
 // Expenses read: settled by offset with the referrer and the loan, not a paying account, and no delete.
 const record=await store.expenseRecord(principal,'rr1:'+s.loan);assert.equal(record.status,200,JSON.stringify(record));
 assert.equal(record.item.offsetPaymentId,off[0].id);assert.equal(Number(record.item.offsetAmount),30);assert.equal(record.item.offsetLoanId,s.refLoans[0]);assert.ok(record.item.offsetLoanLabel);assert.equal(Number(record.item.payableAmount),0);
 assert.equal(record.item.canDelete,false);assert.equal(record.item.canEdit,false);
 assert.match(JSON.stringify(record.item),/SYNTHETIC REFERRER/);
 const page=await store.expenses(principal,{limit:50});assert.equal(page.status,200,JSON.stringify(page).slice(0,300));
 assert.ok(JSON.stringify(page).includes('rr1:'+s.loan),'the offset-settled rebate is in the Expenses list');
 // Collection read of the future-dated offset charges: the referrer is a fully paid row, not "Partially paid" with 0 remaining.
 const board=await reader.listCollection(OWNER_EMAIL,{limit:100});assert.equal(board.ok,true,JSON.stringify(board).slice(0,300));
 const row=board.items.find(x=>x.id===s.referrer);assert.ok(row,'the referrer is on the board (a payment today)');
 assert.notEqual(row.status,'partially_paid',JSON.stringify(row));assert.equal(Number(row.amountRemaining),0);
 const detail=await reader.getCollectionCharges(OWNER_EMAIL,s.referrer,{limit:100});assert.equal(detail.ok,true,JSON.stringify(detail).slice(0,300));
 // The journal keeps the chosen path on the closing command.
 const stored=(await admin.query(`SELECT canonical_json FROM pwa_payment_commands WHERE contract_version=2 AND result_json->>'paymentId'=(SELECT "Ref Closing Payment" FROM "Loans" WHERE "Row ID"=$1)`,[s.loan])).rows[0];
 assert.match(stored.canonical_json,/"rebatePath":"offset"/);
});

test('pay out as expense, a close without rebatePath and no open loan keep the pre-R111 behaviour',async()=>{
 const a=await scenario(),b=await scenario(),c=await scenario({referrerLoans:[],closedReferrerLoan:true});
 for(const [s,inputs] of [[a,{rebatePath:'expense'}],[b,{}],[c,{rebatePath:'offset'}]]){
  const {applied}=await close(s,inputs);assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));
  assert.equal((await offsetPayment(s.referrer)).length,0,'no offset payment');
  const e=(await admin.query(`SELECT "Amount"::numeric::text AS amount,"Ref Offset Payment" AS off,"Ref Paid By Cash Holder" AS holder FROM "Business Expenses" WHERE "Row ID"=$1`,['rr1:'+s.loan])).rows[0];
  assert.deepEqual(e,{amount:'30.00',off:null,holder:'ch:lisa'},'the expense is paid by Lisa as before');
 }
 assert.equal((await admin.query(`SELECT "Amount Remaining"::numeric::text AS r FROM "Charges" WHERE "Row ID"=$1`,[a.refLoans[0]+'-today'])).rows[0].r,'10.00','the referrer loan is untouched by the expense path');
 const bad=await store.operation(principal,closeCommand(a.loan,await store.loanClosePreview(principal,a.loan),{rebatePath:'x'}));
 assert.equal(bad.status,400,'an unknown path is an invalid request');
});

test('a rebate larger than the referrer schedule offsets up to the horizon; the rest stays payable',async()=>{
 const s=await scenario({interest:10000,referrerLoans:[{id:'L',cdi:5,due:5}]}),{preview,applied}=await close(s,{rebatePath:'offset'});assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));
 assert.ok(Number(preview.rebate.offset.payable)>0,'the preview says part stays payable');
 const off=(await offsetPayment(s.referrer))[0];assert.ok(Number(off.amount)>0&&Number(off.amount)<1000,'a partial offset');assert.equal(Number(off.amount),Number(preview.rebate.offset.covered));
 const last=(await admin.query(`SELECT max("Charge Date")::text AS d FROM "Charges" WHERE "Ref Loans"=$1`,[s.refLoans[0]])).rows[0].d;assert.ok(last<=await day(93),'nothing booked beyond day+93');
 assert.equal((await admin.query(`SELECT "Amount"::numeric::text AS a FROM "Business Expenses" WHERE "Row ID"=$1`,['rr1:'+s.loan])).rows[0].a,'1000.00');
 assert.equal(await lisaNet(off.id,'rr1:'+s.loan),-(1000-Number(off.amount)),'Lisa cash nets to minus the payable remainder');
});

test('several open loans of the referrer: due of both first, then the earliest date, the smaller key on a tie',async()=>{
 const s=await scenario({referrerLoans:[{id:'A',cdi:10,due:10},{id:'B',cdi:10,due:10}]}),{applied}=await close(s,{rebatePath:'offset'});assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));
 assert.equal((await offsetPayment(s.referrer))[0].amount,'30.00');
 const d1=await day(1),future=async loan=>(await admin.query(`SELECT "Charge Date"::text AS d FROM "Charges" WHERE "Ref Loans"=$1 AND "Charge Date">$2::date`,[loan,today])).rows.map(r=>r.d);
 assert.deepEqual(await future(s.refLoans[0]),[d1]);assert.deepEqual(await future(s.refLoans[1]),[]);
});

test('corrections: a lone delete of the offset payment is refused; deleting the closing payment removes both and keeps the booked charges open; re-close repeats the path',async()=>{
 const s=await scenario(),{applied}=await close(s,{rebatePath:'offset'});assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));
 const off=(await offsetPayment(s.referrer))[0],closing=(await admin.query('SELECT "Ref Closing Payment" AS id FROM "Loans" WHERE "Row ID"=$1',[s.loan])).rows[0].id;
 const lone=await paymentDelete(off.id);assert.notEqual(lone.originalOutcome?.status,'applied',JSON.stringify(lone));
 assert.equal((await offsetPayment(s.referrer)).length,1,'the offset payment is still there');
 const deleted=await paymentDelete(closing);assert.equal(deleted.originalOutcome?.status,'applied',JSON.stringify(deleted));
 assert.equal((await offsetPayment(s.referrer)).length,0,'the offset payment went with the closing payment');
 assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM "Business Expenses" WHERE "Row ID"=$1`,['rr1:'+s.loan])).rows[0].n,0);
 assert.equal(await lisaNet(off.id,'rr1:'+s.loan),0,'no rebate cash rows remain');
 const open=(await admin.query(`SELECT "Charge Date"::text AS d,"Amount Remaining"::numeric::text AS r FROM "Charges" WHERE "Ref Loans"=$1 ORDER BY "Charge Date"`,[s.refLoans[0]])).rows;
 assert.deepEqual(open.map(c=>c.r),['10.00','10.00','10.00'],'the due and the two booked charges are open again, and stay booked');
 // The re-close preview offers the previous choice, and closing with it repeats the offset path.
 const again=await store.loanClosePreview(principal,s.loan);assert.equal(again.status,200,JSON.stringify(again));assert.equal(again.rebate.previousPath,'offset');
 const second=await store.operation(principal,closeCommand(s.loan,again,{rebatePath:again.rebate.previousPath}));assert.equal(second.originalOutcome?.status,'applied',JSON.stringify(second));
 const off2=await offsetPayment(s.referrer);assert.equal(off2.length,1);assert.equal(off2[0].amount,'30.00');assert.notEqual(off2[0].id,off.id);
 assert.deepEqual((await admin.query(`SELECT "Amount Remaining"::numeric::text AS r FROM "Charges" WHERE "Ref Loans"=$1`,[s.refLoans[0]])).rows.map(r=>r.r),['0.00','0.00','0.00'],'the booked charges are reused and paid again');
});

// R111 extension (V124): a loan closed by any other path offsets the rebate automatically when its Close Date is today.
// The real Receive payment command (v7) closes a daily-interest loan, the last installment of an installment loan and a Fixed Due
// Date loan paid on its due date; a gated referrer never fails the borrower's payment; the agent receipt command does the same.
let m=0;
// kind: 'daily' (charge 0+interest... principal 1000 paid in full), 'installment' (last installment 100+40), 'fixed' (due today 100+30).
async function autoScenario({kind='daily',referrerLoan=true,gated=false}={}){
 const id='R111-X'+(++m),referrer=id+'-REF',borrower=id+'-BOR',loan=id+'-LOAN';
 await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES($1,$2)',[referrer,'SYNTHETIC REFERRER '+id]);
 await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES($1,$2,$3)',[borrower,'SYNTHETIC REFERRED '+id,referrer]);
 const base=`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Daily Payment Amount","Fixed Interest","Due Date","Interest Payment Interval") VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,$4::money,'ยังไม่ปิดยอด',$5,false,$6::money,$7::money,$8::money,$9::date,1)`;
 const today=await day(0),due=await day(7);
 if(referrerLoan){await admin.query(base,[id+'-RL',referrer,fixture.lendingAccountId,1000,'ดอกเบี้ยรายวัน',10,null,null,null]);
  // gated: an open referrer loan that offers neither a due charge nor a future bookable charge (Auto Charge off, nothing due).
  if(!gated){await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,$3::date,0::money,10::money)`,[id+'-RL-today',id+'-RL',today]);
   await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[id+'-RL'])}}
 const spec={daily:[1000,'ดอกเบี้ยรายวัน',100,null,null,null,1000,300],installment:[100,'ผ่อนชำระรายวัน',0,140,null,due,100,40],fixed:[100,'กำหนดวันชำระ',0,null,30,today,100,30]}[kind];
 await admin.query(base,[loan,borrower,fixture.lendingAccountId,spec[0],spec[1],spec[2],spec[3],spec[4],spec[5]]);
 await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,$3::date,$4::money,$5::money)`,[loan+'-today',loan,today,spec[6],spec[7]]);
 return {id,referrer,borrower,loan,rl:id+'-RL',amount:spec[6]+spec[7],rebate:Math.round(spec[7]*0.1)};
}
const receive=async(s,requestId=randomUUID())=>{
 const assigned=await store.autoAssign(principal,s.borrower,{amountReceived:String(s.amount)});assert.equal(assigned.status,200,JSON.stringify(assigned));
 const command={schemaVersion:7,requestId,borrowerId:s.borrower,allocations:assigned.allocations,cashAccountId:fixture.receivingAccountId,paymentDate:today,amountReceived:String(s.amount),paymentMethod:'Bank Transfer',notes:null,receiptId:null,bankReference:null,transferTime:null};
 return {command,posted:await store.submit(principal,command)};
};
const rebateExpense=async loan=>(await admin.query(`SELECT "Amount"::numeric::text AS amount,"Ref Offset Payment" AS off,"Ref Paid By Cash Holder" AS holder FROM "Business Expenses" WHERE "Row ID"=$1`,['rr1:'+loan])).rows[0];
const journalRow=async(loan,payment)=>(await admin.query(`SELECT count(*)::integer AS n FROM pwa_payment_commands WHERE contract_version=2 AND outcome='applied' AND canonical_json::jsonb#>>'{command,operation}'='system.rebate-offset' AND canonical_json::jsonb#>>'{command,targetId}'=$1 AND result_json->>'paymentId'=$2`,[loan,payment])).rows[0].n;

for(const [kind,label] of [['daily','a daily-interest loan'],['installment','the last installment of an installment loan'],['fixed','a Fixed Due Date loan paid on its due date']])
 test('extension: '+label+' closed by Receive payment offsets the rebate to the referrer loan automatically',async()=>{
  const s=await autoScenario({kind}),{posted}=await receive(s);assert.equal(posted.originalOutcome?.status,'posted',JSON.stringify(posted));
  assert.equal((await admin.query('SELECT "Loan Status" AS status FROM "Loans" WHERE "Row ID"=$1',[s.loan])).rows[0].status,'ปิดยอดแล้ว','the payment closes the loan');
  const off=await offsetPayment(s.referrer);assert.equal(off.length,1,'one offset payment');
  assert.deepEqual([off[0].amount,off[0].d,off[0].holder,off[0].status],[s.rebate+'.00',today,'ch:lisa','Posted']);assert.match(off[0].id,/^ro122:pwa:/);
  const expense=await rebateExpense(s.loan);assert.deepEqual(expense,{amount:s.rebate+'.00',off:off[0].id,holder:'ch:lisa'});
  assert.equal(await lisaNet(off[0].id,'rr1:'+s.loan),0,'Lisa cash nets to zero');
  assert.equal(await journalRow(s.loan,off[0].id),1,'a system.rebate-offset journal row names the offset payment');
  // The offset payment reads like any payment (its plan comes from that journal row) and the closing payment says what became of the rebate.
  const offRecord=await store.paymentRecord(principal,off[0].id);assert.equal(offRecord.status,200,JSON.stringify(offRecord).slice(0,300));assert.ok(offRecord.item.allocations.length>=1);
  const closing=await store.paymentRecord(principal,posted.originalOutcome.paymentId);assert.equal(closing.status,200,JSON.stringify(closing).slice(0,300));
  const line=closing.item.closeRebate;assert.ok(line,'the closing payment carries the rebate line');assert.equal(Number(line.amount),s.rebate);assert.equal(line.offsetPaymentId,off[0].id);assert.equal(Number(line.offsetAmount),s.rebate);assert.equal(Number(line.payableAmount),0);assert.equal(line.offsetLoanId,s.rl);assert.match(line.referrerLabel,/SYNTHETIC REFERRER/);if(s.rebate>=10)assert.ok(line.paidThrough,'a rebate covering a whole charge says paid through');
  // The Expenses read shows the offset settlement.
  const record=await store.expenseRecord(principal,'rr1:'+s.loan);assert.equal(record.item.offsetPaymentId,off[0].id);assert.equal(record.item.canDelete,false);
 });

test('extension: a referrer whose schedule cannot take the offset leaves the rebate as an expense and the borrower payment still posts',async()=>{
 const gated=await autoScenario({gated:true}),a=await receive(gated);assert.equal(a.posted.originalOutcome?.status,'posted',JSON.stringify(a.posted));
 const none=await autoScenario({referrerLoan:false}),b=await receive(none);assert.equal(b.posted.originalOutcome?.status,'posted',JSON.stringify(b.posted));
 for(const s of [gated,none]){
  assert.equal((await offsetPayment(s.referrer)).length,0,'no offset payment');
  assert.deepEqual(await rebateExpense(s.loan),{amount:s.rebate+'.00',off:null,holder:'ch:lisa'},'the expense is paid out as before');
  assert.equal(await journalRow(s.loan,'ro122:pwa:x'),0);
 }
 assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM "Charges" WHERE "Ref Loans"=$1`,[gated.rl])).rows[0].n,0,'the unbookable referrer loan is untouched');
 // The closing payment's record says the rebate is paid out from Lisa.
 const closing=await store.paymentRecord(principal,b.posted.originalOutcome.paymentId),line=closing.item.closeRebate;assert.ok(line);assert.equal(line.offsetPaymentId??null,null);assert.equal(Number(line.payableAmount),none.rebate);
 const plain=await scenario(),ordinary=await store.paymentRecord(principal,(await close(plain,{rebatePath:'expense'})).applied.originalOutcome.result.paymentId);void ordinary;
});

test('extension: deleting the closing payment removes the automatic offset; a lone delete is refused; paying again makes a new offset under a new key',async()=>{
 const s=await autoScenario(),first=await receive(s);assert.equal(first.posted.originalOutcome?.status,'posted',JSON.stringify(first.posted));
 const off=(await offsetPayment(s.referrer))[0],lone=await paymentDelete(off.id);assert.notEqual(lone.originalOutcome?.status,'applied',JSON.stringify(lone));assert.equal((await offsetPayment(s.referrer)).length,1);
 const deleted=await paymentDelete(first.posted.originalOutcome.paymentId);assert.equal(deleted.originalOutcome?.status,'applied',JSON.stringify(deleted));
 assert.equal((await offsetPayment(s.referrer)).length,0);assert.equal(await rebateExpense(s.loan),undefined);
 assert.deepEqual((await admin.query(`SELECT "Amount Remaining"::numeric::text AS r FROM "Charges" WHERE "Ref Loans"=$1 ORDER BY "Charge Date"`,[s.rl])).rows.map(r=>r.r),['10.00','10.00','10.00'],'the referrer charges reopen and stay booked');
 const second=await receive(s);assert.equal(second.posted.originalOutcome?.status,'posted',JSON.stringify(second.posted));
 const off2=await offsetPayment(s.referrer);assert.equal(off2.length,1);assert.notEqual(off2[0].id,off.id);assert.equal(off2[0].amount,s.rebate+'.00');
});

test('extension: the agent receipt command closes a loan and offsets the rebate the same way',async()=>{
 const s=await autoScenario(),user='mw-credit-app-command-dev@clever-oasis-508610-n7.iam';
 if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[user])).rowCount)await admin.query(`CREATE ROLE "${user}" LOGIN NOSUPERUSER NOBYPASSRLS`);
 await admin.query(`GRANT mw_app_dev TO "${user}" WITH INHERIT TRUE,SET FALSE,ADMIN FALSE;GRANT EXECUTE ON FUNCTION public.pwa_submit_agent_receipt_v1(text) TO "${user}"`);
 await admin.query(`UPDATE "Partners" SET "AI Reviewer"=true,"IG Integration Enabled"=true WHERE "Row ID"=$1`,[fixture.actorId]);
 const caller=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:1});
 try{
  const reviewId='synthetic-review-r111',requestId=receiptRequestId('dev',reviewId),receiptId='a'.repeat(64),rawSha256='b'.repeat(64);
  const command={schemaVersion:7,requestId,environment:'dev',reviewId,mode:'automatic',borrowerId:s.borrower,cashAccountId:fixture.receivingAccountId,amountReceived:String(s.amount),paymentDate:today,transferTime:'12:00',bankReference:'synthetic-bank-r111',proposalSha256:'c'.repeat(64),archiveEvidence:{receiptId,objectKey:`receipts/dev/2026/11/02/${receiptId}/${rawSha256}.png`,generation:'1',rawSha256,mimeType:'image/png',sizeBytes:100,capturedAt:String(Math.floor(Date.now()/1000))}};
  const identity=agentIdentity(command,{issuer:'https://accounts.google.com',subject:'737787224638',partnerId:fixture.actorId,loginEmail:OWNER_EMAIL.toLowerCase()});
  const result=(await caller.query('SELECT public.pwa_submit_agent_receipt_v1($1) result',[identity.canonicalJson])).rows[0].result;
  assert.equal(result.originalOutcome?.status,'posted',JSON.stringify(result));
  const off=await offsetPayment(s.referrer);assert.equal(off.length,1,'the agent receipt closes the loan and offsets the rebate');assert.equal(off[0].amount,s.rebate+'.00');
  assert.equal(await lisaNet(off[0].id,'rr1:'+s.loan),0);assert.equal(await journalRow(s.loan,off[0].id),1);
 }finally{await caller.end()}
});

test('extension: a correction re-post of an older closing payment (Close Date not today) leaves the rebate as an expense even if the referrer now has an open loan',async()=>{
 const s=await autoScenario({referrerLoan:false}),yesterday=await day(-1);
 // The loan's charge and the payment are dated yesterday; the referrer had no open loan at the time.
 await admin.query('UPDATE "Charges" SET "Charge Date"=$2::date WHERE "Row ID"=$1',[s.loan+'-today',yesterday]);
 const assigned=await store.autoAssign(principal,s.borrower,{amountReceived:String(s.amount)});assert.equal(assigned.status,200,JSON.stringify(assigned));
 const command={schemaVersion:7,requestId:randomUUID(),borrowerId:s.borrower,allocations:assigned.allocations,cashAccountId:fixture.receivingAccountId,paymentDate:yesterday,amountReceived:String(s.amount),paymentMethod:'Bank Transfer',notes:null,receiptId:null,bankReference:null,transferTime:null};
 const posted=await store.submit(principal,command);assert.equal(posted.originalOutcome?.status,'posted',JSON.stringify(posted));
 assert.deepEqual(await rebateExpense(s.loan),{amount:s.rebate+'.00',off:null,holder:'ch:lisa'});
 // The referrer now has an open loan with a due charge.
 const loanSql=`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval") VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,1)`;
 await admin.query(loanSql,[s.id+'-LATE',s.referrer,fixture.lendingAccountId]);
 await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,$3::date,0::money,10::money)`,[s.id+'-LATE-today',s.id+'-LATE',today]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[s.id+'-LATE']);
 const id=posted.originalOutcome.paymentId,preview=(await store.paymentRecord(principal,id,{preview:true})).item,row=preview.balances.find(x=>x.chargeId===s.loan+'-today');assert.ok(row);
 const corrected=await store.operation(principal,{requestId:randomUUID(),operation:'payment.correct',targetId:id,expectedVersion:preview.sourceVersion,predecessorRequestId:preview.predecessorRequestId,receiptId:null,inputs:{kind:'pwa-plan',receiptMode:'preserve',fields:{borrowerId:s.borrower,amountReceived:String(s.amount),paymentDate:yesterday,paymentMethod:'Cash',cashAccountId:fixture.receivingAccountId,notes:null,allocationMethod:'Selected Charges',targetChargeId:null,targetLoanId:null,allocations:[{chargeId:row.chargeId,principal:'1000',interest:'300',expectedPrincipalRemaining:String(Number(row.principalRemaining)),expectedInterestRemaining:String(Number(row.interestRemaining)),chargeDate:row.chargeDate}]}}});
 assert.equal(corrected.originalOutcome?.status,'applied',JSON.stringify(corrected));
 assert.equal((await offsetPayment(s.referrer)).length,0,'a historical re-post never offsets');
 assert.deepEqual(await rebateExpense(s.loan),{amount:s.rebate+'.00',off:null,holder:'ch:lisa'},'the rebate is recreated as an expense');
});
