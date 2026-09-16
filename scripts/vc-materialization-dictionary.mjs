import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx',out='outputs/vc-materialization-20260916';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
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
