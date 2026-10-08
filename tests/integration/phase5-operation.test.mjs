import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {OWNER_EMAIL} from '../../services/api/dev-read-config.mjs';
let admin,app,proof;const user='mw_app_dev_operation_fixture';
before(async()=>{
 admin=await disposablePool(83);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const client=await admin.connect();try{const plan=await planApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(client,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{client.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:2});
 proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:83});
});
after(async()=>{await app?.end();await admin?.end()});

test('v2 durable borrower operations retain outcomes after deletion and isolate v1 status',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-OP');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 const principal={ok:true,email:OWNER_EMAIL,subject:'operation-owner'},store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const targetId=randomUUID(),fields={name:'Operation ไทย',description:'Synthetic',communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:false,referrerId:null,preferredReceivingAccountId:fixture.receivingAccountId,note:' exact\n '};
 const command={requestId:randomUUID(),operation:'borrower.create',targetId,expectedVersion:null,predecessorRequestId:null,inputs:fields,receiptId:null};
 const created=await store.operation(principal,command);assert.equal(created.status,200,JSON.stringify(created));assert.equal(created.originalOutcome.status,'applied');assert.equal(created.originalOutcome.result.paymentId,null);assert.deepEqual(await store.operation(principal,command),created);
 assert.equal((await store.operation(principal,{...command,inputs:{...fields,note:'changed'}})).status,409);
 const row=await store.borrowerRecord(principal,targetId);assert.equal(row.item.note,fields.note);
 const deleted=await store.operation(principal,{...command,requestId:randomUUID(),operation:'borrower.delete',expectedVersion:row.item.version,inputs:{}});assert.equal(deleted.originalOutcome.status,'applied',JSON.stringify(deleted));
 assert.deepEqual(await store.operation(principal,command),created);assert.equal((await store.borrowerRecord(principal,targetId)).status,404);
 assert.equal((await store.status(principal,command.requestId)).kind,'unresolved');
 await assert.rejects(app.query('UPDATE public.pwa_payment_commands SET result_json=$2 WHERE request_id=$1',[command.requestId,{}]));
});


test('shared first-day component calculation preserves daily, installment, fee and disabled rules',async()=>{
 const base={'Loan Date':'2026-10-01','Due Date':'2026-10-03','Principal Amount':'100','Auto Charge Enabled':true,'Transfer Fee':'2','Current Daily Interest':'5','Daily Payment Amount':'40'};
 const calculate=async overrides=>(await app.query(`SELECT principal::text,interest::text FROM public.first_day_components_v83(jsonb_populate_record(NULL::public."Loans",$1::jsonb))`,[JSON.stringify({...base,...overrides})])).rows;
 assert.deepEqual(await calculate({'Loan Type':'ดอกเบี้ยรายวัน'}),[{principal:'0',interest:'7.00'}]);
 assert.deepEqual(await calculate({'Loan Type':'ผ่อนชำระรายวัน'}),[{principal:'34',interest:'8.00'}]);
 assert.deepEqual(await calculate({'Loan Type':'กำหนดวันชำระ'}),[]);
 assert.deepEqual(await calculate({'Loan Type':'ดอกเบี้ยรายวัน','Auto Charge Enabled':false}),[]);
 assert.deepEqual(await calculate({'Loan Type':'ดอกเบี้ยรายวัน','Current Daily Interest':'0'}),[]);
 await assert.rejects(calculate({'Loan Type':'ผ่อนชำระรายวัน','Due Date':'2026-09-30'}),/Invalid installment/);
 await assert.rejects(calculate({'Loan Type':'ผ่อนชำระรายวัน','Daily Payment Amount':'1'}),/Invalid first-day interest/);
});

