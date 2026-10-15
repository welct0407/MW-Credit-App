import fs from 'node:fs/promises';
const root='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/postgresql-migration-trial-20260914';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const before=await read(`${root}/bulk-before-1.000005.json`),after=await read(`${root}/bulk-full-after-1.000007.json`);
const plan=await read(`${out}/bulk-copy-plan.json`),tables=plan.tables.map(t=>t.table),configs=new Map();let schema='';
for(const t of before){if(t.rows[0]?.[0]==='Schema Name')schema=t.rows[0][1].replace(/_Schema$/,'');if(t.rows[0]?.[0]==='Column name')configs.set(`${schema}/${t.rows[0][1]}`,Object.fromEntries(t.rows));}
const configChanges=[];
if(before.length!==after.length)throw Error('Configuration shape mismatch');
for(let i=0;i<before.length;i++)if(JSON.stringify(before[i])!==JSON.stringify(after[i])){
 const b=Object.fromEntries(before[i].rows),a=Object.fromEntries(after[i].rows),props=[...new Set([...Object.keys(b),...Object.keys(a)])].filter(k=>b[k]!==a[k]);
 if(!tables.includes(b['Table name'])&&!(props.length===1&&props[0]==='Version'))throw Error('Unexpected configuration difference');
 if(b['Table name']&&props.some(k=>!['Data locale','Data Source','Source Path','Worksheet Name/Qualifier'].includes(k)))throw Error('Unexpected table setting change');
 configChanges.push({table:b['Table name']??'App',properties:props});
}
const results=[];let failed=false;
for(const table of tables){
 const src=await read(`${root}/bulk-source/${table}.json`),dst=await read(`${root}/bulk-full-after/${table}.json`),map=new Map(dst.map(r=>[r['Row ID'],r]));
 let fields=0,rowNumberChanges=0;const orderOnly={},differences=[];
 for(const row of src){const found=map.get(row['Row ID']);if(!found){differences.push({kind:'missing-row'});continue;}
  for(const key of Object.keys(row)){if(key==='_RowNumber'){if(row[key]!==found[key])rowNumberChanges++;continue;}fields++;if(row[key]===found[key])continue;
   const def=configs.get(`${table}/${key}`);
   if(def?.Type==='List'&&def['App formula']?.includes('REF_ROWS(')){
    const split=v=>v.split(',').map(s=>s.trim()).filter(Boolean).sort();
    if(JSON.stringify(split(row[key]))===JSON.stringify(split(found[key]))){orderOnly[key]=(orderOnly[key]??0)+1;continue;}
   }
   differences.push({column:key,kind:'value-mismatch'});
  }
 }
 const passed=src.length===dst.length&&map.size===src.length&&!differences.length;if(!passed)failed=true;
 results.push({table,rows:src.length,afterRows:dst.length,comparedFields:fields,rowNumberChanges,relatedListOrderOnly:orderOnly,differences,passed});
}
const bindings=after.filter(t=>t.rows[0]?.[0]==='Table name').map(t=>Object.fromEntries(t.rows)).filter(t=>t['Data Source']!=='native').map(t=>({table:t['Table name'],source:t['Data Source'],path:t['Source Path'],permissions:t['Are updates allowed?']}));
if(bindings.filter(t=>t.source==='database-2').length!==12)throw Error('Not all native tables use SQL');
const dependencies=[...configs.entries()].filter(([,d])=>Object.entries(d).some(([k,v])=>k!=='Column name'&&typeof v==='string'&&v.includes('[_RowNumber]'))).map(([column,d])=>({column,properties:Object.entries(d).filter(([k,v])=>k!=='Column name'&&typeof v==='string'&&v.includes('[_RowNumber]')).map(([k])=>k)}));
const report={version:'1.000007',rollback:'1.000006',initialRollback:'1.000004',unchangedColumnConfigurations:374,configChanges,bindings,results,allBusinessValuesAndRelatedMembershipMatched:!failed,rowNumberDependencies:dependencies,limitation:'Provider row numbers and unordered REF_ROWS lists are not stable across source migration. Financial write workflows and order-dependent allocation require separate validation before cutover.'};
await fs.writeFile(`${out}/full-app-verification.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(failed)process.exitCode=1;
