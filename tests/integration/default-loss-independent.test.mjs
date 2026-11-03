import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {OWNER_EMAIL} from '../../services/lib/identity.mjs';
import {migrationHead} from '../migration-head.mjs';
// R109 V120: Default Loan with a loss amount and kept charges, through the real application role and the operation
// route, on the migration head. Archie's worked example: principal 10,000, Original Daily Interest Rate 3 (Current Daily
// Interest 300), interval 3 (one charge of 900 every 3 days), two unpaid charges (today-4 and today-1, 1,800 in all).
// Every assertion reads the committed rows (after the operation's transaction). Synthetic data only.
let admin,app,store,fixture,today;const user='mw_app_dev_r109_fixture';
const principal={ok:true,email:OWNER_EMAIL,subject:'r109-default-owner'};
const day=offset=>admin.query("SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+$1::integer)::text AS day",[offset]).then(r=>r.rows[0].day);
const posting=(loan,date)=>'df10:'+Array.from(loan).length+':'+loan+':'+date;
const version=async loan=>(await admin.query('SELECT public.pwa_loan_version_v2($1) AS v',[loan])).rows[0].v;
async function operation(operationName,loan,inputs,requestId=randomUUID()){
 const value=await store.operation(principal,{requestId,operation:operationName,targetId:loan,expectedVersion:await version(loan),predecessorRequestId:null,receiptId:null,inputs});
 assert.ok(value.originalOutcome,JSON.stringify(value));return value.originalOutcome;
}
const lossInputs=(amount,keepCharges,businessDate=today)=>({businessDate,amount,keepCharges});
const applied=async(...args)=>{const outcome=await operation(...args);assert.equal(outcome?.status,'applied',JSON.stringify(outcome));return outcome};
const rejected=async(code,...args)=>{const outcome=await operation(...args);assert.deepEqual([outcome?.status,outcome?.code],['rejected',code],JSON.stringify(outcome));return outcome};
async function loanRow(loan){
 return (await admin.query(`SELECT coalesce("Defaulted",false) AS defaulted,"Loan Status" AS status,"Close Date"::text AS "closeDate","Closed By" AS "closedBy",
  "Default Loss Amount"::numeric(20,2)::text AS loss,"Total Principal Received"::numeric(20,2)::text AS tpr,"Outstanding Principal"::numeric(20,2)::text AS outstanding,
  "Current Daily Interest"::numeric(20,2)::text AS cdi,"Expected Daily Interest Amount"::numeric(20,2)::text AS edia,"Total Interest Received"::numeric(20,2)::text AS tir
  FROM "Loans" WHERE "Row ID"=$1`,[loan])).rows[0];
}
const charges=async loan=>(await admin.query(`SELECT "Row ID" AS id,"Charge Date"::text AS date,"Principal Due"::numeric::text AS p,"Interest Due"::numeric::text AS i,"Notes" AS notes
 FROM "Charges" WHERE "Ref Loans"=$1 ORDER BY "Charge Date","Row ID" COLLATE "C"`,[loan])).rows;
const pairs=async loan=>(await admin.query(`SELECT c."Row ID" AS id,c."Charge Date"::text AS date,c."Principal Due"::numeric::text AS p,c."Interest Due"::numeric::text AS i,
 r."Principal Paid"::numeric::text AS rp,r."Interest Paid"::numeric::text AS ri,r."Ref Payment" AS payment,r."Created By" AS "createdBy"
 FROM "Charges" c JOIN "Repayments" r ON r."Row ID"=c."Row ID" WHERE c."Ref Loans"=$1 AND c."Row ID" LIKE 'df10:%' ORDER BY c."Charge Date"`,[loan])).rows;