test('shared provenance routes newly submitted v6 receipts and retains immutable original actor',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-OP-ROUTE');
 await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 const principal={ok:true,email:OWNER_EMAIL,subject:'operation-owner'},store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const charge=(await admin.query('SELECT "Row ID" id,"Charge Date"::text AS day FROM "Charges" WHERE "Row ID"=$1',[fixture.chargeIds[0]])).rows[0];
 const day=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
 const command={schemaVersion:6,requestId:randomUUID(),borrowerId:fixture.borrowerId,allocations:[{chargeId:charge.id,principal:'100',interest:'10',expectedPrincipalRemaining:'100',expectedInterestRemaining:'10',chargeDate:charge.day}],cashAccountId:fixture.receivingAccountId,paymentDate:day,amountReceived:'110',paymentMethod:'Bank Transfer',notes:null,receiptId:null};
 const result=await store.submit(principal,command);assert.equal(result.status,200,JSON.stringify(result));
 const provenance=(await app.query('SELECT public.pwa_effective_payment_plan_v2($1) value',[result.originalOutcome.paymentId])).rows[0].value;
 assert.equal(provenance.originRequestId,command.requestId);assert.equal(provenance.effectivePlanRequestId,command.requestId);assert.equal(provenance.originActor.loginEmail,OWNER_EMAIL);assert.equal(provenance.correctionActor,null);assert.deepEqual(provenance.plan.allocations,command.allocations);
 assert.deepEqual(await store.submit(principal,command),result);
 await assert.rejects(app.query('SELECT public.post_payment_legacy_v59($1)',[result.originalOutcome.paymentId]),/legacy|origin|explicit/i);
});

test('loan creation stages first-day provenance before one governed receipt for all three types',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-OP-LOAN');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 const principal={ok:true,email:OWNER_EMAIL,subject:'operation-owner'},store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const dates=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day,((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+2)::text AS due")).rows[0];
 for(const [type,expected] of [['ดอกเบี้ยรายวัน','7'],['ผ่อนชำระรายวัน','42'],['กำหนดวันชำระ',null]]){
  const command={requestId:randomUUID(),operation:'loan.create',targetId:randomUUID(),expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{borrowerId:fixture.borrowerId,loanDate:dates.day,principal:'100',transferFee:'2',disbursingAccountId:fixture.lendingAccountId,type,dueDate:type==='ดอกเบี้ยรายวัน'?null:dates.due,dailyPayment:type==='ผ่อนชำระรายวัน'?'40':null,fixedInterest:type==='กำหนดวันชำระ'?'15':null,currentDailyInterest:type==='ดอกเบี้ยรายวัน'?'5':null,paymentInterval:1,arrangement:null,autoChargeEnabled:true}};
  const result=await store.operation(principal,command);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.originalOutcome.status,'applied');assert.deepEqual(await store.operation(principal,command),result);
  const value=result.originalOutcome.result;
  if(expected){assert.equal(value.paymentId,'fd6:fd6:'+command.targetId);assert.equal(value.plan.amountReceived,expected);assert.equal(value.plan.allocationMethod,'First-day Auto');const posted=(await admin.query('SELECT "Status" status,"Amount Received"::numeric::text amount FROM "Payments" WHERE "Row ID"=$1',[value.paymentId])).rows[0];assert.equal(posted.status,'Posted');assert.equal(Number(posted.amount),Number(expected));}
  else{assert.equal(value.paymentId,null);assert.equal(value.plan,null);}
 }
});

test('loan lifecycle CAS applies canonical Default and Undo and rejects a stale action',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-OP-LIFE');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 await admin.query('UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1',[fixture.loanIds[0]]);
 const principal={ok:true,email:OWNER_EMAIL,subject:'operation-owner'},store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true}),id=fixture.loanIds[0];
 const day=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
 const original=await store.loanRecord(principal,id);
 const command={requestId:randomUUID(),operation:'loan.default',targetId:id,expectedVersion:original.item.version,predecessorRequestId:null,receiptId:null,inputs:{businessDate:day}};
 const applied=await store.operation(principal,command);assert.equal(applied.status,200,JSON.stringify(applied));assert.equal((await store.loanRecord(principal,id)).item.defaulted,true);assert.deepEqual(await store.operation(principal,command),applied);
 const stale=await store.operation(principal,{...command,requestId:randomUUID()});assert.equal(stale.originalOutcome.code,'source_conflict');
 const current=await store.loanRecord(principal,id);
 const undone=await store.operation(principal,{...command,requestId:randomUUID(),operation:'loan.undo-default',expectedVersion:current.item.version,inputs:{}});assert.equal(undone.status,200,JSON.stringify(undone));assert.equal((await store.loanRecord(principal,id)).item.defaulted,false);
 const inactive=await store.loanRecord(principal,fixture.loanIds[1]);
 const generated=await store.operation(principal,{...command,requestId:randomUUID(),operation:'loan.generate-charge',targetId:fixture.loanIds[1],expectedVersion:inactive.item.version});assert.equal(generated.status,200,JSON.stringify(generated));assert.equal(generated.originalOutcome.result.paymentId,null);
});

