import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {readOfflineDatasetDelta,readOfflineSourceVersion} from '../../services/business/offline-dataset-delta.mjs';

// R078 protocol v4 on a disposable PostgreSQL database migrated through V97 (never DEV or PROD).
// MW_V4_LAB_URL=postgres://postgres@127.0.0.1:5498/loan_manager_dev node --test tests/integration/offline-delta-v4-lab.test.mjs
// A normal payment answers with a key-only records delta; changes the change log cannot see (TRUNCATE,
// triggers bypassed) are caught by the source fingerprint and answered with a walk.
const url=process.env.MW_V4_LAB_URL;
const lab=url?new URL(url):null;
const disposable=!!lab&&['127.0.0.1','localhost'].includes(lab.hostname)&&lab.pathname==='/loan_manager_dev';
const actor={issuer:'synthetic',subject:'owner',partnerId:'lab-partner'};
async function read(client,input){
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{return await readOfflineDatasetDelta(client,actor,'records',input)}finally{await client.query('ROLLBACK')}
}
/** A client's complete records bundle state: the walk's final source version and its first change cursor. */
async function walk(client){
 let cursor=null,changes=null,response;
 for(let step=0;step<500;step++){response=await read(client,{cursor,need:[],sourceVersion:null,acceptChanged:true});changes??=response.changes??null;if(response.complete)return {sourceVersion:response.sourceVersion,changes};cursor=response.nextCursor}
 throw Error('Walk did not complete');
}
test('protocol v4 sends a key-only delta for a payment and walks on changes the change log cannot see',{skip:!disposable&&'set MW_V4_LAB_URL to a disposable 127.0.0.1 loan_manager_dev'},async()=>{
 const client=new pg.Client({connectionString:url});await client.connect();
 try{
  if(!(await client.query(`SELECT 1 FROM public."Cash Accounts" WHERE "Row ID"='CI-DAD'`)).rowCount)await client.query(readFileSync(new URL('../../scripts/database/Test-CashAccountFixtures.sql',import.meta.url),'utf8').replace(/^\\.*$/gm,''));
  const id=randomUUID().slice(0,8),borrower='V4-B-'+id,loan='V4-L-'+id,partner='V4-P-'+id;
  await client.query(`INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ($1,'Synthetic v4 borrower')`,[borrower]);
  await client.query(`INSERT INTO "Partners"("Row ID","Partner Role") VALUES ($1,'A')`,[partner]);
  await client.query(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES ($1,$2,current_date,'Contribution',10000::money)`,['V4-C-'+id,partner]);
  await client.query(`INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES ('CI-LISA',$1,$2,current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false)`,[loan,borrower]);
  await client.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES ($1,$2,current_date-1,100::money,10::money)`,['V4-CH-'+id,loan]);
  if(!(await client.query('SELECT 1 FROM public."Statistics"')).rowCount)await client.query(`INSERT INTO "Statistics"("Row ID","Statistics ID") VALUES ('lab-statistics','lab')`);
  let state=await walk(client);
  assert.match(state.changes?.seq??'',/^\d+$/,'v3 responses carry the change cursor');

  // A normal payment: only the borrower's records travel (key-only delta, schemaVersion 4), with the fingerprint.
  const payment='V4-PAY-'+id;
  await client.query(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,50::money,current_date,'Lump Sum')`,[payment,borrower]);
  const delta=await read(client,{cursor:null,need:[],sourceVersion:state.sourceVersion,acceptChanged:true,since:state.changes});
  assert.equal(delta.schemaVersion,4);assert.equal(delta.delta,true);assert.equal(delta.complete,true);
  const keys=new Set(delta.patches.map(patch=>patch.key));for(const key of ['payments','paymentHistory','charges','loans','borrowers','dashboard'])assert.ok(keys.has(key),key);
  assert.ok(delta.patches.find(patch=>patch.key==='payments'&&patch.mode==='upsert').refs.length>=1);
  // The content request replays the same delta (same manifest) and returns exactly the requested values.
  const need=[...new Set(delta.patches.flatMap(patch=>patch.refs))].slice(0,2048),fetched=await read(client,{cursor:null,need,sourceVersion:state.sourceVersion,acceptChanged:true,since:state.changes});
  assert.deepEqual(fetched.patches,delta.patches);assert.equal(Object.keys(fetched.values).length,need.length);
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const fingerprint=await readOfflineSourceVersion(client,actor,'records',delta.businessDate);await client.query('ROLLBACK');
  assert.equal(delta.sourceVersion,fingerprint,'the delta carries the fingerprint of its snapshot');
  state={sourceVersion:delta.sourceVersion,changes:delta.changes};
  const unchanged=await read(client,{cursor:null,need:[],sourceVersion:state.sourceVersion,acceptChanged:true,since:state.changes});
  assert.equal(unchanged.unchanged,true);

  // Triggers bypassed (a restore or data load): no change-log row, the fingerprint differs -> walk.
  const before=(await client.query('SELECT max(seq) AS seq FROM public.pwa_row_changes')).rows[0].seq;
  await client.query('BEGIN');await client.query("SET LOCAL session_replication_role=replica");await client.query(`UPDATE "Borrowers" SET "Description"='bypassed' WHERE "Row ID"=$1`,[borrower]);await client.query('COMMIT');
  assert.equal((await client.query('SELECT max(seq) AS seq FROM public.pwa_row_changes')).rows[0].seq,before,'the bypassed write is not logged');
  const bypassed=await read(client,{cursor:null,need:[],sourceVersion:state.sourceVersion,acceptChanged:true,since:state.changes});
  assert.equal(bypassed.schemaVersion,3);assert.notEqual(bypassed.unchanged,true);assert.ok(bypassed.patches.length>0,'a walk starts');
  state=await walk(client);

  // TRUNCATE is not logged either: the records content fingerprint of Daily Analytics catches it -> walk.
  await client.query(`INSERT INTO "Daily Analytics"("Row ID","Snapshot Date","Generated At") VALUES ($1,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date-1,now())`,['V4-DA-'+id]);
  state=await walk(client);
  await client.query('TRUNCATE "Daily Analytics"');
  const truncated=await read(client,{cursor:null,need:[],sourceVersion:state.sourceVersion,acceptChanged:true,since:state.changes});
  assert.equal(truncated.schemaVersion,3);assert.notEqual(truncated.unchanged,true);
 }finally{await client.end()}
});
