import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {settlementVersionSql} from '../../services/business/referrers.mjs';
import {sortedExpenseIds as sortedExpenseIdsOf} from '../../services/contracts/rebate-settlement-command.mjs';
import {OWNER_EMAIL} from '../../services/lib/identity.mjs';
import {migrationHead} from '../migration-head.mjs';
import {renderNotification} from '../../services/notifications/content.mjs';
// R129 V137: referral rebate settlement through the real application role and the command store, on the migration head
// (receiving group): a close books a pending rebate, the Referrers reads (list, detail, accruing estimate, history), the
// settle and delete operations, the expense and payment states, the version mirror, and the design's case 14 (two
// settlements of one rebate in parallel; a settlement and the closing-payment delete in parallel). Synthetic data only.
let admin,app,store,fixture,today;const user='mw_app_dev_r129_fixture';
const principal={ok:true,email:OWNER_EMAIL,subject:'r129-rebate-owner'};
const day=offset=>(admin.query("SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+$1::integer)::text AS day",[offset])).then(r=>r.rows[0].day);
before(async()=>{
 const head=migrationHead();
 admin=await disposablePool(head);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:4});
 const proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:head});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 fixture=await seedPaymentFixture(admin,'R129-REB');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 await admin.query(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('R129-CAPITAL',$1,current_date,'Contribution',200000::money)`,[fixture.actorId]);
 today=await day(0);
 // Design case 13: the DEV reconcile (applied above) keeps the settlements read-only for the application role.
 const access=(await admin.query(`SELECT has_table_privilege('mw_app_dev','public.pwa_rebate_settlements','SELECT') AS r,has_table_privilege('mw_app_dev','public.pwa_rebate_settlements','INSERT') OR has_table_privilege('mw_app_dev','public.pwa_rebate_settlements','UPDATE') OR has_table_privilege('mw_app_dev','public.pwa_rebate_settlements','DELETE') AS w`)).rows[0];
 assert.deepEqual(access,{r:true,w:false},'the reconcile keeps pwa_rebate_settlements read-only for mw_app_dev');
});
after(async()=>{await app?.end();await admin?.end()});
let n=0;
const loanSql=`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval") VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,100::money,1)`;
const chargeSql=`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,0::money,$3::money)`;
/** A referrer with no loan of its own and `count` referred borrowers, each with an open loan of 1000 and `interest` due today. */
async function scenario({count=1,interest=3000,terms=null}={}){
 const id='R129-S'+(++n),referrer=id+'-REF',borrowers=[],loans=[];
 await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name","Description","Referral Rebate Rate","Referral Rebate Cap") VALUES($1,$2,$3,$4,$5)',[referrer,'SYNTHETIC REFERRER '+id,'Mai '+id,terms?.rate??null,terms?.cap??null]);
 for(let k=1;k<=count;k++){const b=id+'-B'+k,l=id+'-L'+k;borrowers.push(b);loans.push(l);
  await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES($1,$2,$3)',[b,'SYNTHETIC REFERRED '+id+' '+k,referrer]);
  await admin.query(loanSql,[l,b,fixture.lendingAccountId]);await admin.query(chargeSql,[l+'-today',l,interest]);
  await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[l]);}
 return {id,referrer,borrowers,loans};
}
const closeCommand=(loan,preview,inputs={})=>({requestId:randomUUID(),operation:'loan.close',targetId:loan,expectedVersion:preview.sourceVersion,predecessorRequestId:null,receiptId:null,inputs:{paymentDate:preview.businessDate,cashAccountId:fixture.receivingAccountId,paymentMethod:'Cash',notes:'close synthetic',expectedAmount:preview.amount,expectedPlanHash:preview.planHash,...inputs}});
async function close(loan){const preview=await store.loanClosePreview(principal,loan);assert.equal(preview.status,200,JSON.stringify(preview));const applied=await store.operation(principal,closeCommand(loan,preview,{rebatePath:'expense'}));assert.equal(applied.originalOutcome?.status,'applied',JSON.stringify(applied));return {preview,applied};}
const lisaAccount=async()=>(await admin.query(`SELECT public.default_cash_account('ch:lisa') AS id`)).rows[0].id;
const settleCommand=async(referrer,expenseIds,over={})=>({requestId:randomUUID(),operation:'rebate-settlement.create',targetId:randomUUID(),expectedVersion:null,predecessorRequestId:null,receiptId:null,
 inputs:{referrerId:referrer,expenseIds:sortedExpenseIdsOf(expenseIds),settlementDate:today,cashAccountId:await lisaAccount(),paymentMethod:'Bank Transfer',bankReference:'R129-REF',notes:null,...over}});
const deleteCommand=(id,version)=>({requestId:randomUUID(),operation:'rebate-settlement.delete',targetId:id,expectedVersion:version,predecessorRequestId:null,receiptId:null,inputs:{}});
const paymentDelete=async paymentId=>{const record=(await store.paymentRecord(principal,paymentId,{preview:true})).item;return {requestId:randomUUID(),operation:'payment.delete',targetId:paymentId,expectedVersion:record.sourceVersion,predecessorRequestId:record.predecessorRequestId,receiptId:null,inputs:{}}};
const closing=async loan=>(await admin.query('SELECT "Ref Closing Payment" AS id FROM "Loans" WHERE "Row ID"=$1',[loan])).rows[0].id;
const owed=async referrer=>(await admin.query('SELECT public.pwa_rebates_owed_v1($1)::numeric(20,2)::text AS v',[referrer])).rows[0].v;
const cents=value=>Math.round(Number(value)*100);
/** The referred borrowers' figures add up to the referrer's four tiles. */
function assertRefereesSum(detail){
 const sum=key=>detail.referees.reduce((total,row)=>total+cents(row[key]),0);
 assert.deepEqual([sum('unpaidAmount'),sum('accruingAmount'),sum('paidAmount'),sum('offsetAmount')],
  [cents(detail.referrer.unpaidAmount),cents(detail.referrer.accruingAmount),cents(detail.referrer.paidToDate),cents(detail.referrer.offsetToDate)],'the referees add up to the tiles');
}

/** A legacy (V2) rebate of s.referrer, paid at close: its borrower is referred only after the close (no rebate then), and the row
 * is written the way the V135 trigger wrote it (from inside a trigger, as the referral rule requires; nothing disabled). */
