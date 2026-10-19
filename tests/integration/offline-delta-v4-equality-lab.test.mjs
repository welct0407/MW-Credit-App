import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {readOfflineDatasetDelta} from '../../services/business/offline-dataset-delta.mjs';
import {readOfflineDatasetChunk} from '../../services/business/offline-dataset-chunks.mjs';
import {canonicalDeltaValue} from '../../services/api/offline-dataset-delta.mjs';

// R078 protocol v4 equality proof on a disposable PostgreSQL database migrated through V97 (never DEV or PROD).
// MW_V4_LAB_URL=postgres://postgres@127.0.0.1:5498/loan_manager_dev node --test tests/integration/offline-delta-v4-equality-lab.test.mjs
// For each change a client holding the previous bundle applies the server's answer (a v4 delta, or the walk the
// server falls back to); the result must equal a fresh full walk of the same database, row for row.
const url=process.env.MW_V4_LAB_URL;
const lab=url?new URL(url):null;
const disposable=!!lab&&['127.0.0.1','localhost'].includes(lab.hostname)&&lab.pathname==='/loan_manager_dev';
const actor={issuer:'synthetic',subject:'owner',partnerId:'lab-partner'};
const plain=value=>JSON.parse(JSON.stringify(canonicalDeltaValue(value)));
const rr=async(client,work)=>{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{return await work()}finally{await client.query('ROLLBACK')}};
/** The client's patch application (apps/pwa/src/offline-dataset.ts), including the v4 modes. */
function apply(data,patch){
 const path=[patch.key,...(patch.path??[])];let target=data;
 for(const key of path.slice(0,-1)){if(target[key]===undefined)target[key]={};target=target[key]}
 const key=path.at(-1);
 if(patch.mode==='append')target[key]=[...(target[key]??[]),...patch.value];
 else if(patch.mode==='merge')target[key]={...target[key],...patch.value};
 else if(patch.mode==='replace')target[key]=patch.value;
 else if(patch.mode==='upsert'){const rows=[...(target[key]??[])],at=new Map(rows.map((row,index)=>[row?.id,index]));for(const row of patch.value){const index=at.get(row.id);if(index===undefined){at.set(row.id,rows.length);rows.push(row)}else rows[index]=row}target[key]=rows}
 else if(patch.mode==='remove'){const by=patch.by??'id',drop=new Set(patch.value.map(item=>JSON.stringify(item??null))),current=target[key];if(Array.isArray(current))target[key]=current.filter(row=>!drop.has(JSON.stringify(row?.[by]??null)));else if(current&&typeof current==='object')for(const name of patch.value)delete current[name]}
 else throw Error('mode '+patch.mode);
}
async function walk(client){
 const data={};let cursor=null,changes=null,sourceVersion=null;
 for(let step=0;step<800;step++){
  const response=await rr(client,()=>readOfflineDatasetDelta(client,actor,'records',{cursor,need:[],sourceVersion:null,acceptChanged:true}));
  const chunk=await rr(client,()=>readOfflineDatasetDelta(client,actor,'records',{cursor,need:[...new Set(response.patches.flatMap(patch=>patch.refs))],sourceVersion:null,acceptChanged:true}));
  assert.deepEqual(chunk.patches,response.patches);changes??=response.changes??null;
  for(const patch of response.patches)apply(data,{...patch,value:patch.mode==='append'||patch.mode==='upsert'?patch.refs.map(ref=>chunk.values[ref]):chunk.values[patch.refs[0]]});
  if(response.complete){sourceVersion=response.sourceVersion;break}
  cursor=response.nextCursor;
 }
 return {data:plain(data),sourceVersion,changes};
}
/** What a client does with the server's answer to its previous bundle. */
async function refresh(client,state){
 const response=await rr(client,()=>readOfflineDatasetDelta(client,actor,'records',{cursor:null,need:[],sourceVersion:state.sourceVersion,acceptChanged:true,since:state.changes}));
 if(response.unchanged)return {kind:'unchanged',state};
 if(response.schemaVersion!==4)return {kind:'walk',state:await walk(client)};
 const fetched=await rr(client,()=>readOfflineDatasetDelta(client,actor,'records',{cursor:null,need:[...new Set(response.patches.flatMap(patch=>patch.refs))],sourceVersion:state.sourceVersion,acceptChanged:true,since:state.changes}));
 const data=structuredClone(state.data);
 for(const patch of response.patches)apply(data,{...patch,value:patch.mode==='append'||patch.mode==='upsert'?patch.refs.map(ref=>fetched.values[ref]):fetched.values[patch.refs[0]]});
 return {kind:'delta',keys:[...new Set(response.patches.map(patch=>patch.key))],state:{data:plain(data),sourceVersion:response.sourceVersion,changes:response.changes}};
}
const rowId=row=>row?.id??row?.borrowerId+'/'+row?.month??JSON.stringify(row);
/** Differences by key and row id; row order is reported separately (a client re-sorts for display). */
function differences(left,right){
 const out=[];
 for(const key of new Set([...Object.keys(left),...Object.keys(right)])){
  const a=left[key],b=right[key];
  if(JSON.stringify(a)===JSON.stringify(b))continue;
  if(Array.isArray(a)&&Array.isArray(b)){
   const index=list=>new Map(list.map(row=>[rowId(row),JSON.stringify(row)]));const ia=index(a),ib=index(b);
   const rows=[...new Set([...ia.keys(),...ib.keys()])].filter(id=>ia.get(id)!==ib.get(id));
   const fields=rows.slice(0,1).flatMap(rowKey=>{const x=JSON.parse(ia.get(rowKey)??'{}'),y=JSON.parse(ib.get(rowKey)??'{}');return Object.keys({...x,...y}).filter(field=>JSON.stringify(x[field])!==JSON.stringify(y[field]))});
   out.push(rows.length?`${key}: ${rows.length} rows differ (${rows.slice(0,3).join(', ')}; fields ${fields.join('/')})`:`${key}: order only`);
  }else if(a&&b&&typeof a==='object'&&!Array.isArray(a)){
   out.push(`${key}: `+Object.keys({...a,...b}).filter(field=>JSON.stringify(a[field])!==JSON.stringify(b[field])).map(field=>field+(Array.isArray(a[field])&&Array.isArray(b[field])&&[...a[field]].map(row=>JSON.stringify(row)).sort().join()===[...b[field]].map(row=>JSON.stringify(row)).sort().join()?' (order only)':' (content)')).join(','));
  }else out.push(`${key}: differs`);
 }
 return out;
}
test('a client holding the previous bundle ends equal to a fresh full walk after each kind of change',{skip:!disposable&&'set MW_V4_LAB_URL to a disposable 127.0.0.1 loan_manager_dev'},async()=>{
 const client=new pg.Client({connectionString:url});await client.connect();
 try{
  const q=(sql,params)=>client.query(sql,params);
  if(!(await q(`SELECT 1 FROM public."Cash Accounts" WHERE "Row ID"='CI-DAD'`)).rowCount)await q(readFileSync(new URL('../../scripts/database/Test-CashAccountFixtures.sql',import.meta.url),'utf8').replace(/^\\.*$/gm,''));
  if(!(await q('SELECT 1 FROM public."Statistics"')).rowCount)await q(`INSERT INTO "Statistics"("Row ID","Statistics ID") VALUES ('lab-statistics','lab')`);
  const id=randomUUID().slice(0,8),A='EQ-A-'+id,B='EQ-B-'+id,C='EQ-C-'+id,LA='EQ-LA-'+id,LB='EQ-LB-'+id,partner='EQ-P-'+id;
  await q(`INSERT INTO "Partners"("Row ID","Partner Role") VALUES ($1,'A')`,[partner]);
  await q(`INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES ($1,$2,current_date,'Contribution',100000::money)`,['EQ-CP-'+id,partner]);
  for(const [borrower,name] of [[A,'Alpha'],[B,'Bravo'],[C,'Charlie']])await q(`INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ($1,$2)`,[borrower,name+' '+id]);
  await q(`UPDATE "Borrowers" SET "Ref Referrer"=$1 WHERE "Row ID"=$2`,[A,C]);
  for(const [loan,borrower] of [[LA,A],[LB,B]]){
   await q(`INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES ('CI-LISA',$1,$2,current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false)`,[loan,borrower]);
   for(const day of [3,2,1])await q(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES ($1,$2,current_date-$3::int,30::money,5::money)`,[`EQ-CH-${loan}-${day}`,loan,day]);
  }
  let state=await walk(client);
  const scenarios=[
   ['payment on A',async()=>q(`INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES ('CI-DAD',$1,'Processing',$2,50::money,current_date,'Lump Sum')`,['EQ-PAY1-'+id,A])],
   ['rename referrer A (C refers to A)',async()=>q(`UPDATE "Borrowers" SET "Borrower Name"='Alpha renamed '||$2 WHERE "Row ID"=$1`,[A,id])],
   ['loan reassigned from B to C',async()=>q(`UPDATE "Loans" SET "Ref Borrowers"=$2 WHERE "Row ID"=$1`,[LB,C])],
   ['payment moved from A to B',async()=>q(`UPDATE "Payments" SET "Ref Borrower"=$2 WHERE "Row ID"=$1`,['EQ-PAY1-'+id,B])],
   ['charge edited',async()=>q(`UPDATE "Charges" SET "Interest Due"=7::money WHERE "Row ID"=$1`,[`EQ-CH-${LA}-1`])],
   ['new borrower',async()=>q(`INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ($1,'Delta '||$2)`,['EQ-D-'+id,id])],
   ['borrower hidden',async()=>q(`UPDATE "Borrowers" SET "Hidden Flag"=true WHERE "Row ID"=$1`,['EQ-D-'+id])],
   ['expense linked to a loan',async()=>q(`INSERT INTO "Business Expenses"("Row ID","Expense Date","Amount","Ref Related Loan","Ref Related Borrower","Ref Paid By Cash Account","Expense Category") VALUES ($1,current_date,10::money,$2,$3,'CI-LISA','Other')`,['EQ-EX-'+id,LA,A])],
   ['receipt attached to a payment',async()=>q(`UPDATE "Payments" SET "Uploaded Receipt"='manual-receipts/x/y.png',"Uploaded Receipt At"=now() WHERE "Row ID"=$1`,['EQ-PAY1-'+id])],
   ['two borrowers in one delta',async()=>{await q(`UPDATE "Borrowers" SET "Borrower Note"='n1' WHERE "Row ID"=$1`,[A]);await q(`UPDATE "Borrowers" SET "Borrower Note"='n2' WHERE "Row ID"=$1`,[B])}],
   ['expense payee changed to B',async()=>q(`UPDATE "Business Expenses" SET "Ref Payee Borrower"=$2 WHERE "Row ID"=$1`,['EQ-EX-'+id,B])],
   ['settlement (dashboard only)',async()=>q(`INSERT INTO "Settlements"("Ref Paid From Cash Account","Row ID","Ref Partner","Status","Transfer Date","Amount") VALUES ('CI-LISA',$1,$2,'Completed',current_date,5::money)`,['EQ-S-'+id,partner])],
   ['direct repayment row on B charge',async()=>q(`INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES ($1,$2,$3,current_date,1::money,1::money)`,['EQ-R-'+id,LA,`EQ-CH-${LA}-2`])],
   ['cash account label (expect walk)',async()=>q(`UPDATE "Cash Accounts" SET "Account Label"='Renamed '||$2 WHERE "Row ID"=$1`,['CI-DAD',id])],
   ['payment deleted',async()=>q(`DELETE FROM "Payments" WHERE "Row ID"=$1`,['EQ-PAY1-'+id])],
  ];
  const report=[];
  for(const [label,change] of scenarios){
   try{await change()}catch(error){report.push(`${label}: change refused (${error.message.slice(0,60)})`);continue}
   const result=await refresh(client,state),fresh=await walk(client),diff=differences(result.state.data,fresh.data);
   report.push(`${label}: ${result.kind}${result.keys?' ['+result.keys.join(',')+']':''} ${diff.length?'MISMATCH '+diff.join('; '):'equal'}`);
   state=result.kind==='unchanged'?state:result.state;
   if(diff.length)state=fresh;
  }
  console.log(report.join('\n'));
  assert.ok(report.every(line=>!line.includes('MISMATCH')),'\n'+report.join('\n'));
 }finally{await client.end()}
});

test('a transaction that commits after the cursor was taken is still delivered by the next delta',{skip:!disposable&&'set MW_V4_LAB_URL to a disposable 127.0.0.1 loan_manager_dev'},async()=>{
 const client=new pg.Client({connectionString:url}),slow=new pg.Client({connectionString:url}),quick=new pg.Client({connectionString:url});
 await Promise.all([client.connect(),slow.connect(),quick.connect()]);
 try{
  if(!(await client.query(`SELECT 1 FROM public."Cash Accounts" WHERE "Row ID"='CI-DAD'`)).rowCount)await client.query(readFileSync(new URL('../../scripts/database/Test-CashAccountFixtures.sql',import.meta.url),'utf8').replace(/^\\.*$/gm,''));
  if(!(await client.query('SELECT 1 FROM public."Statistics"')).rowCount)await client.query(`INSERT INTO "Statistics"("Row ID","Statistics ID") VALUES ('lab-statistics','lab')`);
  const id=randomUUID().slice(0,8),A='LT-A-'+id,B='LT-B-'+id,L='LT-L-'+id;
  for(const [borrower,name] of [[A,'Late A'],[B,'Late B']])await client.query(`INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ($1,$2)`,[borrower,name+' '+id]);
  await client.query(`INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES ('CI-LISA',$1,$2,current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false)`,[L,A]);
  await client.query(`INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES ($1,$2,current_date-1,30::money,5::money)`,['LT-CH-'+id,L]);
  const s0=await walk(client);
  // The slow transaction logs its change first (lower seq) and commits last; the quick one commits in between.
  await slow.query('BEGIN');await slow.query(`UPDATE "Charges" SET "Interest Due"=9::money WHERE "Row ID"=$1`,['LT-CH-'+id]);
  await quick.query(`UPDATE "Borrowers" SET "Borrower Note"='quick' WHERE "Row ID"=$1`,[B]);
  const s1=await refresh(client,s0);assert.equal(s1.kind,'delta');
  await slow.query('COMMIT');
  const s2=await refresh(client,s1.state),fresh=await walk(client);
  assert.equal(s2.kind,'delta');assert.ok(s2.keys.includes('charges'),'the late commit arrives with the next delta');
  assert.deepEqual(differences(s2.state.data,fresh.data).filter(line=>!line.endsWith('order only')),[]);
 }finally{await Promise.all([client.end(),slow.end(),quick.end()])}
});
