import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget,applicationConnectionGuard} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore,createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
import {canonicalActor,commandIdentity} from '../../services/contracts/payment-command.mjs';
import {OWNER_EMAIL,PROJECT_ID} from '../../services/lib/identity.mjs';
// R075 V96: manual payment command v7 (slip bank reference and transfer time) on the V96 head,
// through the real application role, explicit plan engine and journal. Synthetic data only.
let admin,app,proof,store,fixture,today,yesterday;const user='mw_app_dev_v7_fixture';
const principal={ok:true,email:OWNER_EMAIL,subject:'v7-manual-owner'};
const actor=()=>({issuer:`https://securetoken.google.com/${PROJECT_ID}`,subject:principal.subject,partnerId:fixture.actorId,loginEmail:OWNER_EMAIL});
before(async()=>{
 admin=await disposablePool(96);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);
 const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:3});
 proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:96});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 fixture=await seedPaymentFixture(admin,'V7-MANUAL');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);
 ({today,yesterday}=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS today,((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-1)::text AS yesterday")).rows[0]);
});
after(async()=>{await app?.end();await admin?.end()});
async function line(index=0,amount){
 const d=await store.draft(principal,fixture.borrowerId,{scope:'all'});const charge=d.charges.find(row=>row.id===fixture.chargeIds[index]);
 const interest=amount===undefined?charge.interestRemaining:String(Math.min(Number(amount),Number(charge.interestRemaining)));
 const principalPaid=amount===undefined?charge.principalRemaining:String(Number(amount)-Number(interest));
 return {chargeId:charge.id,principal:principalPaid,interest,expectedPrincipalRemaining:charge.principalRemaining,expectedInterestRemaining:charge.interestRemaining,chargeDate:charge.chargeDate};
}
const v7=(allocation,overrides={})=>({schemaVersion:7,requestId:randomUUID(),borrowerId:fixture.borrowerId,allocations:[allocation],cashAccountId:fixture.receivingAccountId,paymentDate:today,amountReceived:String(Number(allocation.principal)+Number(allocation.interest)),paymentMethod:'Bank Transfer',notes:null,receiptId:null,bankReference:null,transferTime:null,...overrides});
const payment=async id=>(await admin.query(`SELECT "Status" AS status,"Payment Date"::text AS day,"Bank Reference" AS reference,to_char("Created At",'YYYY-MM-DD HH24:MI:SS') AS created,"Allocation Method" AS method FROM "Payments" WHERE "Row ID"=$1`,[id])).rows[0];

test('V96 v7 posts through the explicit plan with slip date, Bank Reference and Created At; replay is idempotent',async()=>{
 const command=v7(await line(0,'5'),{paymentDate:yesterday,bankReference:'ab-12 34 cd',transferTime:'09:41:27'});
 const posted=await store.submit(principal,command);assert.equal(posted.status,200,JSON.stringify(posted));assert.equal(posted.originalOutcome.status,'posted',JSON.stringify(posted));
 const id=posted.originalOutcome.paymentId;
 assert.deepEqual(await payment(id),{status:'Posted',day:yesterday,reference:'AB1234CD',created:yesterday+' 09:41:00',method:'Selected Charges'});
 const journal=(await admin.query('SELECT canonical_json FROM pwa_payment_commands WHERE request_id=$1',[command.requestId])).rows[0].canonical_json;
 assert.equal(journal,commandIdentity(command,actor(),null).canonicalJson);
 assert.match(journal,/"receiptId":null,"bankReference":"AB1234CD","transferTime":"09:41"\}/);
 const provenance=(await admin.query('SELECT pwa_effective_payment_plan_v2($1) AS value',[id])).rows[0].value;
 assert.equal(provenance.plan.paymentDate,yesterday);assert.equal(provenance.plan.allocations.length,1);
 assert.equal(Number((await admin.query('SELECT count(*) n FROM "Payment Allocations" WHERE "Ref Payment"=$1',[id])).rows[0].n),1);
 const result=await store.result(principal,command.requestId);assert.equal(result.currentSource,'present',JSON.stringify(result));
 assert.deepEqual(await store.submit(principal,command),posted);
});

test('V96 v7 without slip fields leaves Bank Reference and Created At empty; v6 is unchanged',async()=>{
 const plain=v7(await line(1,'3'));const posted=await store.submit(principal,plain);assert.equal(posted.originalOutcome?.status,'posted',JSON.stringify(posted));
 assert.deepEqual(await payment(posted.originalOutcome.paymentId),{status:'Posted',day:today,reference:null,created:null,method:'Selected Charges'});
 const {bankReference,transferTime,...v6}=v7(await line(1,'2'),{schemaVersion:6});void bankReference;void transferTime;
 const legacy=await store.submit(principal,v6);assert.equal(legacy.originalOutcome?.status,'posted',JSON.stringify(legacy));
 assert.deepEqual(await payment(legacy.originalOutcome.paymentId),{status:'Posted',day:today,reference:null,created:null,method:'Selected Charges'});
});

test('V96 date window: v7 rejects two days ago, v6 still rejects yesterday; both are journalled rejections',async()=>{
 const old=(await admin.query("SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-2)::text AS day")).rows[0].day;
 const late=await store.submit(principal,v7(await line(1,'1'),{paymentDate:old,bankReference:'REF0001',transferTime:'23:59'}));
 assert.equal(late.originalOutcome?.status,'rejected',JSON.stringify(late));assert.equal(late.originalOutcome.code,'invalid_date');
 const {bankReference,transferTime,...v6}=v7(await line(1,'1'),{schemaVersion:6,paymentDate:yesterday});void bankReference;void transferTime;
 const legacy=await store.submit(principal,v6);assert.equal(legacy.originalOutcome?.status,'rejected',JSON.stringify(legacy));assert.equal(legacy.originalOutcome.code,'invalid_date');
});