async function legacyRebate(s){
 const legacyBorrower=s.id+'-LB',legacyLoan=s.id+'-LEGACY';
 await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES($1,$2)',[legacyBorrower,'SYNTHETIC LEGACY '+s.id]);
 await admin.query(loanSql,[legacyLoan,legacyBorrower,fixture.lendingAccountId]);await admin.query(chargeSql,[legacyLoan+'-today',legacyLoan,3000]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[legacyLoan]);
 const legacyPreview=await store.loanClosePreview(principal,legacyLoan);assert.equal(legacyPreview.rebate,null,'no referrer yet: no rebate');
 assert.equal((await store.operation(principal,closeCommand(legacyLoan,legacyPreview))).originalOutcome?.status,'applied');
 await admin.query('UPDATE "Borrowers" SET "Ref Referrer"=$1 WHERE "Row ID"=$2',[s.referrer,legacyBorrower]);
 const c=await admin.connect();
 try{
  await c.query('CREATE TEMP TABLE r129_legacy(j jsonb)');
  await c.query(`CREATE FUNCTION pg_temp.r129_legacy() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN
   INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Payee Name","Ref Payee Borrower","Ref Related Borrower","Ref Related Loan","Source Type","Source Key","Gross Profit Basis","Rule Version","Created By","Rebate Rate","Rebate Cap")
   SELECT r."Row ID",r."Expense Date",r."Expense Category",r."Amount",r."Payee Name",r."Ref Payee Borrower",r."Ref Related Borrower",r."Ref Related Loan",r."Source Type",r."Source Key",r."Gross Profit Basis",r."Rule Version",r."Created By",r."Rebate Rate",r."Rebate Cap"
   FROM jsonb_populate_record(NULL::public."Business Expenses",NEW.j) r; RETURN NULL; END $f$`);
  await c.query('CREATE TRIGGER r129_legacy AFTER INSERT ON r129_legacy FOR EACH ROW EXECUTE FUNCTION pg_temp.r129_legacy()');
  await c.query('INSERT INTO r129_legacy VALUES($1::jsonb)',[JSON.stringify({'Row ID':'rr1:'+legacyLoan,'Expense Date':today,'Expense Category':'Referral Rebate / เงินคืนค่าแนะนำลูกค้า','Amount':300,'Payee Name':'SYNTHETIC REFERRER '+s.id,
   'Ref Payee Borrower':s.referrer,'Ref Related Borrower':legacyBorrower,'Ref Related Loan':legacyLoan,'Source Type':'Referral Rebate','Source Key':'REFERRAL_REBATE:'+legacyLoan,'Gross Profit Basis':3000,'Rule Version':'REFERRAL_REBATE_V2','Created By':'SQL:loan-close','Rebate Rate':10,'Rebate Cap':1000})]);
 }finally{c.release(true)}
 return {legacyBorrower,legacyLoan};
}

test('a close books a pending rebate: preview owedBefore, the result pending and owedTotal, the expense and payment states',async()=>{
 const s=await scenario({count:2});
 const first=await close(s.loans[0]);assert.equal(first.preview.rebate.owedBefore,'0');
 assert.deepEqual([first.applied.originalOutcome.result.rebate.pending,first.applied.originalOutcome.result.rebate.owedTotal],['300','300']);
 const second=await close(s.loans[1]);assert.equal(second.preview.rebate.owedBefore,'300','the first rebate is owed');
 assert.equal(second.applied.originalOutcome.result.rebate.owedTotal,'600');
 const expense=await store.expenseRecord(principal,'rr1:'+s.loans[0]);assert.equal(expense.status,200,JSON.stringify(expense));
 assert.deepEqual([expense.item.ruleVersion,expense.item.rebateState,expense.item.pendingAmount,expense.item.settlementId,expense.item.settlementDate],['REFERRAL_REBATE_V3','pending','300.00',null,null]);
 assert.equal(expense.item.reimbursements.length,0,'no cash row at the close');
 const payment=await store.paymentRecord(principal,await closing(s.loans[0]));assert.equal(payment.status,200);
 assert.deepEqual([payment.item.closeRebates[0].rebateState,payment.item.closeRebates[0].pendingAmount,payment.item.closeRebates[0].owedTotal],['pending','300.00','600.00']);
 const borrower=await store.borrowerRecord(principal,s.referrer);assert.deepEqual([borrower.item.details.isReferrer,borrower.item.details.referrerUnpaidAmount,borrower.item.details.referrerUnpaidSince],[true,'600.00',today]);
 // Pay one of the two: a subset settlement.
 const settle=await store.operation(principal,await settleCommand(s.referrer,['rr1:'+s.loans[0]]));assert.equal(settle.originalOutcome?.status,'applied',JSON.stringify(settle));
 const id=settle.originalOutcome.result.targetId;
 const paid=await store.expenseRecord(principal,'rr1:'+s.loans[0]);assert.deepEqual([paid.item.rebateState,paid.item.pendingAmount,paid.item.settlementId,paid.item.settlementDate],['paid','0.00',id,today]);
 assert.notEqual(paid.item.version,expense.item.version,'the expense version changes on settlement');
 const after=await store.paymentRecord(principal,await closing(s.loans[0]));assert.deepEqual([after.item.closeRebates[0].rebateState,after.item.closeRebates[0].settlementDate,after.item.closeRebates[0].owedTotal],['paid',today,'300.00']);
 // The settlement read, its version equals the SQL function and the Node mirror, and its delete.
 const record=await store.rebateSettlementRecord(principal,id);assert.equal(record.status,200,JSON.stringify(record));
 assert.deepEqual([record.item.amount,record.item.referrerId,record.item.paymentMethod,record.item.bankReference,record.item.rebates.length,record.item.rebates[0].paidAmount],['300.00',s.referrer,'Bank Transfer','R129-REF',1,'300.00']);
 const sqlVersion=(await admin.query('SELECT public.pwa_rebate_settlement_version_v1($1) AS v',[id])).rows[0].v;
 const mirror=(await admin.query(settlementVersionSql,[id])).rows[0].encode;
 assert.equal(record.item.version,sqlVersion);assert.equal(mirror,sqlVersion,'the Node mirror is the SQL text');
 // The session time zone does not change the version.
 const tz=await admin.connect();try{await tz.query("SET TimeZone='America/Los_Angeles'");assert.equal((await tz.query('SELECT public.pwa_rebate_settlement_version_v1($1) AS v',[id])).rows[0].v,sqlVersion)}finally{tz.release()}
 const removed=await store.operation(principal,deleteCommand(id,record.item.version));assert.equal(removed.originalOutcome?.status,'applied',JSON.stringify(removed));
 assert.equal(await owed(s.referrer),'600.00');assert.equal((await store.rebateSettlementRecord(principal,id)).status,404);
});

