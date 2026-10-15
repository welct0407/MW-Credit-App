import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const root='C:/GitHub/AppSheet-Loan-Project';
const out=root+'/outputs/assessment-promotion-20260915';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/assessment-promotion-20260915';
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(root+'/Documents/AppSheet_Data_Dictionary.xlsx'));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(process.argv.includes('--render-after')){
 for(const name of ['Prod Tables','Prod Columns','Column Rules','Prod Relationships','Prod Slices','Slice Columns','Dev Differences','App Settings','Guide']){
  const data=before[name];let at=data.findIndex(r=>r[0]==='OLAP'&&r[1]==='Loan Assessment');if(at<0)at=data.findIndex(r=>r[0]==='OLAP'||r[0]==='production-olap');if(at<0)at=0;
  const s=wb.worksheets.getItem(name),range=s.getRangeByIndexes(at,0,Math.min(4,data.length-at),Math.min(data[0].length,9));
  const p=await wb.render({sheetName:name,range:range.address.split('!').pop(),scale:1,format:'png'});await fs.writeFile(out+'/'+name.replaceAll(' ','-')+'-changed.png',new Uint8Array(await p.arrayBuffer()));
 }process.exit(0);
}
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([k,v])=>[k,{rows:v.length,head:v[0]}]))));
 const p=await wb.render({sheetName:'Prod Columns',range:'A1:I5',scale:1,format:'png'});await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await p.arrayBuffer()));process.exit(0);
}
try{await fs.access(priv+'/dictionary-before.xlsx');}catch{await fs.copyFile(root+'/Documents/AppSheet_Data_Dictionary.xlsx',priv+'/dictionary-before.xlsx');}
const model=JSON.parse(await fs.readFile(root+'/outputs/documentation-reconciliation-20260915/app-model.json','utf8'));
const parse=async name=>{
 const raw=JSON.parse(await fs.readFile(priv+'/'+name,'utf8')).map(t=>Object.fromEntries(t.rows.filter(r=>r.length===2)));
 const tables=raw.filter(t=>t['Table name']),bySchema=new Map(tables.map(t=>[t.Schema,t['Table name']]));let schema;const columns=[];
 for(const p of raw){if(p['Schema Name'])schema=p['Schema Name'];if(p['Column name'])columns.push({table:bySchema.get(schema)||schema,...p});}
 const clean=a=>a.map(o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='string'?v.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'<redacted-email>'):v])));
 return {version:raw.find(t=>t.Version).Version,tables:clean(tables),columns:clean(columns),slices:clean(raw.filter(t=>t['Slice Name'])),actions:clean(raw.filter(t=>t['Action name'])),views:clean(raw.filter(t=>t['View name']))};
};
model['production-olap']=await parse('production-calendar-saved.json');
model['development-olap']=await parse('development-before.json');
const app=model['production-olap'],dev=model['development-olap'];
const rows={};for(const name of ['Prod Tables','Prod Columns','Column Rules','Prod Relationships','Prod Slices','Slice Columns','Dev Differences'])rows[name]=before[name].filter((r,i)=>i===0||r[0]!=='OLAP');
const business=new Set(app.tables.filter(t=>t['Data Source']!=='native').map(t=>t['Table name']));
for(const t of app.tables)rows['Prod Tables'].push(['OLAP','v'+app.version,t['Table name'],t['Data Source'],t['Source Path'],t.Schema,t['Are updates allowed?'],t['Data Source']==='native'?'AppSheet internal':'Business source']);
for(const c of app.columns.filter(c=>business.has(c.table))){
 rows['Prod Columns'].push(['OLAP',c.table,c['Column name'],c.Type,c['Virtual?'],c.Key,c.Label,c['Read-Only'],c.Hidden]);
 if(c.Type==='Ref'){const q=JSON.parse(c['Type Qualifier']);rows['Prod Relationships'].push(['OLAP',c.table,c['Column name'],q.ReferencedTableName,q.ReferencedKeyColumn,q.IsAPartOf]);}
 for(const [k,v]of Object.entries(c)){
  if(['table','Column name','Type','Virtual?','Key','Label','Read-Only','Hidden'].includes(k))continue;
  if(k==='Type Qualifier'){for(const [qk,qv]of Object.entries(JSON.parse(v)))if(qv!==null)rows['Column Rules'].push(['OLAP',c.table,c['Column name'],'Type Qualifier.'+qk,typeof qv==='object'?JSON.stringify(qv):String(qv)]);}
  else if(v!=='')rows['Column Rules'].push(['OLAP',c.table,c['Column name'],k,v]);
 }
}
for(const s of app.slices){rows['Prod Slices'].push(['OLAP',s['Slice Name'],s['Source Table'],s['Update mode'],s['Row filter condition']||'',s['Slice Actions']||'']);for(const [i,c]of(s['Slice Columns']||'').split('\n').entries())rows['Slice Columns'].push(['OLAP',s['Slice Name'],s['Source Table'],i+1,c]);}
for(const [category,key]of [['tables','Table name'],['columns','Column name'],['slices','Slice Name'],['actions','Action name'],['views','View name']]){
 const id=o=>(o.table?o.table+'.':category==='actions'?o['For a record of this table']+'.':'')+o[key];const p=new Map(app[category].filter(o=>category!=='columns'||business.has(o.table)).map(o=>[id(o),o])),d=new Map(dev[category].filter(o=>category!=='columns'||business.has(o.table)).map(o=>[id(o),o]));
 for(const name of new Set([...p.keys(),...d.keys()])){
  if(!p.has(name)||!d.has(name)){rows['Dev Differences'].push(['OLAP',category+': '+name,'Availability',p.has(name)?'Present':'Absent',d.has(name)?'Present':'Absent']);continue;}
  for(const prop of new Set([...Object.keys(p.get(name)),...Object.keys(d.get(name))]))if((p.get(name)[prop]||'')!==(d.get(name)[prop]||''))rows['Dev Differences'].push(['OLAP',category+': '+name,prop,p.get(name)[prop]||'',d.get(name)[prop]||'']);
 }
}
rows.Guide=before.Guide.map(r=>r.map(v=>typeof v==='string'?v.replace('OLAP 1.100046','OLAP '+app.version).replace('Live app definitions captured 2026-09-15 12:17–12:20 Bangkok.','OLAP promotion captured 2026-09-15. Other inventory retains its prior capture.'):v));
rows['App Settings']=before['App Settings'].map(r=>r[0]==='production-olap'&&r[1]==='Sync'?[...r.slice(0,3),['Sync on start','Automatic updates','syncOnStart','automaticUpdates'].includes(r[2])?'On':'Off','Current editor, assessment promotion 15 September 2026']:r);
// Exact setting labels come from the existing inventory, not assumptions.
console.log('sync labels',before['App Settings'].filter(r=>r[0]==='production-olap'&&r[1]==='Sync').map(r=>r[2]));
for(const [name,data]of Object.entries(rows)){
 const s=wb.worksheets.getItem(name),cols=data[0].length,old=before[name].length;
 s.getUsedRange().clear({applyTo:'contents'});
 if(data.length>old)s.getRangeByIndexes(old,0,data.length-old,cols).copyFrom(s.getRangeByIndexes(old-1,0,1,cols),'all');
 s.getRangeByIndexes(0,0,data.length,cols).values=data.map(r=>r.map(v=>v===undefined?'':typeof v==='string'&&v.startsWith('=')?"'"+v:v));
}
wb.recalculate();
for(const name of ['Prod Tables','Prod Columns','Dev Differences']){const p=await wb.render({sheetName:name,range:name==='Prod Columns'?'A1:I5':'A1:E5',scale:1,format:'png'});await fs.writeFile(out+'/'+name.replaceAll(' ','-')+'.png',new Uint8Array(await p.arrayBuffer()));}
const target=root+'/Documents/AppSheet_Data_Dictionary.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(target);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(target));
const norm=a=>a.map(r=>r.map(v=>v===null?'':typeof v==='string'?v.replace(/^'/,''):v)).filter(r=>r.some(v=>v!==''));
for(const s of check.worksheets.items){const expected=rows[s.name]||before[s.name];if(JSON.stringify(norm(s.getUsedRange().values))!==JSON.stringify(norm(expected)))throw Error('Roundtrip/preservation mismatch '+s.name);}
await fs.writeFile(out+'/app-model.json',JSON.stringify(model,null,2));
await fs.writeFile(out+'/dictionary-verification.json',JSON.stringify({version:app.version,unchangedSheets:Object.keys(before).filter(k=>!rows[k]),allSheetsRoundtrip:true,businessColumns:rows['Prod Columns'].length-1,sliceMembers:rows['Slice Columns'].length-1,olapBusinessColumns:app.columns.filter(c=>business.has(c.table)).length},null,2));
console.log('Dictionary updated and roundtrip verified');
