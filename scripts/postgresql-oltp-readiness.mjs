import fs from 'node:fs/promises';
const root='C:/GitHub/AppSheet-Loan-Project',out=`${root}/outputs/postgresql-migration-trial-20260914`,priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914';
const before=JSON.parse(await fs.readFile(`${priv}/oltp-pg-before-1.000002.json`,'utf8')),after=JSON.parse(await fs.readFile(`${priv}/oltp-pg-after-1.000004.json`,'utf8'));
const business=['Borrowers','Loans','Repayments','Statistics','Charges','Partners','Payment Allocations','Payments'];
const cols=d=>{let table;const rows=[];for(const t of d){if(t.rows[0]?.[0]==='Schema Name')table=t.rows[0][1].replace(/_Schema$/,'');if(t.rows[0]?.[0]==='Column name'&&business.includes(table))rows.push({table,...t});}return rows;};
if(JSON.stringify(cols(before))!==JSON.stringify(cols(after)))throw Error('Column definitions changed');
const sources=after.filter(t=>t.rows[0]?.[0]==='Table name').map(t=>Object.fromEntries(t.rows)).filter(t=>t['Data Source']!=='native').map(t=>({table:t['Table name'],source:t['Data Source'],path:t['Source Path']}));
if(sources.length!==8||sources.some(t=>t.source!=='database-2'))throw Error('Unexpected business sources');
const report={appName:'LoanMgr PG Test 20260914',appId:'65faacd8-2b0d-43bf-9e0a-58eb915dcf9b',originalAppId:'93844270-6aa5-420b-a960-bcdf08abd357',originalVersion:'3.000064',copyBaseline:'1.000002',isolatedBotsVersion:'1.000003',sqlBindingsVersion:'1.000004',unchangedRenderedColumns:cols(after).length,sources,disabledBots:['Generate Daily Charges','Notification - New Loan Created','Notification - Loan Closed','Notification - Charge Received'],retainedBots:['Create First-Day Charge','Auto Receive First-Day Charge','Payments - Process Receipt'],status:'Functional testing in progress; not ready for cutover'};
await fs.writeFile(`${out}/oltp-pg-config-verification.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({unchangedColumns:report.unchangedRenderedColumns,businessTables:sources.length}));
const config=JSON.parse(await fs.readFile(`${out}/lab-config.json`,'utf8'));
config.definitions=config.definitions.filter(r=>r[0]!=='OLTP SQL validation');
for(const source of sources)config.definitions.push(['OLTP SQL validation','1.000004',source.table,'Data source','SQL binding','Copied OLTP; testing in progress','Original OLTP 3.000064 remains on Money',`${source.source}; ${source.path}`]);
config.definitions.push(['OLTP SQL validation','OLTP 1.000005; OLAP 1.000007','Loans','Borrower Name','SQL lookup triggers','Installed; insert and rename verified','Restores native Lookup on Borrowers.Borrower Name for both app consumers','BEFORE INSERT OR UPDATE Loans: resolve Borrower Name through Ref Borrowers; AFTER Borrower Name update: propagate to Loans. No added columns.']);
config.definitions.push(['OLTP SQL validation','1.000005','Loans','Two charge actions','Display only','Temporary; restoration pending','New GUI lifecycle testing','Generate Today\'s Charge and New Loan Payment - Create First-Day Charge: Prominent instead of Hide.']);
await fs.writeFile(`${out}/lab-config.json`,JSON.stringify(config,null,2)+'\n');
for(const name of await fs.readdir(out))if(/^tommy-.*\.json$/.test(name)){
 const content=JSON.parse(await fs.readFile(`${out}/${name}`,'utf8'));
 for(const rows of Object.values(content))if(Array.isArray(rows))for(const row of rows)for(const key of ['Created By','Closed By'])if(row[key])row[key]='<test operator>';
 await fs.writeFile(`${out}/${name}`,JSON.stringify(content,null,2)+'\n');
}