// The worked-example loan: inserted with Auto Charge off (no first-day charge or net-off receipt), then enabled.
async function exampleLoan(loan,{borrower=fixture.borrowerId,withCharges=true,dailyInterest=300}={}){
 await admin.query(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval")
  VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-7,10000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,$4::numeric::money,3)`,[loan,borrower,fixture.lendingAccountId,dailyInterest]);
 if(withCharges)await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
  SELECT $1||x.s,$1,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+x.d,0::money,900::money FROM (VALUES('-C1',-4),('-C2',-1)) x(s,d)`,[loan]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[loan]);
}
async function pay(charge,amount){
 const date=(await admin.query('SELECT "Charge Date"::text AS d FROM "Charges" WHERE "Row ID"=$1',[charge])).rows[0].d;
 const command={schemaVersion:6,requestId:randomUUID(),borrowerId:fixture.borrowerId,amountReceived:amount,paymentDate:today,paymentMethod:'Cash',cashAccountId:fixture.receivingAccountId,notes:null,receiptId:null,
  allocations:[{chargeId:charge,principal:'0',interest:amount,expectedPrincipalRemaining:'0',expectedInterestRemaining:amount,chargeDate:date}]};
 const posted=await store.submit(principal,command);assert.equal(posted.originalOutcome?.status,'posted',JSON.stringify(posted));return posted.originalOutcome.paymentId;
}
// A day-earlier loss event, as a reviewed seed: the pair first, then the matching total (the trigger accepts the ledger sum).
async function seedLoss(loan,amount,offset){
 const c=await admin.connect();try{
  await c.query('BEGIN');const date=await day(offset),id=posting(loan,date);
  await c.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES($1,$2,$3::date,$4::numeric::money,(-$4::numeric)::money,'R109 seed')`,[id,loan,date,amount]);
  await c.query(`INSERT INTO "Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes","Ref Loans","Ref Charges","Created By") VALUES($1,$3::date,$4::numeric::money,(-$4::numeric)::money,'R109 seed',$2,$1,$5)`,[id,loan,date,amount,OWNER_EMAIL]);
  await c.query(`UPDATE "Loans" SET "Default Loss Amount"=$2::numeric::money WHERE "Row ID"=$1`,[loan,amount]);
  await c.query('COMMIT');
 }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}
before(async()=>{
 const head=migrationHead();
 admin=await disposablePool(head);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:3});
 const proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:head});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 fixture=await seedPaymentFixture(admin,'R109-PAY');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 await admin.query(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('R109-CAPITAL',$1,current_date-30,'Contribution',500000::money)`,[fixture.actorId]);
 today=await day(0);
});
after(async()=>{await app?.end();await admin?.end()});

test('T1 full amount, keepCharges false: write off and close exactly as the ordinary-source path; T1u undo restores it',async()=>{
 await exampleLoan('R109-T1A');await exampleLoan('R109-T1B');await exampleLoan('R109-T1C');
 assert.deepEqual(await loanRow('R109-T1A'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:null,tpr:'0.00',outstanding:'10000.00',cdi:'300.00',edia:'300.00',tir:'0.00'});
 assert.equal((await admin.query('SELECT "Original Daily Interest Rate" AS r FROM "Loans" WHERE "Row ID"=$1',['R109-T1A'])).rows[0].r,3,'the frozen rate of the worked example');
 await applied('loan.default','R109-T1A',lossInputs('10000',false));
 // The twin through the ordinary source path (no request): the same rows.
 await admin.query(`UPDATE "Loans" SET "Defaulted"=true,"Close Date"=$2::date,"Closed By"=$3 WHERE "Row ID"=$1`,['R109-T1B',today,OWNER_EMAIL]);
 const id=posting('R109-T1A',today);
 assert.deepEqual(await pairs('R109-T1A'),[{id,date:today,p:'10000.00',i:'-10000.00',rp:'10000.00',ri:'-10000.00',payment:null,createdBy:OWNER_EMAIL}]);
 const written=await charges('R109-T1A');
 for(const row of written.filter(row=>!row.id.startsWith('df10:'))){
  assert.deepEqual([row.p,row.i],['0.00','0.00']);const note=JSON.parse(row.notes.slice('Default write-off '.length));
  assert.deepEqual([note.posting,note.original_interest,note.written_off_interest,note.date,note.actor],[id,900,900,today,OWNER_EMAIL]);
 }
 const closed={defaulted:true,status:'ปิดยอดแล้ว',closeDate:today,closedBy:OWNER_EMAIL,loss:'10000.00',tpr:'10000.00',outstanding:'0.00',cdi:'0.00',edia:'0.00',tir:'-10000.00'};
 assert.deepEqual(await loanRow('R109-T1A'),closed);assert.deepEqual(await loanRow('R109-T1B'),closed);
 const twin=rows=>JSON.stringify(rows).replaceAll('R109-T1B','R109-T1A');
 assert.equal(twin(await charges('R109-T1B')),JSON.stringify(written),'the ordinary-source path posts the same rows, dated id included');
 assert.equal(twin(await pairs('R109-T1B')),JSON.stringify(await pairs('R109-T1A')));
 // The one-key form of earlier PWA builds ({businessDate}, e.g. a request saved offline before R109) is the same write-off.
 await applied('loan.default','R109-T1C',{businessDate:today});
 const third=rows=>JSON.stringify(rows).replaceAll('R109-T1C','R109-T1A');
 assert.equal(third(await charges('R109-T1C')),JSON.stringify(written));assert.deepEqual(await loanRow('R109-T1C'),closed);
 await assert.rejects(admin.query(`UPDATE "Charges" SET "Notes"='x' WHERE "Row ID"=$1`,['R109-T1A-C1']),/Undo Default before changing or deleting its original charges/);
 await applied('loan.undo-default','R109-T1A',{});
 assert.deepEqual(await pairs('R109-T1A'),[]);
 assert.deepEqual((await charges('R109-T1A')).map(row=>[row.id,row.p,row.i,row.notes]),[['R109-T1A-C1','0.00','900.00',null],['R109-T1A-C2','0.00','900.00',null]]);
 assert.deepEqual(await loanRow('R109-T1A'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:null,tpr:'0.00',outstanding:'10000.00',cdi:'300.00',edia:'300.00',tir:'0.00'});
});

