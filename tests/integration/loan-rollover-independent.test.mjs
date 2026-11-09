import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {canonicalOperation} from '../../services/contracts/operation-command.mjs';
import {OWNER_EMAIL} from '../../services/lib/identity.mjs';
import {migrationHead} from '../migration-head.mjs';
// R136 V138: loan.rollover through the real application role and the command store, on the migration head (receiving group):
// the rollover preview read, the apply (journal row with both receipts, both loans' links and versions), idempotent replay,
// source_conflict for a changed original loan, rollover_ineligible for a closed one, and the contract's refusals. The SQL
// arithmetic of every case is in scripts/database/Test-Rollover.sql. Synthetic data only.
let admin,app,store,fixture,today;const user='mw_app_dev_r136_fixture';
const principal={ok:true,email:OWNER_EMAIL,subject:'r136-rollover-owner'};
before(async()=>{
 const head=migrationHead();
 admin=await disposablePool(head);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:4});
 const proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:head});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 fixture=await seedPaymentFixture(admin,'R136-RL');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 await admin.query(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('R136-CAPITAL',$1,current_date,'Contribution',500000::money)`,[fixture.actorId]);
 today=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
});
after(async()=>{await app?.end();await admin?.end()});
let n=0;
/** The owner's example: 10,000 at 500 a day over 25 days, fee 1,000, today is day 18, days 1 to 18 charged and repaid. */
async function instalment(){
 const id='R136-L'+(++n),borrower='R136-B'+n;
 await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name","Description") VALUES($1,$2,$3)',[borrower,'SYNTHETIC ROLLOVER '+n,'Rollover '+n]);
 await admin.query(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Transfer Fee","Loan Status","Loan Type","Due Date","Daily Payment Amount","Auto Charge Enabled","Interest Payment Interval","Defaulted")
  VALUES($1,$2,$3,$4::date-17,10000::money,1000::money,'ยังไม่ปิดยอด','ผ่อนชำระรายวัน',$4::date+7,500::money,false,1,false)`,[id,borrower,fixture.lendingAccountId,today]);
 for(let k=1;k<=18;k++){
  const charge=(k===1?'fd6:':'cg8:'+k+':')+id;
  await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,$3::date-18+$4::integer,400::money,$5::money)`,[charge,id,today,k,k===1?1100:100]);
  await admin.query(`INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES($1,$2,$3,$4::date-18+$5::integer,400::money,$6::money)`,['rp:'+charge,id,charge,today,k,k===1?1100:100]);
 }
 await admin.query('UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1',[id]);
 return {id,borrower};
}
const rollover=(loan,preview,over={})=>({requestId:randomUUID(),operation:'loan.rollover',targetId:randomUUID(),expectedVersion:null,predecessorRequestId:null,receiptId:null,
 inputs:{borrowerId:loan.borrower,loanDate:preview.businessDate,principal:'10000',transferFee:'1000',disbursingAccountId:fixture.lendingAccountId,type:'ผ่อนชำระรายวัน',
  dueDate:new Date(Date.parse(preview.businessDate+'T00:00:00Z')+24*86400000).toISOString().slice(0,10),dailyPayment:'500',fixedInterest:null,currentDailyInterest:null,paymentInterval:1,
  arrangement:'Rollover of loan '+loan.id,autoChargeEnabled:true,sourceLoanId:loan.id,sourceExpectedVersion:preview.source.version,penalty:preview.penalty,
  expectedSettlement:preview.quote?.settlement??'1',expectedPlanHash:preview.quote?.planHash??'0'.repeat(64),...over}});

test('preview: the quote, the original terms and the day and penalty rules',async()=>{
 const loan=await instalment();
 const preview=await store.loanRolloverPreview(principal,loan.id,{});
 assert.equal(preview.status,200,JSON.stringify(preview));
 assert.equal(preview.eligible,true);assert.equal(preview.businessDate,today);assert.equal(preview.penalty,'2000');
 assert.deepEqual([preview.quote.unpaid,preview.quote.unchargedDays,preview.quote.missingPrincipal,preview.quote.remainingInterest,preview.quote.settlement],['0',7,'2800','700','5500']);
 assert.equal(preview.source.term,25);assert.equal(preview.source.type,'ผ่อนชำระรายวัน');assert.match(preview.source.version,/^[a-f0-9]{64}$/);
 assert.ok(preview.accounts.some(row=>row.id===fixture.lendingAccountId));
 const typed=await store.loanRolloverPreview(principal,loan.id,{day:preview.yesterday,penalty:'2250'});
 assert.equal(typed.status,200);assert.equal(typed.businessDate,preview.yesterday);assert.equal(typed.quote.penalty,'2250');
 for(const options of [{day:'2001-01-01'},{penalty:'-5'},{penalty:'0.5'}])assert.equal((await store.loanRolloverPreview(principal,loan.id,options)).status,400,JSON.stringify(options));
 assert.equal((await store.loanRolloverPreview(principal,'R136-MISSING',{})).status,404);
});

test('apply: one journal row with both receipts, the links, versions and idempotent replay',async()=>{
 const loan=await instalment(),preview=await store.loanRolloverPreview(principal,loan.id,{});
 const command=rollover(loan,preview);
 const applied=await store.operation(principal,command);
 assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));
 const result=applied.originalOutcome.result;
 assert.equal(result.operation,'loan.rollover');assert.equal(result.targetId,command.targetId);
 assert.equal(result.paymentId,'fd6:fd6:'+command.targetId);assert.equal(result.settlement.paymentId,'pwa:'+command.requestId);
 assert.equal(result.rollover.closedLoanId,loan.id);assert.equal(result.rollover.statement.cashIssued,'3000');assert.equal(result.rollover.statement.profit,'3800');
 const replay=await store.operation(principal,command);
 assert.deepEqual(replay.originalOutcome,applied.originalOutcome,'the same request replays its recorded outcome');
 const other=await store.operation(principal,{...command,inputs:{...command.inputs,arrangement:'Another note'}});
 assert.equal(other.status,409);assert.equal(other.code,'command_conflict');
 const journal=(await admin.query(`SELECT count(*)::integer AS n,min(result_json->>'paymentId') AS first,min(result_json#>>'{settlement,paymentId}') AS settlement FROM pwa_payment_commands WHERE request_id=$1`,[command.requestId])).rows[0];
 assert.deepEqual(journal,{n:1,first:'fd6:fd6:'+command.targetId,settlement:'pwa:'+command.requestId});
 const source=(await store.loanRecord(principal,loan.id)).item,created=(await store.loanRecord(principal,command.targetId)).item;
 assert.equal(source.status,'ปิดยอดแล้ว');assert.notEqual(source.version,preview.source.version,'the original loan has a new version');
 assert.equal(source.rolledOverToLoanId,command.targetId);assert.equal(source.rolledOverToLoanDate,today);assert.match(source.rolledOverToDisplayKey,/SYNTHETIC ROLLOVER/);
 assert.equal(created.rolloverSourceLoanId,loan.id);assert.equal(created.rolloverSourceCloseDate,today);assert.match(created.version,/^[a-f0-9]{64}$/);
 assert.equal(created.rolledOverToLoanId,null);
 const settlement=(await store.paymentRecord(principal,'pwa:'+command.requestId)).item;
 assert.equal(Number(settlement.amountReceived),5500);assert.equal(settlement.originalOutcomeStatus,'applied');assert.equal(settlement.provenance.plan.allocationMethod,'Selected Charges');
});