test('Referrers list and detail: owed, accruing at custom terms (0 and 3,000 received), history with a legacy row, sorting',async()=>{
 // T: custom terms 15% and 2,000; one closed referred loan (pending 450 of 3,000 interest), two open ones: one has 3,000 interest
 // received (estimate 450), the other nothing yet (0).
 const t=await scenario({count:3,terms:{rate:15,cap:2000}});
 await close(t.loans[0]);
 const assigned=await store.autoAssign(principal,t.borrowers[1],{amountReceived:'3000'});assert.equal(assigned.status,200,JSON.stringify(assigned));
 const posted=await store.submit(principal,{schemaVersion:7,requestId:randomUUID(),borrowerId:t.borrowers[1],allocations:assigned.allocations,cashAccountId:fixture.receivingAccountId,paymentDate:today,amountReceived:'3000',paymentMethod:'Bank Transfer',notes:null,receiptId:null,bankReference:null,transferTime:null});
 assert.equal(posted.originalOutcome?.status,'posted',JSON.stringify(posted));
 await admin.query(`DELETE FROM "Charges" WHERE "Row ID"=$1`,[t.loans[2]+'-today']);
 // A legacy (V2) rebate of T, paid at close (legacyRebate).
 const {legacyBorrower,legacyLoan}=await legacyRebate(t);
 const legacy=await store.expenseRecord(principal,'rr1:'+legacyLoan);assert.deepEqual([legacy.item.rebateState,legacy.item.pendingAmount,legacy.item.reimbursements.length],['paid-at-close','0.00',1],'a legacy row moved its cash at close and is never pending');
 const list=await store.referrers(principal);assert.equal(list.status,200,JSON.stringify(list).slice(0,300));
 const row=list.items.find(r=>r.id===t.referrer);assert.ok(row,'the referrer is listed');
 assert.deepEqual([row.terms,row.referredCount,row.unpaidAmount,row.unpaidCount,row.oldestUnpaidCloseDate,row.accruingAmount,row.accruingLoanCount,row.paidToDate],[{rate:15,cap:2000,custom:true},4,'450.00',1,today,'450.00',2,'300.00']);
 // Sorted by unpaid amount, then accruing, then name.
 const amounts=list.items.map(r=>[Number(r.unpaidAmount),Number(r.accruingAmount)]);
 for(let k=1;k<amounts.length;k++)assert.ok(amounts[k-1][0]>amounts[k][0]||(amounts[k-1][0]===amounts[k][0]&&amounts[k-1][1]>=amounts[k][1]),'sorted');
 const detail=await store.referrerRecord(principal,t.referrer);assert.equal(detail.status,200,JSON.stringify(detail).slice(0,300));
 assert.deepEqual(detail.unpaid.map(r=>[r.expenseId,r.pendingAmount,r.closeDate]),[['rr1:'+t.loans[0],'450.00',today]]);
 assert.deepEqual(detail.accruing.map(r=>[r.loanId,r.profitToDate,r.estimatedRebate]).sort(),[[t.loans[1],'3000.00','450.00'],[t.loans[2],'0.00','0.00']].sort());
 assert.ok(detail.unpaid[0].loanDisplayKey&&detail.accruing[0].loanDisplayKey,'loan keys');
 assert.deepEqual(detail.history.map(h=>[h.kind,h.amount,h.date,h.expenseId]),[['paid-at-close','300.00',today,'rr1:'+legacyLoan]],'the legacy row Lisa paid at close');
 // Referred borrowers: one row each (the legacy borrower too), sorted unpaid, then accruing, then the Thai name; they add up to the tiles.
 const refereeRows=d=>d.referees.map(r=>[r.borrowerId,r.loanCount,r.openLoanCount,r.unpaidAmount,r.paidAmount,r.offsetAmount,r.accruingAmount]);
 assert.deepEqual(refereeRows(detail),[[t.borrowers[0],1,0,'450.00','0.00','0.00','0.00'],[t.borrowers[1],1,1,'0.00','0.00','0.00','450.00'],
  [legacyBorrower,1,0,'0.00','300.00','0.00','0.00'],[t.borrowers[2],1,1,'0.00','0.00','0.00','0.00']]);
 assert.equal(detail.referees[0].borrowerLabel,'SYNTHETIC REFERRED '+t.id+' 1');
 assertRefereesSum(detail);
 assert.equal(detail.settleOptions.defaultAccountId,await lisaAccount());assert.ok(detail.settleOptions.accounts.length>=1);assert.equal(detail.settleOptions.businessDate,today);
 // R141: owed=1 lists the referrers still owed rebates; its total is the Cash Position Rebates payable amount.
 const owedList=async()=>{const answer=await store.referrers(principal,{owed:'1'});assert.equal(answer.status,200,JSON.stringify(answer).slice(0,300));const position=await store.management(principal,'cash-position');assert.equal(position.status,200);
  assert.ok(answer.items.every(r=>Number(r.unpaidAmount)>0),'only owed referrers');assert.equal(answer.filter.total.count,answer.items.length);
  assert.equal(answer.filter.total.amount,position.rebatesPayable.amount,'the filter total is the Rebates payable line');
  assert.equal(answer.items.reduce((sum,r)=>sum+Number(r.unpaidAmount),0).toFixed(2),answer.filter.total.amount);return answer};
 assert.ok((await owedList()).items.some(r=>r.id===t.referrer),'the owed referrer is listed');
 assert.equal((await store.referrers(principal,{owed:'yes'})).status,400);
 const settled=await store.operation(principal,await settleCommand(t.referrer,['rr1:'+t.loans[0]],{paymentMethod:'Cash',bankReference:null}));assert.equal(settled.originalOutcome?.status,'applied',JSON.stringify(settled));
 assert.equal((await owedList()).items.some(r=>r.id===t.referrer),false,'settled: no longer owed');
 const later=await store.referrerRecord(principal,t.referrer);
 assert.deepEqual(later.history.map(h=>[h.kind,h.amount,h.rebateCount??null,h.paymentMethod??null]),[['settlement','450.00',1,'Cash'],['paid-at-close','300.00',null,null]],'newest first: the settlement, then the legacy row');
 assert.equal(later.referrer.paidToDate,'750.00');assert.equal(later.referrer.unpaidAmount,'0.00');
 assert.deepEqual(later.referees.find(r=>r.borrowerId===t.borrowers[0]).paidAmount,'450.00','the settled rebate counts as paid');assertRefereesSum(later);
 // A borrower who referred nobody and has no rebate is not a referrer.
 assert.equal((await store.referrerRecord(principal,t.borrowers[0])).status,404);
 assert.equal((await store.referrerRecord(principal,'bad\nid')).status,400);
});