test('T2 full loss, charges kept: open at 0 principal, collectable charges, no new charge; T2p payment; T2u undo',async()=>{
 await exampleLoan('R109-T2');
 await applied('loan.default','R109-T2',lossInputs('10000',true));
 assert.deepEqual(await pairs('R109-T2'),[{id:posting('R109-T2',today),date:today,p:'10000.00',i:'-10000.00',rp:'10000.00',ri:'-10000.00',payment:null,createdBy:OWNER_EMAIL}]);
 assert.deepEqual((await charges('R109-T2')).filter(row=>!row.id.startsWith('df10:')).map(row=>[row.id,row.p,row.i,row.notes]),[['R109-T2-C1','0.00','900.00',null],['R109-T2-C2','0.00','900.00',null]],'charges untouched');
 assert.deepEqual(await loanRow('R109-T2'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:'10000.00',tpr:'10000.00',outstanding:'0.00',cdi:'0.00',edia:'0.00',tir:'-10000.00'});
 assert.equal((await admin.query('SELECT public.generate_loan_charge($1,$2::date) AS id',['R109-T2',await day(2)])).rows[0].id,null,'daily interest 0: no new charge');
 const read=(await store.loanRecord(principal,'R109-T2')).item;
 assert.deepEqual([read.defaultLoss,read.outstandingPrincipal,read.defaultLossDate,read.lastDefaultLoss,read.unpaidChargeCount,read.unpaidChargeAmount],['10000.00','0.00',today,'10000.00',2,'1800.00']);
 // T2p: a payment on a kept charge is interest income on the payment date; the loan stays open with C2 unpaid.
 const paymentId=await pay('R109-T2-C1','900');
 assert.deepEqual((await admin.query('SELECT "Interest Paid"::numeric::text AS i,"Payment Date"::text AS d FROM "Repayments" WHERE "Ref Payment"=$1',[paymentId])).rows,[{i:'900.00',d:today}]);
 assert.deepEqual(await loanRow('R109-T2'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:'10000.00',tpr:'10000.00',outstanding:'0.00',cdi:'0.00',edia:'0.00',tir:'-9100.00'});
 // T2u: undo after the payment reverses only the pair; C1 stays paid.
 await applied('loan.undo-default','R109-T2',{});
 assert.deepEqual(await pairs('R109-T2'),[]);
 assert.deepEqual(await loanRow('R109-T2'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:null,tpr:'0.00',outstanding:'10000.00',cdi:'300.00',edia:'300.00',tir:'900.00'});
 assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM "Repayments" WHERE "Ref Payment"=$1`,[paymentId])).rows[0].n,1,'the receipt is kept');
 // T2c: full loss again (the same day is free after the undo), then the last payment closes the loan; undo is refused.
 await applied('loan.default','R109-T2',lossInputs('10000',true));
 const closingPayment=await pay('R109-T2-C2','900');
 const closed=(await admin.query(`SELECT "Loan Status" AS status,"Ref Closing Payment" AS closing,coalesce("Defaulted",false) AS defaulted,"Default Loss Amount"::numeric::text AS loss FROM "Loans" WHERE "Row ID"=$1`,['R109-T2'])).rows[0];
 assert.deepEqual(closed,{status:'ปิดยอดแล้ว',closing:closingPayment,defaulted:false,loss:'10000.00'},'the last kept charge paid closes the loan');
 await rejected('record_requires_reconciliation','loan.undo-default','R109-T2',{});
 assert.equal((await loanRow('R109-T2')).loss,'10000.00');
});

test('T3 partial loss: outstanding and daily interest fall, the next charge is lower, one posting a day, Loan Close uses the reduced figures',async()=>{
 await exampleLoan('R109-T3');
 await applied('loan.default','R109-T3',lossInputs('4000',true));
 assert.deepEqual((await pairs('R109-T3')).map(row=>[row.id,row.p,row.i]),[[posting('R109-T3',today),'4000.00','-4000.00']]);
 assert.deepEqual(await loanRow('R109-T3'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:'4000.00',tpr:'4000.00',outstanding:'6000.00',cdi:'180.00',edia:'180.00',tir:'-4000.00'});
 // T3c: Loan Close preview on the day of the loss: principal 6000, unpaid 1800 plus one day at 180 since the latest charge.
 const preview=await store.loanClosePreview(principal,'R109-T3');assert.equal(preview.status,200,JSON.stringify(preview));
 assert.deepEqual([preview.principalAmount,preview.interestAmount,preview.amount],['6000.00','1980.00','7980']);
 assert.ok(!preview.plan.allocations.some(line=>line.chargeId.startsWith('df10:')),'the posting is never a close line');
 assert.ok(!preview.plan.targetChargeId.startsWith('df10:'),'nor the target charge');
 // T3r: a second posting on the same day is refused and changes nothing.
 const requestId=randomUUID();
 await rejected('record_requires_reconciliation','loan.default','R109-T3',lossInputs('1000',true),requestId);
 const replay=await store.operation(principal,{requestId,operation:'loan.default',targetId:'R109-T3',expectedVersion:await version('R109-T3'),predecessorRequestId:null,receiptId:null,inputs:lossInputs('1000',true)});
 assert.equal(replay.originalOutcome?.code,'record_requires_reconciliation','replay returns the recorded outcome');
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM pwa_payment_commands WHERE request_id=$1',[requestId])).rows[0].n,1,'journal row recorded once');
 assert.equal((await loanRow('R109-T3')).loss,'4000.00');
 // The next scheduled charge (today+2) at the reduced daily interest over its 3 days (the posting is not "the latest charge").
 const next=await day(2);
 // The forecast treats the loan as open (no Negative obligation exception): Pay ahead offers the same reduced charge.
 assert.deepEqual((await admin.query(`SELECT charge_date::text AS d,principal_due::text AS p,interest_due::text AS i FROM public.pwa_next_projected_charge_v1($1,$2::date) WHERE loan_id='R109-T3'`,[fixture.borrowerId,today])).rows,[{d:next,p:'0',i:'540'}]);
 assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM public.reporting_forecast_inputs_v1 i CROSS JOIN LATERAL public.forecast_schedule_v1(i.loan,i.charges,i.reporting_date,i.month_end) s WHERE i.loan_id='R109-T3' AND s.origin='Exception'`)).rows[0].n,0);
 assert.equal((await admin.query('SELECT public.generate_loan_charge($1,$2::date) AS id',['R109-T3',next])).rows[0].id,'cg8:7:R109-T3:'+next);
 assert.deepEqual((await charges('R109-T3')).filter(row=>row.date===next).map(row=>[row.p,row.i]),[['0.00','540.00']]);
});

