// Read-only verification of frozen, private cutover evidence. Emits aggregates only.
import fs from 'node:fs/promises';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-cutover-20260914';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/postgresql-production-cutover-20260915';
const read=async p=>JSON.parse(await fs.readFile(`${priv}/${p}`,'utf8'));
const tables=['Borrowers','Loans','Repayments','Statistics','Charges','Loan Assessment','Cash Pool Contributions','Partners','Settlements','Daily Analytics','Payment Allocations','Payments'];
const result=[];
for(const table of tables){
 const a=await read(`source/${table}.json`), confirm=await read(`source-confirm/${table}.json`), b=await read(`sql-after/${table}.json`);
 const by=new Map(b.map(r=>[r['Row ID'],r]));let scalarDifferences=0,relationshipDifferences=0,orderOnly=0;
 for(const r of a){const s=by.get(r['Row ID']);if(!s)throw Error(`Missing key in ${table}`);
  for(const c of Object.keys(r)){if(c==='_RowNumber'||JSON.stringify(r[c])===JSON.stringify(s[c]))continue;
   if(c.startsWith('Related ')){const list=v=>(Array.isArray(v)?[...v]:String(v).split(' , ').map(x=>x.trim())).sort();if(JSON.stringify(list(r[c]))===JSON.stringify(list(s[c])))orderOnly++;else relationshipDifferences++;}
   else scalarDifferences++;
  }
 }
 const stable=JSON.stringify(a)===JSON.stringify(confirm);
 result.push({table,sourceRows:a.length,sqlRows:b.length,sourceStable:stable,scalarDifferences,relationshipDifferences,relationshipOrderOnly:orderOnly});
 if(!stable||a.length!==b.length||scalarDifferences||relationshipDifferences)throw Error(`Readback mismatch: ${table}`);
}
const indexDoc=d=>{let schema='';const map={};for(const {rows:r} of d){if(!r.length)continue;const[k,v]=r[0],obj=Object.fromEntries(r.filter(x=>x.length===2));if(k==='Schema Name')schema=v;const key=k==='Column name'?`Column:${schema}:${v}`:k==='Action name'?`${k}:${obj['For a record of this table']}:${v}`:`${k}:${v}`;if(map[key])throw Error(`Duplicate definition identity ${key}`);map[key]=obj;}return map;};
const apps=[];
for(const app of ['olap','oltp']){
 const a=indexDoc(await read(`${app}-before.json`)),b=indexDoc(await read(`${app}-final.json`));
 const removed=Object.keys(a).filter(k=>!b[k]),added=Object.keys(b).filter(k=>!a[k]);if(removed.length||added.length)throw Error(`Unexpected ${app} object inventory change`);
 const changes=[];
 for(const k of Object.keys(a)){for(const f of new Set([...Object.keys(a[k]),...Object.keys(b[k])]))if(a[k][f]!==b[k][f]){
  const sourceMetadata=k.startsWith('Table name:')&&['Source Path','Worksheet Name/Qualifier','Data Source','Data locale'].includes(f);
  if(!sourceMetadata&&f!=='Version')throw Error(`Unexpected setting change ${app}: ${k}.${f}`);
  changes.push({object:k,field:f,before:a[k][f],after:b[k][f]});
 }}
 apps.push({app,changedFields:changes,unchangedColumns:Object.keys(a).filter(k=>k.startsWith('Column:')).length,unchangedActions:Object.keys(a).filter(k=>k.startsWith('Action name:')).length});
}
await fs.writeFile(`${out}/cutover-verification.json`,JSON.stringify({verifiedAt:new Date().toISOString(),sourceStatisticsException:'API reader Statistics was already SQL; native Money Statistics Row ID and MAIN label were independently checked in current database UI.',tables:result,apps},null,2)+'\n');
console.log(JSON.stringify({tables:result,totalRows:result.reduce((s,r)=>s+r.sourceRows,0),apps:apps.map(a=>({app:a.app,changedFields:a.changedFields.length,unchangedColumns:a.unchangedColumns,unchangedActions:a.unchangedActions}))}));