test('close calculation is read-only and repeated governed preparation adds principal only once',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-OP-CLOSE');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 const principal={ok:true,email:OWNER_EMAIL,subject:'operation-owner'},store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const dates=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day,((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3)::text AS start")).rows[0];
 const command={requestId:randomUUID(),operation:'loan.create',targetId:randomUUID(),expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{borrowerId:fixture.borrowerId,loanDate:dates.start,principal:'100',transferFee:'0',disbursingAccountId:fixture.lendingAccountId,type:'ดอกเบี้ยรายวัน',dueDate:null,dailyPayment:null,fixedInterest:null,currentDailyInterest:'5',paymentInterval:1,arrangement:null,autoChargeEnabled:true}};
 assert.equal((await store.operation(principal,command)).status,200);
 const client=await app.connect();try{
  await client.query('BEGIN READ ONLY');
  const preview=(await client.query('SELECT public.loan_close_calculation_v83($1,$2) AS value',[command.targetId,dates.day])).rows[0].value;
  assert.equal(preview.amount,'115');assert.equal(preview.mutation.kind,'insert');
  assert.equal((await client.query('SELECT count(*)::integer count FROM "Charges" WHERE "Ref Loans"=$1',[command.targetId])).rows[0].count,1);
  await client.query('COMMIT');await client.query('BEGIN');
  await client.query('SELECT public.apply_loan_close_calculation_v83($1,$2,$3)',[command.targetId,dates.day,preview.planHash]);
  const second=(await client.query('SELECT public.apply_loan_close_calculation_v83($1,$2,NULL) AS value',[command.targetId,dates.day])).rows[0].value;
  assert.equal(second.amount,preview.amount);assert.equal(second.mutation,null);
  assert.equal((await client.query('SELECT "Principal Due"::numeric::text AS p FROM "Charges" WHERE "Row ID"=$1',[preview.targetChargeId])).rows[0].p,'100.00');
  await client.query('ROLLBACK');
 }finally{client.release()}
 const preview=await store.loanClosePreview(principal,command.targetId);assert.equal(preview.status,200,JSON.stringify(preview));
 const close={requestId:randomUUID(),operation:'loan.close',targetId:command.targetId,expectedVersion:preview.sourceVersion,predecessorRequestId:null,receiptId:null,inputs:{paymentDate:dates.day,cashAccountId:fixture.receivingAccountId,paymentMethod:'Cash',notes:' close\nไทย ',expectedAmount:preview.amount,expectedPlanHash:preview.planHash}};
 const applied=await store.operation(principal,close);assert.equal(applied.status,200,JSON.stringify(applied));assert.equal(applied.originalOutcome.result.plan.amountReceived,'115');assert.deepEqual(await store.operation(principal,close),applied);
 const payment=(await admin.query('SELECT "Status" status,"Notes" notes FROM "Payments" WHERE "Row ID"=$1',[applied.originalOutcome.result.paymentId])).rows[0];assert.equal(payment.status,'Posted');assert.equal(payment.notes,close.inputs.notes);
});

test('manual expense operations preserve exact source and durable deletion',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-EXP');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 const principal={ok:true,email:OWNER_EMAIL,subject:'expense-owner'},store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const options=await store.expenseOptions(principal);assert.equal(options.status,200,JSON.stringify(options));
 const command={requestId:randomUUID(),operation:'expense.create',targetId:randomUUID(),expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{expenseDate:options.businessDate,category:'Other / อื่น ๆ',amount:'10',payeeName:'Synthetic',relatedBorrowerId:fixture.borrowerId,relatedLoanId:fixture.loanIds[0],notes:' exact\nไทย ',paidByAccountId:fixture.receivingAccountId}};
 const created=await store.operation(principal,command);assert.equal(created.status,200,JSON.stringify(created));assert.equal(created.originalOutcome.status,'applied');assert.deepEqual(await store.operation(principal,command),created);
 const current=await store.expenseRecord(principal,command.targetId);assert.equal(current.status,200,JSON.stringify(current));assert.equal(current.item.notes,command.inputs.notes);assert.equal(current.item.sourceType,'Manual');
 const updated=await store.operation(principal,{...command,requestId:randomUUID(),operation:'expense.update',expectedVersion:current.item.version,inputs:{...command.inputs,notes:'Changed\nไทย'}});assert.equal(updated.status,200,JSON.stringify(updated));
 const fresh=await store.expenseRecord(principal,command.targetId);assert.equal(fresh.item.notes,'Changed\nไทย');
 const deleted=await store.operation(principal,{...command,requestId:randomUUID(),operation:'expense.delete',expectedVersion:fresh.item.version,inputs:{}});assert.equal(deleted.status,200,JSON.stringify(deleted));assert.equal((await store.expenseRecord(principal,command.targetId)).status,404);assert.deepEqual(await store.operation(principal,command),created);
});