test('T4 a loss on each of two days sums; T4u undo reverses the latest only, then the earlier one; a third undo is refused',async()=>{
 await exampleLoan('R109-T4');
 await seedLoss('R109-T4','4000',-1);
 assert.deepEqual(await loanRow('R109-T4'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:'4000.00',tpr:'4000.00',outstanding:'6000.00',cdi:'180.00',edia:'180.00',tir:'-4000.00'});
 await applied('loan.default','R109-T4',lossInputs('2000',true));
 assert.deepEqual((await pairs('R109-T4')).map(row=>[row.id,row.p]),[[posting('R109-T4',await day(-1)),'4000.00'],[posting('R109-T4',today),'2000.00']]);
 assert.deepEqual(await loanRow('R109-T4'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:'6000.00',tpr:'6000.00',outstanding:'4000.00',cdi:'120.00',edia:'120.00',tir:'-6000.00'});
 assert.equal((await store.loanRecord(principal,'R109-T4')).item.defaultLossDate,today);
 await applied('loan.undo-default','R109-T4',{});
 assert.deepEqual((await pairs('R109-T4')).map(row=>row.id),[posting('R109-T4',await day(-1))]);
 assert.deepEqual(await loanRow('R109-T4'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:'4000.00',tpr:'4000.00',outstanding:'6000.00',cdi:'180.00',edia:'180.00',tir:'-4000.00'});
 const read=(await store.loanRecord(principal,'R109-T4')).item;assert.deepEqual([read.defaultLossDate,read.lastDefaultLoss],[await day(-1),'4000.00']);
 await applied('loan.undo-default','R109-T4',{});
 assert.deepEqual(await pairs('R109-T4'),[]);
 assert.deepEqual(await loanRow('R109-T4'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:null,tpr:'0.00',outstanding:'10000.00',cdi:'300.00',edia:'300.00',tir:'0.00'});
 await rejected('record_requires_reconciliation','loan.undo-default','R109-T4',{});
});

