import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {readCollection} from '../../services/api/collection-read-contract.mjs';
import {migrationHead} from '../migration-head.mjs';
// R114 COL-2 (the R109 guard): the Collection read's prepaid-source statement, run by the real read SQL under a reader role that
// has exactly the column grants of the PROD reader contract (scripts/production/reader-capability-contract.json), on the migration
// head. WITH the grants a borrower paid in advance by a Referral Rebate Offset shows prepaidSource 'rebate_offset' and an ordinary
// advance does not; WITHOUT the Payments and Repayments."Ref Payment" grants the read does not fail (no 42501 / 503): the rows come
// back with the date only. Fixture: each prepaid charge is paid by a Receive All dated yesterday while it is yesterday's charge, then dated today
// (payments are immutable, charges are not). Synthetic data only.
const contract=JSON.parse(readFileSync(new URL('../../scripts/production/reader-capability-contract.json',import.meta.url),'utf8')).columnSelect;
let admin,fixture,reader;const role='mw_reader_r114_fixture';
const q=(sql,args)=>admin.query(sql,args);
const day=offset=>q("SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+$1::integer)::text AS day",[offset]).then(r=>r.rows[0].day);
const grantAll=async()=>{for(const [table,columns] of Object.entries(contract))await q(`GRANT SELECT(${columns.map(c=>'"'+c+'"').join(',')}) ON public."${table}" TO ${role}`)};
const revokeSource=async()=>{await q(`REVOKE SELECT("Row ID","Payment Method") ON public."Payments" FROM ${role}; REVOKE SELECT("Ref Payment") ON public."Repayments" FROM ${role}`)};
const client=async()=>{const c=await reader.connect();return c};
// The cluster may be shared with earlier files (Run-UnifiedReceiving.ps1): every read is scoped to this fixture by name.
async function board(){const c=await client();try{return await readCollection(c,{limit:100,after:null,query:'SYNTHETIC COL2'});}finally{c.release();}}
before(async()=>{
 admin=await disposablePool(migrationHead());
 await q(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$`);await q(`GRANT USAGE ON SCHEMA public TO ${role}`);
 reader=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user:role,password:'',max:2});
 fixture=await seedPaymentFixture(admin,'R114-COL');
 await q(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('R114-COL-CAPITAL2',$1,current_date,'Contribution',500000::money)`,[fixture.actorId]);
 // Three borrowers with one daily loan (10 a day) and today's charge of 10: paid yesterday by a rebate offset, paid yesterday by an ordinary
 // transfer, and unpaid.
 const today=await day(0),yesterday=await day(-1);
 for(const [id,method] of [['OFF','Referral Rebate Offset'],['ORD','Bank Transfer'],['NONE',null]]){
  const b='R114-'+id+'-B',l='R114-'+id+'-L';
  await q('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES($1,$2)',[b,'SYNTHETIC COL2 '+id]);
  await q(`INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval") VALUES($1,$2,$3,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-3,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money,1)`,[l,b,fixture.lendingAccountId]);
  await q(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES($1,$2,$3::date,0::money,10::money)`,[l+'-today',l,method?yesterday:today]);
  await q(`UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=$1`,[l]);
  if(method){   // an earlier payment that settles the charge (Receive All, dated yesterday, while it is yesterday's charge) ...
   await q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Amount Received","Payment Date","Payment Method","Allocation Method","Status") VALUES($1,$2,$3,10::money,$4::date,$5,'Receive All','Processing')`,[fixture.receivingAccountId,'R114-'+id+'-PAY',b,yesterday,method]);
   await q('SET CONSTRAINTS ALL IMMEDIATE');
   await q(`UPDATE "Charges" SET "Charge Date"=$2::date WHERE "Row ID"=$1`,[l+'-today',today]);   // ... which is then dated today: paid in advance
  }
 }
 await q('SET CONSTRAINTS ALL IMMEDIATE');
});
after(async()=>{await reader?.end();await admin?.end()});   // the fixture rows stay (prefixed R114-), as the other files' do; the role's grants are reset per test
const byId=result=>Object.fromEntries(result.items.map(item=>[item.id,item]));
test('the fixture pays today\'s charge in advance for two borrowers (the date facts the caption uses)',async()=>{
 const rows=(await q(`SELECT l."Ref Borrowers" AS b,r."Payment Date"::text AS d,p."Payment Method" AS m FROM "Repayments" r JOIN "Charges" c ON c."Row ID"=r."Ref Charges" JOIN "Loans" l ON l."Row ID"=c."Ref Loans" JOIN "Payments" p ON p."Row ID"=r."Ref Payment" WHERE c."Charge Date"=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AND l."Ref Borrowers" IN ('R114-OFF-B','R114-ORD-B','R114-NONE-B') ORDER BY 1`)).rows;
 assert.deepEqual(rows.map(r=>[r.b,r.m]),[['R114-OFF-B','Referral Rebate Offset'],['R114-ORD-B','Bank Transfer']]);
});
test('WITH the reader contract grants the rebate-offset advance shows prepaidSource, an ordinary advance does not, and the date stays',async()=>{
 await grantAll();
 const result=await board();assert.equal(result.collectionError,undefined,JSON.stringify(result));
 const rows=byId(result);const yesterday=await day(-1);
 assert.equal(rows['R114-OFF-B'].prepaidOnly,true);assert.equal(rows['R114-OFF-B'].prepaidSource,'rebate_offset');assert.equal(rows['R114-OFF-B'].prepaidPaymentDate,yesterday);
 assert.equal(rows['R114-ORD-B'].prepaidOnly,true);assert.equal(rows['R114-ORD-B'].prepaidSource,undefined);assert.equal(rows['R114-ORD-B'].prepaidPaymentDate,yesterday);
 assert.equal(rows['R114-NONE-B'].prepaidOnly,false);assert.equal(rows['R114-NONE-B'].prepaidSource,undefined);
 // The borrower's own Collection read (detail) carries it too.
 const c=await client();try{const detail=await readCollection(c,{limit:10,after:null,borrowerId:'R114-OFF-B'});assert.equal(detail.borrower.prepaidSource,'rebate_offset');}finally{c.release();}
});
test('WITHOUT the Payments and Repayments."Ref Payment" grants the read does not fail: no source, the date only',async()=>{
 await grantAll();await revokeSource();
 // The reader really cannot read the columns (the guard the statement checks first).
 const c=await client();try{await assert.rejects(()=>c.query('SELECT "Payment Method" FROM public."Payments" LIMIT 1'),error=>error.code==='42501');}finally{c.release();}
 const result=await board();assert.equal(result.collectionError,undefined,JSON.stringify(result));
 const rows=byId(result);const yesterday=await day(-1);
 assert.equal(rows['R114-OFF-B'].prepaidOnly,true);assert.equal(rows['R114-OFF-B'].prepaidSource,undefined,'no grant: no source');assert.equal(rows['R114-OFF-B'].prepaidPaymentDate,yesterday,'the date still shows');
 assert.equal(rows['R114-ORD-B'].prepaidPaymentDate,yesterday);
 const d=await client();try{const detail=await readCollection(d,{limit:10,after:null,borrowerId:'R114-OFF-B'});assert.equal(detail.collectionError,undefined);assert.equal(detail.borrower.prepaidSource,undefined);assert.equal(detail.borrower.prepaidPaymentDate,yesterday);}finally{d.release();}
});
test('each missing grant alone also falls back (Payments Row ID, Payments Payment Method, Repayments Ref Payment)',async()=>{
 for(const revoke of ['REVOKE SELECT("Row ID") ON public."Payments" FROM','REVOKE SELECT("Payment Method") ON public."Payments" FROM','REVOKE SELECT("Ref Payment") ON public."Repayments" FROM']){
  await grantAll();await q(`${revoke} ${role}`);
  const result=await board();assert.equal(result.collectionError,undefined,revoke+' '+JSON.stringify(result));assert.equal(byId(result)['R114-OFF-B'].prepaidSource,undefined,revoke);
 }
});