test('refusals: source_conflict for a changed original loan, rollover_ineligible for a closed one, invalid inputs',async()=>{
 const loan=await instalment(),preview=await store.loanRolloverPreview(principal,loan.id,{});
 await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,$3::date,0::money,50::money)`,['R136-LATE-'+n,loan.id,today]);
 const stale=await store.operation(principal,rollover(loan,preview));
 assert.equal(stale.originalOutcome?.status,'rejected');assert.equal(stale.originalOutcome?.code,'source_conflict');
 const fresh=await store.loanRolloverPreview(principal,loan.id,{});
 assert.equal((await store.operation(principal,rollover(loan,fresh))).originalOutcome?.status,'applied');
 const closed=await store.loanRolloverPreview(principal,loan.id,{});
 assert.equal(closed.eligible,false);assert.equal(closed.reason,'closed');
 const refused=await store.operation(principal,rollover(loan,closed));
 assert.equal(refused.originalOutcome?.code,'rollover_ineligible',JSON.stringify(refused));
 for(const over of [{penalty:'-1'},{penalty:'1.5'},{expectedSettlement:'0'},{type:'กำหนดวันชำระ'},{autoChargeEnabled:false},{scheduleAnchor:today},{sourceExpectedVersion:'x'}]){
  assert.throws(()=>canonicalOperation(rollover(loan,fresh,over)),/invalid_request/,JSON.stringify(over));
  assert.equal((await store.operation(principal,rollover(loan,fresh,over))).status,400,JSON.stringify(over));
 }
 assert.throws(()=>canonicalOperation({...rollover(loan,fresh),expectedVersion:'a'.repeat(64)}),/invalid_request/);
});