test('T5 a fully lost loan is written off and closed later with amount 0; undo reopens it, a second undo reverses the loss',async()=>{
 await exampleLoan('R109-T5');
 await seedLoss('R109-T5','10000',-1);
 assert.deepEqual([(await loanRow('R109-T5')).outstanding,(await loanRow('R109-T5')).cdi],['0.00','0.00']);
 await rejected('record_requires_reconciliation','loan.default','R109-T5',lossInputs('0',true));
 await applied('loan.default','R109-T5',lossInputs('0',false));
 assert.deepEqual((await pairs('R109-T5')).map(row=>row.id),[posting('R109-T5',await day(-1))],'no new pair');
 for(const row of (await charges('R109-T5')).filter(row=>!row.id.startsWith('df10:'))){
  assert.deepEqual([row.p,row.i],['0.00','0.00']);assert.equal(JSON.parse(row.notes.slice('Default write-off '.length)).posting,posting('R109-T5',today));
 }
 assert.deepEqual(await loanRow('R109-T5'),{defaulted:true,status:'ปิดยอดแล้ว',closeDate:today,closedBy:OWNER_EMAIL,loss:'10000.00',tpr:'10000.00',outstanding:'0.00',cdi:'0.00',edia:'0.00',tir:'-10000.00'});
 await applied('loan.undo-default','R109-T5',{});
 assert.deepEqual((await charges('R109-T5')).filter(row=>!row.id.startsWith('df10:')).map(row=>[row.p,row.i,row.notes]),[['0.00','900.00',null],['0.00','900.00',null]]);
 assert.deepEqual(await loanRow('R109-T5'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:'10000.00',tpr:'10000.00',outstanding:'0.00',cdi:'0.00',edia:'0.00',tir:'-10000.00'});
 await applied('loan.undo-default','R109-T5',{});
 assert.deepEqual(await pairs('R109-T5'),[]);
 assert.deepEqual([(await loanRow('R109-T5')).loss,(await loanRow('R109-T5')).outstanding,(await loanRow('R109-T5')).cdi],[null,'10000.00','300.00']);
});

test('T5b same-day full loss then write-off share one event: one undo reverses both',async()=>{
 await exampleLoan('R109-T5B');
 await applied('loan.default','R109-T5B',lossInputs('10000',true));
 await applied('loan.default','R109-T5B',lossInputs('0',false));
 assert.equal((await loanRow('R109-T5B')).defaulted,true);
 await applied('loan.undo-default','R109-T5B',{});
 assert.deepEqual(await pairs('R109-T5B'),[]);
 assert.deepEqual(await loanRow('R109-T5B'),{defaulted:false,status:'ยังไม่ปิดยอด',closeDate:null,closedBy:null,loss:null,tpr:'0.00',outstanding:'10000.00',cdi:'300.00',edia:'300.00',tir:'0.00'});
});

