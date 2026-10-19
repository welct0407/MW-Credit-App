import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import pg from 'pg';
import {readOfflineDatasetDelta} from '../../services/business/offline-dataset-delta.mjs';
import {pinOfflineBusinessDate} from '../../services/business/offline-dataset-chunks.mjs';
import * as shared from '../../services/lib/offline-dataset-digest.mjs';

// R078 day change on a disposable PostgreSQL database migrated through V97 (never DEV or PROD). The business date
// is pinned (test-only stamp override) across a month end; the database clock does not move, so this proves the
// mechanism (kept keys, re-read plan, combined row changes, fallbacks), while Archie's trace proves which keys
// read the date. Chase owns the full byte-for-byte equality suite.
// MW_V4_LAB_URL=postgres://postgres@127.0.0.1:5498/loan_manager_dev node --test --test-concurrency=1 tests/integration/offline-day-change-lab.test.mjs
const url=process.env.MW_V4_LAB_URL;
const lab=url?new URL(url):null;
const disposable=!!lab&&['127.0.0.1','localhost'].includes(lab.hostname)&&lab.pathname==='/loan_manager_dev';
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
const same=(left,right,label)=>assert.deepEqual(plain(canonicalDatasetValue(left)),plain(canonicalDatasetValue(right)),label);
test('a month-end day change keeps the date-independent keys, re-reads the rest and equals a walk; row changes combine or walk',{skip:!disposable&&'set MW_V4_LAB_URL to a disposable 127.0.0.1 loan_manager_dev'},async()=>{
 const client=new pg.Client({connectionString:url});await client.connect();
 try{
  const q=(sql,params)=>client.query(sql,params);
  if(!(await q(`SELECT 1 FROM public."Cash Accounts" WHERE "Row ID"='CI-DAD'`)).rowCount)await q(readFileSync(new URL('../../scripts/database/Test-CashAccountFixtures.sql',import.meta.url),'utf8').replace(/^\\.*$/gm,''));
  if(!(await q('SELECT 1 FROM public."Statistics"')).rowCount)await q(`INSERT INTO "Statistics"("Row ID","Statistics ID") VALUES ('lab-statistics','lab')`);
  if(!(await q(`SELECT 1 FROM public."Partners" WHERE "Row ID"='lab-partner'`)).rowCount)await q(`INSERT INTO "Partners"("Row ID","Partner Role","Partner Name") VALUES ('lab-partner','B','Lab partner')`);
  const id=randomUUID().slice(0,8),borrower='DC-B-'+id,loan='DC-L-'+id;
  await q(`INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ($1,'Day change '||$2)`,[borrower,id]);
  await q(`INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES ('CI-LISA',$1,$2,current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false)`,[loan,borrower]);
  await q(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES ($1,$2,current_date-1,100::money,10::money)`,['DC-CH-'+id,loan]);

  // Nothing changed overnight: every day domain answers with a day change equal to a walk at the new date.
  pinOfflineBusinessDate('2026-10-31');
  const before={};for(const domain of ['records','cash','management','collection'])before[domain]=await walk(client,domain);
  assert.ok(before.records.data.loans.some(row=>row.id===loan&&row.businessDate==='2026-10-31'),'details carry the stamp date');
  pinOfflineBusinessDate('2026-11-01');
  for(const domain of ['records','cash','management']){
   const day=await check(client,domain,before[domain]);assert.ok(day,domain+' answers with a day change');
   assert.equal(day.businessDate,'2026-11-01');
   if(domain==='records')assert.ok(day.keep.includes('loans')&&day.data.loans.length&&day.data.loans.every(row=>row.businessDate==='2026-11-01'),'kept detail rows move to the new date');
   same(day.data,(await walk(client,domain)).data,domain+' equals a walk at the new date');
  }
  assert.equal(await check(client,'collection',before.collection),null,'collection reads the date everywhere: it walks');

  // A payment overnight: records combines its rows with the day plan; cash (ledger tables) walks.
  pinOfflineBusinessDate('2026-10-31');
  const records=await walk(client,'records'),cash=await walk(client,'cash');
  await q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,50::money,current_date,'Lump Sum')`,['DC-PAY-'+id,borrower]);
  pinOfflineBusinessDate('2026-11-01');
  const combined=await check(client,'records',records);assert.ok(combined,'records answers with a day change');
  assert.ok(combined.data.payments.some(row=>row.id==='DC-PAY-'+id&&row.businessDate==='2026-11-01'),'the new payment arrives with the new date');
  same(combined.data,(await walk(client,'records')).data,'records with a row change equals a walk');
  assert.equal(await check(client,'cash',cash),null,'a ledger change overnight walks cash');

  // The fingerprint stays the authority: a client version that does not match its own date's sources walks.
  pinOfflineBusinessDate('2026-10-31');
  const stale=await walk(client,'management');
  pinOfflineBusinessDate('2026-11-01');
  assert.equal(await check(client,'management',{...stale,sourceVersion:'0'.repeat(64)}),null,'an unexplained difference walks');
  // More than DAY_CHANGE_MAX_DAYS: walk.
  pinOfflineBusinessDate('2026-11-20');
  assert.equal(await check(client,'management',stale),null,'a bundle more than 14 days old walks');
 }finally{pinOfflineBusinessDate(null);await client.end()}
});