test('case 14: two settlements of the same rebate in parallel: one applies, the other is record_requires_reconciliation',async()=>{
 const s=await scenario();await close(s.loans[0]);
 const [a,b]=await Promise.all([store.operation(principal,await settleCommand(s.referrer,['rr1:'+s.loans[0]])),store.operation(principal,await settleCommand(s.referrer,['rr1:'+s.loans[0]]))]);
 const outcomes=[a,b].map(r=>r.originalOutcome?.status==='applied'?'applied':r.originalOutcome?.code??r.code).sort();
 assert.deepEqual(outcomes,['applied','record_requires_reconciliation'],JSON.stringify([a,b]));
 assert.equal((await admin.query('SELECT count(*)::int AS n FROM pwa_rebate_settlements WHERE payee_borrower_id=$1',[s.referrer])).rows[0].n,1);
 assert.equal((await admin.query(`SELECT count(*)::int AS n FROM "Cash Ledger" WHERE "Source Type"='Rebate Settlement' AND "Ref Rebate Settlement" IN (SELECT id FROM pwa_rebate_settlements WHERE payee_borrower_id=$1)`,[s.referrer])).rows[0].n,1);
 assert.equal(await owed(s.referrer),'0.00');
});

test('case 14: a settlement and the closing-payment delete in parallel: one wins, the other is refused or finds nothing pending',async()=>{
 for(let round=0;round<3;round++){
  const s=await scenario();await close(s.loans[0]);
  const payment=await closing(s.loans[0]),remove=await paymentDelete(payment),settle=await settleCommand(s.referrer,['rr1:'+s.loans[0]]);
  const [x,y]=await Promise.all([store.operation(principal,settle),store.operation(principal,remove)]);
  const settled=x.originalOutcome?.status==='applied',deleted=y.originalOutcome?.status==='applied';
  assert.ok(settled!==deleted,'exactly one wins: '+JSON.stringify([x,y]));
  const loser=settled?y:x;assert.ok(['dependency_conflict','record_requires_reconciliation','command_busy'].includes(loser.originalOutcome?.code??loser.code),JSON.stringify(loser));
  const expense=(await admin.query(`SELECT "Ref Rebate Settlement" AS link FROM "Business Expenses" WHERE "Row ID"=$1`,['rr1:'+s.loans[0]])).rows[0];
  if(settled){assert.ok(expense?.link,'the rebate stays, paid');assert.ok((await admin.query('SELECT 1 FROM "Payments" WHERE "Row ID"=$1',[payment])).rowCount);}
  else{assert.equal(expense,undefined,'the rebate went with its closing payment');assert.equal((await admin.query('SELECT count(*)::int AS n FROM pwa_rebate_settlements WHERE payee_borrower_id=$1',[s.referrer])).rows[0].n,0);}
  assert.equal(await owed(s.referrer),'0.00');
 }
});

test('a closing payment whose rebate is paid cannot be deleted until the settlement goes (dependency_conflict)',async()=>{
 const s=await scenario();await close(s.loans[0]);
 const settle=await store.operation(principal,await settleCommand(s.referrer,['rr1:'+s.loans[0]]));assert.equal(settle.originalOutcome?.status,'applied');
 const refused=await store.operation(principal,await paymentDelete(await closing(s.loans[0])));assert.equal(refused.originalOutcome?.code,'dependency_conflict',JSON.stringify(refused));
 const record=await store.rebateSettlementRecord(principal,settle.originalOutcome.result.targetId);
 assert.equal((await store.operation(principal,deleteCommand(record.item.id,record.item.version))).originalOutcome?.status,'applied');
 assert.equal((await store.operation(principal,await paymentDelete(await closing(s.loans[0])))).originalOutcome?.status,'applied');
 assert.equal((await store.expenseRecord(principal,'rr1:'+s.loans[0])).status,404);
});

/** The records bundle as the PWA reads it through the command store (protocol 3): a full walk, then deltas since its cursor. */
const recordsRead=async(input,label,domain='records')=>{const r=await store.offlineDataset(principal,domain,undefined,{protocol:3,input:{cursor:null,need:[],sourceVersion:null,acceptChanged:true,...input}});assert.equal(r.status,200,label+': '+JSON.stringify(r).slice(0,300));return r};
async function recordsWalk(label,domain='records'){let cursor=null,changes=null;for(let k=0;k<500;k++){const r=await recordsRead({cursor},label+' ('+domain+' walk)',domain);changes??=r.changes??null;if(r.complete)return {sourceVersion:r.sourceVersion,changes};cursor=r.nextCursor}throw Error('walk did not complete')}
async function recordsAfter(state,label){await recordsRead({sourceVersion:state.sourceVersion,since:state.changes},label+' (delta)');return recordsWalk(label)}
test('PROD defect: the records offline dataset still reads after a close with a pending rebate, a settlement and its delete',async()=>{
 // The records dashboard reads olap_portfolio_summary, one row per Statistics row (DEV and PROD have one).
 if(!(await admin.query('SELECT 1 FROM public."Statistics"')).rowCount)await admin.query(`INSERT INTO "Statistics"("Row ID","Statistics ID") VALUES ('r129-statistics','r129')`);
 const s=await scenario({count:2});let state=await recordsWalk('start');
 await close(s.loans[0]);state=await recordsAfter(state,'pending V3 rebate');
 const settle=await store.operation(principal,await settleCommand(s.referrer,['rr1:'+s.loans[0]]));assert.equal(settle.originalOutcome?.status,'applied',JSON.stringify(settle));
 state=await recordsAfter(state,'settlement');
 const record=await store.rebateSettlementRecord(principal,settle.originalOutcome.result.targetId);
 assert.equal((await store.operation(principal,deleteCommand(record.item.id,record.item.version))).originalOutcome?.status,'applied');
 state=await recordsAfter(state,'settlement deleted');
 // Pond's case on PROD: a legacy (V2) row paid at close, then the owner-authorized conversion to a pending V3 rebate (D1).
 const {legacyLoan}=await legacyRebate(s);state=await recordsAfter(state,'legacy rebate');
 await admin.query('SELECT public.pwa_convert_legacy_rebate_v1($1)',['rr1:'+legacyLoan]);
 assert.equal((await store.expenseRecord(principal,'rr1:'+legacyLoan)).item.rebateState,'pending','converted to a pending V3 rebate');
 state=await recordsAfter(state,'legacy conversion');
 // A second settlement stays: its Cash Ledger row (Source Type 'Rebate Settlement') is in the records and cash bundles.
 assert.equal((await store.operation(principal,await settleCommand(s.referrer,['rr1:'+legacyLoan]))).originalOutcome?.status,'applied');
 await recordsAfter(state,'second settlement');await recordsWalk('second settlement','cash');
});

