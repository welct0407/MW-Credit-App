import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createServer} from 'node:http';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {createAgentReceiptHandler} from '../../services/agent-receipts/runtime.mjs';
import {receiptRequestId} from '../../services/agent-receipts/contract.mjs';
import {OWNER_EMAIL} from '../../services/lib/identity.mjs';
import {migrationHead} from '../migration-head.mjs';
// R112 V125: the agent receipt command v9 through the real shared receipt API handler (HTTP, the command IAM database user, the real
// SQL), on the migration head. The agent's own logic (options, numbered reply, Instagram) is covered by the Python tests with the
// transport mocked; here the API side is real: forward, principal and split through the plan, drift rejected, one request id per slip,
// v7 unchanged, the reviewer rules, the 65 KB v9 body, and a referred-loan close offset as V124 does. Synthetic data only.
let admin,app,store,fixture,server,base,today,caller;const user='mw_app_dev_r112_fixture',iam='mw-credit-app-command-dev@clever-oasis-508610-n7.iam';
const principal={ok:true,email:OWNER_EMAIL,subject:'r112-owner'};
const day=offset=>(admin.query("SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+$1::integer)::text AS day",[offset])).then(r=>r.rows[0].day);
const policy={environment:'dev',audience:'https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app',callerEmail:'synthetic-agent@clever-oasis-508610-n7.iam.gserviceaccount.com',callerSubject:'737787224638',automaticPartnerId:'',reviewerPartnerIds:[],evidenceSha256:'d'.repeat(64)};
before(async()=>{
 const head=migrationHead();
 admin=await disposablePool(head);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:3});
 const proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:head});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 fixture=await seedPaymentFixture(admin,'R112-AG');
 await admin.query('UPDATE "Partners" SET "Login Email"=$1,"AI Reviewer"=true,"IG Integration Enabled"=true WHERE "Row ID"=$2',[OWNER_EMAIL.toLowerCase(),fixture.actorId]);
 await admin.query(`INSERT INTO "Partners"("Row ID","Partner Role","Login Email","AI Reviewer","IG Integration Enabled") VALUES('R112-PLAIN','A','r112-plain@example.invalid',false,false)`);
 await admin.query(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('R112-CAPITAL',$1,current_date,'Contribution',200000::money)`,[fixture.actorId]);
 if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[iam])).rowCount)await admin.query(`CREATE ROLE "${iam}" LOGIN NOSUPERUSER NOBYPASSRLS`);
 await admin.query(`GRANT mw_app_dev TO "${iam}" WITH INHERIT TRUE,SET FALSE,ADMIN FALSE;GRANT EXECUTE ON FUNCTION public.pwa_submit_agent_receipt_v1(text),public.pwa_agent_receipt_status_v1(uuid,text,text) TO "${iam}"`);
 const ac=await admin.connect();try{assert.deepEqual((await reconcileApplicationRole(ac,{database:'payment_rehearsal',creators:['postgres']},{apply:true})).violations,[]);}finally{ac.release();}
 caller=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user:iam,password:'',max:3});
 policy.automaticPartnerId=fixture.actorId;policy.reviewerPartnerIds=[fixture.actorId,'R112-PLAIN'];
 const handler=createAgentReceiptHandler({next:(_req,res)=>{res.writeHead(401);res.end();},policy,pool:caller,guardConnection:async()=>{},afterCommit:async()=>{},
  verifyOidc:async()=>({aud:policy.audience,iss:'https://accounts.google.com',email:policy.callerEmail,sub:policy.callerSubject,email_verified:true,iat:Date.now()/1000,exp:Date.now()/1000+60})});
 server=createServer((req,res)=>void handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 today=await day(0);
});
after(async()=>{await new Promise(r=>server?.close(r));await caller?.end();await app?.end();await admin?.end()});
const post=(body,path='/internal/agent/receipt-payments')=>fetch(base+path,{method:'POST',headers:{authorization:'Bearer synthetic',['content-type']:'application/json'},body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()}));
const status=requestId=>fetch(base+'/internal/agent/receipt-payments/'+requestId,{headers:{authorization:'Bearer synthetic'}}).then(async r=>({status:r.status,body:await r.json()}));
let n=0;
async function scenario({cdi=10,interval=1,due=10,principalDue=0,referrerLoan=null,otherLoan=false}={}){
 const id='R112-S'+(++n),borrower=id+'-B',loan=id+'-L';
 let referrer=null;
 if(referrerLoan){referrer=id+'-REF';await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES($1,$2)',[referrer,'SYNTHETIC REFERRER '+id])}
 await admin.query('INSERT INTO "Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES($1,$2,$3)',[borrower,'SYNTHETIC SLIP '+id,referrer]);
 const loanSql=`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval") VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,$4::money,$5)`;
 await admin.query(loanSql,[loan,borrower,fixture.lendingAccountId,cdi,interval]);
 await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,$3::date,$4::money,$5::money)`,[loan+'-today',loan,today,principalDue,due]);
 if(referrerLoan){await admin.query(loanSql,[id+'-RL',referrer,fixture.lendingAccountId,10,1]);await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,$3::date,0::money,10::money)`,[id+'-RL-today',id+'-RL',today]);await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[id+'-RL'])}
 if(otherLoan){   // a second open loan with its own due charge: the closing loan carries unpaid principal, so the remainder pays forward on this one
  await admin.query(loanSql,[id+'-L2',borrower,fixture.lendingAccountId,10,1]);await admin.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,$3::date,0::money,10::money)`,[id+'-L2-today',id+'-L2',today]);
  await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[id+'-L2']);
 }
 await admin.query(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[loan]);
 return {id,borrower,loan,referrer,rl:id+'-RL'};
}
// The agent's options come from the plan; the command carries the plan the reviewer saw (allocations, materialize, principal) and the purpose.
const byte=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
async function agentCommand(s,amount,purpose,reviewId=s.id+'-review',mode='reviewed'){
 const plan=(await store.plan(principal,s.borrower,{amountReceived:String(amount),purpose})).plan;assert.ok(plan,'the plan is readable');
 const lines=plan.allocations.map(l=>({chargeId:l.chargeId,principal:String(l.principal),interest:String(l.interest),expectedPrincipalRemaining:String(l.expectedPrincipalRemaining),expectedInterestRemaining:String(l.expectedInterestRemaining),chargeDate:l.chargeDate})).sort((a,b)=>byte(a.chargeId,b.chargeId));   // the command lists are ordered (chargeId, then loanId; byte order)
 const entries=plan.materialize.map(e=>({loanId:e.loanId,chargeId:e.chargeId,chargeDate:e.chargeDate,principalDue:String(e.principalDue),interestDue:String(e.interestDue)})).sort((a,b)=>byte(a.chargeId,b.chargeId));
 const prin=purpose.principal.map(ask=>{const p=plan.principal.find(x=>x.loanId===ask.loanId);return{loanId:p.loanId,kind:p.kind,chargeId:p.chargeId,chargeDate:p.chargeDate,amount:ask.amount,accruedInterest:String(p.accruedInterest),principalDue:String(p.principalDue)}}).sort((a,b)=>byte(a.loanId,b.loanId));
 const receiptId='a'.repeat(64),rawSha256='b'.repeat(64),capturedAt=String(Math.floor(Date.parse(today+'T05:00:00Z')/1000));
 return {actorPartnerId:fixture.actorId,command:{schemaVersion:9,requestId:receiptRequestId('dev',reviewId),environment:'dev',reviewId,mode,borrowerId:s.borrower,cashAccountId:fixture.receivingAccountId,amountReceived:String(amount),paymentDate:today,transferTime:'12:10',bankReference:'R112REF'+reviewId.replace(/\W/g,'').toUpperCase().slice(-12),payerLines:null,proposalSha256:'c'.repeat(64),
  archiveEvidence:{receiptId,objectKey:`receipts/dev/${today.replaceAll('-','/')}/${receiptId}/${rawSha256}.png`,generation:'1',rawSha256,mimeType:'image/png',sizeBytes:100,capturedAt},purpose,allocations:lines,materialize:entries,principal:prin}};
}
const paid=async loan=>(await admin.query(`SELECT "Charge Date"::text AS d,"Principal Due"::numeric::text AS p,"Interest Due"::numeric::text AS i,"Amount Remaining"::numeric::text AS r FROM "Charges" WHERE "Ref Loans"=$1 ORDER BY "Charge Date"`,[loan])).rows;
const payment=async requestId=>(await admin.query(`SELECT "Status" AS status,"Amount Received"::numeric::text AS amount,"Allocation Method" AS method FROM "Payments" WHERE "Row ID"=$1`,['pwa:'+requestId])).rows[0];

test('v9 forward: a slip above what is due posts through the plan; replay is the recorded outcome; a different purpose for the same slip conflicts',async()=>{
 const s=await scenario(),body=await agentCommand(s,60,{forward:true,principal:[],loans:null}),other=await agentCommand(s,60,{forward:false,principal:[{loanId:s.loan,amount:'50'}],loans:null},s.id+'-review'),r=await post(body);   // both plans are read before anything posts
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.originalOutcome?.status,'posted',JSON.stringify(r.body));
 assert.deepEqual(await payment(body.command.requestId),{status:'Posted',amount:'60.00',method:'Selected Charges'});
 assert.equal(r.body.financialMatch,true,'the agent reads a financial match');
 assert.match((await admin.query('SELECT "Selected Charge IDs" AS ids FROM "Payments" WHERE "Row ID"=$1',['pwa:'+body.command.requestId])).rows[0].ids,/ , /,'the chosen charges are recorded in the Selected Charge IDs list');
 assert.deepEqual((await paid(s.loan)).map(c=>c.r),['0.00','0.00','0.00','0.00','0.00','0.00'],'the due charge and five booked charges are paid');
 const again=await post(body);assert.equal(again.body.originalOutcome?.status,'posted');assert.equal((await admin.query('SELECT count(*)::integer AS n FROM "Payments" WHERE "Ref Borrower"=$1',[s.borrower])).rows[0].n,1,'one payment');
 assert.equal((await post(other)).body.kind,'conflict','one slip, one request id: another purpose never posts');
 const read=await status(body.command.requestId);assert.equal(read.body.originalOutcome?.status,'posted','the status read reports the recorded outcome');
});

test('v9 principal (raise) and split through the plan: new daily interest, anchor today, forward charges at the recomputed amount',async()=>{
 const a=await scenario({interval:7,due:70}),pa=await agentCommand(a,270,{forward:false,principal:[{loanId:a.loan,amount:'200'}],loans:null});
 assert.equal((await post(pa)).body.originalOutcome?.status,'posted');
 assert.deepEqual((await admin.query(`SELECT "Interest Schedule Anchor Date"::text AS anchor,"Outstanding Principal"::numeric::text AS o,"Current Daily Interest"::numeric::text AS d FROM "Loans" WHERE "Row ID"=$1`,[a.loan])).rows[0],{anchor:today,o:'800.00',d:'8.00'});
 const b=await scenario(),pb=await agentCommand(b,128,{forward:true,principal:[{loanId:b.loan,amount:'100'}],loans:null});
 assert.equal((await post(pb)).body.originalOutcome?.status,'posted');
 const rows=await paid(b.loan);assert.deepEqual(rows.map(c=>[c.p,c.i,c.r]),[['100.00','10.00','0.00'],['0.00','9.00','0.00'],['0.00','9.00','0.00']],'principal 100 on today, then two charges at 9');
});

test('drift is rejected as selection_unavailable with nothing booked; a tampered plan too',async()=>{
 const s=await scenario(),body=await agentCommand(s,30,{forward:true,principal:[],loans:null});
 assert.equal((await admin.query('SELECT public.generate_loan_charge($1,$2::date) AS id',[s.loan,await day(1)])).rows[0].id,'cg8:'+Array.from(s.loan).length+':'+s.loan+':'+await day(1));
 const r=await post(body);assert.equal(r.body.originalOutcome?.status,'rejected',JSON.stringify(r.body));assert.equal(r.body.originalOutcome.code,'selection_unavailable');
 assert.equal(await payment(body.command.requestId),undefined,'nothing posted');assert.equal((await paid(s.loan)).length,2,'only today and the charge booked meanwhile');
 const t=await scenario(),tamper=await agentCommand(t,30,{forward:true,principal:[],loans:null});tamper.command.materialize[0].interestDue='9';tamper.command.allocations.find(l=>l.chargeId===tamper.command.materialize[0].chargeId).expectedInterestRemaining='9';
 const bad=await post(tamper);assert.ok(bad.status===400||bad.body.originalOutcome?.status==='rejected',JSON.stringify(bad));assert.equal(await payment(tamper.command.requestId),undefined);
});

test('v7 is unchanged: a slip that is due posts as a Lump Sum; the reviewer rules hold',async()=>{
 const s=await scenario();const receiptId='a'.repeat(64),rawSha256='b'.repeat(64),capturedAt=String(Math.floor(Date.parse(today+'T05:00:00Z')/1000));
 const v7={actorPartnerId:fixture.actorId,command:{schemaVersion:7,requestId:receiptRequestId('dev',s.id+'-due'),environment:'dev',reviewId:s.id+'-due',mode:'reviewed',borrowerId:s.borrower,cashAccountId:fixture.receivingAccountId,amountReceived:'10',paymentDate:today,transferTime:'12:10',bankReference:'R112DUE'+n,proposalSha256:'c'.repeat(64),archiveEvidence:{receiptId,objectKey:`receipts/dev/${today.replaceAll('-','/')}/${receiptId}/${rawSha256}.png`,generation:'1',rawSha256,mimeType:'image/png',sizeBytes:100,capturedAt}}};
 assert.equal((await post(v7)).body.originalOutcome?.status,'posted');assert.equal((await payment(v7.command.requestId)).method,'Lump Sum');
 // A Partner who is not an AI Reviewer cannot post a reviewed slip; an actor outside the policy is refused before the database.
 const t=await scenario(),plain=await agentCommand(t,60,{forward:true,principal:[],loans:null});plain.actorPartnerId='R112-PLAIN';
 assert.equal((await post(plain)).status,403);assert.equal(await payment(plain.command.requestId),undefined);
 const outsider=await agentCommand(t,60,{forward:true,principal:[],loans:null});outsider.actorPartnerId='someone-else';assert.equal((await post(outsider)).status,400);
});

test('the v9 body may be larger than v7: a 93-day forward plan is accepted; an oversized v7 is still refused',async()=>{
 const s=await scenario(),body=await agentCommand(s,940,{forward:true,principal:[],loans:null});
 assert.ok(JSON.stringify(body).length>16384,'the plan is bigger than the v7 body limit');
 const r=await post(body);assert.equal(r.status,200,JSON.stringify(r).slice(0,300));assert.equal(r.body.originalOutcome?.status,'posted');
 assert.equal((await paid(s.loan)).length,94,'today and 93 booked charges');
 const huge={actorPartnerId:fixture.actorId,command:{schemaVersion:7,padding:'x'.repeat(20000)}};assert.equal((await post(huge)).status,400);
});

test('a v9 slip that closes a referred loan offsets the rebate to the referrer loan as V124 does',async()=>{
 const s=await scenario({due:300,principalDue:1000,cdi:100,referrerLoan:true,otherLoan:true}),body=await agentCommand(s,1320,{forward:true,principal:[],loans:null});
 const r=await post(body);assert.equal(r.body.originalOutcome?.status,'posted',JSON.stringify(r.body));
 assert.equal((await admin.query('SELECT "Loan Status" AS s FROM "Loans" WHERE "Row ID"=$1',[s.loan])).rows[0].s,'ปิดยอดแล้ว');
 const off=(await admin.query(`SELECT "Row ID" AS id,"Amount Received"::numeric::text AS amount FROM "Payments" WHERE "Ref Borrower"=$1 AND "Payment Method"='Referral Rebate Offset'`,[s.referrer])).rows;
 assert.equal(off.length,1);assert.equal(off[0].amount,'30.00');assert.match(off[0].id,/^ro122:pwa:/);
 assert.equal((await admin.query(`SELECT "Ref Offset Payment" AS o FROM "Business Expenses" WHERE "Row ID"=$1`,['rr1:'+s.loan])).rows[0].o,off[0].id);
});

test('a v9 slip dated yesterday is refused as invalid_date; nothing is posted or booked',async()=>{
 const s=await scenario(),body=await agentCommand(s,60,{forward:true,principal:[],loans:null}),yesterday=await day(-1);
 body.command.paymentDate=yesterday;const receiptId=body.command.archiveEvidence.receiptId;
 body.command.archiveEvidence.capturedAt=String(Math.floor(Date.parse(yesterday+'T05:00:00Z')/1000));body.command.archiveEvidence.objectKey=`receipts/dev/${yesterday.replaceAll('-','/')}/${receiptId}/${body.command.archiveEvidence.rawSha256}.png`;
 const r=await post(body);assert.equal(r.body.originalOutcome?.status,'rejected',JSON.stringify(r));assert.equal(r.body.originalOutcome.code,'invalid_date');
 assert.equal(await payment(body.command.requestId),undefined);assert.equal((await paid(s.loan)).length,1);
});