test('V96 refuses noncanonical or non-transfer slip fields before any journal row',async()=>{
 const base=v7(await line(1,'1'));
 assert.equal((await store.submit(principal,{...base,paymentMethod:'Cash',bankReference:'REF0002'})).status,400);
 for(const mutate of [c=>{c.command.bankReference='ab1234'},c=>{c.command.transferTime='9:05'},c=>{c.command.paymentMethod='Cash';c.command.transferTime='09:05'},c=>{delete c.command.transferTime}]){
  const forged=JSON.parse(commandIdentity({...base,requestId:randomUUID()},actor(),null).canonicalJson);mutate(forged);
  await assert.rejects(app.query('SELECT pwa_submit_selected_charges_v1($1)',[JSON.stringify(forged)]),error=>error.code==='22023');
  assert.equal((await admin.query('SELECT count(*) n FROM pwa_payment_commands WHERE request_id=$1',[forged.command.requestId])).rows[0].n,'0');
 }
});

test('V96 explicit provenance excludes a contract-1 schemaVersion 7 agent receipt row without an allocation plan',async()=>{
 const c=await admin.connect();
 try{
  await c.query('BEGIN');const request=randomUUID(),id='pwa:'+request;
  const canonical=JSON.stringify({contractVersion:1,command:{schemaVersion:7,requestId:request,environment:'dev',reviewId:'synthetic',mode:'automatic'},actor:{issuer:'https://accounts.google.com',subject:'1',partnerId:fixture.actorId,loginEmail:OWNER_EMAIL.toLowerCase()},receipt:null});
  await c.query(`INSERT INTO pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code) VALUES($1,1,'https://accounts.google.com','1',$2,$3,$4,$5,'posted',$6,NULL)`,[request,fixture.actorId,OWNER_EMAIL.toLowerCase(),canonical,createHash('sha256').update(canonical).digest('hex'),id]);
  assert.equal((await c.query('SELECT pwa_effective_payment_plan_v2($1) AS value',[id])).rows[0].value,null);
 }finally{await c.query('ROLLBACK');c.release()}
});

test('R075 recognition rules read this database: masked account match, ambiguity, existing reference warning, slip date window',async t=>{
 const saved=(await admin.query('SELECT "Row ID" id,"Account Number" number,"Alternative Account Number" alternative FROM "Cash Accounts" WHERE "Row ID"=ANY($1)',[[fixture.receivingAccountId,fixture.lendingAccountId]])).rows;
 t.after(async()=>{for(const row of saved)await admin.query('UPDATE "Cash Accounts" SET "Account Number"=$2,"Alternative Account Number"=$3 WHERE "Row ID"=$1',[row.id,row.number,row.alternative])});
 await admin.query('UPDATE "Cash Accounts" SET "Account Number"=$2,"Alternative Account Number"=NULL WHERE "Row ID"=$1',[fixture.receivingAccountId,'123-4-56789-0']);
 await admin.query('UPDATE "Cash Accounts" SET "Account Number"=$2 WHERE "Row ID"=$1',[fixture.lendingAccountId,'999-9-99999-9']);
 const resolveActor=async(client,p)=>{const rows=(await client.query('SELECT "Row ID" AS id FROM "Partners" WHERE lower(btrim("Login Email"))=$1',[p.email])).rows;return rows.length===1?canonicalActor({...actor(),partnerId:rows[0].id}):null};
 let calls=0;const recognizer={recognize:async()=>{calls++;return {status:'recognized',provider:'gemini',model:'synthetic-flash-001',result:{is_payment_receipt:true,transfer_successful:true,date:yesterday,time:'09:41:27',amount:'1500.00',currency:'THB',reference:'AB-1234 CD',recipient_numbers:['xxx-x-x6789-x']}}}};
 const receiptAdapter={resolveReceipt(){},retrieve:async()=>({bytes:Buffer.from('synthetic'),mimeType:'image/png'})};
 const recognition=createEnvironmentCommandStore({pool:app,guardConnection:applicationConnectionGuard(proof),principalAllowed:()=>true,resolveActor,actorIssuer:actor().issuer,receiptAdapter,recognizer});
 const ids={requestId:randomUUID(),receiptId:randomUUID()};
 const first=await recognition.recognize(principal,ids);assert.equal(first.status,200,JSON.stringify(first));
 assert.deepEqual(first.recognition.suggestion,{amountReceived:'1500',cashAccountId:fixture.receivingAccountId,bankReference:'AB1234CD',paymentDate:yesterday,transferTime:'09:41',paymentMethod:'Bank Transfer'});
 // The first test recorded AB1234CD on a Payment: the rule reads Payments on every call, even from cache.
 assert.deepEqual(first.recognition.warnings,[{code:'reference_exists'}]);
 const again=await recognition.recognize(principal,ids);assert.deepEqual(again.recognition,first.recognition);assert.equal(calls,1);
 // A second active account fitting the same masked digits makes the match ambiguous; still no new model call.
 await admin.query('UPDATE "Cash Accounts" SET "Account Number"=$2 WHERE "Row ID"=$1',[fixture.lendingAccountId,'555-5-56789-5']);
 const ambiguous=await recognition.recognize(principal,ids);assert.equal(ambiguous.recognition.suggestion.cashAccountId,null);assert.deepEqual(ambiguous.recognition.warnings.map(w=>w.code),['account_ambiguous','reference_exists']);assert.equal(calls,1);
});