// R184 (V155): partial settlement and the offset to the referrer's own loan, through the real application role and command
// store: the design's two-connection cases (section 5) and the invariants after any order of creates and deletes. Synthetic.
const later=(ms,run)=>new Promise(resolve=>setTimeout(resolve,ms)).then(run);
const outcomeOf=r=>r.originalOutcome?.status==='applied'?'applied':r.originalOutcome?.code??r.code;
const byteOrder=(a,b)=>Buffer.compare(Buffer.from(a.expenseId),Buffer.from(b.expenseId));
/** Per-rebate lines [expenseId, amount, expectedPending], ascending by expense id (the canonical order). */
const linesOf=list=>list.map(([expenseId,amount,expectedPending])=>({expenseId,amount:String(amount),expectedPending:String(expectedPending)})).sort(byteOrder);
const partCommand=async(referrer,allocations,over={})=>({requestId:randomUUID(),operation:'rebate-settlement.create',targetId:randomUUID(),expectedVersion:null,predecessorRequestId:null,receiptId:null,
 inputs:{referrerId:referrer,destination:'referrer',allocations,settlementDate:today,cashAccountId:await lisaAccount(),paymentMethod:'Bank Transfer',bankReference:null,notes:null,expectedPlanHash:null,...over}});
/** An offset of the lines' total to the referrer's own loan, with the plan hash the preview read answers now. */
async function offsetCommand(referrer,allocations){
 const amount=String(allocations.reduce((sum,line)=>sum+Number(line.amount),0)),preview=await store.referrerOffsetPreview(principal,referrer,amount);
 assert.equal(preview.status,200,JSON.stringify(preview).slice(0,300));assert.equal(preview.covered,amount,'the plan covers the amount: '+JSON.stringify(preview).slice(0,300));
 return {preview,command:await partCommand(referrer,allocations,{destination:'offset',cashAccountId:null,paymentMethod:null,bankReference:null,expectedPlanHash:preview.planHash})};
}
/** The referrer's own open loan (1,000, 100 a day, auto charge) with `interest` due today. */
async function ownLoan(s,interest){
 const loan=s.id+'-RL';await admin.query(loanSql,[loan,s.referrer,fixture.lendingAccountId]);await admin.query(chargeSql,[loan+'-today',loan,interest]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[loan]);return loan;
}
const pendingOf=async id=>Number((await admin.query('SELECT public.pwa_rebate_pending_v1($1) AS v',[id])).rows[0].v);
const deleteSettlement=async id=>{const record=await store.rebateSettlementRecord(principal,id);assert.equal(record.status,200,JSON.stringify(record).slice(0,300));return store.operation(principal,deleteCommand(id,record.item.version))};
/** D2, D4, D7: for every rebate of the referrer Amount = close-time offset + allocations + pending (pending never clamps a
 * negative), the link is the newest settlement that applied to it (null exactly when none did); every settlement's rows sum
 * to its amount; a direct settlement has one Lisa cash row of its amount, an offset settlement none and its payment's receipt
 * nets it on Lisa's default account; the owed total is the sum of the pending amounts. */
async function assertInvariants(referrer,label){
 const rows=(await admin.query(`SELECT x."Row ID" AS id,x."Amount"::numeric AS amount,coalesce(o."Amount Received"::numeric,0) AS off,
   coalesce((SELECT sum(a.amount) FROM public.pwa_rebate_settlement_allocations a WHERE a.expense_id=x."Row ID"),0) AS alloc,public.pwa_rebate_pending_v1(x."Row ID") AS pending,x."Ref Rebate Settlement" AS link,
   (SELECT a.settlement_id FROM public.pwa_rebate_settlement_allocations a JOIN public.pwa_rebate_settlements s ON s.id=a.settlement_id WHERE a.expense_id=x."Row ID" ORDER BY s.created_at DESC,s.id COLLATE "C" DESC LIMIT 1) AS newest
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment" WHERE x."Ref Payee Borrower"=$1 AND x."Source Type"='Referral Rebate' AND x."Rule Version"='REFERRAL_REBATE_V3'`,[referrer])).rows;
 for(const r of rows){
  assert.ok(Number(r.amount)-Number(r.off)-Number(r.alloc)>=0,label+': '+r.id+' allocations exceed the rebate: '+JSON.stringify(r));
  assert.equal(Number(r.amount),Number(r.off)+Number(r.alloc)+Number(r.pending),label+': '+r.id+' Amount = offset + allocations + pending: '+JSON.stringify(r));
  assert.equal(r.link,r.newest,label+': '+r.id+' links its newest settlement: '+JSON.stringify(r));
 }
 const settlements=(await admin.query(`SELECT s.id,s.amount,s.offset_payment_id,s.paid_by_cash_account AS account,(SELECT coalesce(sum(a.amount),0) FROM public.pwa_rebate_settlement_allocations a WHERE a.settlement_id=s.id) AS alloc,
   (SELECT count(*)::int FROM public."Cash Ledger" c WHERE c."Source Type"='Rebate Settlement' AND c."Ref Rebate Settlement"=s.id AND c."Amount"::numeric=s.amount AND c."Ref From Cash Holder"='ch:lisa') AS out,
   (SELECT count(*)::int FROM public."Cash Ledger" c WHERE c."Ref Payment"=s.offset_payment_id AND c."Amount"::numeric=s.amount AND c."Ref To Cash Account"=s.paid_by_cash_account) AS back,
   (SELECT p."Status" FROM public."Payments" p WHERE p."Row ID"=s.offset_payment_id) AS status
  FROM public.pwa_rebate_settlements s WHERE s.payee_borrower_id=$1`,[referrer])).rows;
 for(const s of settlements){
  assert.equal(Number(s.alloc),Number(s.amount),label+': settlement '+s.id+' rows sum to its amount');
  assert.equal(s.out,1,label+': settlement '+s.id+' has one Lisa cash row of its amount');
  if(s.offset_payment_id){assert.equal(s.status,'Posted',label+': the offset payment is posted');assert.equal(s.back,1,label+': the offset receipt returns the amount to the same Lisa account');}
 }
 const owedNow=Number(await owed(referrer)),sum=rows.reduce((total,r)=>total+Number(r.pending),0);
 assert.equal(owedNow,sum,label+': owed is the sum of the pending amounts');
 return {rows,settlements,owed:owedNow};
}

