import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import pg from 'pg';
import {readOfflineDatasetDelta} from '../../services/business/offline-dataset-delta.mjs';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as shared from '../../services/lib/offline-dataset-digest.mjs';

// R078 day change with a TRUE database clock shift (Chase's month-end equality proof). The postmaster runs under libfaketime
// reading its clock from the file named by MW_FAKETIME_FILE (FAKETIME_TIMESTAMP_FILE, FAKETIME_NO_CACHE=1, TZ=UTC): the test writes
// the file to move CURRENT_TIMESTAMP, CURRENT_DATE and now() for every SQL statement, so kept keys are proven not to read the
// database clock. No test pin is used. Disposable lab only (never DEV or PROD); run serially.
// Lab start: apt-get install libfaketime; echo '2026-10-31 03:00:00' > $F; then start the postmaster (initdb'd, migrated through V97) with
//   TZ=UTC LD_PRELOAD=/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1 FAKETIME_TIMESTAMP_FILE=$F FAKETIME_NO_CACHE=1 DONT_FAKE_MONOTONIC=1 pg_ctl ... start
// (the frozen clock moves when the test rewrites $F; the lab database must be new, the clock only moves forward).
// MW_V4_LAB_URL=postgres://postgres@127.0.0.1:5498/loan_manager_dev MW_FAKETIME_FILE=/path/faketime.rc node --test --test-concurrency=1 tests/integration/offline-day-change-clock-lab.test.mjs
const url=process.env.MW_V4_LAB_URL;
const lab=url?new URL(url):null;
const clockFile=process.env.MW_FAKETIME_FILE;
const disposable=!!lab&&['127.0.0.1','localhost'].includes(lab.hostname)&&lab.pathname==='/loan_manager_dev'&&!!clockFile;
const actor={issuer:'synthetic',subject:'owner',partnerId:'lab-partner'};
const {applyDatasetPatch,canonicalDatasetValue}=shared;
// The client's own day-change helpers (apps/pwa/src/offline-dataset.ts), loaded as the coordinator test does.
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/offline-dataset.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sandbox={exports:{},require:name=>name==='./dataset-patch'?shared:name==='./client-events'?{recordClientEvent:()=>{}}:name==='./request-activity'?{activitySnapshot:()=>0,subscribeActivity:()=>()=>{}}:(()=>{throw Error('Unexpected import '+name)})(),window:new EventTarget(),document:new EventTarget(),navigator:{onLine:true},URL,crypto:globalThis.crypto,TextEncoder,structuredClone,setTimeout,clearTimeout,console};
runInNewContext(source,sandbox);
const {moveBusinessDate,dayKeysCovered}=sandbox.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
const hydrate=(value,asOf,businessDate)=>Array.isArray(value)?value.map(item=>hydrate(item,asOf,businessDate)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='asOf'&&item===null?asOf:key==='businessDate'&&item===null?businessDate:hydrate(item,asOf,businessDate)])):value;
async function read(client,domain,input){
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{return await readOfflineDatasetDelta(client,actor,domain,{acceptChanged:true,dates:true,...input})}finally{await client.query('ROLLBACK')}
}
/** One response with its values fetched (need) and hydrated, as a client applies it. */
async function fetchChunk(client,domain,input){
 const manifest=await read(client,domain,{...input,need:[]});
 const refs=[...new Set(manifest.patches.flatMap(patch=>patch.refs))],values={};
 for(let offset=0;offset<refs.length;offset+=2048){const batch=await read(client,domain,{...input,need:refs.slice(offset,offset+2048)});assert.deepEqual(batch.patches,manifest.patches,'the need request replays the same manifest');Object.assign(values,batch.values)}
 return {...manifest,patches:manifest.patches.map(patch=>({...patch,value:patch.mode==='append'||patch.mode==='upsert'?patch.refs.map(ref=>hydrate(structuredClone(values[ref]),manifest.asOf,manifest.businessDate)):hydrate(structuredClone(values[patch.refs[0]]),manifest.asOf,manifest.businessDate)}))};
}
/** A complete walk: data, version, change cursor, business date. */
async function walk(client,domain){
 const data={};let cursor=null,changes=null;
 for(let step=0;step<800;step++){
  const chunk=await fetchChunk(client,domain,{cursor,sourceVersion:null});changes??=chunk.changes??null;
  for(const patch of chunk.patches)applyDatasetPatch(data,patch);
  if(chunk.complete)return {data,sourceVersion:chunk.sourceVersion,changes,businessDate:chunk.businessDate};
  cursor=chunk.nextCursor;
 }
 throw Error('Walk did not complete');
}
/** A client's next check after the date moved: a day change applied onto the stored bundle, or null (it walked). */
async function check(client,domain,state){
 const input={cursor:null,sourceVersion:state.sourceVersion,since:state.changes};
 let chunk=await fetchChunk(client,domain,input);
 if(!chunk.dayChange||chunk.schemaVersion!==4)return null;
 const {from,keep,reread}=chunk.dayChange;
 assert.equal(from,state.businessDate);assert.ok(dayKeysCovered(state.data,keep,reread),'every stored key is named');
 const data=plain(moveBusinessDate(state.data,from,chunk.businessDate,keep)),changes=chunk.changes;
 for(let step=0;;step++){
  assert.ok(step<800);
  for(const patch of chunk.patches)applyDatasetPatch(data,patch);
  if(chunk.complete)return {data,sourceVersion:chunk.sourceVersion,changes,businessDate:chunk.businessDate,keep};
  chunk=await fetchChunk(client,domain,{cursor:chunk.nextCursor,sourceVersion:state.sourceVersion});
  assert.equal(chunk.dayChange?.from,from,'every chunk of the re-read names the day change');
 }
}

