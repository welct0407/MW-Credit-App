import fs from 'node:fs/promises';
import path from 'node:path';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const root='C:/GitHub/AppSheet-Loan-Project';const out=root+'/outputs/documentation-reconciliation-20260915';
const m=JSON.parse(await fs.readFile(out+'/app-model.json','utf8'));
const db=JSON.parse(await fs.readFile(out+'/production-database.json','utf8'));
const dev=JSON.parse(await fs.readFile(out+'/development-database.json','utf8'));
const issues=[];let bindings=0;let slices=0;
for(const [app,a]of Object.entries(m)){
 const tables=new Map(a.tables.map(t=>[t['Table name'],t]));
 const columns=new Set(a.columns.map(c=>c.table+'\0'+c['Column name']));
 for(const t of a.tables.filter(t=>(t['Data Source']||'').startsWith('database-'))){bindings++;const expected=app.startsWith('production')?'database-2':'database-3';if(t['Data Source']!==expected)issues.push('Wrong source '+app+' '+t['Table name']);
  const sqlcols=new Set(db.columns.filter(c=>c.table_name===t['Source Path']).map(c=>c.column_name));
  if(!sqlcols.size)issues.push('Missing SQL relation '+t['Source Path']);
  for(const c of a.columns.filter(c=>c.table===t['Table name']&&c['Virtual?']!=='Yes'&&c['Column name']!=='_RowNumber'))if(!sqlcols.has(c['Column name']))issues.push('Missing SQL column '+app+' '+c.table+'.'+c['Column name']);
 }
 for(const s of a.slices){slices++;for(const c of(s['Slice Columns']||'').split('\n'))if(c&&!columns.has(s['Source Table']+'\0'+c))issues.push('Missing slice column '+app+' '+s['Slice Name']+'.'+c);}
 const name=a.columns.find(c=>c.table==='Loans'&&c['Column name']==='Borrower Name');if(name?.['Virtual?']!=='Yes'||name['App formula']!=='=[Ref Borrowers].[Borrower Name]')issues.push('Borrower name VC mismatch '+app);
}
for(const [env,d]of [['production',db],['development',dev]]){
 if(d.constraints.filter(c=>c.type==='f').length!==13||d.constraints.some(c=>!c.validated))issues.push('Constraint validation '+env);
 if(d.triggers.length!==10||d.triggers.some(t=>t.enabled!=='O')||d.functions.length!==6)issues.push('Logic inventory '+env);
 if(d.flyway.length!==1||d.flyway[0].version!=='1'||!d.flyway[0].success)issues.push('Flyway baseline '+env);
}
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(root+'/Documents/AppSheet_Data_Dictionary.xlsx'));
const business=m['production-oltp'].columns.filter(c=>m['production-oltp'].tables.some(t=>t['Table name']===c.table&&t['Data Source']!=='native')).length+m['production-olap'].columns.filter(c=>m['production-olap'].tables.some(t=>t['Table name']===c.table&&t['Data Source']!=='native')).length;
if(wb.worksheets.getItem('Prod Columns').getUsedRange().values.length-1!==business)issues.push('Workbook business count');
if(wb.worksheets.getItem('Prod Tables').getRange('B2').values[0][0]!=='v3.000070')issues.push('Version text preservation');
let formulaCells=0;for(const s of wb.worksheets.items)for(const r of s.getUsedRange().formulas)for(const f of r)if(f)formulaCells++;
if(formulaCells)issues.push('Unexpected Excel formulas in literal dictionary: '+formulaCells);
const docs=['README.md','AppSheet_Data_Model_Overview.md','Development_Changes.md','Environment_Inventory.md'];let links=0;
for(const file of docs){const text=await fs.readFile(root+'/Documents/'+file,'utf8');for(const match of text.matchAll(/\]\(([^)]+)\)/g)){const dest=match[1].split('#')[0];if(!dest||/^(https?:|mailto:)/.test(dest))continue;links++;try{await fs.access(path.resolve(root+'/Documents',decodeURIComponent(dest)));}catch{issues.push('Broken link '+file+': '+dest);}}}
await fs.writeFile(out+'/checks.json',JSON.stringify({checkedAt:new Date().toISOString(),sqlBindingsChecked:bindings,slicesChecked:slices,productionBusinessColumns:business,documentationLinksChecked:links,unexpectedExcelFormulaCells:formulaCells,issues},null,2));
console.log(JSON.stringify({bindings,slices,business,links,formulaCells,issues}));if(issues.length)process.exitCode=1;
