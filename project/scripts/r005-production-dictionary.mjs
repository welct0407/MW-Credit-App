import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const out='outputs/r005-20260917',file='Documents/AppSheet_Data_Dictionary.xlsx',priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917';
const read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const expected=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
const touched=new Map();
function put(sheetName,row,keys){const rows=expected[sheetName],sh=wb.worksheets.getItem(sheetName);let i=rows.findIndex((r,n)=>n>0&&keys.every(k=>r[k]===row[k]));if(i<0){i=rows.length;sh.getRangeByIndexes(i,0,1,row.length).copyFrom(sh.getRangeByIndexes(i-1,0,1,row.length),'all');}const safe=row.map(v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v??'');sh.getRangeByIndexes(i,0,1,row.length).values=[safe];rows[i]=safe;touched.set(sheetName,(touched.get(sheetName)||0)+1);return i;}
const pkg=await read(`${out}/production-package.json`);
for(const app of ['oltp','olap']){
 const tables=await read(`${priv}/prod-${app}-final-appdoc.json`);let schema='';const appName=app.toUpperCase(),version=pkg.productionVersions[app];
 const affected=new Set(pkg.rows.filter(r=>r.app===app).map(r=>r.path.split('/').slice(0,3).join('/')));
 const added=['Cash Holders','Cash Holder Balances',...(app==='olap'?['Cash Ledger']:[])];
 for(const {rows}of tables){const p=Object.fromEntries(rows.filter(r=>r.length===2));if(p['Schema Name'])schema=p['Schema Name'];
  if(p['Table name']&&(added.includes(p['Table name'])||p['Table name']==='Settlements'&&app==='olap')){
   put('Prod Tables',[appName,'v'+version,p['Table name'],p['Data Source'],p['Source Path'],p.Schema,p['Are updates allowed?'],'R005 saved PROD; '+(p['Security filter']||'')],[0,2]);
   for(const[k,v]of Object.entries(p))put('App Settings',[appName+' PROD',p['Table name'],k,v,'R005 production-saved-readback.json / '+version],[0,1,2]);
  }
  if(p['Column name']&&schema.endsWith('_Schema')){const table=schema.slice(0,-7),col=p['Column name'];if(!added.includes(table)&&!affected.has(`Column/${schema}/${col}`)&&!(app==='oltp'&&((table==='Borrowers'&&col==='Todays Amount Due')||(table==='Statistics'&&col==='Total Cash Pool'))))continue;
   put('Prod Columns',[appName,table,col,p.Type,p['Virtual?'],p.Key,p.Label,p['Read-Only'],p.Hidden],[0,1,2]);
   for(const[k,v]of Object.entries(p))if(k!=='Column name')put('Column Rules',[appName,table,col,k,v],[0,1,2,3]);
   const qualifiers=JSON.parse(p['Type Qualifier']||'{}');for(const[k,v]of Object.entries(qualifiers))put('Column Rules',[appName,table,col,'Type Qualifier.'+k,v===null?'':typeof v==='object'?JSON.stringify(v):String(v)],[0,1,2,3]);
   if(p.Type==='Ref'){const q=JSON.parse(p['Type Qualifier']);put('Prod Relationships',[appName,table,col,q.ReferencedTableName,q.ReferencedKeyColumn,q.IsAPartOf],[0,1,2]);}
  }
  if(p['Slice Name']&&(p['Slice Name']==='Business Cash Held'||pkg.rows.some(r=>r.app===app&&r.path.startsWith(`Slice Name/${p['Slice Name']}/`)))){
   put('Prod Slices',[appName,p['Slice Name'],p['Source Table'],p['Update mode'],p['Row filter condition'],p['Slice Actions']],[0,1]);
   const cols=p['Slice Columns'].split('\n');for(let n=0;n<cols.length;n++)put('Slice Columns',[appName,p['Slice Name'],p['Source Table'],n+1,cols[n]],[0,1,3]);
  }
 }
}
const sql=await read(`${out}/production-schema-metadata.json`);
for(const c of sql.columns)put('DB Columns',[c.table_name,c.column_name,c.ordinal_position,c.data_type,c.is_nullable,c.column_default],[0,1]);
for(const c of sql.constraints)put('DB Constraints',[c.table_name,c.conname,c.contype,c.convalidated,c.definition],[0,1]);
for(const n of ['model-inventory','reversal-model-inventory'])for(const r of await read(`${out}/${n}.json`))if(!r.object.startsWith('OLTP')&&!r.object.startsWith('OLAP'))put('DB Logic',['R005 PROD V21',r.object,r.property,'Applied 18 September 2026',r.value],[0,1,2]);
const differences=expected['Dev Differences'];for(let i=1;i<differences.length;i++)if(String(differences[i][0]).startsWith('R005 ')){const r=[...differences[i]];r[0]='R005 historical DEV checkpoint';r[3]='Promoted 18 September 2026: PROD OLTP 3.000172 / OLAP 1.100122 / SQL V21. Exact current values are in production inventory and production-package.json. DEV-only opening/test data excluded.';const sh=wb.worksheets.getItem('Dev Differences');sh.getRangeByIndexes(i,0,1,5).values=[r];differences[i]=r;}
put('Dev Differences',['R005 Released','Current scope','Reconciliation','PROD OLTP 3.000172 / OLAP 1.100122 / SQL V21; 2408 core properties and 20 dashboard items verified.','No remaining R005 business configuration differences. DEV uses database-3, its own app links/theme, owner-only delivery, Prototype mode and synthetic fixtures. See PRODUCTION_REPORT.md.'],[0,1,2]);
put('Guide',['R005 production model','Affected tables, columns, rules, relationships, slices and database metadata','Reconciled 18 September 2026 from independent saved PROD readback: OLTP 3.000172 / OLAP 1.100122, SQL V21. outputs/r005-20260917/PRODUCTION_REPORT.md. Earlier Dev Differences rows are historical.'],[0]);
wb.recalculate();
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30}});await fs.writeFile(`${out}/dictionary-production-error-scan.jsonl`,errors.ndjson);
const sh=wb.worksheets.getItem('Prod Columns'),rr=expected['Prod Columns'].findIndex(r=>r[1]==='Cash Holders');const preview=await wb.render({sheetName:'Prod Columns',range:`A${rr+1}:I${rr+5}`,scale:1,format:'png'});await fs.writeFile(`${out}/dictionary-production-after.png`,new Uint8Array(await preview.arrayBuffer()));
await(await SpreadsheetFile.exportXlsx(wb)).save(file);
const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(file));const norm=arr=>{const r=arr.map(row=>row.map(v=>typeof v==='string'&&v.startsWith("'=")?v.slice(1):v??''));while(r.length&&r.at(-1).every(v=>v===''))r.pop();return r;};
for(const s of reopened.worksheets.items)assert.deepEqual(norm(s.getUsedRange().values),norm(expected[s.name]),s.name);
await fs.writeFile(`${out}/dictionary-production-verification.json`,JSON.stringify({allSheetsValueRoundtrip:true,affectedSheets:Object.fromEntries(touched),versions:pkg.productionVersions},null,2));
try{await fs.rename(file+'.inspect.ndjson',`${priv}/production-dictionary.inspect.ndjson`);}catch(e){if(e.code!=='ENOENT')throw e;}
console.log(JSON.stringify({allSheetsValueRoundtrip:true,affectedSheets:Object.fromEntries(touched)}));