const sha256=text=>createHash('sha256').update(text).digest('hex');
const same=(left,right,label)=>assert.deepEqual(plain(canonicalDatasetValue(left)),plain(canonicalDatasetValue(right)),label);
/** The reconciliation the phone runs: the server walks the domain itself and compares digests of the stored bundle. */
async function reconcile(client,domain,state){
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{return await readOfflineDatasetDelta(client,actor,domain,{reconcile:true,sourceVersion:state.sourceVersion,digests:await shared.datasetDigests(state.data,sha256)})}finally{await client.query('ROLLBACK')}
}
const domains=['records','collection','cash','management'];
const noDate=value=>Array.isArray(value)?value.map(noDate):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='businessDate').map(([key,item])=>[key,noDate(item)])):value;
/** Top-level keys whose content (ignoring the stamp date) differs between the stored bundle and a walk at the new date. */
const movedKeys=(before,after)=>[...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>JSON.stringify(plain(canonicalDatasetValue(noDate(before[key]))))!==JSON.stringify(plain(canonicalDatasetValue(noDate(after[key])))));
test('month-end day changes with the database clock really moved equal a fresh walk and reconcile to a match',{skip:!disposable&&'set MW_V4_LAB_URL (disposable 127.0.0.1 lab started under libfaketime) and MW_FAKETIME_FILE'},async()=>{
 const client=new pg.Client({connectionString:url});await client.connect();
 try{
  const q=(sql,params)=>client.query(sql,params);
  const clock=async(utc,expectedBangkokDay)=>{writeFileSync(clockFile,utc+'\n');const day=(await q(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day,current_date::text AS "serverDate"`)).rows[0];assert.equal(day.day,expectedBangkokDay,'the database clock moved to '+expectedBangkokDay)};
  await clock('2026-10-31 03:00:00','2026-10-31');
  if(!(await q(`SELECT 1 FROM public."Cash Accounts" WHERE "Row ID"='CI-DAD'`)).rowCount)await q(readFileSync(new URL('../../scripts/database/Test-CashAccountFixtures.sql',import.meta.url),'utf8').replace(/^\\.*$/gm,''));
  if(!(await q('SELECT 1 FROM public."Statistics"')).rowCount)await q(`INSERT INTO "Statistics"("Row ID","Statistics ID") VALUES ('lab-statistics','lab')`);
  if(!(await q(`SELECT 1 FROM public."Partners" WHERE "Row ID"='lab-partner'`)).rowCount)await q(`INSERT INTO "Partners"("Row ID","Partner Role","Partner Name") VALUES ('lab-partner','B','Lab partner')`);
  const seed=randomUUID().slice(0,8);
  await q(`INSERT INTO "Partners"("Row ID","Partner Role") VALUES ($1,'A')`,['CK-P-'+seed]);
  await q(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES ($1,$2,current_date,'Contribution',100000::money)`,['CK-C-'+seed,'CK-P-'+seed]);
  const world={};
  async function build(tag){
   const A=`CK-A-${tag}-${seed}`,B=`CK-B-${tag}-${seed}`,LA=`CK-LA-${tag}-${seed}`,LB=`CK-LB-${tag}-${seed}`;
   for(const [borrower,name] of [[A,'Alpha'],[B,'Bravo']])await q(`INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ($1,$2)`,[borrower,`${name} ${tag}`]);
   for(const [loan,borrower] of [[LA,A],[LB,B]]){
    await q(`INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES ('CI-LISA',$1,$2,current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false)`,[loan,borrower]);
    // Overdue, due today (tomorrow it is overdue) and future charges (tomorrow one is due): the date-dependent shapes.
    for(const day of [3,2,1,0,-1,-2,-9])await q(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES ($1,$2,current_date-$3::int,30::money,5::money)`,[`CK-CH-${tag}-${loan}-${day}`,loan,day]);
   }
   await q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,20::money,current_date,'Lump Sum')`,[`CK-PAY0-${tag}-${seed}`,A]);
   // A daily-interest loan with automatic charges: the overnight charge job writes a charge dated the new day.
   await q(`INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Fixed Interest","Daily Payment Amount","Interest Payment Interval","Due Date","Interest Schedule Anchor Date") VALUES ('CI-LISA',$1,$2,current_date-6,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',true,10::money,0::money,0::money,1,NULL,current_date-1)`,[`CK-LD-${tag}-${seed}`,B]);
   // Month-bound money: an expense, a contribution and a withdrawal dated on the last day, so any month-to-date figure shows.
   await q(`INSERT INTO "Business Expenses"("Row ID","Expense Date","Amount","Ref Related Loan","Ref Related Borrower","Ref Paid By Cash Account","Expense Category") VALUES ($1,current_date,12::money,$2,$3,'CI-LISA','Other')`,[`CK-EX-${tag}-${seed}`,LA,A]);
   await q(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES ($1,$2,current_date,'Withdrawal',3::money)`,[`CK-W-${tag}-${seed}`,'CK-P-'+seed]);
   await q(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES ($1,$2,current_date,'Contribution',700::money)`,[`CK-CC-${tag}-${seed}`,'CK-P-'+seed]);
   return {A,B,LA,LB};
  }
  const report=[];
  /** Walk every domain at the current (fake) date. */
  const walkAll=async()=>{const states={};for(const domain of domains)states[domain]=await walk(client,domain);return states};
  /** Move to the next day, let `overnight` write, then check every day domain against a fresh walk and a reconciliation. */
  async function crossDay(label,before,overnight){
   await overnight();
   for(const domain of domains){
    const day=domain==='collection'?null:await check(client,domain,before[domain]);
    const fresh=await walk(client,domain);
    if(day){
     assert.equal(day.businessDate,fresh.businessDate);same(day.data,fresh.data,`${label}: ${domain} day change equals a walk`);
     // The discriminating check: a key that the database clock (or any overnight write) changed must not have been kept.
     const moved=movedKeys(before[domain].data,fresh.data),wronglyKept=moved.filter(key=>day.keep.includes(key)&&JSON.stringify(plain(canonicalDatasetValue(day.data[key])))!==JSON.stringify(plain(canonicalDatasetValue(fresh.data[key]))));
     assert.deepEqual(wronglyKept,[],`${label}: ${domain} kept keys did not move`);
     report.push(`${label}: ${domain} keys that changed across the day and were re-read: ${moved.join(',')||'none'}`);
    }
    const state=day??fresh,answer=await reconcile(client,domain,state);
    assert.equal(answer.result,'match',`${label}: ${domain} reconciles to a match (${JSON.stringify(answer.keys)})`);
    report.push(`${label}: ${domain} ${day?'day change (keep '+day.keep.length+' keys)':'walk'} equal, reconcile match`);
   }
  }
  // 1. Nothing happens overnight: 31 October -> 1 November.
  await clock('2026-10-31 03:00:00','2026-10-31');world.one=await build('one');let before=await walkAll();
  await crossDay('31 Oct -> 1 Nov, nothing overnight',before,()=>clock('2026-11-01 03:00:00','2026-11-01'));
  // 2. An overnight payment on the first morning: 30 November -> 1 December.
  await clock('2026-11-30 03:00:00','2026-11-30');world.two=await build('two');before=await walkAll();
  await crossDay('30 Nov -> 1 Dec, payment after midnight',before,async()=>{await clock('2026-12-01 03:00:00','2026-12-01');await q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,25::money,current_date,'Lump Sum')`,['CK-PAY1-'+seed,world.two.B])});
  // 3. A payment late on the last evening, the client has not seen it: 31 December -> 1 January (year end).
  await clock('2026-12-31 03:00:00','2026-12-31');world.three=await build('three');before=await walkAll();
  await crossDay('31 Dec -> 1 Jan, payment late evening',before,async()=>{await clock('2026-12-31 16:30:00','2026-12-31');await q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,25::money,current_date,'Lump Sum')`,['CK-PAY2-'+seed,world.three.A]);await clock('2027-01-01 03:00:00','2027-01-01')});
  // 4. The overnight jobs: the daily analytics refresh and charge generation, 28 February -> 1 March (not a leap year).
  await clock('2027-02-28 03:00:00','2027-02-28');world.four=await build('four');before=await walkAll();
  await crossDay('28 Feb -> 1 Mar, overnight jobs',before,async()=>{await clock('2027-03-01 03:00:00','2027-03-01');report.push('daily jobs: charges '+(await q('SELECT generate_due_charges(current_date) n')).rows[0].n+', analytics '+(await q('SELECT refresh_daily_analytics(current_date-1,current_date) n')).rows[0].n)});
  console.log(report.join('\n'));
 }finally{writeFileSync(clockFile,'2026-10-31 03:00:00\n');await client.end()}
});
