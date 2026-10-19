import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {readOfflineDatasetDelta} from '../../services/business/offline-dataset-delta.mjs';
import {applyDatasetPatch,datasetDigests} from '../../services/lib/offline-dataset-digest.mjs';

// R078 reconciliation on a disposable PostgreSQL database migrated through V97 (never DEV or PROD).
// MW_V4_LAB_URL=postgres://postgres@127.0.0.1:5498/loan_manager_dev node --test tests/integration/offline-reconcile-lab.test.mjs
const url=process.env.MW_V4_LAB_URL;
const lab=url?new URL(url):null;
const disposable=!!lab&&['127.0.0.1','localhost'].includes(lab.hostname)&&lab.pathname==='/loan_manager_dev';
const actor={issuer:'synthetic',subject:'owner',partnerId:'lab-partner'},sha256=text=>createHash('sha256').update(text).digest('hex');
const rr=async(client,work,isolation='REPEATABLE READ')=>{await client.query(`BEGIN ISOLATION LEVEL ${isolation} READ ONLY`);try{return await work()}finally{await client.query('ROLLBACK')}};
/** What a client stores after a walk: values fetched by hash and applied with the shared patch logic. */
async function walk(client,domain){
 const data={};let cursor=null;
 for(let step=0;step<800;step++){
  const manifest=await rr(client,()=>readOfflineDatasetDelta(client,actor,domain,{cursor,need:[],sourceVersion:null,acceptChanged:true}));
  const need=[...new Set(manifest.patches.flatMap(patch=>patch.refs))],fetched=need.length?await rr(client,()=>readOfflineDatasetDelta(client,actor,domain,{cursor,need,sourceVersion:null,acceptChanged:true})):{values:{}};
  for(const patch of manifest.patches)applyDatasetPatch(data,{...patch,value:patch.mode==='append'||patch.mode==='upsert'?patch.refs.map(ref=>structuredClone(fetched.values[ref])):structuredClone(fetched.values[patch.refs[0]])});
  if(manifest.complete)return {data,sourceVersion:manifest.sourceVersion};
  cursor=manifest.nextCursor;
 }
 throw Error('Walk did not complete');
}
const reconcile=async(client,domain,state,isolation)=>rr(client,async()=>readOfflineDatasetDelta(client,actor,domain,{reconcile:true,sourceVersion:state.sourceVersion,digests:await datasetDigests(state.data,sha256)}),isolation);
test('reconciliation matches a walked bundle, names exactly a mutated key, and reports stale and changed versions',{skip:!disposable&&'set MW_V4_LAB_URL to a disposable 127.0.0.1 loan_manager_dev'},async()=>{
 const client=new pg.Client({connectionString:url}),writer=new pg.Client({connectionString:url});await Promise.all([client.connect(),writer.connect()]);
 try{
  const q=(sql,params)=>client.query(sql,params);
  if(!(await q(`SELECT 1 FROM public."Cash Accounts" WHERE "Row ID"='CI-DAD'`)).rowCount)await q(readFileSync(new URL('../../scripts/database/Test-CashAccountFixtures.sql',import.meta.url),'utf8').replace(/^\\.*$/gm,''));
  if(!(await q('SELECT 1 FROM public."Statistics"')).rowCount)await q(`INSERT INTO "Statistics"("Row ID","Statistics ID") VALUES ('lab-statistics','lab')`);
  // cash preferences read the actor's own partner row.
  if(!(await q(`SELECT 1 FROM public."Partners" WHERE "Row ID"='lab-partner'`)).rowCount)await q(`INSERT INTO "Partners"("Row ID","Partner Role","Partner Name") VALUES ('lab-partner','B','Lab partner')`);
  const id=randomUUID().slice(0,8),borrower='RC-B-'+id,loan='RC-L-'+id,partner='RC-P-'+id;
  await q(`INSERT INTO "Partners"("Row ID","Partner Role") VALUES ($1,'A')`,[partner]);
  await q(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES ($1,$2,current_date,'Contribution',10000::money)`,['RC-C-'+id,partner]);
  await q(`INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ($1,'Reconcile '||$2)`,[borrower,id]);
  await q(`INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES ('CI-LISA',$1,$2,current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false)`,[loan,borrower]);
  await q(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES ($1,$2,current_date-1,100::money,10::money)`,['RC-CH-'+id,loan]);
  await q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,50::money,current_date,'Lump Sum')`,['RC-PAY-'+id,borrower]);
  const report=[];
  for(const domain of ['records','collection','cash','management']){
   const state=await walk(client,domain),match=await reconcile(client,domain,state);
   assert.equal(match.result,'match',domain+' '+JSON.stringify(match.keys));
   // One item mutated in the stored bundle: exactly that key is named.
   const key=Object.keys(state.data).sort().find(name=>Array.isArray(state.data[name])&&state.data[name].length&&typeof state.data[name][0]==='object')??Object.keys(state.data).sort().find(name=>state.data[name]&&typeof state.data[name]==='object');
   const corrupt=structuredClone(state.data),target=Array.isArray(corrupt[key])?corrupt[key][0]:corrupt[key];target.corrupted=true;
   const mismatch=await reconcile(client,domain,{...state,data:corrupt});
   assert.equal(mismatch.result,'mismatch');assert.deepEqual(mismatch.keys,[key],domain);report.push(domain+':'+key);
  }
  // Stale: the client's version is older than the database.
  const before=await walk(client,'records');
  await q(`UPDATE "Borrowers" SET "Borrower Note"='stale check' WHERE "Row ID"=$1`,[borrower]);
  assert.equal((await reconcile(client,'records',before)).result,'stale');
  // Changed: a write lands between the two version reads (only possible outside REPEATABLE READ; the service uses it).
  const current=await walk(client,'collection'),digests=await datasetDigests(current.data,sha256);let wrote=false;
  const racing={query:async(sql,params)=>{if(!wrote&&!sql.includes('AS fingerprint')&&!sql.startsWith('SELECT to_char')){wrote=true;await writer.query(`UPDATE "Charges" SET "Interest Due"=11::money WHERE "Row ID"=$1`,['RC-CH-'+id])}return client.query(sql,params)}};
  const changed=await rr(client,()=>readOfflineDatasetDelta(racing,actor,'collection',{reconcile:true,sourceVersion:current.sourceVersion,digests}),'READ COMMITTED');
  assert.equal(changed.result,'changed');
  console.log('mutated keys named: '+report.join(', '));
 }finally{await Promise.all([client.end(),writer.end()])}
});
