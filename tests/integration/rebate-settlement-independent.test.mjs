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
