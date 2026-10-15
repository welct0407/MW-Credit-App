import fs from 'node:fs/promises';
const root='C:/GitHub/AppSheet-Loan-Project';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project';
const out=root+'/outputs/appsheet-cleanup-20260915';
const result={date:'2026-09-15',apps:[],appCount:4,appsheetDatabaseCount:1,preservedDatabase:'Money database',cloudSqlChanged:false};
for(const [kind,name,version]of [['oltp','Loan Manager — DEV','1.000012'],['olap','Loan Business Insights — DEV','1.000026']]){
 const before=JSON.parse(await fs.readFile(priv+'/documentation-reconciliation-20260915/development-'+kind+'.json','utf8'));
 const after=JSON.parse(await fs.readFile(priv+'/appsheet-cleanup-20260915/'+kind+'-after.json','utf8'));
 const normalize=doc=>doc.map(t=>t.rows.filter(r=>!['Short Name','Version'].includes(r[0])));
 if(JSON.stringify(normalize(before))!==JSON.stringify(normalize(after)))throw Error('Unexpected definition difference '+kind);
 const rows=after.flatMap(t=>t.rows);if(rows.find(r=>r[0]==='Short Name')?.[1]!==name||rows.find(r=>r[0]==='Version')?.[1]!==version)throw Error('Name/version mismatch');
 const tables=after.map(t=>Object.fromEntries(t.rows.filter(r=>r.length===2))).filter(t=>t['Table name']);
 if(tables.filter(t=>t['Data Source']==='database-3').length!==(kind==='oltp'?8:13))throw Error('Source binding mismatch');
 const actions=after.map(t=>Object.fromEntries(t.rows.filter(r=>r.length===2))).filter(t=>t['Action name']&&JSON.stringify(t).includes('LINKTOAPP'));
 result.apps.push({kind,name,version,onlyNameAndVersionChanged:true,sqlSource:'database-3',crossAppActions:actions});
}
const appText=await fs.readFile(out+'/apps-after.txt','utf8');const dbText=await fs.readFile(out+'/databases-after.txt','utf8');
if(!appText.includes('Owned (4)')||!dbText.includes('Owned (1)')||!dbText.includes('Money database'))throw Error('Final inventory counts not verified');
result.deletedApps=['SQL Sync POC TEST 20260914','LoanMgr Perf TEST 20260912','LoanMgr FULL BACKUP 20260906'];
result.deletedDatabases=['Money BACKUP Borrower Cleanup 20260913','Money Perf TEST 20260912','Money Restructure Backup 20260908','Money Collection Backup 20260908','Money FULL BACKUP 20260906'];
for(const n of result.deletedApps)if(appText.includes(n))throw Error('Deleted app remains');for(const n of result.deletedDatabases)if(dbText.includes(n))throw Error('Deleted database remains');
await fs.writeFile(out+'/verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({apps:result.apps.map(a=>({name:a.name,version:a.version,unchangedModel:a.onlyNameAndVersionChanged})),appCount:4,appsheetDatabaseCount:1}));