test('T6 refusals: amount, partial without keep, date, contract shape, missing rate, delete, direct edit, loan type, full keep with nothing unpaid, stray request',async()=>{
 await exampleLoan('R109-T6');
 const unchanged=await loanRow('R109-T6');
 await rejected('record_requires_reconciliation','loan.default','R109-T6',lossInputs('0',true));
 await rejected('record_requires_reconciliation','loan.default','R109-T6',lossInputs('0',false));
 await rejected('record_requires_reconciliation','loan.default','R109-T6',lossInputs('10001',true));
 await rejected('record_requires_reconciliation','loan.default','R109-T6',lossInputs('4000',false));
 await rejected('invalid_date','loan.default','R109-T6',lossInputs('4000',true,await day(-1)));
 for(const inputs of [{businessDate:today,amount:'40.5',keepCharges:true},{businessDate:today,amount:4000,keepCharges:true},{businessDate:today,amount:'4000',keepCharges:'true'},{businessDate:today,amount:'4000'},{businessDate:today,keepCharges:false}])
  assert.equal((await store.operation(principal,{requestId:randomUUID(),operation:'loan.default',targetId:'R109-T6',expectedVersion:await version('R109-T6'),predecessorRequestId:null,receiptId:null,inputs})).status,400,JSON.stringify(inputs));
 assert.deepEqual(await loanRow('R109-T6'),unchanged,'no refusal changes the loan');
 assert.deepEqual(await pairs('R109-T6'),[]);
 // A direct edit of the column is refused unless it equals the ledger.
 await assert.rejects(admin.query(`UPDATE "Loans" SET "Default Loss Amount"=1::money WHERE "Row ID"='R109-T6'`),/Default loss amount changes only through Default Loan or Undo Default/);
 // Delete is refused while any loss posting exists, on an open loan too.
 await applied('loan.default','R109-T6',lossInputs('4000',true));
 const deleted=await rejected('dependency_conflict','loan.delete','R109-T6',{});assert.ok(deleted);
 await assert.rejects(admin.query(`DELETE FROM "Loans" WHERE "Row ID"='R109-T6'`),/Undo Default before deleting this loan/);
 // The posting stays immutable; the kept charges stay editable.
 await assert.rejects(admin.query(`UPDATE "Charges" SET "Notes"='x' WHERE "Row ID"=$1`,[posting('R109-T6',today)]),/Default posting is immutable/);
 await admin.query(`UPDATE "Charges" SET "Notes"='kept charge note' WHERE "Row ID"='R109-T6-C1'`);
 // (A Processing or Error payment still blocks Default Loan, the V60 rule kept unchanged in post_loan_default; a synthetic
 // Processing payment posts at insert, so Test-DefaultLoan.sql's in-transaction fixture is where it is held.)
 // A daily-interest loan without a frozen rate cannot take a loss (the V68 recompute needs it), on any path.
 await exampleLoan('R109-T6R',{withCharges:false,dailyInterest:null});
 await admin.query(`UPDATE "Loans" SET "Current Daily Interest"=300::money WHERE "Row ID"='R109-T6R'`);
 assert.equal((await admin.query(`SELECT "Original Daily Interest Rate" AS r FROM "Loans" WHERE "Row ID"='R109-T6R'`)).rows[0].r,null);
 for(const inputs of [lossInputs('4000',true),lossInputs('10000',true),lossInputs('10000',false)])await rejected('record_requires_reconciliation','loan.default','R109-T6R',inputs);
 await assert.rejects(admin.query(`UPDATE "Loans" SET "Default Loss Amount"=4000::money WHERE "Row ID"='R109-T6R'`),/Default loss amount changes only through/);
 // Keeping charges needs a daily-interest loan; a fixed-date loan may still be written off and closed.
 await admin.query(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Due Date","Fixed Interest")
  VALUES('R109-T6F',$1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-7,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+20,100::money)`,[fixture.borrowerId,fixture.lendingAccountId]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='R109-T6F'`);
 await rejected('record_requires_reconciliation','loan.default','R109-T6F',lossInputs('1000',true));
 await applied('loan.default','R109-T6F',lossInputs('1000',false));
 // Chase D1: a full loss that keeps charges needs an unpaid charge (else the loan stays open at 0 with nothing to close it);
 // a partial loss on the same loan stays allowed, and write off and close remains available.
 await exampleLoan('R109-T6N',{withCharges:false});
 await rejected('record_requires_reconciliation','loan.default','R109-T6N',lossInputs('10000',true));
 assert.deepEqual(await pairs('R109-T6N'),[]);
 await applied('loan.default','R109-T6N',lossInputs('4000',true));
 assert.deepEqual([(await loanRow('R109-T6N')).outstanding,(await loanRow('R109-T6N')).cdi],['6000.00','180.00']);
 await applied('loan.undo-default','R109-T6N',{});
 await applied('loan.default','R109-T6N',lossInputs('10000',false));
 assert.equal((await loanRow('R109-T6N')).defaulted,true);
 // A request names its loan: a stray setting never applies to another row.
 const c=await admin.connect();try{
  await c.query('BEGIN');await c.query(`SELECT set_config('business_crud.default_request','{"loan":"R109-T6","op":"undo"}',true)`);
  await assert.rejects(c.query(`UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='R109-T6R'`),/Default request does not match this loan/);
 }finally{await c.query('ROLLBACK');c.release()}
});

