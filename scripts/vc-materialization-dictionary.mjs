import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/vc-materialization-20260916';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(process.argv.includes('--promote')){
 const dest='outputs/vc-production-20260916',expected=structuredClone(before);
 const model=JSON.parse(await fs.readFile(out+'/model-evidence.json','utf8'));
 const versions={OLTP:'3.000108',OLAP:'1.100090'};
 const target=(app,table,name)=>model.columns.some(c=>c.app===app&&c.table===table&&c.name===name);
 const removed=(app,table,name)=>app==='OLTP'&&table==='Payment Allocations'&&model.removed.includes(name);
 const upsert=(sheet,pred,row)=>{const i=expected[sheet].findIndex(pred);if(i<0)expected[sheet].push(row);else expected[sheet][i]=row;};
 expected['Prod Columns']=expected['Prod Columns'].filter((r,i)=>i===0||!removed(r[0],r[1],r[2])).map((r,i)=>i&&target(r[0],r[1],r[2])?[...r.slice(0,4),'No',r[5],r[6],'Yes',r[8]]:r);
 expected['Column Rules']=expected['Column Rules'].filter((r,i)=>i===0||(!removed(r[0],r[1],r[2])&&!(target(r[0],r[1],r[2])&&r[3]==='App formula'))).map(r=>['OLTP','OLAP'].includes(r[0])&&['Borrowers','Charges'].includes(r[1])&&r[2]==='Row ID'&&['Editable Initial Value?','Fixed definition?'].includes(r[3])?[...r.slice(0,4),r[3]==='Fixed definition?'?'No':'Yes']:r);
 for(const c of model.columns){
  if(!expected['Prod Columns'].some(r=>r[0]===c.app&&r[1]===c.table&&r[2]===c.name)){
   expected['Prod Columns'].push([c.app,c.table,c.name,c.type,'No','No','No','Yes','Yes']);
   const rules={'Editable Initial Value?':'Yes','Fixed definition?':'No','Formula version':'0',LocaleName:'en-US','Part of Key?':'No','Reset on edit?':'No',Scannable:'No',Searchable:'No','Sensitive data':'No','System Defined?':'No','Visible?':'ALWAYS','Type Qualifier.ShowThousandsSeparator':true,'Type Qualifier.NumberDisplayMode':'Auto'};
   if(c.type==='Decimal')rules['Type Qualifier.DecimalDigits']=2;
   for(const [k,v]of Object.entries(rules))expected['Column Rules'].push([c.app,c.table,c.name,k,v]);
  }
 }
 expected['Prod Tables']=expected['Prod Tables'].map((r,i)=>i&&versions[r[0]]?[r[0],'v'+versions[r[0]],...r.slice(2)]:r);
 expected['Dev Differences']=expected['Dev Differences'].map(r=>{
  if(model.columns.some(c=>c.app===r[0]&&c.table+'.'+c.name===r[1])||model.removed.some(n=>r[0]==='OLTP'&&r[1]==='Payment Allocations.'+n)||r[1]==='Payment - Freeze Allocation')return [...r.slice(0,3),r[4],r[4]];
  if(r[0]==='Database'&&r[1]==='Flyway')return [...r.slice(0,3),'V14','V14'];return r;
 });
 for(const [app,version]of Object.entries(versions))upsert('App Settings',r=>r[0]==='production-'+app.toLowerCase()&&r[1]==='Version',['production-'+app.toLowerCase(),'Version','Saved app version',version,'Chrome saved definition and current-runtime sync; VC phases 1–4 promoted 16 Sep 2026']);
 expected['DB Columns']=expected['DB Columns'].filter(r=>!String(r[0]).startsWith('DEV '));
 for(const c of model.databaseColumns)upsert('DB Columns',r=>r[0]===c.table&&r[1]===c.name,[c.table,c.name,c.position,c.type,'YES','']);
 expected['DB Logic']=expected['DB Logic'].filter(r=>!String(r[0]).startsWith('Development '));
 for(const l of model.logic){const kind=l.kind==='function'?'Function':'Trigger',name=l.name.replace(/ on .+$/,'');upsert('DB Logic',r=>r[0]===kind&&r[1]===l.table&&r[2]===name,[kind,l.table,name,l.version+'; production and development',l.description]);}
 upsert('Guide',r=>r[0]==='Production versions',['Production versions','OLTP 3.000108; OLAP 1.100090','VC phases 1–4 promoted from tested f48dd28; rollback 3.000098 / 1.100081 plus private V11 backup.']);
 upsert('Guide',r=>r[0]==='Production model',['Production model','Prod Tables, Prod Columns, Column Rules, Prod Relationships, Prod Slices, Slice Columns','Reconciled 16 Sep 2026: all 48 SQL-owned fields verified; four OLTP obsolete VCs removed; unrelated settings and all slices preserved.']);
 upsert('Guide',r=>r[0]==='Database',['Database','Production and development V14','V12–V14 materialize Charge/Loan/Borrower/Payment totals. Both apps read physical values without App formulas. Existing scheduling unchanged.']);
 upsert('Guide',r=>r[0]==='Development VC materialization',['Development VC materialization','DEV V14; OLTP 1.000061, OLAP 1.000064','Owner authorized production promotion 16 Sep 2026. Both environments now have the same VC changes; Amount Due remains virtual. DEV benchmark remains historical evidence.']);
 upsert('Guide',r=>r[0]==='Production VC materialization',['Production VC materialization','V14; OLTP 3.000108, OLAP 1.100090','SQL parity and original-data preservation passed; current-GUI sync and unsaved payment form checked. No production financial test writes. See outputs/vc-production-20260916/REPORT.md.']);
 const changed=[];const text=v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v??'';
 for(const [name,rows]of Object.entries(expected)){
  const sh=wb.worksheets.getItem(name),old=before[name],width=old[0].length;
  for(let i=0;i<Math.max(old.length,rows.length);i++){
   const row=rows[i]??Array(width).fill('');if(JSON.stringify(row)===JSON.stringify(old[i]))continue;
   const range=sh.getRangeByIndexes(i,0,1,width);if(i>=old.length){range.copyFrom(sh.getRangeByIndexes(old.length-1,0,1,width),'all');range.format.wrapText=true;range.format.rowHeight=90;}
   range.values=[row.map(text)];changed.push({sheet:name,row:i+1});
  }
 }
 wb.recalculate();const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Production dictionary error scan'});await fs.writeFile(dest+'/dictionary-error-scan.jsonl',scan.ndjson);
 const png=await wb.render({sheetName:'Guide',range:'A2:C5',scale:1,format:'png'});await fs.writeFile(dest+'/dictionary-after.png',new Uint8Array(await png.arrayBuffer()));
 const stage=dest+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(stage);const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(stage));
 const norm=rows=>{const rs=rows.map(r=>r.map(v=>v??''));while(rs.length&&rs.at(-1).every(v=>v===''))rs.pop();return rs;};
 for(const sh of reopened.worksheets.items)if(JSON.stringify(norm(sh.getUsedRange().values))!==JSON.stringify(norm(expected[sh.name])))throw Error('Unexpected production dictionary difference '+sh.name);
 await fs.copyFile(stage,file);await fs.unlink(stage);await fs.unlink(stage+'.inspect.ndjson').catch(()=>{});await fs.writeFile(dest+'/dictionary-changes.json',JSON.stringify({allSheetsRoundtrip:true,changed},null,2));console.log(JSON.stringify({allSheetsRoundtrip:true,changedRows:changed.length}));process.exit(0);
}
if(process.argv.includes('--build-evidence')){
 const groups={Charges:['Principal Paid','Interest Paid','Total Paid','Principal Remaining','Interest Remaining','Amount Remaining','Payment Count','Payment Status','Payment Date'],Loans:['Total Interest Received','Total Principal Received','Outstanding Principal','Total Amount Received','Expected Daily Interest Amount'],Borrowers:['Total Interest Earned','Total Amount Loaned','Total Number of Loans','Total Outstanding Principal','Active Loan Interest Earned','Active Daily Interest','Has Closed Loan','Has Active Loan'],Payments:['Planned Allocation Amount','Posted Amount']};
 const columns=[];
 for(const app of ['OLTP','OLAP'])for(const [table,names]of Object.entries(groups))for(const name of names){
  const o=before['Prod Columns'].find(r=>r[0]===app&&r[1]===table&&r[2]===name);
  const rule=before['Column Rules'].find(r=>r[0]===app&&r[1]===table&&r[2]===name&&r[3]==='App formula');
  const type=app==='OLAP'&&table==='Payments'?'Decimal':name==='Payment Count'||name==='Total Number of Loans'?'Number':name==='Payment Status'?'Text':name==='Payment Date'?'Date':name.startsWith('Has ')?'Yes/No':'Price';
  const hidden=['Payment Count','Expected Daily Interest Amount','Has Closed Loan','Has Active Loan'].includes(name)||(app==='OLAP'&&table==='Payments')?'Yes':'No';
  columns.push({app,table,name,type,hidden,original:o?{Type:o[3],Virtual:o[4],'Read-Only':o[7],Hidden:o[8],'App formula':rule?.[4]??'See production Column Rules'}:null});
 }
 const databaseColumns=(await fs.readFile(out+'/final-parity.jsonl','utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse).filter(r=>r.check==='vc_column'&&groups[r.table]?.includes(r.name));
 const logic=[];
 for(const f of (await fs.readdir('database/migrations')).filter(f=>/^V1[234]__/.test(f))){
  const sql=await fs.readFile('database/migrations/'+f,'utf8'),version=f.match(/^V\d+/)[0];
  for(const m of sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.([a-z_]+)\(/g))logic.push({kind:'function',table:'public',name:m[1],version,description:'See immutable migration '+f+'; derived rollup ownership, refresh and transaction safety.'});
  for(const m of sql.matchAll(/CREATE(?: CONSTRAINT)? TRIGGER ([a-z_]+)[\s\S]*? ON public\."([^"]+)"/g))logic.push({kind:'trigger',table:m[2],name:m[1]+' on '+m[2],version,description:'See immutable migration '+f+'; source or derived-value event.'});
 }
 await fs.writeFile(out+'/model-evidence.json',JSON.stringify({versions:{OLTP:'1.000061',OLAP:'1.000064'},columns,databaseColumns,logic,removed:['Calculated Order','Calculated Amount','Calculated Interest','Calculated Principal'],verification:'Chrome saved appdoc: all 48 app fields physical, blank App formula, read-only; four obsolete VCs absent; SQL parity zero mismatches.'},null,2));
 console.log(JSON.stringify({columns:columns.length,databaseColumns:databaseColumns.length,logic:logic.length}));process.exit(0);
}
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([n,r])=>[n,{head:r[0],rows:r.length}]))));
 console.log(JSON.stringify(before['Dev Differences'].slice(-4)));
 const p=await wb.render({sheetName:'Dev Differences',range:'A1:E4',scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await p.arrayBuffer()));
 process.exit(0);
}
const model=JSON.parse(await fs.readFile(out+'/model-evidence.json','utf8'));
const expected=structuredClone(before),changed=[];
function put(sheet,i,row){expected[sheet][i]=row;changed.push({sheet,row:i+1});}
function upsert(sheet,pred,row){const i=expected[sheet].findIndex(pred);put(sheet,i<0?expected[sheet].length:i,row);}
function diff(app,obj,prop,prod,dev){upsert('Dev Differences',r=>r[0]===app&&r[1]===obj&&r[2]===prop,[app,obj,prop,prod,dev]);}
for(const c of model.columns){
 for(const [prop,val] of Object.entries({Type:c.type,Virtual:'No','Read-Only':'Yes',Hidden:c.hidden,'App formula':'Blank; PostgreSQL owns value'}))
 diff(c.app,c.table+'.'+c.name,prop,c.original?.[prop]??'Absent',val);
}
for(const name of model.removed)diff('OLTP','Payment Allocations.'+name,'Availability','Virtual column','Removed; physical allocation results retained');
diff('OLTP','Payment - Freeze Allocation','Only if this condition is true','Legacy allocation condition','FALSE; self-assignment of physical fields; SQL owns allocation');
diff('Database','Flyway','Version','V11','V14; VC phases 1–4 in DEV only');
diff('Database','Flyway','Schema version','V11','V14');
for(const [app,version] of Object.entries(model.versions))upsert('App Settings',r=>r[0]==='development-'+app.toLowerCase()&&r[1]==='Version',['development-'+app.toLowerCase(),'Version','Saved app version',version,'Chrome current editor; VC phases 1–4; owner acceptance pending']);
upsert('Guide',r=>r[0]==='Development VC materialization',['Development VC materialization','DEV V14; OLTP '+model.versions.OLTP+', OLAP '+model.versions.OLAP,'24 OLTP VCs materialized; four obsolete allocation VCs removed. Amount Due remains virtual. Production V11 inventory unchanged. See Markdown change log for tests, benchmark and pending owner acceptance.']);
for(const c of model.databaseColumns)upsert('DB Columns',r=>r[0]==='DEV '+c.table&&r[1]===c.name,['DEV '+c.table,c.name,c.position,c.type,'YES','']);
for(const l of model.logic)upsert('DB Logic',r=>r[0]==='Development '+l.kind&&r[2]===l.name,['Development '+l.kind,l.table,l.name,l.version,l.description]);
const txt=v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v??'';
for(const [name,rows] of Object.entries(expected)){
 const sh=wb.worksheets.getItem(name),old=before[name];
 for(let i=0;i<rows.length;i++){
  if(JSON.stringify(rows[i])===JSON.stringify(old[i]))continue;
  const r=sh.getRangeByIndexes(i,0,1,rows[0].length);
  if(i>=old.length){r.copyFrom(sh.getRangeByIndexes(old.length-1,0,1,rows[0].length),'all');r.format.wrapText=true;r.format.verticalAlignment='top';r.format.rowHeight=90;}
  r.values=[rows[i].map(txt)];
 }
}
wb.recalculate();
const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Dictionary error scan'});
await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
const firstVcRow=expected['Dev Differences'].findIndex(r=>r[0]==='OLTP'&&r[1]==='Charges.Principal Paid')+1;
for(const [sheetName,range] of [['Guide',`A${expected.Guide.length}:C${expected.Guide.length}`],['Dev Differences',`A${firstVcRow}:E${firstVcRow+3}`]]){
 const p=await wb.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(out+'/dictionary-after-'+sheetName.replaceAll(' ','-')+'.png',new Uint8Array(await p.arrayBuffer()));
}
const stage=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(stage);
const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(stage));
const norm=rs=>rs.map(r=>r.map(v=>v??''));
for(const s of reopened.worksheets.items)if(JSON.stringify(norm(s.getUsedRange().values))!==JSON.stringify(norm(expected[s.name])))throw Error('Unexpected dictionary difference '+s.name);
await fs.copyFile(stage,file);await fs.unlink(stage);await fs.unlink(stage+'.inspect.ndjson').catch(()=>{});
await fs.writeFile(out+'/dictionary-changes.json',JSON.stringify({allSheetsRoundtrip:true,changed},null,2));
console.log(JSON.stringify({allSheetsRoundtrip:true,changedRows:changed.length}));
