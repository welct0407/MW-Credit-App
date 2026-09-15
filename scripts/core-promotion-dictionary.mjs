import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const file='Documents/AppSheet_Data_Dictionary.xlsx';
const out='outputs/core-promotion-20260915';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const before=Object.fromEntries(wb.worksheets.items.map(s=>[s.name,s.getUsedRange().values]));
if(process.argv.includes('--verify')||process.argv.includes('--refine')){
 if(process.argv.includes('--refine')){
  for(const [row,height]of [[2888,100],[3034,56],[4645,44]]){
   const range=wb.worksheets.getItem('Column Rules').getRange(`A${row}:E${row}`);
   range.format.wrapText=true;range.format.rowHeight=height;range.format.verticalAlignment='top';
  }
  wb.recalculate();
  const stage=out+'/dictionary-refined.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(stage);
  const reopened=await SpreadsheetFile.importXlsx(await FileBlob.load(stage));
  for(const s of reopened.worksheets.items)if(JSON.stringify(s.getUsedRange().values)!==JSON.stringify(before[s.name]))throw Error('Refinement changed values '+s.name);
  await fs.copyFile(stage,file);await fs.unlink(stage);await fs.unlink(stage+'.inspect.ndjson').catch(()=>{});
 }
 for(const [app,table,column,prop] of [['OLTP','Payments','Amount Received','Type Qualifier.Valid_If'],['OLTP','Payments','Ref Target Charge','Type Qualifier.Required_If'],['OLAP','Loans','Default Loss Amount','Type Qualifier.CurrencySymbol']]){
  const i=before['Column Rules'].findIndex(r=>r[0]===app&&r[1]===table&&r[2]===column&&r[3]===prop);
  if(i<0)throw Error('Changed rule missing');
  const p=await wb.render({sheetName:'Column Rules',range:`A${i+1}:E${i+1}`,scale:1,format:'png'});
  await fs.writeFile(out+'/dictionary-rule-'+i+'.png',new Uint8Array(await p.arrayBuffer()));
  console.log({row:i+1,column,property:prop,value:before['Column Rules'][i][4]});
 }
 process.exit(0);
}
if(!process.argv.includes('--edit')){
 console.log(JSON.stringify(Object.fromEntries(Object.entries(before).map(([n,r])=>[n,{head:r[0],rows:r.length}]))));
 await fs.writeFile('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/core-promotion-20260915/dictionary-rows.json',JSON.stringify(before));
 const p=await wb.render({sheetName:'Prod Columns',range:'A1:I4',scale:1,format:'png'});
 await fs.writeFile(out+'/dictionary-before.png',new Uint8Array(await p.arrayBuffer()));
 process.exit(0);
}
const model=JSON.parse(await fs.readFile(out+'/model-evidence.json'));
const metadata=(await fs.readFile(out+'/database-after.jsonl','utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
if(before.Guide.some(r=>r[0]==='Core production release'))throw Error('Release already documented; inspect before rerunning');
const expected=structuredClone(before),changes=[];
function put(sheet,index,row){expected[sheet][index]=row.map(v=>v??'');changes.push({sheet,row:index+1});}
function append(sheet,row){put(sheet,expected[sheet].length,row);}
function rule(app,table,column,property,value){
 const rows=expected['Column Rules'];const index=rows.findIndex(r=>r[0]===app&&r[1]===table&&r[2]===column&&r[3]===property);
 const row=[app,table,column,property,value];index<0?append('Column Rules',row):put('Column Rules',index,row);
}
for(const c of model.columns){
 const p=c.properties;
 if(before['Prod Columns'].some(r=>r[0]===c.app&&r[1]===c.table&&r[2]===p['Column name']))throw Error('Column already in production inventory');
 append('Prod Columns',[c.app,c.table,p['Column name'],p.Type,p['Virtual?'],p.Key,p.Label,p['Read-Only'],p.Hidden]);
 for(const [k,v]of Object.entries(p)){
  if(['Column name','Type','Virtual?','Key','Label','Read-Only','Hidden'].includes(k))continue;
  if(k==='Type Qualifier'){for(const [qk,qv]of Object.entries(JSON.parse(v)))if(qv!==null)rule(c.app,c.table,p['Column name'],'Type Qualifier.'+qk,typeof qv==='object'?JSON.stringify(qv):String(qv));}
  else rule(c.app,c.table,p['Column name'],k,v);
 }
 if(p['Virtual?']==='No'){rule(c.app,c.table,p['Column name'],'Initial value','Blank');rule(c.app,c.table,p['Column name'],'App formula','Blank');}
 if(p.Type==='Ref')append('Prod Relationships',[c.app,c.table,p['Column name'],JSON.parse(p['Type Qualifier']).ReferencedTableName,'Row ID','false']);
}
for(const r of model.rules)rule(r.app,r.table,r.column,r.property,r.value);
expected['Prod Tables']=before['Prod Tables'].filter((r,i)=>i===0||r[0]!=='OLTP'||!model.tablesRemoved.includes(r[2])).map((r,i)=>i===0?r:[r[0],'v'+model.versions[r[0]],...r.slice(2)]);
expected['Prod Tables'].push(...model.tablesAdded);
changes.push({sheet:'Prod Tables',scope:'Refresh versions and generated process table inventory; business bindings unchanged'});
let ordinal=Math.max(...before['Slice Columns'].filter(r=>r[0]==='OLAP'&&r[1]==='Reporting Loans').map(r=>Number(r[3])));
for(const name of model.slice.appendedColumns)append('Slice Columns',['OLAP','Reporting Loans','Loans',++ordinal,name]);
for(const c of metadata.filter(r=>r.column))append('DB Columns',[c.table,c.column,c.position,c.type,c.nullable,c.default??'']);
for(const c of metadata.filter(r=>r.constraint))append('DB Constraints',[c.table.replaceAll('"',''),c.constraint,c.type,String(c.validated),c.definition]);
// Refresh the live function/trigger catalog rather than leaving obsolete V4
// and development revisions mixed with current definitions.
expected['DB Logic']=[before['DB Logic'][0],...before['DB Logic'].slice(1).filter(r=>!/(function|trigger|index)/i.test(r[0])).map(r=>[r[0].replace('Development','Production and development'),r[1],r[2],r[3].replace('Flyway V5 in both environments','Introduced V5; retained in both V10 environments'),r[4].replace('on development host only','on each isolated environment host')])];
for(const r of expected['DB Logic'])if(r[2]==='loan-daily-charges'){r[3]='Flyway V9; both nightly jobs active';r[4]='00:05 Asia/Bangkok. Development synthetic scheduler passed; production activated 15 Sep 22:50:48, first natural run pending. Metadata is not an AppSheet business table.';}
for(const c of metadata.filter(r=>r.kind)){
 const kind=c.kind==='function'?'Function':c.kind==='trigger'?'Trigger':'Index';
 const status=c.hash??c.enabled??'V10 catalog';
 expected['DB Logic'].push([kind,c.schema??c.table,c.name,status,c.definition??`${c.arguments}; exact versioned definition in database/migrations (V1–V10)`]);
}
changes.push({sheet:'DB Logic',scope:'Current production V10 function hashes, trigger definitions and new indexes; identical normalized development schema'});
for(let i=1;i<expected['App Settings'].length;i++){
 const r=[...expected['App Settings'][i]];
 if(r[0]!=='production-oltp'||r[1]!=='Bot')continue;
 if(r[2]==='Auto Receive First-Day Charge')r[2]='Notification - First-Day Charge';
 r[3]=['Create First-Day Charge','Generate Daily Charges','Payments - Process Receipt'].includes(r[2])?'Disabled':'Enabled';
 r[4]='Current editor, production OLTP 3.000094, 15 Sep 2026. Enabled bots are notification-only; production partner recipients.';put('App Settings',i,r);
}
const phaseObjects=new Set(['Create First-Day Charge','Auto Receive First-Day Charge','Payments - Process Receipt','Payment - Process Receipt','Payment - Close Paid Loans','Generate Daily Charges','Generate Daily Charges / Daily 00:05','Generate Today\'s Charge','Generate All Today\'s Charges','Create Final Charge','Add Principal to Today\'s Charge','Add Outstanding Principal to Charge','Receive All Remaining Charges','Wrapped Action - Close Loan','Wrapped Action - Default Loan','Default - sub-actions','Loans.Defaulted','Charges','Repayments','loan-daily-charges','Reporting Loans','View Ref (Ref Closing Payment)','View Ref (Ref Target Loan)']);
for(let i=1;i<expected['Dev Differences'].length;i++){
 const r=[...expected['Dev Differences'][i]];
 const col=model.columns.find(c=>c.app===r[0]&&c.table+'.'+c.properties['Column name']===r[1]);
 const change=model.rules.find(c=>c.app===r[0]&&c.table+'.'+c.column===r[1]&&(c.property===r[2]||c.property.replace('Type Qualifier.','')===r[2]));
 if(col){const p=col.properties;const q=JSON.parse(p['Type Qualifier']);r[3]=p[r[2]]??q[r[2]]??q[r[2].replace('Type Qualifier.','')]??(r[2]==='Initial value'||r[2]==='App formula'?'Blank':r[4]);}
 else if(change)r[3]=change.value;
 else if(r[1]==='Flyway'){r[3]='V10';r[4]='V10; identical tested migration hashes';}
 else if(r[1]==='Loans.Default Loss Amount'){r[3]='฿ / 0; read-only Loans and Reporting Loans';}
 else if(r[1]?.startsWith('Notification -')){r[3]='Promoted SQL-aware notification route; production Partners[Email] excluding acting user. See core-promotion-20260915/appsheet-configuration.md for exact events and templates.';}
 else if(phaseObjects.has(r[1])){r[3]='Promoted 15 Sep 2026. '+String(r[4]).replaceAll('development only','both environments').replaceAll('development pg_cron','production pg_cron').replaceAll('owner-only','production partner').replaceAll('Absent in production','Present');}
 else if(r[0]==='Database'&&/Ref Closing Payment|Ref Target Loan|Charge Generation Request/.test(r[1]))r[3]=r[4];
 else if(['Payments.Row ID','Payments.Amount Received','Payments.Ref Target Charge'].includes(r[1]))r[3]=r[4];
 else continue;
 put('Dev Differences',i,r);
}
for(let i=1;i<expected.Guide.length;i++){
 const r=expected.Guide[i];
 if(r[0]==='Production versions')put('Guide',i,['Production versions','OLTP 3.000094; OLAP 1.100062','Saved appdoc comparison and current-GUI sync, 15 Sep 2026. Rollback 3.000080 / 1.100056.']);
 if(r[0]==='Database')put('Guide',i,['Database','Production and development Flyway V10','Exact tested V6–V10 promoted. Current catalog below. Core historical financial records preserved; no backfill.']);
 if(r[0]==='Remaining verification')put('Guide',i,['Remaining verification','First natural production nightly run; ordinary device push feedback; offline/multiple-device GUI; Looker','Production sync and unsaved payment form checks passed. No production financial test transaction or forced notification. Development financial cases already tested and release authorized.']);
 if(r[0]==='Development Default Loan')put('Guide',i,[r[0],r[1],'Development losses 100/90/110/92 reconcile. Owner accepted implementation through explicit phases 1–6 production request. Separate phase-6 device delivery was not explicitly confirmed.']);
 if(['Development lump sum','Interest schedule anchor','Development core payment','Development atomic loan close','Development charge generation'].includes(r[0]))put('Guide',i,['Historical: '+r[0],r[1],r[2]]);
}
append('Guide',['Core production release','Phases 1–6 live; OLTP 3.000094, OLAP 1.100062, Flyway V10','Production 00:05 Bangkok SQL job enabled. AppSheet financial bots disabled. Partner notifications retained. See outputs/core-promotion-20260915/REPORT.md.']);
const text=v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v??'';
for(const [name,rows]of Object.entries(expected)){
 const sheet=wb.worksheets.getItem(name),old=before[name];
 for(let i=0;i<rows.length;i++){
  if(JSON.stringify(rows[i])===JSON.stringify(old[i]))continue;
  const range=sheet.getRangeByIndexes(i,0,1,rows[0].length);
  if(i>=old.length){range.copyFrom(sheet.getRangeByIndexes(old.length-1,0,1,rows[0].length),'all');range.format.wrapText=true;range.format.verticalAlignment='top';range.format.rowHeight=name==='Prod Columns'?42:Math.max(...rows[i].map(v=>String(v).length))>900?409:120;}
  range.values=[rows[i].map(text)];
 }
 if(rows.length<old.length)sheet.getRangeByIndexes(rows.length,0,old.length-rows.length,old[0].length).clear({applyTo:'contents'});
}
wb.recalculate();
const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Production dictionary formula error scan'});await fs.writeFile(out+'/dictionary-error-scan.jsonl',scan.ndjson);
for(const [sheetName,range]of [['Prod Columns','A561:I570'],['Guide','A16:C16'],['DB Columns','A167:F169'],['Column Rules','A'+(before['Column Rules'].length+1)+':E'+(before['Column Rules'].length+2)]]){
 const p=await wb.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(out+'/dictionary-after-'+sheetName.replaceAll(' ','-')+'.png',new Uint8Array(await p.arrayBuffer()));
}
const staged=out+'/dictionary-staged.xlsx';await(await SpreadsheetFile.exportXlsx(wb)).save(staged);
const check=await SpreadsheetFile.importXlsx(await FileBlob.load(staged));
const norm=rows=>{const a=rows.map(r=>r.map(v=>v??''));while(a.length&&a.at(-1).every(v=>v===''))a.pop();return a;};
for(const s of check.worksheets.items)if(JSON.stringify(norm(s.getUsedRange().values))!==JSON.stringify(norm(expected[s.name])))throw Error('Unexpected dictionary difference '+s.name);
await fs.copyFile(staged,file);await fs.unlink(staged);await fs.unlink(staged+'.inspect.ndjson').catch(()=>{});
await fs.writeFile(out+'/dictionary-changes.json',JSON.stringify({allSheetsRoundtrip:true,changes,rows:Object.fromEntries(Object.entries(expected).map(([n,r])=>[n,r.length]))},null,2));
console.log({allSheetsRoundtrip:true,changedRows:changes.length});