test('T8 views: every loan with a loss is a default; the portfolio summary appends Total Principal Loss',async()=>{
 await admin.query(`INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('R109-VB','Synthetic view borrower')`);
 if(!(await admin.query('SELECT 1 FROM "Statistics"')).rowCount)await admin.query(`INSERT INTO "Statistics"("Row ID","Statistics ID") VALUES($1,'R109 portfolio')`,[randomUUID()]);
 await exampleLoan('R109-V1',{borrower:'R109-VB'});
 await admin.query(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval")
  VALUES('R109-M1','R109-VB',$1,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-7,500::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,15::money,3)`,[fixture.lendingAccountId]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='R109-M1'`);
 const borrower=async()=>(await admin.query(`SELECT "Default Count"::integer AS count,"Lifetime Default Loss"::numeric::text AS loss,"Daily Collection Status" AS status,"Largest Successful Loan"::numeric::text AS largest FROM olap_borrowers_analytics WHERE "Row ID"='R109-VB'`)).rows[0];
 const health=async()=>(await admin.query(`SELECT default_count,recorded_default_loss::numeric::text AS loss FROM reporting_borrower_payment_health_v1 WHERE borrower_id='R109-VB'`)).rows[0];
 const portfolio=async()=>(await admin.query(`SELECT "Outstanding Principal"::numeric AS outstanding,"Expected Daily Interest"::numeric AS daily,"Total Principal Loss"::numeric AS loss FROM olap_portfolio_summary`)).rows[0];
 const columns=async view=>(await admin.query(`SELECT array_agg(column_name::text ORDER BY ordinal_position) AS c FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,[view])).rows[0].c;
 const before={borrower:await borrower(),portfolio:await portfolio(),columns:await columns('olap_borrowers_analytics'),health:await columns('reporting_borrower_payment_health_v1')};
 assert.deepEqual([before.borrower.count,Number(before.borrower.loss)],[0,0]);
 assert.equal((await columns('olap_portfolio_summary'))[43],'Total Principal Loss','V120 column 44 (V128 appends the write-offs after it)');
 await applied('loan.default','R109-V1',lossInputs('4000',true));
 const partial=await portfolio();
 assert.equal(Number(partial.outstanding)-Number(before.portfolio.outstanding),-4000,'portfolio principal drops by the loss');
 assert.equal(Number(partial.daily)-Number(before.portfolio.daily),-120,'Expected Daily Interest drops from 300 to 180');
 assert.equal(Number(partial.loss)-Number(before.portfolio.loss),4000);
 await applied('loan.default','R109-M1',lossInputs('500',false));
 const afterBorrower=await borrower();
 assert.deepEqual([afterBorrower.count,Number(afterBorrower.loss),afterBorrower.status],[2,4500,before.borrower.status],'Default Count and Lifetime Default Loss cover the open loss; collection status unchanged');
 assert.deepEqual(await health(),{default_count:2,loss:'4500.00'});
 assert.equal(Number((await portfolio()).loss)-Number(before.portfolio.loss),4500,'Total Principal Loss covers the open loss and the Defaulted loan');
 assert.deepEqual([await columns('olap_borrowers_analytics'),await columns('reporting_borrower_payment_health_v1')],[before.columns,before.health],'column lists unchanged');
 // A dashboard read carries the figure as money.
 const dashboard=await store.dashboard(principal);assert.equal(dashboard.status??200,200,JSON.stringify(dashboard).slice(0,300));
 assert.equal(dashboard.principalLoss,String(Math.round(Number((await portfolio()).loss))));
});
