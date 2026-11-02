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
 assert.deepEqual([off[0].amount,off[0].d,off[0].holder,off[0].status,off[0].notes],['30.00',today,'ch:lisa','Posted','Rebate from loan '+s.loan]);
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
