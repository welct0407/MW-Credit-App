import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createBorrowerReadStore} from '../../services/api/borrower-read-store.mjs';
import {encodeCollectionCursor} from '../../services/api/collection-read-contract.mjs';
if(process.env.COLLECTION_TEST_DISPOSABLE!=='1'||!/^\d+$/.test(process.env.COLLECTION_TEST_PORT||''))throw Error('Run only with the disposable Collection fixture runner');
const connection={host:'127.0.0.1',port:Number(process.env.COLLECTION_TEST_PORT),database:'collection_fixture'};
const admin=new pg.Pool({...connection,user:'postgres'});const reader=new pg.Pool({...connection,user:'synthetic_reader'});
const owner='synthetic-owner@example.test';let instant='2026-10-07T05:00:00Z';const queries=[];
const pool={connect:async()=>{const c=await reader.connect();return{release:()=>c.release(),query:(sql,params)=>{queries.push(sql);if(sql.startsWith('SELECT CURRENT_TIMESTAMP AS'))return c.query(`SELECT $1::timestamptz AS "asOf",($1::timestamptz AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`,[instant]);return c.query(sql,params)}}}};
const store=createBorrowerReadStore({pool,config:{ownerEmail:owner,database:'collection_fixture',dbUser:'synthetic_reader'}});
const q=(sql,p)=>admin.query(sql,p);const pending='รอชำระ',partial='ชำระบางส่วน',paid='ชำระแล้ว';
before(async()=>{await q(`CREATE ROLE synthetic_reader LOGIN; CREATE TABLE "Partners"("Row ID" text PRIMARY KEY,"Login Email" text); CREATE TABLE "Borrowers"("Row ID" text PRIMARY KEY,"Borrower Name" text,"Description" text,"Hidden Flag" boolean,"Creation Date" date,"Has Active Loan" boolean,"Total Interest Earned" numeric,"Total Outstanding Principal" numeric,"Borrower Note" text); CREATE TABLE "Loans"("Row ID" text PRIMARY KEY,"Ref Borrowers" text,"Principal Amount" money,"Loan Date" date,"Original Daily Interest Rate" integer); CREATE TABLE "Charges"("Row ID" text PRIMARY KEY,"Ref Loans" text,"Charge Date" date,"Payment Status" text,"Payment Date" date,"Amount Remaining" numeric,"Total Paid" numeric); CREATE TABLE "Repayments"("Ref Charges" text,"Payment Date" date,"Principal Paid" money,"Interest Paid" money); GRANT SELECT ON ALL TABLES IN SCHEMA public TO synthetic_reader;`);await setupProviders()});
after(async()=>{await reader.end();await admin.end()});
beforeEach(async()=>{instant='2026-10-07T05:00:00Z';queries.length=0;await q('TRUNCATE "Repayments","Charges","Loans","Borrowers","Partners"');await q('INSERT INTO "Partners" VALUES ($1,$2)',['partner',owner])});
async function borrower(id,hidden=false){await q('INSERT INTO "Borrowers" VALUES ($1,$2,$3,$4,$5,true,0,1000,NULL)',[id,'ชื่อ '+id,'Synthetic '+id,hidden,'2026-01-01']);await q('INSERT INTO "Loans" VALUES ($1,$2,12000,$3,2)',['loan-'+id,id,'2026-10-01'])}
async function charge(id,b,status=pending,date='2026-10-07',remaining='100.25',paymentDate=null,total='0'){await q('INSERT INTO "Charges" VALUES ($1,$2,$3,$4,$5,$6,$7)',[id,'loan-'+b,date,status,paymentDate,remaining,total])}
async function repayment(id,principal,interest,date='2026-10-07'){await q('INSERT INTO "Repayments" VALUES ($1,$2,$3,$4)',[id,date,principal,interest])}
const board=()=>store.listCollection(owner,{limit:100});const detail=b=>store.getCollectionCharges(owner,b,{limit:100});
test('eligibility covers three arms, future receipts, hidden and fully paid zero without directory leak',async()=>{for(const id of ['due','paid','future','hidden','excluded'])await borrower(id,id==='hidden');await charge('c-due','due');await charge('c-paid','paid',paid,'2026-10-06','0','2026-10-07');await charge('c-future','future',pending,'2026-10-09','500');await repayment('c-future','12.34','1.66');await charge('c-hidden','hidden');await charge('c-excluded','excluded',paid,'2026-10-01','0',null);const result=await board();assert.equal(result.ok,true);assert.deepEqual(result.items.map(x=>x.id),['due','future','hidden','paid']);assert.deepEqual(result.items.find(x=>x.id==='future'),{id:'future',displayName:'ชื่อ future - Synthetic future',status:'not_paid',amountDue:'14.00',amountCollected:'14.00',amountRemaining:'0'});assert.equal(result.items.at(-1).status,'fully_paid');assert.equal(result.items.at(-1).amountDue,'0');assert.equal((await detail('excluded')).status,404);assert.equal((await store.getBorrower(owner,'hidden')).status,404);assert.equal((await detail('hidden')).items.length,1)});
test('status precedence and global display order differ',async()=>{for(const b of ['pending','partial','mixed','overdue','paid'])await borrower(b);await charge('p','pending');await charge('s','partial',partial);await charge('m1','mixed');await charge('m2','mixed',paid,'2026-10-07','0','2026-10-07');await charge('o1','overdue',pending,'2026-10-06');await charge('o2','overdue',paid,'2026-10-07','0','2026-10-07');await charge('f','paid',paid,'2026-10-07','0','2026-10-07');const result=await board();assert.deepEqual(result.items.map(x=>[x.id,x.status]),[['pending','not_paid'],['mixed','partially_paid'],['partial','partially_paid'],['overdue','overdue'],['paid','fully_paid']])});
test('multiple repayments aggregate once per charge and preserve signed exact decimals',async()=>{await borrower('a');await charge('c1','a',partial,'2026-10-07','10.125');await charge('c2','a',partial,'2026-10-07','-2.125');await repayment('c1','10.10','0.20');await repayment('c1','2.00','0.30');await repayment('c2','-1.00','-0.25');await repayment('c2','999','999','2026-10-06');await repayment('c2','999','999',null);const r=(await board()).items[0];assert.equal(r.amountCollected,'11.35');assert.equal(r.amountRemaining,'8.000');assert.equal(r.amountDue,'19.350');const children=await detail('a');assert.equal(children.ok,true);assert.deepEqual(children.items.map(x=>[x.id,x.receivedToday]),[['c1','12.60'],['c2','-1.25']]);assert.equal(children.items[0].loanDisplayKey,'ชื่อ a - Synthetic a-฿12,000-01/10-2%')});
test('relevant null inputs propagate while empty sums and irrelevant nulls do not',async()=>{await borrower('a');await charge('c','a',pending,'2026-10-07',null,null,null);await repayment('c',null,'2');let r=(await board()).items[0];assert.equal(r.amountDue,null);assert.equal(r.amountCollected,null);assert.equal(r.amountRemaining,null);assert.equal((await detail('a')).items[0].totalPaid,null);await q('DELETE FROM "Repayments"');await q('UPDATE "Charges" SET "Charge Date"=$1',['2026-10-09']);await repayment('c','1','2');r=(await board()).items[0];assert.equal(r.amountRemaining,'0');assert.equal(r.amountDue,'3.00')});
test('candidate quality fails before eligibility; paid null date valid; orphan and other scope excluded',async()=>{await borrower('a');await borrower('b');await charge('a-good','a');await charge('bad','b','unknown','2026-10-20');assert.equal((await board()).code,'source_unavailable');assert.equal((await detail('a')).ok,true);assert.equal((await detail('b')).code,'source_unavailable');await q('UPDATE "Charges" SET "Payment Status"=$1 WHERE "Row ID"=$2',[paid,'bad']);assert.equal((await board()).ok,true);await q('UPDATE "Charges" SET "Charge Date"=NULL WHERE "Row ID"=$1',['bad']);assert.equal((await board()).code,'source_unavailable');await q('DELETE FROM "Charges" WHERE "Row ID"=$1',['bad']);await q('INSERT INTO "Charges" VALUES ($1,$2,NULL,NULL,NULL,NULL,NULL)',['orphan','missing-loan']);assert.equal((await board()).items.length,1)});
test('board and charge keyset traverse more than25 ties without missing/duplicate records',async()=>{for(let i=0;i<28;i++){const id='b'+String(i).padStart(2,'0');await borrower(id);await charge('c'+id,id,i<13?pending:i<26?partial:paid,'2026-10-07','0',i>=26?'2026-10-07':null)}let cursor=null,ids=[];do{const r=await store.listCollection(owner,{cursor});assert.equal(r.ok,true);ids.push(...r.items.map(x=>x.id));cursor=r.nextCursor}while(cursor);assert.equal(ids.length,28);assert.equal(new Set(ids).size,28);await borrower('many');for(let i=0;i<28;i++)await charge('m'+String(i).padStart(2,'0'),'many',pending,i<14?'2026-10-07':'2026-10-06');cursor=null;ids=[];do{const r=await store.getCollectionCharges(owner,'many',{cursor});assert.equal(r.ok,true);ids.push(...r.items.map(x=>x.id));cursor=r.nextCursor}while(cursor);assert.deepEqual(ids,Array.from({length:28},(_,i)=>'m'+String(i).padStart(2,'0')))});
test('Bangkok midnight invalidates old cursor and no query-selected date is accepted',async()=>{await borrower('a');await charge('c','a');instant='2026-10-07T16:59:59Z';assert.equal((await board()).businessDate,'2026-10-07');const cursor=encodeCollectionCursor({kind:'collection',businessDate:'2026-10-07',rank:0,id:'a'});instant='2026-10-07T17:00:00Z';const r=await store.listCollection(owner,{cursor});assert.deepEqual(r,{ok:false,status:409,code:'business_date_changed'});assert.equal((await board()).businessDate,'2026-10-08')});
test('owner mapping identity and repeatable read remain default deny with no writes',async()=>{await borrower('a');await charge('c','a');assert.equal((await store.listCollection('wrong@example.test')).status,403);assert.equal(queries.length,0);await q('INSERT INTO "Partners" VALUES ($1,$2)',['duplicate',owner]);assert.equal((await board()).status,403);assert.equal(queries.some(s=>s.includes('WITH today_repayments')),false);await q('DELETE FROM "Partners" WHERE "Row ID"=$1',['duplicate']);await board();assert.ok(queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert.equal(queries.some(s=>/^\s*(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i.test(s)),false);const c=await reader.connect();try{await assert.rejects(c.query('UPDATE "Charges" SET "Total Paid"=0'),/permission denied/)}finally{c.release()}});

test('nonfinite and out-of-public-range charge dates fail the source guard',async()=>{await borrower('a');for(const date of ['infinity','-infinity','10000-01-01']){await q('DELETE FROM "Charges"');await charge('bad','a',pending,date);assert.equal((await board()).code,'source_unavailable');assert.equal((await detail('a')).code,'source_unavailable')}});

// Real immutable forecast engine and maintained provider views; synthetic JSON inputs only.
import {readFileSync} from 'node:fs';
const migration = name => readFileSync(new URL('../../database/migrations/'+name,import.meta.url),'utf8').replaceAll('\r\n','\n');
const statement = (source,start,end=';\n') => {const from=source.indexOf(start);assert.ok(from>=0);const to=source.indexOf(end,from);assert.ok(to>=from);return source.slice(from,to+end.length)};
async function setupProviders(){
 await q(`CREATE TABLE reporting_forecast_inputs_v1(loan_id text,borrower_id text,loan jsonb,charges jsonb,reporting_date date); CREATE FUNCTION olap_reporting_date() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '2026-10-07'::date $$`);
 await q(statement(migration('V45__automatic_daily_interest_after_principal_payment.sql'),'CREATE FUNCTION public.daily_interest_basis(','END $$;'));
 await q(statement(migration('V53__original_daily_interest_rate.sql'),'CREATE OR REPLACE FUNCTION public.forecast_schedule_v1(','END $$;'));
 const providers=migration('V54__oltp_upcoming_charges.sql');
 for(const name of ['events','coverage'])await q(statement(providers,'CREATE VIEW public.oltp_upcoming_charge_'+name+'_v1 AS'));
 await q(statement(migration('V56__oltp_upcoming_summary_drilldown.sql'),'CREATE VIEW public.oltp_upcoming_charge_summary_v2 AS'));
 await q('GRANT SELECT ON ALL TABLES IN SCHEMA public TO synthetic_reader');
}
beforeEach(async()=>{await q('TRUNCATE reporting_forecast_inputs_v1')});
const loanJson={status:'ยังไม่ปิดยอด',defaulted:false,start:'2026-10-01',close:null,balance:1000,daily:10,auto:true,interval:1,anchor:'2026-10-01',type:'ดอกเบี้ยรายวัน',due:null,original_rate:1,original:1000,payment:0,fixed:0,invalid:false};
async function forecast(id,b,changes={},charges=[{id:'today',date:'2026-10-07',pdue:0,idue:10,ppaid:0,ipaid:0,invalid:false}]){
 await q('INSERT INTO "Loans" VALUES ($1,$2,1000,$3,1) ON CONFLICT DO NOTHING',[id,b,'2026-10-01']);
 await q('INSERT INTO reporting_forecast_inputs_v1 VALUES ($1,$2,$3,$4,$5)',[id,b,JSON.stringify({...loanJson,...changes}),JSON.stringify(charges),'2026-10-07']);
}
const upcoming=(b,extra={})=>store.getCollectionUpcoming(owner,b,{businessDate:'2026-10-07',...extra});
test('actual forecast providers preserve first five distinct dates and all 27 fifth-date loans across pages',async()=>{
 await borrower('a',true);await charge('today','a');
 for(let i=0;i<27;i++)await forecast('future-'+String(i).padStart(2,'0'),'a');
 const r=await upcoming('a');assert.equal(r.ok,true);assert.equal(r.reviewRequired,false);assert.equal(r.horizonEnd,'2027-01-07');
 assert.deepEqual(r.items.map(x=>x.dueDate),['2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12']);
 assert.ok(r.items.every(x=>Number(x.totalCharge)===270));
 const first=await upcoming('a',{dueDate:'2026-10-12'});assert.equal(first.items.length,25);assert.equal(Number(first.totalCharge),270);assert.ok(first.nextCursor);assert.ok(first.items.every(x=>x.basis==='Projected'));
 const second=await upcoming('a',{dueDate:'2026-10-12',cursor:first.nextCursor});assert.equal(second.items.length,2);assert.equal(second.nextCursor,null);assert.equal(Number(second.totalCharge),270);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,27);
 assert.equal((await upcoming('a',{dueDate:'2026-10-13'})).status,404);
 assert.equal((await upcoming('other',{dueDate:'2026-10-12',cursor:first.nextCursor})).status,400);
});
test('actual provider recorded settlement/review bases, exact decimals, genuine empty and excluded parent',async()=>{
 await borrower('a');await charge('today','a');
 await forecast('manual','a',{auto:false},[{id:'future',date:'2026-10-09',pdue:100,idue:2.125,ppaid:0,ipaid:0,invalid:false}]);
 let r=await upcoming('a');assert.equal(r.reviewRequired,false);assert.equal(r.items[0].totalCharge,'102.125');assert.equal((await upcoming('a',{dueDate:'2026-10-09'})).items[0].basis,'Recorded settlement');
 await q(`UPDATE reporting_forecast_inputs_v1 SET loan=loan||'{"status":"ปิดยอดแล้ว"}'::jsonb`);
 r=await upcoming('a');assert.equal(r.reviewRequired,true);assert.equal((await upcoming('a',{dueDate:'2026-10-09'})).items[0].basis,'Recorded - review status');
 await q('TRUNCATE reporting_forecast_inputs_v1');r=await upcoming('a');assert.equal(r.ok,true);assert.deepEqual(r.items,[]);assert.equal(r.reviewRequired,false);
 await borrower('not-member');assert.equal((await upcoming('not-member')).status,404);
});
test('Upcoming midnight and owner checks remain separate from provider data',async()=>{
 await borrower('a');await charge('today','a');await forecast('future','a');
 queries.length=0;assert.equal((await store.getCollectionUpcoming('wrong@example.test','a',{businessDate:'2026-10-07'})).status,403);assert.equal(queries.length,0);
 instant='2026-10-07T17:00:00Z';assert.equal((await upcoming('a')).status,409);
});