test('R184 two partials of one rebate with the same expectedPending in parallel: exactly one applies, nothing of the other',async()=>{
 for(let round=0;round<3;round++){
  const s=await scenario();await close(s.loans[0]);const id='rr1:'+s.loans[0];
  const [a,b]=[await partCommand(s.referrer,linesOf([[id,100,300]])),await partCommand(s.referrer,linesOf([[id,150,300]]))];
  const [x,y]=await Promise.all([store.operation(principal,a),store.operation(principal,b)]);
  assert.deepEqual([outcomeOf(x),outcomeOf(y)].sort(),['applied','record_requires_reconciliation'],JSON.stringify([x,y]).slice(0,600));
  const won=outcomeOf(x)==='applied'?{r:x,amount:100,target:a.targetId}:{r:y,amount:150,target:b.targetId},lost=won.target===a.targetId?b.targetId:a.targetId;
  assert.deepEqual(won.r.originalOutcome.result.rebateSettlement,{destination:'referrer',amount:String(won.amount),owedAfter:String(300-won.amount),offsetPaymentId:null,lines:[{expenseId:id,amount:String(won.amount),pendingAfter:String(300-won.amount)}]});
  assert.equal(await pendingOf(id),300-won.amount);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM public.pwa_rebate_settlements WHERE id=$1',[lost])).rows[0].n,0,'the refused settlement wrote nothing');
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM public.pwa_rebate_settlement_allocations WHERE settlement_id=$1',[lost])).rows[0].n,0);
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM public."Cash Ledger" WHERE "Ref Rebate Settlement"=$1`,[lost])).rows[0].n,0);
  await assertInvariants(s.referrer,'two partials round '+round);
  // The loser read again: its stale expectedPending is refused again, a fresh one applies.
  const retry=await store.operation(principal,await partCommand(s.referrer,linesOf([[id,50,300]])));assert.equal(outcomeOf(retry),'record_requires_reconciliation');
  assert.equal(outcomeOf(await store.operation(principal,await partCommand(s.referrer,linesOf([[id,50,300-won.amount]])))),'applied');
  await assertInvariants(s.referrer,'two partials retried round '+round);
 }
});

test('R184 a partial settlement in parallel with a referee\'s Loan Close: both apply and owedTotal and owedAfter are exact for their order',async t=>{
 for(let round=0;round<3;round++){
  const s=await scenario({count:2});await close(s.loans[0]);const first='rr1:'+s.loans[0];
  const preview=await store.loanClosePreview(principal,s.loans[1]);assert.equal(preview.status,200);assert.equal(preview.rebate.owedBefore,'300');
  const settle=await partCommand(s.referrer,linesOf([[first,120,300]]));
  const [x,y]=await Promise.all([later([0,0,150][round],()=>store.operation(principal,settle)),later([150,0,0][round],()=>store.operation(principal,closeCommand(s.loans[1],preview,{rebatePath:'expense'})))]);
  assert.deepEqual([outcomeOf(x),outcomeOf(y)],['applied','applied'],JSON.stringify([x,y]).slice(0,600));
  const owedTotal=y.originalOutcome.result.rebate.owedTotal,owedAfter=x.originalOutcome.result.rebateSettlement.owedAfter;
  // Close first: it saw 300 + 300 owed and the settlement then left 480. Settlement first: it left 180, then the close 480.
  assert.ok((owedTotal==='600'&&owedAfter==='480')||(owedTotal==='480'&&owedAfter==='180'),'exact for one order: '+JSON.stringify({owedTotal,owedAfter}));t.diagnostic('round '+round+': '+(owedTotal==='600'?'close':'settlement')+' first');
  const inv=await assertInvariants(s.referrer,'settle vs close round '+round);assert.equal(inv.owed,480);
 }
});

test('R184 an offset settlement in parallel with a payment on the referrer\'s own loan: no hang, one consistent outcome',async t=>{
 const deadline=(promise,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(label+' did not finish in 30 s (lock wait)')),30000))]);
 for(let round=0;round<3;round++){
  const s=await scenario();await close(s.loans[0]);const id='rr1:'+s.loans[0],loan=await ownLoan(s,500);
  const {command:offset}=await offsetCommand(s.referrer,linesOf([[id,200,300]]));
  const assigned=await store.autoAssign(principal,s.referrer,{amountReceived:'500'});assert.equal(assigned.status,200,JSON.stringify(assigned).slice(0,300));
  const payment={schemaVersion:7,requestId:randomUUID(),borrowerId:s.referrer,allocations:assigned.allocations,cashAccountId:fixture.receivingAccountId,paymentDate:today,amountReceived:'500',paymentMethod:'Bank Transfer',notes:null,receiptId:null,bankReference:null,transferTime:null};
  const [x,y]=await deadline(Promise.all([later([0,40,150][round],()=>store.operation(principal,offset)),store.submit(principal,payment)]),'offset vs payment');
  const offsetOutcome=outcomeOf(x),paymentOutcome=y.originalOutcome?.status==='posted'?'posted':y.originalOutcome?.code??y.code;
  // The offset applies or finds the plan changed (the payment took the due charge first); the payment posts or is refused as stale.
  // A lock timeout or deadlock is busy with nothing applied (design section 4); a hang fails the deadline above.
  assert.ok(['applied','plan_changed','command_busy'].includes(offsetOutcome),'offset: '+JSON.stringify(x).slice(0,400));
  assert.ok(['posted','selection_unavailable','record_requires_reconciliation','command_busy'].includes(paymentOutcome),'payment: '+JSON.stringify(y).slice(0,400));
  assert.ok(offsetOutcome==='applied'||paymentOutcome==='posted','at least one applies');t.diagnostic('round '+round+': offset '+offsetOutcome+', payment '+paymentOutcome);
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted`)).rows[0].n,0,'nothing waits on a lock afterwards');
  const charge=(await admin.query(`SELECT "Amount Remaining"::numeric AS left FROM "Charges" WHERE "Row ID"=$1`,[loan+'-today'])).rows[0];
  const repaid=(await admin.query(`SELECT coalesce(sum(r."Interest Paid"::numeric+r."Principal Paid"::numeric+r."Late Charge Paid"::numeric),0) AS paid FROM "Repayments" r WHERE r."Ref Charges"=$1`,[loan+'-today'])).rows[0];
  assert.equal(Number(charge.left)+Number(repaid.paid),500,'the due charge is never paid twice: '+JSON.stringify({charge,repaid}));
  await assertInvariants(s.referrer,'offset vs payment round '+round);
  assert.equal(await pendingOf(id),offsetOutcome==='applied'?100:300);
 }
});

