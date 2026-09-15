import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {FileBlob,SpreadsheetFile,Workbook} from '@oai/artifact-tool';
const root='C:/GitHub/AppSheet-Loan-Project';
const out=root+'/outputs/documentation-reconciliation-20260915';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/documentation-reconciliation-20260915';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const schemaHash=hash(await fs.readFile(root+'/database/migrations/V1__existing_schema.sql'));
if(process.argv.includes('--edit'))for(const environment of ['production','development']){
 const snapshot=await fs.readFile('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/flyway/'+environment+'-doc-normalized.sql');
 if(hash(snapshot)!==schemaHash)throw Error('Captured schema does not match reviewed baseline: '+environment);
}
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(root+'/Documents/AppSheet_Data_Dictionary.xlsx'));
if(!process.argv.includes('--edit')) {
 console.log(JSON.stringify(wb.worksheets.items.map(s=>({name:s.name,rows:s.getUsedRange().values.length,head:s.getUsedRange().values.slice(0,1)}))));
 const s=wb.worksheets.items[0];const p=await wb.render({sheetName:s.name,range:'A1:D5',scale:1,format:'png'});await fs.writeFile(out+'/before.png',new Uint8Array(await p.arrayBuffer()));
 for(const label of ['production-oltp','production-olap','development-oltp','development-olap']){
  const d=JSON.parse(await fs.readFile(priv+'/'+label+'.json','utf8')).map(t=>Object.fromEntries(t.rows.filter(r=>r.length===2)));
  console.log(label,JSON.stringify({tables:d.filter(t=>t['Table name']).map(t=>[t['Table name'],t['Data Source']]),firstKinds:[...new Set(d.map(t=>Object.keys(t)[0]))]}));
 }
 process.exit(0);
}
// Preserve the original workbook byte-for-byte as historical evidence.
await fs.mkdir(root+'/Documents/history',{recursive:true});
const archive=root+'/Documents/history/AppSheet_Data_Dictionary_before_reconciliation_2026-09-15.xlsx';
try {await fs.access(archive);} catch {await fs.copyFile(root+'/Documents/AppSheet_Data_Dictionary.xlsx',archive);}
const safe=v=>typeof v==='string'?v.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'<redacted-email>'):v;
const model={};
for(const label of ['production-oltp','production-olap','development-oltp','development-olap']){
 const raw=JSON.parse(await fs.readFile(priv+'/'+label+'.json','utf8')).map(t=>Object.fromEntries(t.rows.filter(r=>r.length===2)));
 const tables=raw.filter(t=>t['Table name']);const bySchema=new Map(tables.map(t=>[t.Schema,t['Table name']]));let schema;
 const columns=[];
 for(const p of raw){if(p['Schema Name'])schema=p['Schema Name'];if(p['Column name'])columns.push({table:bySchema.get(schema)||schema,...p});}
 const clean=items=>items.map(o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,safe(v)])));
 model[label]={version:raw.find(t=>t.Version).Version,tables:clean(tables),columns:clean(columns),slices:clean(raw.filter(t=>t['Slice Name'])),actions:clean(raw.filter(t=>t['Action name'])),views:clean(raw.filter(t=>t['View name']))};
 if(columns.length!==Number(raw[0]['Data Summary'].match(/(\d+) Columns/)[1]))throw Error('Column extraction mismatch '+label);
}
await fs.writeFile(out+'/app-model.json',JSON.stringify(model,null,2));
const db=JSON.parse(await fs.readFile(out+'/production-database.json','utf8'));
const editor=JSON.parse(await fs.readFile(out+'/app-editor-settings.json','utf8'));
const rows={
 'Guide':[['Reference','Scope','Verification / use'],['Production model','Prod Tables, Prod Columns, Column Rules, Prod Relationships, Prod Slices, Slice Columns','Live app definitions captured 2026-09-15 12:17–12:20 Bangkok.'],['Production versions','OLTP 3.000070; OLAP 1.100046','Configuration inventory only; no new transaction testing.'],['Development','Dev Differences; App Settings','Differences from production; full development definition in accompanying app-model.json.'],['Database','DB Columns, DB Constraints, DB Logic','Fresh read-only catalog; both schemas exactly match Flyway V1. Constraint types: n = not null, p = primary key, f = foreign key.'],['Instance capacity','Production 100; development 50 connections','PostgreSQL 18.6; SSL confirmed. Memory/load capacity not inferred.'],['History','Documents/history','Original workbook preserved byte-for-byte. Old trial sheets are historical.'],['Maintenance','Documents/README.md; database/README.md','Update overview, dictionary, dev differences and changelog together.'],['Remaining verification','Scheduled execution, Looker and export delivery','Sync toggles and bot enabled-state verified in current editor; runtime delivery not tested.']],
 'Prod Tables':[['App','Version','Table','Source','Source path','Schema','Update permission','Scope']],
 'Prod Columns':[['App','Table','Column','Type','Virtual','Key','Label','Read-only','Hidden']],
 'Column Rules':[['App','Table','Column','Property','Definition']],
 'Prod Relationships':[['App','Child table','Ref column','Parent table','Parent key','Part of parent']],
 'Prod Slices':[['App','Slice','Source table','Permission','Filter','Actions']],
 'Slice Columns':[['App','Slice','Source table','Ordinal','Column']],
 'DB Columns':[['Table / view','Column','Position','PostgreSQL type','Nullable','Default']],
 'DB Constraints':[['Table','Constraint','Type','Validated','Definition']],
 'DB Logic':[['Kind','Schema / table','Name','Status / hash','Definition / arguments']],
 'Dev Differences':[['App','Object','Property','Production','Development']],
 'App Settings':[['Environment / app','Group','Setting / bot','Value','Evidence']]
};
for(const kind of ['oltp','olap']){
 const app=model['production-'+kind];
 for(const t of app.tables)rows['Prod Tables'].push([kind.toUpperCase(),'v'+app.version,t['Table name'],t['Data Source'],t['Source Path'],t.Schema,t['Are updates allowed?'],t['Data Source']==='native'?'AppSheet internal':'Business source']);
 const business=new Set(app.tables.filter(t=>t['Data Source']!=='native').map(t=>t['Table name']));
 for(const c of app.columns.filter(c=>business.has(c.table))){
  rows['Prod Columns'].push([kind.toUpperCase(),c.table,c['Column name'],c.Type,c['Virtual?'],c.Key,c.Label,c['Read-Only'],c.Hidden]);
  if(c.Type==='Ref'){const q=JSON.parse(c['Type Qualifier']);rows['Prod Relationships'].push([kind.toUpperCase(),c.table,c['Column name'],q.ReferencedTableName,q.ReferencedKeyColumn,q.IsAPartOf]);}
  for(const [k,v] of Object.entries(c)){
   if(['table','Column name','Type','Virtual?','Key','Label','Read-Only','Hidden'].includes(k))continue;
   if(k==='Type Qualifier'){let q;try{q=JSON.parse(v);}catch{throw Error('Invalid type qualifier');}for(const [qk,qv]of Object.entries(q))if(qv!==null)rows['Column Rules'].push([kind.toUpperCase(),c.table,c['Column name'],'Type Qualifier.'+qk,typeof qv==='object'?JSON.stringify(qv):String(qv)]);}
   else if(v!=='')rows['Column Rules'].push([kind.toUpperCase(),c.table,c['Column name'],k,v]);
  }
 }
 for(const s of app.slices){rows['Prod Slices'].push([kind.toUpperCase(),s['Slice Name'],s['Source Table'],s['Update mode'],s['Row filter condition']||'',s['Slice Actions']||'']);for(const [i,c]of(s['Slice Columns']||'').split('\n').entries())rows['Slice Columns'].push([kind.toUpperCase(),s['Slice Name'],s['Source Table'],i+1,c]);}
 const dev=model['development-'+kind];
 for(const [category,key] of [['tables','Table name'],['columns','Column name'],['slices','Slice Name'],['actions','Action name'],['views','View name']]){
  const id=o=>(o.table?o.table+'.':'')+o[key];
  const p=new Map(app[category].filter(o=>category!=='columns'||business.has(o.table)).map(o=>[id(o),o]));
  const d=new Map(dev[category].filter(o=>category!=='columns'||business.has(o.table)).map(o=>[id(o),o]));
  for(const name of new Set([...p.keys(),...d.keys()])){
   if(!p.has(name)||!d.has(name)){rows['Dev Differences'].push([kind.toUpperCase(),category+': '+name,'Availability',p.has(name)?'Present':'Absent',d.has(name)?'Present':'Absent']);continue;}
   for(const prop of new Set([...Object.keys(p.get(name)),...Object.keys(d.get(name))]))if((p.get(name)[prop]||'')!==(d.get(name)[prop]||''))rows['Dev Differences'].push([kind.toUpperCase(),category+': '+name,prop,p.get(name)[prop]||'',d.get(name)[prop]||'']);
  }
 }
}
for(const c of db.columns)rows['DB Columns'].push([c.table_name,c.column_name,c.ordinal_position,c.data_type,c.is_nullable,c.column_default||'']);
for(const c of db.constraints)rows['DB Constraints'].push([c.table_name,c.name,c.type,c.validated,c.definition]);
for(const t of db.triggers)rows['DB Logic'].push(['Trigger',t.table_name,t.name,t.enabled,t.definition]);
for(const f of db.functions)rows['DB Logic'].push(['Function',f.schema,f.name,f.definition_md5,f.arguments]);
for(const [app,s]of Object.entries(editor.apps)){for(const [name,value]of Object.entries(s.sync))rows['App Settings'].push([app,'Sync',name,value?'On':'Off','Current editor, 15 September 2026']);for(const b of s.bots)rows['App Settings'].push([app,'Bot',b.name,b.enabled?'Enabled':'Disabled','Current editor, 15 September 2026']);}
const current=Workbook.create();
for(const [name,data] of Object.entries(rows)){
 const s=current.worksheets.add(name);s.showGridLines=false;
 const values=data.map(r=>r.map(v=>v===undefined?'':typeof v==='string'&&v.startsWith('=')?"'"+v:v));
 const range=s.getRangeByIndexes(0,0,values.length,values[0].length);range.setNumberFormat('@');range.values=values;range.format.font.name='Arial';range.format.font.size=10;range.format.wrapText=true;range.format.verticalAlignment='top';range.format.rowHeight=32;
 for(let col=0;col<values[0].length;col++)s.getRangeByIndexes(0,col,values.length,1).format.columnWidth=col===values[0].length-1?70:col===0?15:30;
 if(name==='Guide'){s.getRange('A:A').format.columnWidth=25;s.getRange('B:B').format.columnWidth=62;s.getRange('C:C').format.columnWidth=85;range.format.rowHeight=46;}
 if(name==='Dev Differences'){s.getRange('B:B').format.columnWidth=48;s.getRange('D:E').format.columnWidth=65;}
 if(name==='Prod Columns')for(const col of ['D','E','F','G','H','I'])s.getRange(col+':'+col).format.columnWidth=14;
 const head=s.getRangeByIndexes(0,0,1,values[0].length);head.format.fill='#17365D';head.format.font.color='#FFFFFF';head.format.font.bold=true;head.format.rowHeight=32;
 s.freezePanes.freezeRows(1);s.tabColor=name==='Guide'?'#607D8B':'#17365D';
 // Long expressions remain exact in cells and in app-model.json; expand up to Excel's row-height ceiling.
 for(let i=1;i<values.length;i++){const lines=Math.max(...values[i].map((v,j)=>String(v).split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil(l.length/(j===values[0].length-1?65:27))),0)));if(lines>2)s.getRangeByIndexes(i,0,1,values[0].length).format.rowHeight=Math.min(409,lines*13+6);}
}
current.recalculate();
for(const s of current.worksheets.items){const width=rows[s.name][0].length;const range=s.getRangeByIndexes(0,0,Math.min(5,rows[s.name].length),width);const p=await current.render({sheetName:s.name,range:range.address.split('!').pop(),scale:1,format:'png'});await fs.writeFile(out+'/'+s.name.replaceAll(' ','-')+'.png',new Uint8Array(await p.arrayBuffer()));}
const target=out+'/AppSheet_Data_Dictionary.xlsx';await(await SpreadsheetFile.exportXlsx(current)).save(target);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(target));
const norm=a=>a.map(r=>r.map(v=>v===null?'':typeof v==='string'?v.replace(/^'/,''):v));
for(const s of current.worksheets.items)if(JSON.stringify(norm(s.getUsedRange().values))!==JSON.stringify(norm(check.worksheets.getItem(s.name).getUsedRange().values)))throw Error('Roundtrip mismatch '+s.name);
await fs.copyFile(target,root+'/Documents/AppSheet_Data_Dictionary.xlsx');await fs.unlink(target);
await fs.unlink(target+'.inspect.ndjson').catch(e=>{if(e.code!=='ENOENT')throw e;});
await fs.writeFile(out+'/verification.json',JSON.stringify({capturedDate:'2026-09-15',schemaSha256:schemaHash,schemaMatchesBaseline:{production:true,development:true},versions:Object.fromEntries(Object.entries(model).map(([k,v])=>[k,v.version])),worksheetRows:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.length-1])),roundtrip:true},null,2));
console.log(JSON.stringify({versions:Object.fromEntries(Object.entries(model).map(([k,v])=>[k,v.version])),rows:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.length-1]))}));