test('own preferences and cash providers use current actor and governed balances',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-PREF');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 const principal={ok:true,email:OWNER_EMAIL,subject:'preference-owner'},store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const prefs=await store.preferences(principal);assert.equal(prefs.status,200,JSON.stringify(prefs));assert.equal(prefs.item.id,fixture.actorId);assert.equal(prefs.dates.length,15);
 const command={requestId:randomUUID(),operation:'preference.update',targetId:fixture.actorId,expectedVersion:prefs.item.version,predecessorRequestId:null,receiptId:null,inputs:{language:'ไทย',statementAccountId:fixture.receivingAccountId,statementDate:prefs.dates[0]}};
 const saved=await store.operation(principal,command);assert.equal(saved.status,200,JSON.stringify(saved));assert.deepEqual(await store.operation(principal,command),saved);assert.equal((await store.preferences(principal)).item.language,'ไทย');
 const denied=await store.operation(principal,{...command,requestId:randomUUID(),targetId:'C-P5-HIST-A'});assert.equal(denied.status,403,JSON.stringify(denied));assert.equal((await admin.query('SELECT count(*) n FROM public.pwa_payment_commands WHERE canonical_json::jsonb#>>\'{command,targetId}\'=\'C-P5-HIST-A\'')).rows[0].n,'0');
 const overview=await store.cashOverview(principal);assert.equal(overview.status,200,JSON.stringify(overview));assert.ok(overview.accounts.some(row=>row.id===fixture.receivingAccountId));assert.equal(typeof overview.dashboard.cashPoolRemaining,'string');
 const uninitializedAccount=randomUUID();await app.query('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES($1,$2,$3,$4)',[uninitializedAccount,'ch:dad','B uninitialized '+uninitializedAccount,'Synthetic']);
 const statement=await store.cashStatement(principal,{accountId:uninitializedAccount,date:prefs.dates[0],limit:25,cursor:null});assert.equal(statement.status,200,JSON.stringify(statement));assert.equal(statement.summary.initialized,false);assert.equal(statement.summary.openingBalance,null);
 assert.equal((await store.cashStatement(principal,{accountId:fixture.receivingAccountId,date:'2026-02-30',limit:25,cursor:null})).status,400);
});

test('PWA correction enters prepared Loan Close without duplicate preparation',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-TRANSITION');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 const principal={ok:true,email:OWNER_EMAIL,subject:'transition-owner'},store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const loan='4A-TRANSITION-DAILY',charge='4A-TRANSITION-DUE';
 await admin.query(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Type","Auto Charge Enabled","Current Daily Interest","Created By","Loan Status","Defaulted") VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,100::money,'ดอกเบี้ยรายวัน',true,1::money,$4,'ยังไม่ปิดยอด',false)`,[loan,fixture.borrowerId,fixture.lendingAccountId,OWNER_EMAIL]);
 await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-1,100::money,0::money)`,[charge,loan]);
 const dates=(await admin.query(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day,((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-1)::text AS prior`)).rows[0];
 const original={schemaVersion:6,requestId:randomUUID(),borrowerId:fixture.borrowerId,allocations:[{chargeId:charge,principal:'10',interest:'0',expectedPrincipalRemaining:'100',expectedInterestRemaining:'0',chargeDate:dates.prior}],cashAccountId:fixture.receivingAccountId,paymentDate:dates.day,amountReceived:'10',paymentMethod:'Cash',notes:null,receiptId:null};
 const posted=await store.submit(principal,original);assert.equal(posted.status,200,JSON.stringify(posted));const id=posted.originalOutcome.paymentId;
 const before=(await admin.query('SELECT count(*) n FROM "Charges" WHERE "Ref Loans"=$1',[loan])).rows[0].n;
 const preview=await store.paymentRecord(principal,id,{preview:true,targetLoanId:loan,paymentDate:dates.day});assert.equal(preview.status,200,JSON.stringify(preview));assert.equal((await admin.query('SELECT count(*) n FROM "Charges" WHERE "Ref Loans"=$1',[loan])).rows[0].n,before);
 const prepared=preview.item.closePreparation,command={requestId:randomUUID(),operation:'payment.correct',targetId:id,expectedVersion:preview.item.sourceVersion,predecessorRequestId:preview.item.predecessorRequestId,receiptId:null,inputs:{kind:'pwa-plan',fields:{...prepared.plan,notes:'close transition'},receiptMode:'preserve',closePreparationHash:prepared.planHash}};
 const result=await store.operation(principal,command);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.originalOutcome.status,'applied');assert.deepEqual(await store.operation(principal,command),result);
 const payment=(await admin.query('SELECT "Allocation Method" method,"Amount Received"::numeric::text amount,"Status" status FROM "Payments" WHERE "Row ID"=$1',[id])).rows[0];assert.equal(payment.method,'Loan Close');assert.equal(payment.status,'Posted');assert.equal(Number(payment.amount),Number(prepared.plan.amountReceived));
 const count=(await admin.query('SELECT count(*) n FROM "Charges" WHERE "Ref Loans"=$1',[loan])).rows[0].n;await app.query('SELECT public.post_payment($1)',[id]);assert.equal((await admin.query('SELECT count(*) n FROM "Charges" WHERE "Ref Loans"=$1',[loan])).rows[0].n,count);
});