test('R184 offset lifecycle: preview, apply, replay, the reads, the "Rebate offset" push, the preview read\'s refusals, delete',async()=>{
 const s=await scenario();await close(s.loans[0]);const id='rr1:'+s.loans[0],loan=await ownLoan(s,500);
 // The preview read validates its amount and its borrower (400 and 404) and is owner-gated like the other Referrers reads.
 for(const bad of ['0','01','1.5','-1','abc','1000000000000',null])assert.equal((await store.referrerOffsetPreview(principal,s.referrer,bad)).status,400,String(bad));
 assert.equal((await store.referrerOffsetPreview(principal,'bad\nid','100')).status,400);assert.equal((await store.referrerOffsetPreview(principal,s.id+'-NOBODY','100')).status,404);
 const stranger=await store.referrerOffsetPreview({ok:true,email:'stranger@example.invalid',subject:'r184-stranger'},s.referrer,'100');assert.ok([401,403].includes(stranger.status),JSON.stringify(stranger));
 const detail=await store.referrerRecord(principal,s.referrer);assert.deepEqual([detail.settleOptions.offset.available,detail.settleOptions.offset.dueAmount],[true,'500']);
 const {preview,command}=await offsetCommand(s.referrer,linesOf([[id,200,300]]));
 assert.deepEqual(preview.lines.map(l=>[l.chargeId,l.amount,l.due]),[[loan+'-today','200',true]],'200 goes to the due charge');
 const applied=await store.operation(principal,command);assert.equal(outcomeOf(applied),'applied',JSON.stringify(applied).slice(0,500));
 const target=command.targetId,paymentId='rs155:'+target;
 assert.deepEqual(applied.originalOutcome.result.rebateSettlement,{destination:'offset',amount:'200',owedAfter:'100',offsetPaymentId:paymentId,lines:[{expenseId:id,amount:'200',pendingAfter:'100'}]});
 // D13: replay returns the recorded outcome; the same id with another payload conflicts and nothing more is written.
 const replay=await store.operation(principal,command);assert.deepEqual(replay.originalOutcome,applied.originalOutcome,'replay: the recorded outcome');
 const other=await store.operation(principal,{...command,inputs:{...command.inputs,notes:'changed'}});assert.notEqual(outcomeOf(other),'applied',JSON.stringify(other).slice(0,300));
 assert.equal((await admin.query('SELECT count(*)::int AS n FROM public."Payments" WHERE "Ref Borrower"=$1',[s.referrer])).rows[0].n,1,'one offset payment');
 const inv=await assertInvariants(s.referrer,'offset applied');assert.equal(inv.owed,100);
 assert.equal((await admin.query(`SELECT "Amount Remaining"::numeric AS v FROM "Charges" WHERE "Row ID"=$1`,[loan+'-today'])).rows[0].v,'300.00');
 // The reads: payment, settlement, expense and the referrer's tiles (total = unpaid + paid + offset).
 const payment=await store.paymentRecord(principal,paymentId);assert.equal(payment.status,200);assert.deepEqual([payment.item.paymentMethod,payment.item.rebateSettlementId],['Referral Rebate Offset',target]);
 const record=await store.rebateSettlementRecord(principal,target);assert.equal(record.status,200);
 assert.deepEqual([record.item.destination,record.item.offsetPaymentId,record.item.accountLabel,record.item.deleteBlocked,record.item.rebates.map(r=>[r.appliedAmount,r.partial,r.pendingAmount])],['offset',paymentId,null,null,[['200.00',true,'100.00']]]);
 const expense=await store.expenseRecord(principal,id);
 assert.deepEqual([expense.item.rebateState,expense.item.settledAmount,expense.item.pendingAmount,expense.item.settlementId,expense.item.settlementDestination,expense.item.settlements],['part-paid','200.00','100.00',target,'offset',[{settlementId:target,date:today,amount:'200.00',destination:'offset'}]]);
 const after=await store.referrerRecord(principal,s.referrer);
 assert.deepEqual([after.referrer.unpaidAmount,after.referrer.paidToDate,after.referrer.offsetToDate],['100.00','0.00','200.00']);assertRefereesSum(after);
 assert.deepEqual(after.history.map(h=>[h.kind,h.destination,h.amount,h.partialCount,h.offsetPaymentId]),[['settlement','offset','200.00',1,paymentId]]);
 // D14: the offset payment's push is the existing "Rebate offset" line, without the loan part (no close-time rebate names it).
 const event=(await admin.query(`INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email) VALUES('payment.posted:'||$1||':posted','payment.posted','payment',$1,'posted',NULL,NULL) RETURNING event_id`,[paymentId])).rows[0].event_id;
 const sub=(await admin.query(`INSERT INTO public.pwa_push_subscriptions(issuer,subject,partner_id,endpoint_hash,endpoint,p256dh,auth) VALUES('https://securetoken.google.com/clever-oasis-508610-n7','r184-push',$1,encode(sha256(convert_to('r184-push','UTF8')),'hex'),'https://fcm.googleapis.com/fcm/send/r184-push','synthetic','synthetic') RETURNING subscription_id`,[fixture.actorId])).rows[0].subscription_id;
 const delivery=(await admin.query(`INSERT INTO public.pwa_notification_deliveries(event_id,channel,destination_key,recipient_partner_id,subscription_id,subscription_version,state,lease_generation,lease_expires_at) VALUES($1,'web-push',encode(sha256(convert_to('r184-push','UTF8')),'hex'),$2,$3,1,'leased',3,clock_timestamp()+interval '10 minutes') RETURNING delivery_id`,[event,fixture.actorId,sub])).rows[0].delivery_id;
 await admin.query(`DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='chase_dispatch') THEN CREATE ROLE chase_dispatch LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END$$`);
 await admin.query('GRANT mw_notify_dispatch_dev TO chase_dispatch WITH INHERIT TRUE, SET FALSE, ADMIN FALSE');await admin.query('GRANT USAGE ON SCHEMA public TO chase_dispatch');
 const dispatch=new pg.Client({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user:'chase_dispatch',password:''});await dispatch.connect();
 let facts;try{facts=(await dispatch.query('SELECT * FROM public.pwa_notify_content_v5($1::uuid,$2::bigint)',[delivery,3])).rows[0];}finally{await dispatch.end()}
 const push=renderNotification({found:facts.found,eventType:facts.event_type,language:facts.language,borrowerName:facts.borrower_name,amount:facts.amount,rebatePayee:facts.rebate_payee??null,rebatePayable:facts.rebate_payable??null,paymentMethod:facts.payment_method??null,rebateLoan:facts.rebate_loan??null,lateChargeAmount:facts.late_charge_amount??null,rebates:facts.rebates??null});
 assert.deepEqual(push,{title:'Rebate offset',body:'Rebate offset ฿200 · Mai '+s.id},JSON.stringify(facts));
 // Delete: the amount returns to pending, the payment and both cash rows go, the charge is unpaid again.
 const removed=await deleteSettlement(target);assert.equal(outcomeOf(removed),'applied',JSON.stringify(removed).slice(0,400));
 assert.equal(await pendingOf(id),300);assert.equal((await admin.query('SELECT count(*)::int AS n FROM public."Payments" WHERE "Row ID"=$1',[paymentId])).rows[0].n,0);
 assert.equal((await admin.query(`SELECT count(*)::int AS n FROM public."Cash Ledger" WHERE "Ref Payment"=$1 OR "Ref Rebate Settlement"=$2`,[paymentId,target])).rows[0].n,0);
 assert.equal((await admin.query(`SELECT "Amount Remaining"::numeric AS v FROM "Charges" WHERE "Row ID"=$1`,[loan+'-today'])).rows[0].v,'500.00');
 assert.equal((await store.expenseRecord(principal,id)).item.rebateState,'pending');await assertInvariants(s.referrer,'offset deleted');
 // D10: the deleted settlement's id is not reusable for another offset (its journal row stays): source_conflict.
 const {command:again}=await offsetCommand(s.referrer,linesOf([[id,100,300]]));
 assert.equal(outcomeOf(await store.operation(principal,{...again,targetId:target})),'source_conflict');
});

