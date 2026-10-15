import fs from 'node:fs/promises';
const root='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914';
const repo='C:/GitHub/AppSheet-Loan-Project',out=`${repo}/outputs/postgresql-migration-trial-20260914`;
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const before=await read(`${root}/bulk-before-1.000005.json`),after=await read(`${root}/bulk-after-1.000006.json`);
const masters=['Borrowers','Loans','Partners'];
const changed=[];
if(before.length!==after.length)throw Error('App documentation shape changed');
for(let i=0;i<before.length;i++)if(JSON.stringify(before[i])!==JSON.stringify(after[i])){
 const b=Object.fromEntries(before[i].rows),a=Object.fromEntries(after[i].rows);
 const props=[...new Set([...Object.keys(b),...Object.keys(a)])].filter(k=>b[k]!==a[k]);
 if(!masters.includes(b['Table name'])&&!(props.length===1&&props[0]==='Version'))throw Error('Unexpected app configuration difference');
 if(b['Table name']&&props.some(k=>!['Source Path','Worksheet Name/Qualifier','Data Source','Data locale'].includes(k)))throw Error('Unexpected table setting difference');
 changed.push({table:b['Table name']??'App',properties:props});
}
const appData=[];
for(const table of masters){
 const source=await read(`${root}/bulk-source/${table}.json`),actual=await read(`${root}/bulk-after/${table}.json`);
 const map=new Map(actual.map(r=>[r['Row ID'],r]));let checked=0;const differences=[];
 for(const row of source){const found=map.get(row['Row ID']);if(!found)throw Error('Missing master row');for(const k of Object.keys(row)){if(k==='_RowNumber')continue;checked++;if(row[k]!==found[k])differences.push({column:k});}}
 if(differences.length||map.size!==source.length||actual.length!==source.length)throw Error('App read-back mismatch');
 appData.push({table,rows:source.length,comparedFields:checked,differences});
}
const bindings=after.filter(t=>t.rows[0]?.[0]==='Table name').map(t=>Object.fromEntries(t.rows)).filter(t=>t['Data Source']!=='native').map(t=>({table:t['Table name'],source:t['Data Source'],path:t['Source Path'],permissions:t['Are updates allowed?']}));
const report={version:'1.000006',rollback:'1.000004',preBindingVersion:'1.000005',changed,unchangedColumns:after.filter(t=>t.rows[0]?.[0]==='Column name').length,appData,bindings};
await fs.writeFile(`${out}/bulk-app-verification.json`,JSON.stringify(report,null,2)+'\n');
const plan=await read(`${out}/bulk-copy-plan.json`),verification=await read(`${out}/bulk-readback-verification.json`),ui=await read(`${out}/bulk-ui-validation.json`);
if(!verification.allPassed||ui.dashboardMatches.some(m=>!m.matched)||ui.visibleSyncError)throw Error('Verification incomplete');
const config=await read(`${out}/lab-config.json`);
for(const row of config.definitions){const t=plan.tables.find(t=>t.table===row[2]);if(row[0]==='Clean restart'&&t&&row[3]==='SQL transfer status'){
 row[1]='1.000006';row[5]=`COPIED AND VERIFIED; ${t.rows} rows`;
 row[6]=masters.includes(t.table)?'Trial reads SQL; existing formulas and permissions retained':'SQL populated; trial app still reads original AppSheet source';
 row[7]=`public."${t.table}"; ${t.physicalColumns} physical columns; exact keys and all fields matched`;
}}
for(const table of masters){const binding=bindings.find(b=>b.table===table);const item=['Master switch','1.000006',table,'Source binding','PostgreSQL table',binding.permissions,'Trial only; existing schema, Refs, slices and calculations preserved',`database-2; Source Path ${table}; Table=public.${table}__${table}`];const i=config.definitions.findIndex(r=>r[0]==='Master switch'&&r[2]===table);if(i>=0)config.definitions[i]=item;else config.definitions.push(item);}
const api=['Master switch','1.000005','Trial app','Cloud API','Integration','ENABLED with explicit owner confirmation','Extraction script uses Find only; access key itself is not read-only','Key and raw extracts stored outside Git; original app API settings unchanged'];
if(!config.definitions.some(r=>r[0]==='Master switch'&&r[3]==='Cloud API'))config.definitions.push(api);
await fs.writeFile(`${out}/lab-config.json`,JSON.stringify(config,null,2)+'\n');
const note=`\n\n## Full native-table copy and three master bindings — 14 September 2026\nCopied and independently verified 1,934 rows across the 11 remaining native AppSheet tables, covering 18,427 physical field values. Together with Statistics, SQL now contains all 12 native tables' snapshots (1,935 rows). Calendar remains on Google Sheets. LoanInsights PG Trial 20260914 (494cd013-0d9b-482f-9559-c9d83059de91) now uses database-2 for Borrowers, Loans, Partners and Statistics; all other app bindings remain original. App rollback 1.000004; API enabled with explicit confirmation in 1.000005; three bindings saved as 1.000006. All 374 rendered column configurations, slices, views and actions unchanged. Master app read-back and eight new-desktop dashboard metrics matched. No production changes, financial write tests, full migration acceptance or performance claim. Details, dependencies, security scope and rollback: outputs/postgresql-migration-trial-20260914/MASTER_TABLE_MIGRATION.md. Owner review pending.\n`;
for(const path of ['Change Logs/CHANGE_NOTES_POSTGRESQL_MIGRATION_TRIAL_2026-09-14.md','Documents/AppSheet_Data_Model_Overview.md']){const text=await fs.readFile(`${repo}/${path}`,'utf8');if(!text.includes('## Full native-table copy and three master bindings'))await fs.appendFile(`${repo}/${path}`,note);}
const status=await fs.readFile(`${out}/STATUS.md`,'utf8');if(!status.startsWith('Latest: all 12'))await fs.writeFile(`${out}/STATUS.md`,'Latest: all 12 native-table snapshots are in SQL. Borrowers, Loans, Partners and Statistics use SQL in trial version 1.000006. See MASTER_TABLE_MIGRATION.md. Earlier status entries below are historical.\n\n'+status);
console.log(JSON.stringify({unchangedColumns:report.unchangedColumns,appData,changed},null,2));
if(process.argv.includes('--full')){
 const full=await read(`${out}/full-app-verification.json`),fullUi=await read(`${out}/full-ui-validation.json`);
 if(!full.allBusinessValuesAndRelatedMembershipMatched||fullUi.dashboardMatches.some(m=>!m.matched))throw Error('Full source checks failed');
 for(const row of config.definitions){const t=plan.tables.find(t=>t.table===row[2]);if(row[0]==='Clean restart'&&t&&row[3]==='SQL transfer status'){row[1]='1.000007';row[6]='Trial now reads SQL; all stored fields and related membership verified';}}
 for(const binding of full.bindings.filter(b=>b.source==='database-2'&&!['Statistics',...masters].includes(b.table))){
  const item=['Remaining switch','1.000007',binding.table,'Source binding','PostgreSQL table',binding.permissions,'Trial only; schema and formulas unchanged',`database-2; Source Path ${binding.table}; Table=public.${binding.table}__${binding.table}`];
  const i=config.definitions.findIndex(r=>r[0]==='Remaining switch'&&r[2]===binding.table);if(i>=0)config.definitions[i]=item;else config.definitions.push(item);
 }
 const order=['Remaining switch','1.000007','Charges / Repayments','Provider row order','System metadata','201 Charges and 144 Repayments row numbers changed','Business values unchanged; 4 related lists reordered with identical membership','Never treat _RowNumber or unsorted REF_ROWS order as stable; validate write workflows separately'];
 if(!config.definitions.some(r=>r[0]==='Remaining switch'&&r[3]==='Provider row order'))config.definitions.push(order);
 await fs.writeFile(`${out}/lab-config.json`,JSON.stringify(config,null,2)+'\n');
 const fullNote='\n\n## Remaining native sources switched — 14 September 2026\nOwner extended the task to switch the remaining copied tables. Saved trial version 1.000007, rollback 1.000006. All 12 native Money tables now use database-2; only Calendar remains on its original read-only Google Sheets source. Compared 46,283 AppSheet business/calculated fields across 1,934 rows; all values and related-record membership matched. Provider _RowNumber changed for 201 Charges and 144 Repayments; three Related Charges lists and one Related Repayments list reordered without membership changes. All 374 rendered column definitions, views, slices, actions and permissions retained. New desktop sync, five view smoke checks, and eight dashboard metric comparisons passed. API remains enabled as authorized; scripts use Find only. No production changes or write/automation/performance acceptance. See outputs/postgresql-migration-trial-20260914/MASTER_TABLE_MIGRATION.md and full-app-verification.json. Owner review pending.\n';
 for(const path of ['Change Logs/CHANGE_NOTES_POSTGRESQL_MIGRATION_TRIAL_2026-09-14.md','Documents/AppSheet_Data_Model_Overview.md']){const text=await fs.readFile(`${repo}/${path}`,'utf8');if(!text.includes('## Remaining native sources switched'))await fs.appendFile(`${repo}/${path}`,fullNote);}
 await fs.writeFile(`${out}/STATUS.md`,'Latest: all 12 native Money tables use PostgreSQL in trial version 1.000007. Calendar remains on Google Sheets. Data/read/display verification passed; write workflows, performance and owner acceptance pending. See MASTER_TABLE_MIGRATION.md.\n\n'+status);
}