test('main Dashboard projects the governed source without an outstanding-principal KPI',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-DASH');await admin.query(`INSERT INTO public."Statistics"("Row ID","Statistics ID") VALUES('4A-DASH-STATS-A','synthetic'),('4A-DASH-STATS-B','synthetic')`);await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);const store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true}),result=await store.dashboard({ok:true,email:OWNER_EMAIL,subject:'dashboard-owner'});assert.equal(result.status,200,JSON.stringify(result));const source=(await admin.query('SELECT DISTINCT "Pending Payment Amount"::text amount FROM public.olap_portfolio_summary')).rows;assert.equal(result.pendingPaymentAmount,source[0].amount);assert.equal('outstandingPrincipal' in result.portfolio,false);assert.match(result.asOf,/Z$/);assert.equal(Number.isSafeInteger(result.collection.notPaid),true);
});

test('standalone Upcoming reads all seven dates for a future-only borrower',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-UPCOMING');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);const store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true}),principal={ok:true,email:OWNER_EMAIL,subject:'upcoming-owner'};
 const borrower='4A-UPCOMING-FUTURE',loan=borrower+'-L';await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES($1,$2)',[borrower,'Future only']);await admin.query(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Loan Type","Principal Amount","Loan Status","Auto Charge Enabled","Created By","Ref Disbursed From Cash Account") VALUES($1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,'ดอกเบี้ยรายวัน',100::money,'ยังไม่ปิดยอด',false,$3,$4)`,[loan,borrower,OWNER_EMAIL,fixture.lendingAccountId]);
 for(let i=1;i<=7;i++)await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+$3::integer,0::money,1::money)`,[loan+'-C'+i,loan,i]);
 let cursor=null,found=[];do{const result=await store.upcoming(principal,{limit:2,cursor});assert.equal(result.status,200,JSON.stringify(result));found.push(...result.items.filter(row=>row.borrowerId===borrower));cursor=result.nextCursor}while(cursor);assert.equal(found.length,7);
 const first=await store.upcoming(principal,{}),detail=await store.upcoming(principal,{borrowerId:borrower,dueDate:found[6].dueDate,businessDate:first.businessDate});assert.equal(detail.status,200,JSON.stringify(detail));assert.equal(detail.items.length,1);assert.equal(detail.totalCharge,'1.00');
});

test('correction proposed borrower scopes only preview balances and retains original lineage',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-DEST');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);const principal={ok:true,email:OWNER_EMAIL,subject:'destination-owner'},store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 const charge=(await admin.query('SELECT "Charge Date"::text AS day FROM "Charges" WHERE "Row ID"=$1',[fixture.chargeIds[0]])).rows[0],day=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
 const command={schemaVersion:6,requestId:randomUUID(),borrowerId:fixture.borrowerId,allocations:[{chargeId:fixture.chargeIds[0],principal:'100',interest:'10',expectedPrincipalRemaining:'100',expectedInterestRemaining:'10',chargeDate:charge.day}],cashAccountId:fixture.receivingAccountId,paymentDate:day,amountReceived:'110',paymentMethod:'Cash',notes:null,receiptId:null};
 const posted=await store.submit(principal,command);assert.equal(posted.status,200,JSON.stringify(posted));const id=posted.originalOutcome.paymentId,original=await store.paymentRecord(principal,id,{preview:true}),proposed=await store.paymentRecord(principal,id,{preview:true,proposedBorrowerId:'4A-DEST-OTHER'});assert.equal(proposed.status,200,JSON.stringify(proposed));assert.equal(proposed.item.proposedBorrowerId,'4A-DEST-OTHER');assert.equal(proposed.item.source.borrowerId,fixture.borrowerId);assert.equal(proposed.item.sourceVersion,original.item.sourceVersion);assert.equal(proposed.item.predecessorRequestId,command.requestId);assert.deepEqual(proposed.item.balances.map(row=>row.chargeId),['4A-DEST-FOREIGN']);assert.equal((await store.paymentRecord(principal,id,{preview:true,proposedBorrowerId:'missing'})).status,400);
 const detail=await store.chargeRecord(principal,fixture.chargeIds[0]);assert.equal(detail.status,200,JSON.stringify(detail));assert.equal(detail.item.allocations.length,1);assert.equal(detail.item.repayments.length,1);assert.equal(detail.item.allocations[0].paymentId,id);
});

test('Collection receipt cards deduplicate positive allocations and include an older partial receipt',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-CARDS');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);const principal={ok:true,email:OWNER_EMAIL,subject:'cards-owner'},store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true}),oldId='4A-CARDS-OLD';
 await admin.query(`INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Payment Method","Allocation Method","Ref Received By Cash Account","Created By","Status") VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-1,5::money,'Cash','Single Partial',$4,$5,'Processing')`,[oldId,fixture.borrowerId,fixture.chargeIds[0],fixture.receivingAccountId,OWNER_EMAIL]);
 const day=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day,dates=(await admin.query('SELECT "Row ID" id,"Charge Date"::text AS day FROM "Charges" WHERE "Row ID"=ANY($1::text[])',[fixture.chargeIds.slice(0,2)])).rows;
 const command={schemaVersion:6,requestId:randomUUID(),borrowerId:fixture.borrowerId,allocations:fixture.chargeIds.slice(0,2).map((id,index)=>({chargeId:id,principal:'0',interest:'2',expectedPrincipalRemaining:index?'200':'100',expectedInterestRemaining:index?'20':'5',chargeDate:dates.find(row=>row.id===id).day})),cashAccountId:fixture.receivingAccountId,paymentDate:day,amountReceived:'4',paymentMethod:'Cash',notes:null,receiptId:null};const posted=await store.submit(principal,command);assert.equal(posted.status,200,JSON.stringify(posted));
 const cards=await store.collectionReceipts(principal,fixture.borrowerId,{businessDate:day,chargeIds:fixture.chargeIds.slice(0,2)});assert.equal(cards.status,200,JSON.stringify(cards));assert.equal(cards.items.length,2);assert.deepEqual(new Set(cards.items.map(row=>row.id)),new Set([oldId,posted.originalOutcome.paymentId]));
 const otherPage=await store.collectionReceipts(principal,fixture.borrowerId,{businessDate:day,chargeIds:[fixture.chargeIds[1]]});assert.deepEqual(otherPage.items.map(row=>row.id),[posted.originalOutcome.paymentId]);assert.equal((await store.collectionReceipts(principal,fixture.borrowerId,{businessDate:day,chargeIds:['4A-CARDS-FOREIGN']})).status,409);
});


test('standalone source lists use stable root cursors and full payment groups',async()=>{
 const fixture=await seedPaymentFixture(admin,'4A-LISTS');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 const store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true}),principal={ok:true,email:OWNER_EMAIL,subject:'root-lists-owner'};
 const loans=await store.recordList(principal,'loans',{limit:1});assert.equal(loans.status,200,JSON.stringify(loans));assert.equal(loans.items.length,1);assert.ok(loans.nextCursor);const next=await store.recordList(principal,'loans',{limit:1,cursor:loans.nextCursor});assert.equal(next.status,200,JSON.stringify(next));assert.notEqual(next.items[0].id,loans.items[0].id);
 assert.equal((await store.recordList(principal,'payments',{cursor:loans.nextCursor})).status,400);assert.equal((await store.recordList(principal,'loans',{q:'other',cursor:loans.nextCursor})).status,400);
 const payments=await store.recordList(principal,'payments',{limit:1});assert.equal(payments.status,200,JSON.stringify(payments));
 const literal=await store.recordList(principal,'loans',{q:'%_'});assert.equal(literal.status,200);assert.equal(literal.items.length,0);
});
