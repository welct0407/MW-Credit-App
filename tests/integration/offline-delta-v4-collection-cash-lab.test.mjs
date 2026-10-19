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

// R078 row-level v4 delta for collection and cash (follow-up batch): each delta-applied bundle must equal a fresh walk byte for byte
// (canonical, asOf ignored) and reconcile to a match. Row-change scenarios run on any disposable lab migrated through V97; the
// day-change scenario also needs the libfaketime lab described in offline-day-change-clock-lab.test.mjs (MW_FAKETIME_FILE).
// Disposable lab only (never DEV or PROD); run serially.
// MW_V4_LAB_URL=postgres://postgres@127.0.0.1:5498/loan_manager_dev [MW_FAKETIME_FILE=/path/faketime.rc] node --test --test-concurrency=1 tests/integration/offline-delta-v4-collection-cash-lab.test.mjs
const url=process.env.MW_V4_LAB_URL;
const lab=url?new URL(url):null;
const clockFile=process.env.MW_FAKETIME_FILE;
const labOk=!!lab&&['127.0.0.1','localhost'].includes(lab.hostname)&&lab.pathname==='/loan_manager_dev';
const disposable=labOk,clocked=labOk&&!!clockFile;
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

const sha256=text=>createHash('sha256').update(text).digest('hex');
const same=(left,right,label)=>assert.deepEqual(plain(canonicalDatasetValue(left)),plain(canonicalDatasetValue(right)),label);
/** The reconciliation the phone runs: the server walks the domain itself and compares digests of the stored bundle. */
async function reconcile(client,domain,state,isolation='REPEATABLE READ'){
 await client.query(`BEGIN ISOLATION LEVEL ${isolation} READ ONLY`);
 try{return await readOfflineDatasetDelta(client,actor,domain,{reconcile:true,sourceVersion:state.sourceVersion,digests:await shared.datasetDigests(state.data,sha256)})}finally{await client.query('ROLLBACK')}
}
/** What a client does with the server's answer to its stored bundle: unchanged, a day change (kept keys moved, re-read applied),
 * a row-level delta, or a walk (also when the delta moved rows between owners). */
