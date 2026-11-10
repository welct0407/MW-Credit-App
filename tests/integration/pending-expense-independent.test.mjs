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
// R140 V142: a manual expense pending payment through the real application role and the command store, on the migration
// head (receiving group): create pending, replay the same requestId, the record, list and cash position reads, pay it with
// expense.update (one System cash row dated on the expense date), then delete it so the shared cluster is left as found.
// Synthetic data only.
let admin,app,store,fixture;const user='mw_app_dev_r140_fixture';
const principal={ok:true,email:OWNER_EMAIL,subject:'r140-expense-owner'};
before(async()=>{
 const head=migrationHead();
 admin=await disposablePool(head);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:2});
 const proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:head});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 fixture=await seedPaymentFixture(admin,'R140-EXP');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 // The reads exclude R005 cutover sources from pending: the application role reads that table only (app-role policy read-only class).
 const access=(await admin.query(`SELECT has_table_privilege('mw_app_dev','public.r005_cash_cutover_sources','SELECT') AS r,has_table_privilege('mw_app_dev','public.r005_cash_cutover_sources','INSERT') AS w`)).rows[0];
 assert.deepEqual(access,{r:true,w:false});
});
after(async()=>{await app?.end();await admin?.end()});
const ledger=async id=>(await admin.query(`SELECT "Entry Origin" AS origin,"Movement Date"::text AS day,"Amount"::numeric::text AS amount,"Ref From Cash Account" AS account FROM public."Cash Ledger" WHERE "Ref Business Expense"=$1`,[id])).rows;

test('a manual expense is created pending payment, replays, reads as pending, is paid with expense.update and deleted',async()=>{
 const options=await store.expenseOptions(principal);assert.equal(options.status,200,JSON.stringify(options));
 const position=async()=>{const answer=await store.management(principal,'cash-position');assert.equal(answer.status,200,JSON.stringify(answer));return answer.expensesPayable;};
 const payableBefore=await position();
 const day=options.businessDate;
 const command={requestId:randomUUID(),operation:'expense.create',targetId:randomUUID(),expectedVersion:null,predecessorRequestId:null,receiptId:null,
  inputs:{expenseDate:day,category:'Other / อื่น ๆ',amount:'40',payeeName:'Synthetic pending',relatedBorrowerId:null,relatedLoanId:null,notes:null,paidByAccountId:null}};
 const created=await store.operation(principal,command);assert.equal(created.status,200,JSON.stringify(created));assert.equal(created.originalOutcome.status,'applied');
 assert.deepEqual(await store.operation(principal,command),created,'a replay of the same requestId returns the recorded outcome');
 assert.equal((await admin.query('SELECT count(*)::int n FROM public."Business Expenses" WHERE "Row ID"=$1',[command.targetId])).rows[0].n,1);
 assert.deepEqual(await ledger(command.targetId),[],'no cash movement while pending');
 const pending=await store.expenseRecord(principal,command.targetId);assert.equal(pending.status,200,JSON.stringify(pending));
 assert.equal(pending.item.paymentState,'pending');assert.equal(pending.item.pendingAmount,'40.00');assert.equal(pending.item.rebateState,null);
 assert.equal(pending.item.paidByAccountId,null);assert.equal(pending.item.paidByHolderId,null);assert.equal(pending.item.canEdit,true);
 const page=await store.expenses(principal,{limit:100});assert.equal(page.status,200,JSON.stringify(page));
 assert.equal(page.items.find(row=>row.id===command.targetId)?.paymentState,'pending','the list carries the state');
 const payable=await position();
 assert.equal(payable.count,payableBefore.count+1);assert.equal(Number(payable.amount),Number(payableBefore.amount)+40);
 // Pay it: the existing expense.update with an account; the cash is dated on the expense date.
 const paid=await store.operation(principal,{...command,requestId:randomUUID(),operation:'expense.update',expectedVersion:pending.item.version,inputs:{...command.inputs,paidByAccountId:fixture.receivingAccountId}});
 assert.equal(paid.status,200,JSON.stringify(paid));assert.equal(paid.originalOutcome.status,'applied',JSON.stringify(paid));
 assert.deepEqual(await ledger(command.targetId),[{origin:'System',day,amount:'40.00',account:fixture.receivingAccountId}]);
 const fresh=await store.expenseRecord(principal,command.targetId);
 assert.equal(fresh.item.paymentState,null);assert.equal(fresh.item.pendingAmount,null);assert.equal(fresh.item.paidByAccountId,fixture.receivingAccountId);
 assert.deepEqual(await position(),payableBefore);
 // A stale version (the pending one) is a source conflict; the paid expense stays paid.
 const stale=await store.operation(principal,{...command,requestId:randomUUID(),operation:'expense.update',expectedVersion:pending.item.version,inputs:{...command.inputs,paidByAccountId:null}});
 assert.equal(stale.originalOutcome?.code??stale.code,'source_conflict',JSON.stringify(stale));
 const deleted=await store.operation(principal,{...command,requestId:randomUUID(),operation:'expense.delete',expectedVersion:fresh.item.version,inputs:{}});
 assert.equal(deleted.originalOutcome.status,'applied',JSON.stringify(deleted));assert.deepEqual(await ledger(command.targetId),[]);
});