test('R184 any order of partial creates (to the referrer or offset) and deletes keeps every rebate exact; each delete is in the change log',async t=>{
 for(const start of [184,7,2026]){
 const s=await scenario({count:3});for(const l of s.loans)await close(l);const ids=s.loans.map(l=>'rr1:'+l);await ownLoan(s,5000);
 let seed=start;const random=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648};const pick=list=>list[Math.floor(random()*list.length)];
 const kinds=[];
 for(let step=0;step<24;step++){
  const live=(await admin.query('SELECT id,offset_payment_id FROM public.pwa_rebate_settlements WHERE payee_borrower_id=$1',[s.referrer])).rows;
  const pending=new Map();for(const id of ids)pending.set(id,await pendingOf(id));
  const open=ids.filter(id=>pending.get(id)>0);
  if(open.length&&(!live.length||random()<0.6)){
   const chosen=open.filter(()=>random()<0.6);if(!chosen.length)chosen.push(pick(open));
   const allocations=linesOf(chosen.map(id=>[id,1+Math.floor(random()*pending.get(id)),pending.get(id)]));
   const offset=random()<0.35,command=offset?(await offsetCommand(s.referrer,allocations)).command:await partCommand(s.referrer,allocations);
   const r=await store.operation(principal,command);assert.equal(outcomeOf(r),'applied','step '+step+' create: '+JSON.stringify(r).slice(0,400));
   assert.deepEqual(r.originalOutcome.result.rebateSettlement.lines,allocations.map(a=>({expenseId:a.expenseId,amount:a.amount,pendingAfter:String(pending.get(a.expenseId)-Number(a.amount))})));
   kinds.push((offset?'offset ':'pay ')+allocations.map(a=>a.amount).join('+'));
  }else{
   const victim=pick(live),touched=(await admin.query('SELECT expense_id FROM public.pwa_rebate_settlement_allocations WHERE settlement_id=$1',[victim.id])).rows.map(r=>r.expense_id);
   const seq=(await admin.query('SELECT coalesce(max(seq),0)::bigint AS s FROM public.pwa_row_changes')).rows[0].s;
   const r=await deleteSettlement(victim.id),code=outcomeOf(r);
   if(code==='applied'){
    // D4: every rebate the settlement paid toward is recorded as changed, also when its link (a newer settlement) stays.
    const logged=(await admin.query(`SELECT DISTINCT row_key FROM public.pwa_row_changes WHERE table_name='Business Expenses' AND seq>$1 AND row_key=ANY($2::text[])`,[seq,touched])).rows.map(r=>r.row_key).sort();
    assert.deepEqual(logged,[...touched].sort(),'step '+step+': the change log names every rebate the delete returned to pending');
   }else assert.ok(victim.offset_payment_id&&code==='dependency_conflict','step '+step+' delete: '+JSON.stringify(r).slice(0,400));
   kinds.push('delete '+(victim.offset_payment_id?'offset':'pay')+' '+code);
  }
  await assertInvariants(s.referrer,'step '+step);
 }
 t.diagnostic('seed '+start+': '+kinds.join(' | '));
 // Everything goes, newest first; every rebate is pending in full again.
 for(const row of (await admin.query('SELECT id FROM public.pwa_rebate_settlements WHERE payee_borrower_id=$1 ORDER BY created_at DESC',[s.referrer])).rows)assert.equal(outcomeOf(await deleteSettlement(row.id)),'applied');
 for(const id of ids)assert.equal(await pendingOf(id),300);assert.equal(await owed(s.referrer),'900.00');await assertInvariants(s.referrer,'all deleted');
 }
});

test('R184 deleting the older of two settlements of one rebate: the link stays on the newer, the expense is logged, and nothing else sees a null link',async()=>{
 const s=await scenario();await close(s.loans[0]);const id='rr1:'+s.loans[0];
 const a=await partCommand(s.referrer,linesOf([[id,100,300]]));assert.equal(outcomeOf(await store.operation(principal,a)),'applied');
 const b=await partCommand(s.referrer,linesOf([[id,50,200]]));assert.equal(outcomeOf(await store.operation(principal,b)),'applied');
 const before=await store.expenseRecord(principal,id);assert.deepEqual([before.item.rebateState,before.item.settlementId,before.item.settlements.map(x=>x.settlementId)],['part-paid',b.targetId,[b.targetId,a.targetId]]);
 // A second connection holds the expense row's lock state open: a closing-payment delete started while the settlement delete
 // runs waits, then sees the committed link (never the transient null) and is refused with "Remove the settlement first".
 const seq=(await admin.query('SELECT coalesce(max(seq),0)::bigint AS s FROM public.pwa_row_changes')).rows[0].s;
 const remove=await paymentDelete(await closing(s.loans[0]));
 const [removed,refused]=await Promise.all([deleteSettlement(a.targetId),store.operation(principal,remove)]);
 assert.equal(outcomeOf(removed),'applied',JSON.stringify(removed).slice(0,300));assert.ok(['dependency_conflict','command_busy'].includes(outcomeOf(refused)),JSON.stringify(refused).slice(0,300));
 assert.ok((await admin.query('SELECT 1 FROM public."Payments" WHERE "Row ID"=$1',[remove.targetId])).rowCount,'the closing payment stays');
 assert.equal(outcomeOf(await store.operation(principal,await paymentDelete(remove.targetId))),'dependency_conflict','afterwards: Remove the settlement first');
 const after=await store.expenseRecord(principal,id);
 assert.deepEqual([after.item.rebateState,after.item.pendingAmount,after.item.settlementId,after.item.settlements.map(x=>[x.settlementId,x.amount])],['part-paid','250.00',b.targetId,[[b.targetId,'50.00']]]);
 // The expense row itself ends as it was (its version, a hash of the row, is unchanged); its pending amount changed, so the
 // clear-and-set of the link puts it in the change log (and a new xmin in the offline fingerprint).
 const log=(await admin.query(`SELECT count(*)::int AS n FROM public.pwa_row_changes WHERE table_name='Business Expenses' AND row_key=$1 AND seq>$2`,[id,seq])).rows[0].n;assert.ok(log>=1,'the expense is in the change log');
 await assertInvariants(s.referrer,'older deleted');
});