async function refresh(client,domain,state){
 const input={cursor:null,sourceVersion:state.sourceVersion,since:state.changes};
 let chunk=await fetchChunk(client,domain,input);
 if(chunk.unchanged)return {kind:'unchanged',state};
 if(chunk.schemaVersion===4&&chunk.dayChange){
  const {from,keep,reread}=chunk.dayChange;
  if(from!==state.businessDate||!dayKeysCovered(state.data,keep,reread))return {kind:'walk',state:await walk(client,domain)};
  const data=plain(moveBusinessDate(state.data,from,chunk.businessDate,keep)),changes=chunk.changes;
  for(let step=0;step<800;step++){
   for(const patch of chunk.patches)applyDatasetPatch(data,patch);
   if(chunk.complete)return {kind:'day change',keep,state:{data,sourceVersion:chunk.sourceVersion,changes,businessDate:chunk.businessDate}};
   chunk=await fetchChunk(client,domain,{cursor:chunk.nextCursor,sourceVersion:state.sourceVersion});
  }
  throw Error('Day change did not complete');
 }
 if(chunk.schemaVersion===4&&chunk.delta){
  if(shared.deltaMovesRows(state.data,chunk.patches))return {kind:'walk (rows moved)',state:await walk(client,domain)};
  const data=plain(state.data);for(const patch of chunk.patches)applyDatasetPatch(data,patch);
  return {kind:'delta',keys:[...new Set(chunk.patches.map(patch=>patch.key+(patch.mode==='replaceWhere'?'/where':'')))],state:{data,sourceVersion:chunk.sourceVersion,changes:chunk.changes??state.changes,businessDate:chunk.businessDate}};
 }
 return {kind:'walk',state:await walk(client,domain)};
}
const labFixtures=async q=>{
 if(!(await q(`SELECT 1 FROM public."Cash Accounts" WHERE "Row ID"='CI-DAD'`)).rowCount)await q(readFileSync(new URL('../../scripts/database/Test-CashAccountFixtures.sql',import.meta.url),'utf8').replace(/^\\.*$/gm,''));
 if(!(await q('SELECT 1 FROM public."Statistics"')).rowCount)await q(`INSERT INTO "Statistics"("Row ID","Statistics ID") VALUES ('lab-statistics','lab')`);
 if(!(await q(`SELECT 1 FROM public."Partners" WHERE "Row ID"='lab-partner'`)).rowCount)await q(`INSERT INTO "Partners"("Row ID","Partner Role","Partner Name") VALUES ('lab-partner','B','Lab partner')`);
};
/** Borrowers with overdue, due-today and future charges, a posted payment and dated cash movements. */
async function build(q,tag){
 const seed=randomUUID().slice(0,8),A=`CC-A-${tag}-${seed}`,B=`CC-B-${tag}-${seed}`,LA=`CC-LA-${tag}-${seed}`,LB=`CC-LB-${tag}-${seed}`,P=`CC-P-${tag}-${seed}`;
 await q(`INSERT INTO "Partners"("Row ID","Partner Role") VALUES ($1,'A')`,[P]);
 await q(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES ($1,$2,current_date-9,'Contribution',100000::money)`,[`CC-C-${tag}-${seed}`,P]);
 for(const [borrower,name] of [[A,'Alpha'],[B,'Bravo']])await q(`INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ($1,$2)`,[borrower,`${name} ${tag} ${seed}`]);
 for(const [loan,borrower] of [[LA,A],[LB,B]]){
  await q(`INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES ('CI-LISA',$1,$2,current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false)`,[loan,borrower]);
  for(const day of [3,2,1,0,-2])await q(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES ($1,$2,current_date-$3::int,30::money,5::money)`,[`CC-CH-${tag}-${loan}-${day}`,loan,day]);
 }
 // Ledger activity on several recent days so running balances exist for later days.
 await q(`INSERT INTO "Business Expenses"("Row ID","Expense Date","Amount","Ref Paid By Cash Account","Expense Category") VALUES ($1,current_date-3,10::money,'CI-LISA','Other')`,[`CC-EX1-${tag}-${seed}`]);
 await q(`INSERT INTO "Business Expenses"("Row ID","Expense Date","Amount","Ref Paid By Cash Account","Expense Category") VALUES ($1,current_date-1,4::money,'CI-LISA','Other')`,[`CC-EX2-${tag}-${seed}`]);
 await q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,20::money,current_date,'Lump Sum')`,[`CC-PAY0-${tag}-${seed}`,A]);
 return {seed,A,B,LA,LB,P,pay0:`CC-PAY0-${tag}-${seed}`};
}
const domains=['collection','cash'];
test('collection and cash row-level deltas equal a fresh walk and reconcile to a match, whatever the change',{skip:!disposable&&'set MW_V4_LAB_URL to a disposable 127.0.0.1 loan_manager_dev'},async()=>{
 const client=new pg.Client({connectionString:url});await client.connect();
 try{
  const q=(sql,params)=>client.query(sql,params);await labFixtures(q);
  const w=await build(q,'rows'),{seed,A,B,LA,LB,P}=w;
  const states={collection:await walk(client,'collection'),cash:await walk(client,'cash')};
  const replica=async sql=>{await q('BEGIN');await q('SET LOCAL session_replication_role=replica');try{await sql();await q('COMMIT')}catch(error){await q('ROLLBACK');throw error}};
  // expect: per domain, the kind of answer the design requires ('delta', 'walk', 'unchanged') or null when any correct answer will do.
  const scenarios=[
   ['own payment with a receipt',async()=>{await q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,35::money,current_date,'Lump Sum')`,['CC-PAY1-'+seed,B]);await q(`UPDATE "Payments" SET "Uploaded Receipt"='manual-receipts/x/y.png',"Uploaded Receipt At"=now() WHERE "Row ID"=$1`,['CC-PAY1-'+seed])},{collection:'delta',cash:'delta'}],
   // A backdated movement changes the running balance of every later day with ledger activity.
   ['backdated expense, later days\' running balances move',async()=>q(`INSERT INTO "Business Expenses"("Row ID","Expense Date","Amount","Ref Paid By Cash Account","Expense Category") VALUES ($1,current_date-5,7::money,'CI-LISA','Other')`,['CC-EXB-'+seed]),{collection:'unchanged',cash:'delta'}],
   ['backdated payment on a past day',async()=>replica(async()=>q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Posted',$2,9::money,current_date-4,'Lump Sum')`,['CC-PAYB-'+seed,A])),{collection:'delta',cash:'delta'}],
   // A correction: the payment's date and amount change in place (the service refuses a direct edit; a repair under replica mode is still logged).
   ['payment correction (date and amount)',async()=>replica(async()=>q(`UPDATE "Payments" SET "Payment Date"=current_date-1,"Amount Received"=40::money,"Posted Amount"=40 WHERE "Row ID"=$1`,['CC-PAY1-'+seed])),{collection:'delta',cash:'delta'}],
   ['charge edited',async()=>q(`UPDATE "Charges" SET "Interest Due"=9::money WHERE "Row ID"=$1`,[`CC-CH-rows-${LB}-1`]),{collection:'delta',cash:null}],
   ['two borrowers paid in one delta',async()=>{for(const [pay,borrower] of [['CC-PAY3-'+seed,A],['CC-PAY4-'+seed,B]])await q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,6::money,current_date,'Lump Sum')`,[pay,borrower])},{collection:'delta',cash:'delta'}],
   ['payment clearing every due charge of a borrower (their collection items go)',async()=>{const due=(await q(`SELECT sum("Amount Remaining")::numeric::text AS total FROM public."Charges" WHERE "Ref Loans"=$1 AND "Charge Date"<=current_date`,[LA])).rows[0].total;await q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,$3::numeric::money,current_date,'Lump Sum')`,['CC-PAY2-'+seed,A,due])},{collection:'delta',cash:'delta'}],
   ['new borrower with a loan and a due charge',async()=>{const n='CC-N-'+seed;await q(`INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ($1,'New '||$2)`,[n,seed]);await q(`INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES ('CI-LISA',$1,$2,current_date-3,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false)`,['CC-NL-'+seed,n]);await q(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES ($1,$2,current_date,30::money,5::money)`,['CC-NCH-'+seed,'CC-NL-'+seed])},{collection:null,cash:null}],
   ['contribution (cash overview only)',async()=>q(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES ($1,$2,current_date,'Contribution',500::money)`,['CC-C2-'+seed,P]),{collection:'unchanged',cash:null}],
   ['payment moved to another borrower (repair)',async()=>replica(async()=>q(`UPDATE "Payments" SET "Ref Borrower"=$2 WHERE "Row ID"=$1`,['CC-PAY3-'+seed,B])),{collection:null,cash:null}],
   // These change names or labels embedded in many rows: the delta cannot name them, so the domains must walk.
   ['borrower rename (must walk)',async()=>q(`UPDATE "Borrowers" SET "Borrower Name"='Alpha renamed '||$2 WHERE "Row ID"=$1`,[A,seed]),{collection:'walk',cash:'walk'}],
   ['cash account label change (must walk)',async()=>q(`UPDATE "Cash Accounts" SET "Account Label"='Renamed '||$2 WHERE "Row ID"=$1`,['CI-DAD',seed]),{collection:'walk',cash:'walk'}],
   ['borrower hidden (must walk)',async()=>q(`UPDATE "Borrowers" SET "Hidden Flag"=true WHERE "Row ID"=$1`,[B]),{collection:'walk',cash:'walk'}],
   ['borrower shown again (must walk)',async()=>q(`UPDATE "Borrowers" SET "Hidden Flag"=false WHERE "Row ID"=$1`,[B]),{collection:'walk',cash:'walk'}],
   ['TRUNCATE Cash Statement Context (marker, cash walks)',async()=>q('TRUNCATE "Cash Statement Context"'),{collection:'unchanged',cash:'walk'}],
   ['payment deleted (a missing row walks)',async()=>replica(async()=>q('DELETE FROM "Payments" WHERE "Row ID"=$1',['CC-PAY4-'+seed])),{collection:null,cash:null}],
  ];
  const report=[],failures=[];
  for(const [label,change,expected] of scenarios){
   try{await change()}catch(error){report.push(`${label}: change refused (${error.message.slice(0,70)})`);continue}
   for(const domain of domains){
    const result=await refresh(client,domain,states[domain]),fresh=await walk(client,domain),problems=[];
    try{same(result.state.data,fresh.data,`${label}: ${domain} equals a walk`)}catch{problems.push('NOT EQUAL')}
    const answer=await reconcile(client,domain,result.state);if(answer.result!=='match')problems.push('reconcile '+answer.result+' '+JSON.stringify(answer.keys));
    const want=expected[domain];if(want&&!(result.kind===want||want==='walk'&&result.kind.startsWith('walk')))problems.push(`kind ${result.kind}, wanted ${want}`);
    report.push(`${label}: ${domain} ${result.kind}${result.keys?' ['+result.keys.join(',')+']':''} ${problems.length?'PROBLEM '+problems.join('; '):'ok'}`);
    if(problems.length)failures.push(`${label} / ${domain}: ${problems.join('; ')}`);
    states[domain]=problems.length?fresh:result.state;
   }
  }
  console.log(report.join('\n'));
  assert.deepEqual(failures,[],'\n'+report.join('\n'));
 }finally{await client.end()}
});
test('a write between the two version reads of a reconciliation gives changed, for collection and cash',{skip:!disposable&&'set MW_V4_LAB_URL to a disposable 127.0.0.1 loan_manager_dev'},async()=>{
 const client=new pg.Client({connectionString:url}),writer=new pg.Client({connectionString:url});await Promise.all([client.connect(),writer.connect()]);
 try{
  const q=(sql,params)=>client.query(sql,params);await labFixtures(q);const w=await build(q,'race');
  for(const domain of domains){
   const state=await walk(client,domain),digests=await shared.datasetDigests(state.data,sha256);let wrote=false;
   // The service reads both versions inside one REPEATABLE READ snapshot; under READ COMMITTED the second read can see a write that landed meanwhile.
   const racing={query:async(sql,params)=>{if(!wrote&&!sql.includes('AS fingerprint')&&!sql.startsWith('SELECT to_char')&&!/^(BEGIN|ROLLBACK)/.test(sql)&&!/pwa_row_changes|to_regclass/.test(sql)){wrote=true;await writer.query(`UPDATE "Charges" SET "Interest Due"="Interest Due"+1::money WHERE "Row ID"=$1`,[`CC-CH-race-${w.LA}-1`]);await writer.query(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,3::money,current_date,'Lump Sum')`,['CC-RACE-'+domain+'-'+w.seed,w.A])}return client.query(sql,params)}};
   await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
   let answer;try{answer=await readOfflineDatasetDelta(racing,actor,domain,{reconcile:true,sourceVersion:state.sourceVersion,digests})}finally{await client.query('ROLLBACK')}
   assert.equal(answer.result,'changed',domain+' reports changed when a write lands between the version reads');
  }
 }finally{await Promise.all([client.end(),writer.end()])}
});
test('a day change combined with a row change equals a walk and reconciles to a match for collection and cash (never a same-day row delta)',{skip:!clocked&&'needs the libfaketime lab: set MW_V4_LAB_URL and MW_FAKETIME_FILE'},async()=>{
 const client=new pg.Client({connectionString:url});await client.connect();
 try{
  const q=(sql,params)=>client.query(sql,params);
  const clock=async(utc,day)=>{writeFileSync(clockFile,utc+'\n');assert.equal((await q(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day`)).rows[0].day,day)};
  await clock('2026-10-31 03:00:00','2026-10-31');await labFixtures(q);const w=await build(q,'day');
  const before={collection:await walk(client,'collection'),cash:await walk(client,'cash')};
  await clock('2026-11-01 03:00:00','2026-11-01');
  await q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,25::money,current_date,'Lump Sum')`,['CC-DAYPAY-'+w.seed,w.B]);
  const report=[],failures=[];
  for(const domain of domains){
   const result=await refresh(client,domain,before[domain]),fresh=await walk(client,domain),problems=[];
   try{same(result.state.data,fresh.data,domain)}catch{problems.push('NOT EQUAL')}
   // Design: the row delta applies within one business date. Across a day change collection always walks and cash walks on any change since
   // the cursor, so any correct answer (day change or walk) is accepted; equality and the reconciliation match are required.
   if(!['day change','walk','walk (rows moved)'].includes(result.kind))problems.push('kind '+result.kind+': a row delta must not be applied across a date change');
   const answer=await reconcile(client,domain,result.state);if(answer.result!=='match')problems.push('reconcile '+answer.result+' '+JSON.stringify(answer.keys));
   report.push(`31 Oct -> 1 Nov with a payment: ${domain} ${result.kind} ${problems.length?'PROBLEM '+problems.join('; '):'ok'}`);if(problems.length)failures.push(`${domain}: ${problems.join('; ')}`);
  }
  console.log(report.join('\n'));assert.deepEqual(failures,[],'\n'+report.join('\n'));
 }finally{if(clockFile)writeFileSync(clockFile,'2026-10-31 03:00:00\n');await client.end()}
});
