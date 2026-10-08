import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {planApplicationRole,reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {canonicalOperation,operationIdentity} from '../../services/contracts/operation-command.mjs';
import {canonicalCommand,commandIdentity} from '../../services/contracts/payment-command.mjs';
import {OWNER_EMAIL,DEV_PROJECT} from '../../services/api/dev-read-config.mjs';
let admin,app,store,proof,fixture;const user='mw_app_dev_c_root_lists_fixture';
const principal={ok:true,email:OWNER_EMAIL,subject:'independent-generalized-owner'};
const fields=()=>({name:'C operation '+randomUUID(),description:'Synthetic English',communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:fixture.receivingAccountId,note:' exact ไทย\n '});
const command=(inputs=fields())=>({requestId:randomUUID(),operation:'borrower.create',targetId:randomUUID(),expectedVersion:null,predecessorRequestId:null,inputs,receiptId:null});
const actor=()=>({issuer:`https://securetoken.google.com/${DEV_PROJECT}`,subject:principal.subject,partnerId:fixture.actorId,loginEmail:OWNER_EMAIL});
before(async()=>{
 admin=await disposablePool(83);await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await admin.query(`GRANT mw_app_dev TO ${user}`);const c=await admin.connect();try{const plan=await planApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']});assert.deepEqual(plan.violations,[]);await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user,password:'',max:4});proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user,expectedVersion:83});store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,ownerTesting:true});
 fixture=await seedPaymentFixture(admin,'C-P5-ROOTS');await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[OWNER_EMAIL,fixture.actorId]);const role=(await app.query('SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.deepEqual(role,{name:user,rolsuper:false,rolbypassrls:false});
});
after(async()=>{await app?.end();await admin?.end()});
async function assertSameBusinessReadC(current,expected){
 const day=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
 const business=row=>{const {asOf,businessDate,...value}=row;assert.match(asOf,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);assert.equal(new Date(asOf).toISOString(),asOf);assert.equal(businessDate,day);return value};
 assert.deepEqual(business(current),business(expected));
}
async function rows(id){return(await admin.query('SELECT to_jsonb(j) AS value FROM pwa_payment_commands j WHERE request_id=$1',[id])).rows}
async function source(id){return(await admin.query('SELECT to_jsonb(b) AS value FROM "Borrowers" b WHERE "Row ID"=$1',[id])).rows}
async function create(c=command()){const r=await store.operation(principal,c);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.originalOutcome.status,'applied');return {c,r,item:(await store.borrowerRecord(principal,c.targetId)).item}}

const byteSort=(a,b)=>Buffer.compare(Buffer.from(a??''),Buffer.from(b??''));
async function allRootC(kind,q,limit=7){let cursor=null,items=[],firstCursor;do{const page=await store.recordList(principal,kind,{q,limit,cursor});assert.equal(page.status,200,JSON.stringify(page));items.push(...page.items);firstCursor??=page.nextCursor;cursor=page.nextCursor;assert.ok(items.length<300)}while(cursor);assert.equal(new Set(items.map(x=>x.id)).size,items.length);return {items,firstCursor}}
test('F13-C01 root Loans and Payments preserve complete source groups ordering literal search and closed cursors',async()=>{
 const tag='C-root-'+randomUUID(),a=await create(command({...fields(),name:tag+' - X',description:'Y %_ ไทย',hidden:true})),b=await create(command({...fields(),name:tag,description:'X - Y %_ ไทย',hidden:false}));
 const day=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
 const loanIds=[];for(let i=0;i<28;i++){const id=randomUUID(),borrower=i%2?a.c.targetId:b.c.targetId,status=['ยังไม่ปิดยอด','ปิดยอดแล้ว',null][i%3];await app.query('INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Created By") VALUES($1,$2,$3,$4::date-40,1000::money,$5,$6,false,$7)',[id,borrower,fixture.lendingAccountId,day,status,'กำหนดวันชำระ',OWNER_EMAIL]);loanIds.push(id)}
 for(const [id,borrower] of [[loanIds[0],b.c.targetId],[loanIds[1],a.c.targetId]])await app.query('INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,$3::date-40,0::money,100::money)',[randomUUID(),id,day]);
 const paymentIds=[];for(let i=0;i<29;i++){const id=randomUUID(),borrower=i<26?a.c.targetId:b.c.targetId;await app.query('INSERT INTO "Payments"("Row ID","Status","Ref Borrower","Amount Received","Payment Date","Payment Method","Allocation Method","Ref Received By Cash Account","Created By","Created At") VALUES($1,$2,$3,1::money,$4,$5,$6,$7,$8,$9::timestamp)',[id,'Processing',borrower,day,'Cash','Lump Sum',fixture.receivingAccountId,OWNER_EMAIL,i%2?'2026-01-01 01:00:00':null]);paymentIds.push(id)}
 const loans=await allRootC('loans',tag),payments=await allRootC('payments',tag,5);assert.equal(loans.items.length,28);assert.equal(payments.items.length,29);assert.deepEqual(new Set(loans.items.map(r=>r.id)),new Set(loanIds));assert.deepEqual(new Set(payments.items.map(r=>r.id)),new Set(paymentIds));assert.deepEqual(new Set(loans.items.map(r=>r.rank)),new Set([0,1,2]));assert.ok(loans.items.some(r=>r.borrowerId===a.c.targetId));
 const rawLoans=(await admin.query('SELECT l."Row ID" id,l."Ref Borrowers" borrower,l."Loan Status" status,l."Loan Date"::text AS day,l."Principal Amount"::numeric::text principal,l."Total Interest Received"::numeric::text interest FROM "Loans" l WHERE l."Row ID"=ANY($1::text[])',[loanIds])).rows;
 const expected=rawLoans.sort((x,y)=>['ยังไม่ปิดยอด','ปิดยอดแล้ว',null].indexOf(x.status)-['ยังไม่ปิดยอด','ปิดยอดแล้ว',null].indexOf(y.status)||byteSort(x.borrower,y.borrower)||byteSort(y.day,x.day)||byteSort(x.id,y.id));assert.deepEqual(loans.items.map(r=>r.id),expected.map(r=>r.id));for(const row of loans.items){const raw=rawLoans.find(r=>r.id===row.id);assert.equal(Number(row.principalRecoveredByInterestRatio),Number(raw.interest)/Number(raw.principal));assert.equal(row.totalInterestReceived,raw.interest)}
 for(const row of payments.items){assert.equal(row.status,'Posted');assert.equal(Number(row.amountReceived),1);assert.equal(Number(row.postedAmount),1);assert.equal(Number(row.groupAmountReceived),row.borrowerId===a.c.targetId?26:3);assert.equal(row.manualReceiptPresent,false);assert.equal(row.agentReceiptPresent,false);assert.ok(!('receiptReference'in row))}
 const rawPayments=(await admin.query('SELECT "Row ID" id,"Ref Borrower" borrower,"Payment Date"::text AS day,"Created At"::text created FROM "Payments" WHERE "Row ID"=ANY($1::text[])',[paymentIds])).rows;rawPayments.sort((x,y)=>byteSort(x.borrower,y.borrower)||byteSort(y.day,x.day)||(x.created===null)-(y.created===null)||byteSort(y.created,x.created)||byteSort(x.id,y.id));assert.deepEqual(payments.items.map(r=>r.id),rawPayments.map(r=>r.id));
 assert.equal((await allRootC('loans','%_')).items.filter(r=>loanIds.includes(r.id)).length,28);assert.equal((await allRootC('payments','ไทย')).items.filter(r=>paymentIds.includes(r.id)).length,29);assert.equal((await store.recordList(principal,'loans',{q:tag+' absent'})).items.length,0);
 for(const [kind,cursor] of [['payments',loans.firstCursor],['loans',payments.firstCursor]])assert.equal((await store.recordList(principal,kind,{q:tag,cursor})).status,400);assert.equal((await store.recordList(principal,'loans',{q:tag+' changed',cursor:loans.firstCursor})).status,400);assert.equal((await store.recordList(principal,'payments',{q:tag,cursor:payments.firstCursor+'='})).status,400);assert.equal((await store.recordList(principal,'loans',{q:tag,limit:101})).status,400);
 const denial=createApplicationRoleCommandStore({pool:{connect(){throw Error('businessSQLmustnotopen')}},targetAttestation:proof,ownerTesting:true});assert.equal((await denial.recordList({...principal,email:'foreign@example.invalid'},'loans',{})).status,403);
});
