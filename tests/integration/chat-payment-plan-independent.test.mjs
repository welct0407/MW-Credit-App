import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {createPaymentCommandHandler} from '../../services/payment-command/handler.mjs';
import {createCommandClient} from '../../services/chat/command-client.mjs';
import {planPayment} from '../../services/chat/payment-plan.mjs';
import {paymentCommandFor,needsPurpose} from '../../services/chat/proposals.mjs';
import {OWNER_EMAIL} from '../../services/lib/identity.mjs';
import {migrationHead} from '../migration-head.mjs';
// R112 V125, the chat card's shape risk: the chat service's own planner and command builder (planPayment, paymentCommandFor) against the
// real command service over HTTP (the real application-role store and SQL) on the migration head. The chat store, model and handler are not
// involved (their cases are unit tests and chat.spec.ts); what is real here is every number of card.purposeOptions and the v10 command
// built at the claim, posted through the real command API. Synthetic data only.
let admin,app,store,fixture,server,client,today;const user='mw_app_dev_r112c_fixture';
const principal={ok:true,email:OWNER_EMAIL,subject:'r112c-owner'};
const day=offset=>(admin.query("SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+$1::integer)::text AS day",[offset])).then(r=>r.rows[0].day);
before(async()=>{
 const head=migrationHead();
 admin=await disposablePool(head);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true});}finally{c.release();}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:3});
 const proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:head});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 fixture=await seedPaymentFixture(admin,'R112-CH');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL.toLowerCase(),fixture.actorId]);
 let handler;server=createServer((req,res)=>void handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 handler=createPaymentCommandHandler({origins:[origin],verifyPrincipal:async()=>principal,store});
 client=createCommandClient({baseUrl:origin,authorization:'Bearer aaa.bbb.ccc',sleep:async()=>{}});
 today=await day(0);
});
after(async()=>{server?.closeAllConnections?.();await new Promise(r=>server?.close(r));await app?.end();await admin?.end()});
let n=0;
// A borrower with one automatic daily-interest loan (1,000, 10 a day, interval 1) and today's charge of 10 due.
async function scenario(){
 const id='R112CH'+(++n),borrower=id+'-B',loan=id+'-L';
 await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES($1,$2)',[borrower,'SYNTHETIC CHAT '+id]);
 await admin.query(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval") VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,1)`,[loan,borrower,fixture.lendingAccountId]);
 await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,$3::date,0::money,10::money)`,[loan+'-today',loan,today]);
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[loan]);
 return {borrower,loan};
}
const values=amount=>({amountReceived:amount,paymentMethod:'Bank Transfer',cashAccountId:fixture.receivingAccountId});
const propose=async(s,amount='100')=>{const requestId=randomUUID();const out=await planPayment({client,borrowerId:s.borrower,values:values(amount),requestId});return {requestId,...out};};
// The proposal's stored line for a remainder draft (proposals.mjs proposePayment): the draft, no command, purposeRequired.
const stored=(p)=>({requestId:p.requestId,purposeRequired:true,draft:p.draft});
const plans=(s,amount,purpose)=>client.post('/api/payment-drafts/'+s.borrower+'/plan',{amountReceived:amount,purpose});

test('(1) a slip above what is due gives purposeOptions with the numbers of the plan route, no command, nothing booked',async()=>{
 const s=await scenario(),p=await propose(s);
 assert.equal(p.command,null);assert.ok(needsPurpose({kind:'payment',card:{purposeOptions:p.plan.purposeOptions}}));
 const o=p.plan.purposeOptions;
 assert.equal(o.remainder,'90');assert.equal(o.dueAmount,'10');assert.equal(o.businessDate,today);assert.equal(o.split,true);
 assert.deepEqual(p.plan.split.map(r=>[r.chargeId,r.principal,r.interest,r.projected]),[[s.loan+'-today','0','10',false]]);
 // Pay forward: the plan route's forward charges for this remainder, row for row.
 const fwd=await plans(s,'100',{forward:true,principal:[],loans:null});assert.equal(fwd.status,200,JSON.stringify(fwd.data));
 assert.equal(o.forward.rows.reduce((sum,r)=>sum+BigInt(r.principal)+BigInt(r.interest),0n).toString(),'90');
 assert.deepEqual(o.forward.rows.map(r=>[r.chargeId,r.chargeDate,r.interest]).sort(),fwd.data.plan.materialize.map(e=>[e.chargeId,e.chargeDate,e.interestDue]).sort());
 assert.equal(o.forward.from,await day(1));assert.equal(o.forward.paidThrough,await day(9));assert.ok(o.forward.rows.every(r=>r.interest==='10'&&r.partial===false));
 // Repay principal: the loan's whole remainder, with the numbers the plan route yields after the raise.
 assert.equal(o.principal.length,1);const pr=o.principal[0];
 assert.deepEqual([pr.loanId,pr.amount,pr.dailyBefore,pr.dailyAfter,pr.outstandingBefore,pr.outstandingAfter],[s.loan,'90','10','9','1000','910']);
 assert.ok(pr.loanDisplayKey);
 const principal_=await plans(s,'100',{forward:false,principal:[{loanId:s.loan,amount:'90'}],loans:null});assert.equal(principal_.status,200,JSON.stringify(principal_.data));
 assert.equal((await admin.query('SELECT count(*)::int AS n FROM "Payments" WHERE "Ref Borrower"=$1',[s.borrower])).rows[0].n,0,'proposing books nothing');
});

test('(2) a Pay forward purpose gives the v10 command under the proposal request id; it posts, books the charges, and a second send reads back',async()=>{
 const s=await scenario(),p=await propose(s);
 const command=await paymentCommandFor({client,stored:stored(p),purpose:{forward:true,principal:[]}});
 assert.equal(command.schemaVersion,10);assert.equal(command.requestId,p.requestId);assert.equal(command.amountReceived,'100');
 assert.equal(command.materialize.length,9);assert.equal(command.allocations.length,10);assert.deepEqual(command.principal??[],[]);
 const sent=await client.submit('payment',JSON.stringify(command));assert.equal(sent.result,'recorded',JSON.stringify(sent));assert.equal(sent.data.originalOutcome.status,'posted',JSON.stringify(sent));
 const paymentId=sent.data.originalOutcome.paymentId;
 const charges=(await admin.query(`SELECT "Charge Date"::text AS d,"Interest Due"::numeric::text AS i FROM "Charges" WHERE "Ref Loans"=$1 ORDER BY 1`,[s.loan])).rows;
 assert.equal(charges.length,10,'today and nine forward charges');assert.ok(charges.every(r=>r.i==='10.00'));
 assert.equal((await admin.query(`SELECT sum("Interest Paid"::numeric)::text AS t FROM "Repayments" WHERE "Ref Payment"=$1`,[paymentId])).rows[0].t,'100.00');
 const pay=(await admin.query(`SELECT "Amount Received"::numeric::text AS a,"Allocation Method" AS m FROM "Payments" WHERE "Row ID"=$1`,[paymentId])).rows[0];assert.deepEqual(pay,{a:'100.00',m:'Selected Charges'});
 // The second Confirm is the same command again: the recorded outcome, no second payment.
 const again=await client.submit('payment',JSON.stringify(command));assert.equal(again.result,'recorded');assert.equal(again.data.originalOutcome.paymentId,paymentId);
 assert.equal((await admin.query('SELECT count(*)::int AS n FROM "Payments" WHERE "Ref Borrower"=$1',[s.borrower])).rows[0].n,1);
 // And the status read of the claim (what the card polls) returns the same outcome.
 const status=await client.status('payment',p.requestId);assert.equal(status.kind,'recorded');assert.equal(status.originalOutcome.paymentId,paymentId);
});

test('(3) Repay principal on a daily-interest loan posts with the anchor moved to today and the daily interest of the card',async()=>{
 const s=await scenario(),p=await propose(s);const pr=p.plan.purposeOptions.principal[0];
 const command=await paymentCommandFor({client,stored:stored(p),purpose:{forward:false,principal:[{loanId:s.loan,amount:pr.amount}]}});
 assert.equal(command.schemaVersion,10);assert.deepEqual(command.materialize??[],[]);assert.equal(command.principal.length,1);assert.equal(command.principal[0].amount,'90');
 const sent=await client.submit('payment',JSON.stringify(command));assert.equal(sent.result,'recorded',JSON.stringify(sent));assert.equal(sent.data.originalOutcome.status,'posted',JSON.stringify(sent));
 const loan=(await admin.query(`SELECT "Interest Schedule Anchor Date"::text AS anchor,"Outstanding Principal"::numeric::text AS o,"Current Daily Interest"::numeric::text AS d FROM "Loans" WHERE "Row ID"=$1`,[s.loan])).rows[0];
 assert.deepEqual(loan,{anchor:today,o:pr.outstandingAfter+'.00',d:pr.dailyAfter+'.00'});
 assert.equal((await admin.query(`SELECT count(*)::int AS n FROM "Charges" WHERE "Ref Loans"=$1 AND "Charge Date">$2::date`,[s.loan,today])).rows[0].n,0,'no forward charge for a principal repayment');
 assert.equal((await client.submit('payment',JSON.stringify(command))).data.originalOutcome.paymentId,sent.data.originalOutcome.paymentId,'a second send reads back');
});

test('(4) a purpose that is not offered is refused: no command built, nothing booked',async()=>{
 const s=await scenario(),p=await propose(s);const other=await scenario();
 const refuse=async(purpose,code=/PURPOSE_NOT_OFFERED/)=>{await assert.rejects(()=>paymentCommandFor({client,stored:stored(p),purpose}),error=>{assert.match(String(error.message??error.code),code,JSON.stringify(purpose));return true});};
 await refuse({forward:false,principal:[{loanId:other.loan,amount:'90'}]});   // a loan the card does not offer
 await refuse({forward:false,principal:[{loanId:s.loan,amount:'50'}]});        // repay principal must be the offered amount
 await refuse({forward:true,principal:[{loanId:s.loan,amount:'90'}]});         // a split must leave the rest paying forward
 await refuse({forward:false,principal:[]});                                   // neither purpose
 await refuse({forward:true,principal:[],extra:true});                          // not the contract's shape
 await refuse(null,/INVALID_COMMAND/);                                         // no purpose at all: the planner returns a draft, not a command
 assert.equal((await admin.query('SELECT count(*)::int AS n FROM "Payments" WHERE "Ref Borrower" IN ($1,$2)',[s.borrower,other.borrower])).rows[0].n,0);
});
